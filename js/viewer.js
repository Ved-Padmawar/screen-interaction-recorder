// Get elements from the DOM
const recordingTitle = document.getElementById('recording-title');
const loadingState = document.getElementById('loading-state');
const slideContainer = document.getElementById('slide-container');
const navigation = document.getElementById('navigation');
const slideImage = document.getElementById('slide-image');
const clickIndicator = document.getElementById('click-indicator');
const slideNumber = document.getElementById('slide-number');
const prevButton = document.getElementById('prev-button');
const nextButton = document.getElementById('next-button');
const exportPptxButton = document.getElementById('export-pptx');
const exportHtmlButton = document.getElementById('export-html');
const backToRecordingsButton = document.getElementById('back-to-recordings');

// Global state
let currentRecording = null;
let slides = [];
let currentSlideIndex = 0;

// Initialize the viewer
document.addEventListener('DOMContentLoaded', () => {
  // Get recording ID from URL
  const params = new URLSearchParams(window.location.search);
  const recordingId = params.get('recording');
  
  if (!recordingId) {
    showError('No recording ID specified');
    return;
  }
  
  // Set up event listeners
  prevButton.addEventListener('click', showPreviousSlide);
  nextButton.addEventListener('click', showNextSlide);
  slideImage.addEventListener('click', showNextSlide);
  clickIndicator.addEventListener('click', showNextSlide); // Make the dot clickable
  exportPptxButton.addEventListener('click', exportToPowerPoint);
  exportHtmlButton.addEventListener('click', exportToHtml);
  backToRecordingsButton.addEventListener('click', navigateToRecordings);
  
  // Add keyboard navigation
  document.addEventListener('keydown', handleKeyDown);
  
  // Add CSS for tooltip chat bubbles
  addTooltipStyles();
  
  // Load the recording
  loadRecording(recordingId);
});

// Add CSS styles for tooltip chat bubbles
function addTooltipStyles() {
  const style = document.createElement('style');
  style.innerHTML = `
    .tooltip-bubble {
      position: absolute;
      left: 25px;
      top: -10px;
      border-radius: 12px;
      filter: drop-shadow(0 1px 4px rgba(0,0,0,0.2));
      min-width: 150px;
      max-width: 280px;
      z-index: 150;
      pointer-events: auto; /* Make tooltip clickable */
      transform-origin: left center;
      animation: tooltipPop 0.3s ease-out;
      background-color: transparent;
      padding: 0;
      cursor: pointer;
    }
    
    @keyframes tooltipPop {
      0% { transform: scale(0.5); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }
    
    .tooltip-text {
      display: inline-block;
      background-color: #8A2BE2; /* Purple color to match dot */
      color: white;
      text-align: left;
      border-radius: 12px;
      padding: 6px 10px;
      width: 100%;
      font-size: 14px;
      line-height: 1.3;
      word-wrap: break-word;
      white-space: pre-wrap;
      font-family: 'Arial', sans-serif;
    }
    
    /* Chat bubble arrow pointing to dot */
    .tooltip-bubble:before {
      content: "";
      position: absolute;
      top: 12px;
      left: -10px;
      border-width: 10px 10px 10px 0;
      border-style: solid;
      border-color: transparent #8A2BE2 transparent transparent;
    }
    
    /* Right-aligned tooltip for dots near the right edge */
    .tooltip-bubble.flip-left {
      left: auto;
      right: 25px;
    }
    
    .tooltip-bubble.flip-left:before {
      left: auto;
      right: -10px;
      transform: scaleX(-1);
    }
    
    /* Make indicator clickable with proper z-index */
    .click-indicator {
      z-index: 200;
      pointer-events: auto; /* Make the dot clickable */
      cursor: pointer;
      border: 2px solid rgba(138, 43, 226, 1);
      background-color: rgba(138, 43, 226, 0.8);
      animation: none;
    }
  `;
  document.head.appendChild(style);
}

// Load recording data
function loadRecording(recordingId) {
  showLoading(true);
  
  // First, get the recordings metadata to find the current recording
  chrome.runtime.sendMessage({ action: "getRecordings" }, (response) => {
    // Check for runtime error
    if (chrome.runtime.lastError) {
      showError(`Runtime error: ${chrome.runtime.lastError.message}`);
      return;
    }
    
    if (response && response.recordings) {
      // Find the recording with the matching filename
      currentRecording = response.recordings.find(r => r.filename === recordingId);
      
      if (currentRecording) {
        // Set the title
        recordingTitle.textContent = currentRecording.title;
        
        // Now get the slides for this recording
        chrome.runtime.sendMessage({ 
          action: "getRecordingSlides",
          filename: recordingId
        }, (slidesResponse) => {
          // Check for runtime error
          if (chrome.runtime.lastError) {
            showError(`Runtime error: ${chrome.runtime.lastError.message}`);
            return;
          }
          
          if (slidesResponse && slidesResponse.slides && slidesResponse.slides.length > 0) {
            slides = slidesResponse.slides;
            showSlide(0);
            showLoading(false);
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

// Show a specific slide
function showSlide(index) {
  if (!slides || !slides[index]) {
    return;
  }
  
  currentSlideIndex = index;
  const slide = slides[index];
  
  try {
    console.log('Showing slide:', index, 'with data:', slide);
    
    // Set the image source - when image loads, position the click indicator
    slideImage.onload = function() {
      console.log('Image loaded with dimensions:', slideImage.width, 'x', slideImage.height);
      // After image loads, position the click indicator accurately
      positionClickIndicator(slide);
    };
    
    slideImage.src = slide.image;
    slideImage.alt = `Slide ${index + 1}`;
    
    // Position click indicator immediately too (in case image is cached)
    console.log('Positioning dot immediately (in case image is cached)');
    positionClickIndicator(slide);
    
    // Update the slide number
    slideNumber.textContent = `${index + 1} / ${slides.length}`;
    
    // Update navigation buttons
    prevButton.disabled = index === 0;
    nextButton.disabled = index === slides.length - 1;
    
    // Show the slide container and navigation
    slideContainer.style.display = 'flex';
    navigation.style.display = 'flex';
  } catch (error) {
    console.error('Error showing slide:', error);
    showError(`Error showing slide: ${error.message}`);
  }
}

// Position the click indicator accurately and add tooltip bubble
function positionClickIndicator(slide) {
  // Get the current image dimensions
  const imgWidth = slideImage.width || slideImage.offsetWidth || slideImage.naturalWidth || 800;
  const imgHeight = slideImage.height || slideImage.offsetHeight || slideImage.naturalHeight || 600;
  
  // Get all position data from the slide
  const { 
    clickX, clickY, 
    exactClickX, exactClickY, 
    originalClientX, originalClientY, 
    originalViewportWidth, originalViewportHeight 
  } = slide;
  
  // Calculate position using best available method
  let dotX, dotY;
  
  // Method 1: Use exact normalized coordinates if available
  if (typeof clickX === 'number' && typeof clickY === 'number') {
    // Check if it's a percentage value (for new format)
    if (clickX > 1 || clickY > 1) {
      dotX = (clickX / 100) * imgWidth;
      dotY = (clickY / 100) * imgHeight;
    } else {
      dotX = clickX * imgWidth;
      dotY = clickY * imgHeight;
    }
  }
  // Method 2: Use exact pixel coordinates if available
  else if (exactClickX !== undefined && exactClickY !== undefined) {
    dotX = exactClickX * imgWidth;
    dotY = exactClickY * imgHeight;
  }
  // Method 3: Calculate from original client coordinates
  else if (originalClientX !== undefined && originalViewportWidth !== undefined) {
    // Calculate scale ratio
    const scaleX = imgWidth / originalViewportWidth;
    const scaleY = imgHeight / originalViewportHeight;
    
    dotX = originalClientX * scaleX;
    dotY = originalClientY * scaleY;
  }
  // Fallback method
  else {
    dotX = imgWidth / 2;
    dotY = imgHeight / 2;
    console.warn('Could not determine accurate dot position, using center');
  }
  
  // Ensure dot is within bounds
  dotX = Math.max(0, Math.min(imgWidth, dotX));
  dotY = Math.max(0, Math.min(imgHeight, dotY));
  
  // Apply position - using absolute positioning relative to the slide container
  clickIndicator.style.left = `${dotX}px`;
  clickIndicator.style.top = `${dotY}px`;
  
  // Make the click indicator more visible
  clickIndicator.style.transform = 'translate(-50%, -50%)'; // Center the indicator
  clickIndicator.style.width = '20px';
  clickIndicator.style.height = '20px';
  clickIndicator.style.backgroundColor = 'rgba(138, 43, 226, 0.8)';
  clickIndicator.style.border = '2px solid rgba(138, 43, 226, 1)';
  clickIndicator.style.borderRadius = '50%';
  clickIndicator.style.pointerEvents = 'auto'; // Make it clickable
  clickIndicator.style.cursor = 'pointer'; // Show pointer cursor
  clickIndicator.style.zIndex = '200'; // Ensure it's above tooltip
  clickIndicator.style.boxShadow = '0 0 5px 2px rgba(138, 43, 226, 0.5)';
  
  // No animation
  clickIndicator.style.animation = 'none';
  
  // Clear any existing tooltip
  clearTooltip();
  
  // Create tooltip bubble if the slide has tooltip text
  if (slide.tooltipText) {
    // Create new tooltip bubble
    const tooltipBubble = document.createElement('div');
    tooltipBubble.className = 'tooltip-bubble';
    tooltipBubble.style.pointerEvents = 'auto'; // Make tooltip clickable
    tooltipBubble.style.cursor = 'pointer'; // Show pointer cursor
    tooltipBubble.style.zIndex = '150';
    
    const tooltipText = document.createElement('div');
    tooltipText.className = 'tooltip-text';
    tooltipText.textContent = slide.tooltipText;
    
    tooltipBubble.appendChild(tooltipText);
    clickIndicator.appendChild(tooltipBubble);
    
    // Adjust position to ensure tooltip is visible in viewport
    setTimeout(() => {
      adjustTooltipPosition(tooltipBubble);
    }, 50);
  }
  
  // Make the dot visible
  clickIndicator.style.display = 'block';
}

// Adjust tooltip position to keep it on screen
function adjustTooltipPosition(tooltip) {
  if (!tooltip) return;
  
  const slideRect = slideContainer.getBoundingClientRect();
  const indicatorRect = clickIndicator.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  
  // Check if tooltip would go beyond right edge
  if (tooltipRect.right > slideRect.right - 20) {
    tooltip.classList.add('flip-left');
  } else {
    tooltip.classList.remove('flip-left');
  }
}

// Remove any existing tooltip bubbles
function clearTooltip() {
  const existingTooltip = clickIndicator.querySelector('.tooltip-bubble');
  if (existingTooltip) {
    existingTooltip.remove();
  }
}

// Show the previous slide
function showPreviousSlide() {
  if (currentSlideIndex > 0) {
    showSlide(currentSlideIndex - 1);
  }
}

// Show the next slide
function showNextSlide() {
  if (currentSlideIndex < slides.length - 1) {
    showSlide(currentSlideIndex + 1);
  }
}

// Handle keyboard navigation
function handleKeyDown(e) {
  if (e.key === 'ArrowLeft') {
    e.preventDefault(); // Prevent scrolling
    showPreviousSlide();
  } else if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault(); // Prevent scrolling
    showNextSlide();
  } else if (e.key === 'Escape') {
    navigateToRecordings();
  }
}

// Show/hide the loading state
function showLoading(show) {
  loadingState.style.display = show ? 'flex' : 'none';
}

// Show an error message
function showError(message) {
  loadingState.textContent = `Error: ${message}`;
  loadingState.style.color = '#d32f2f';
  showLoading(true);
}

// Export to PowerPoint
function exportToPowerPoint() {
  if (!currentRecording) return;
  
  // Instead of sending a message to background script, open the PowerPoint generator page directly
  chrome.tabs.create({ 
    url: chrome.runtime.getURL(`pptx-generator.html?recording=${currentRecording.filename}&autostart=true`)
  });
}

// Export to HTML
function exportToHtml() {
  if (!currentRecording || !slides || slides.length === 0) return;
  
  chrome.runtime.sendMessage({ 
    action: "exportHtml",
    recording: currentRecording,
    slides: slides
  });
}

// Navigate to recordings list
function navigateToRecordings() {
  chrome.tabs.update({ url: chrome.runtime.getURL('recordings.html') });
}

// Handle window resize
window.addEventListener('resize', function() {
  // Re-adjust any tooltip positions when the window is resized
  if (slides[currentSlideIndex]) {
    positionClickIndicator(slides[currentSlideIndex]);
  }
});