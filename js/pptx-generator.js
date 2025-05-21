// Get elements from the DOM
const generatorTitle = document.getElementById('generator-title');
const recordingSubtitle = document.getElementById('recording-subtitle');
const statusText = document.getElementById('status-text');
const errorContainer = document.getElementById('error-container');
const progressBar = document.getElementById('progress-bar');
const completeBadge = document.getElementById('complete-badge');
const generateBtn = document.getElementById('generate-btn');
const viewSlideshowBtn = document.getElementById('view-slideshow-btn');
const backToRecordingsBtn = document.getElementById('back-to-recordings-btn');

// Global state
let currentRecording = null;
let slides = [];
let progress = 0;
let isGenerating = false;
let isComplete = false;
let recordingId = null;

// Initialize the generator
document.addEventListener('DOMContentLoaded', () => {
  // Get recording ID from URL
  const params = new URLSearchParams(window.location.search);
  recordingId = params.get('recording');
  const autoStart = params.get('autostart') === 'true';
  
  if (!recordingId) {
    showError('No recording ID specified');
    return;
  }
  
  // Set up event listeners
  generateBtn.addEventListener('click', generatePowerPoint);
  viewSlideshowBtn.addEventListener('click', viewSlideshow);
  backToRecordingsBtn.addEventListener('click', navigateToRecordings);
  
  // Load the recording
  loadRecording(recordingId, autoStart);
});

// Load recording data
function loadRecording(recordingId, autoStart = false) {
  setStatus('Loading your recording...');
  setProgress(5);
  
  // First, get the recordings metadata to find the current recording
  chrome.runtime.sendMessage({ action: "getRecordings" }, (response) => {
    if (response && response.recordings) {
      // Find the recording with the matching filename
      currentRecording = response.recordings.find(r => r.filename === recordingId);
      
      if (currentRecording) {
        // Set the title
        recordingSubtitle.textContent = currentRecording.title;
        
        // Now get the slides for this recording
        chrome.runtime.sendMessage({ 
          action: "getRecordingSlides",
          filename: recordingId
        }, (slidesResponse) => {
          if (slidesResponse && slidesResponse.slides && slidesResponse.slides.length > 0) {
            slides = slidesResponse.slides;
            setStatus('Ready to generate PowerPoint');
            setProgress(10);
            
            // Auto-start if requested
            if (autoStart && !isGenerating) {
              setTimeout(() => {
                generatePowerPoint();
              }, 500); // Small delay to ensure UI is ready
            }
          } else {
            showError('No slides found for this recording');
          }
        });
      } else {
        showError('Recording not found');
      }
    } else {
      showError('Failed to load recordings');
    }
  });
}

// Generate and download the PowerPoint
async function generatePowerPoint() {
  if (!window.PptxGenJS) {
    showError('PowerPoint generator script is not loaded yet. Please try again in a moment.');
    return;
  }
  
  if (!currentRecording || !slides || slides.length === 0) {
    showError('No slides available for this recording.');
    return;
  }
  
  try {
    isGenerating = true;
    isComplete = false;
    generateBtn.disabled = true;
    completeBadge.style.display = 'none';
    
    setStatus('Creating presentation...');
    setProgress(20);
    
    // Create a new PowerPoint document
    const pptx = new PptxGenJS();
    
    // Set presentation properties
    pptx.title = currentRecording.title;
    
    // Add slides directly - no title slide
    setStatus('Adding slides...');
    setProgress(30);
    
    for (let i = 0; i < slides.length; i++) {
      const slideData = slides[i];
      
      // Update progress
      const slideProgress = 30 + Math.round((i / slides.length) * 60);
      setProgress(slideProgress);
      setStatus(`Adding slide ${i + 1} of ${slides.length}...`);
      
      // Add the slide
      const slide = pptx.addSlide();
      
      // Get image dimensions from the data URL
      let imgWidth = 10;  // Default PowerPoint slide width
      let imgHeight = 5.625; // Default 16:9 ratio
      
      // Add the screenshot as full slide background
      slide.addImage({ 
        data: slideData.image, 
        x: 0, 
        y: 0, 
        w: imgWidth,
        h: imgHeight
      });
      
      // Calculate the most accurate click position
      let clickX, clickY;
      
      // Method 1: Use normalized coordinates
      if (typeof slideData.clickX === 'number' && typeof slideData.clickY === 'number') {
        clickX = slideData.clickX * imgWidth;
        clickY = slideData.clickY * imgHeight;
      } 
      // Method 2: Calculate from original viewport data
      else if (slideData.originalClientX !== undefined && slideData.originalViewportWidth !== undefined) {
        const scaleX = imgWidth / slideData.originalViewportWidth;
        const scaleY = imgHeight / slideData.originalViewportHeight;
        
        clickX = slideData.originalClientX * scaleX;
        clickY = slideData.originalClientY * scaleY;
      }
      // Fallback method
      else {
        clickX = imgWidth / 2;
        clickY = imgHeight / 2;
        console.warn('Could not determine accurate dot position, using center');
      }
      
      // Add the purple click indicator dot
      const dotSize = 0.25; // Size in PowerPoint units
      const dotX = clickX - (dotSize / 2);
      const dotY = clickY - (dotSize / 2);
      
      // Add purple dot
      slide.addShape(pptx.ShapeType.ellipse, {
        x: dotX,
        y: dotY,
        w: dotSize,
        h: dotSize,
        fill: { color: '800080' }, // Purple color
        line: { color: '800080', width: 1 },
        hyperlink: { tooltip: 'Next Slide', slide: i < slides.length - 1 ? i + 1 : i }
      });
      
      // Add slide number - minimal style
      slide.addText(`${i + 1}/${slides.length}`, { 
        x: 9.2, 
        y: 5.4, 
        w: 0.7, 
        h: 0.3, 
        fontSize: 10, 
        color: "ffffff",
        bold: true,
        align: "center",
        fill: { color: '000000', transparency: 50 }
      });
      
      // Add tooltip text if present as a chat bubble
      if (slideData.tooltipText) {
        // Calculate position for the tooltip text box next to the dot
        // We need to adjust position based on which side of the slide the dot is on
        const isOnRightHalf = clickX > (imgWidth / 2);
        
        let tooltipX, tooltipWidth = 3; // Width in PowerPoint units
        
        if (isOnRightHalf) {
          // If dot is on right half of slide, position tooltip to the left of dot
          tooltipX = clickX - tooltipWidth - (dotSize / 2);
        } else {
          // If dot is on left half, position tooltip to the right of dot
          tooltipX = clickX + (dotSize / 2);
        }
        
        // Position vertically centered with the dot
        const tooltipY = clickY - 0.4; // Slight offset upward
        
        // Add purple tooltip bubble with rounded corners
        const bubbleShape = slide.addShape(pptx.ShapeType.roundRect, {
          x: tooltipX,
          y: tooltipY,
          w: tooltipWidth,
          h: 0.8,
          fill: { color: '8A2BE2' }, // Purple bubble
          line: { color: '8A2BE2', width: 1 },
          rectRadius: 0.2 // Rounded corners
        });
        
        // Add text inside bubble
        slide.addText(slideData.tooltipText, {
          x: tooltipX + 0.1, // Slight padding
          y: tooltipY + 0.1,
          w: tooltipWidth - 0.2,
          h: 0.6,
          color: "FFFFFF", // White text
          fontSize: 12,
          fontFace: "Arial",
          valign: "middle",
          wrap: true
        });
        
        // Add a small triangle to point to the dot (arrow)
        let arrowPoints;
        if (isOnRightHalf) {
          // Right side dot - arrow points right
          arrowPoints = [
            { x: tooltipX + tooltipWidth, y: tooltipY + 0.4 },
            { x: tooltipX + tooltipWidth + 0.2, y: tooltipY + 0.4 },
            { x: tooltipX + tooltipWidth, y: tooltipY + 0.6 }
          ];
        } else {
          // Left side dot - arrow points left
          arrowPoints = [
            { x: tooltipX, y: tooltipY + 0.4 },
            { x: tooltipX - 0.2, y: tooltipY + 0.4 },
            { x: tooltipX, y: tooltipY + 0.6 }
          ];
        }
        
        slide.addShape(pptx.ShapeType.triangle, {
          points: arrowPoints,
          fill: { color: '8A2BE2' }, // Match bubble color
          line: { color: '8A2BE2', width: 1 }
        });
      }
    }
    
    // Update progress
    setStatus('Finalizing presentation...');
    setProgress(90);
    
    // Generate filename
    const filename = `${currentRecording.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
    
    // Save the PowerPoint file
    await pptx.writeFile({ fileName: `${filename}.pptx` });
    
    // Mark as complete
    setStatus('PowerPoint generated successfully!');
    setProgress(100);
    generateBtn.disabled = false;
    generateBtn.textContent = 'Download Again';
    completeBadge.style.display = 'inline-flex';
    isGenerating = false;
    isComplete = true;
    
  } catch (error) {
    console.error("Error generating PowerPoint:", error);
    showError(`Error generating PowerPoint: ${error.message || 'Unknown error occurred'}`);
    isGenerating = false;
    generateBtn.disabled = false;
    setProgress(0);
  }
}

// Set the status text
function setStatus(message) {
  statusText.textContent = message;
}

// Set the progress bar percentage
function setProgress(percent) {
  progress = percent;
  progressBar.style.width = `${percent}%`;
  
  // Add or remove the animation class
  if (percent < 100) {
    progressBar.classList.add('animating');
  } else {
    progressBar.classList.remove('animating');
  }
}

// Show an error message
function showError(message) {
  errorContainer.textContent = message;
  errorContainer.style.display = 'block';
  setStatus('Error occurred');
  setProgress(0);
}

// View the slideshow
function viewSlideshow() {
  if (!recordingId) return;
  chrome.tabs.update({ url: chrome.runtime.getURL(`viewer.html?recording=${recordingId}`) });
}

// Navigate to recordings list
function navigateToRecordings() {
  chrome.tabs.update({ url: chrome.runtime.getURL('recordings.html') });
}