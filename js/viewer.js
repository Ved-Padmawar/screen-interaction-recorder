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
      background: #1c2030;
      border: 1px solid #333a52;
      border-radius: 8px;
      border-bottom-left-radius: 2px;
      color: #ccd3e8;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      font-weight: 500;
      padding: 7px 11px;
      min-width: 150px;
      max-width: 280px;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      z-index: 150;
      pointer-events: auto;
      cursor: pointer;
      animation: tooltipPop 0.2s ease-out;
      transform-origin: left center;
    }

    @keyframes tooltipPop {
      0% { transform: scale(0.85); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }

    /* single triangle tail pointing left toward the dot */
    .tooltip-bubble::before {
      content: '';
      position: absolute;
      top: 12px;
      left: -6px;
      border-width: 6px 6px 6px 0;
      border-style: solid;
      border-color: transparent #333a52 transparent transparent;
    }
    .tooltip-bubble::after { content: none; }

    /* Right-aligned tooltip for dots near the right edge */
    .tooltip-bubble.flip-left {
      left: auto;
      right: 25px;
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 2px;
    }
    .tooltip-bubble.flip-left::before {
      left: auto;
      right: -6px;
      border-width: 6px 0 6px 6px;
      border-color: transparent transparent transparent #333a52;
    }

    /* Make indicator clickable with proper z-index */
    .click-indicator {
      z-index: 200;
      pointer-events: auto;
      cursor: pointer;
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

    // Update progress bar and nav label
    const progressFill = document.getElementById('progress-fill');
    const navLabel = document.getElementById('nav-label');
    if (progressFill) progressFill.style.width = `${((index + 1) / slides.length) * 100}%`;
    if (navLabel) navLabel.textContent = `${index + 1} / ${slides.length}`;

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
    clickXPercent, clickYPercent,
    clientX, clientY,
    originalClientX, originalClientY, 
    originalViewportWidth, originalViewportHeight 
  } = slide;
  
  // Calculate position using best available method
  let dotX, dotY;
  let positionMethod = "unknown";
  
  // Method 1: Use clickXPercent/clickYPercent if available (newest format)
  if (typeof clickXPercent === 'number' && typeof clickYPercent === 'number') {
    dotX = (clickXPercent / 100) * imgWidth;
    dotY = (clickYPercent / 100) * imgHeight;
    positionMethod = "clickPercent";
  }
  // Method 2: Use exact normalized coordinates (0-1 range)
  else if (typeof exactClickX === 'number' && typeof exactClickY === 'number') {
    dotX = exactClickX * imgWidth;
    dotY = exactClickY * imgHeight;
    positionMethod = "exactClick";
  }
  // Method 3: Use legacy clickX/clickY values
  else if (typeof clickX === 'number' && typeof clickY === 'number') {
    // Check if it's a percentage value (some older format)
    if (clickX > 1 || clickY > 1) {
      dotX = (clickX / 100) * imgWidth;
      dotY = (clickY / 100) * imgHeight;
    } else {
      dotX = clickX * imgWidth;
      dotY = clickY * imgHeight;
    }
    positionMethod = "legacyClick";
  }
  // Method 4: Use client coordinates directly
  else if (typeof clientX === 'number' && typeof clientY === 'number' && 
          typeof originalViewportWidth === 'number' && typeof originalViewportHeight === 'number') {
    const scaleX = imgWidth / originalViewportWidth;
    const scaleY = imgHeight / originalViewportHeight;
    
    dotX = clientX * scaleX;
    dotY = clientY * scaleY;
    positionMethod = "clientCoords";
  }
  // Method 5: Calculate from original client coordinates
  else if (typeof originalClientX === 'number' && typeof originalClientY === 'number' && 
          typeof originalViewportWidth === 'number' && typeof originalViewportHeight === 'number') {
    // Calculate scale ratio
    const scaleX = imgWidth / originalViewportWidth;
    const scaleY = imgHeight / originalViewportHeight;
    
    dotX = originalClientX * scaleX;
    dotY = originalClientY * scaleY;
    positionMethod = "originalCoords";
  }
  // Fallback method
  else {
    dotX = imgWidth / 2;
    dotY = imgHeight / 2;
    console.warn('Could not determine accurate dot position, using center');
    positionMethod = "fallback";
  }
  
  // Log position method used for debugging
  console.log(`Using position method: ${positionMethod}`, {
    dotX, dotY, 
    availableData: {
      clickX, clickY, exactClickX, exactClickY, clickXPercent, clickYPercent,
      clientX, clientY, originalClientX, originalClientY,
      originalViewportWidth, originalViewportHeight
    }
  });
  
  // Ensure dot is within bounds
  dotX = Math.max(0, Math.min(imgWidth, dotX));
  dotY = Math.max(0, Math.min(imgHeight, dotY));
  
  // Apply position - using absolute positioning relative to the slide container
  clickIndicator.style.left = `${dotX}px`;
  clickIndicator.style.top = `${dotY}px`;
  
  clickIndicator.style.transform = 'translate(-50%, -50%)';
  clickIndicator.style.borderRadius = '50%';
  clickIndicator.style.pointerEvents = 'auto';
  clickIndicator.style.cursor = 'pointer';
  clickIndicator.style.zIndex = '200';
  clickIndicator.style.animation = 'none';
  
  // Clear any existing tooltip
  clearTooltip();
  
  // Create tooltip bubble if the slide has tooltip text
  if (slide.tooltipText) {
    // Create new tooltip bubble
    const tooltipBubble = document.createElement('div');
    tooltipBubble.className = 'tooltip-bubble';
    tooltipBubble.textContent = slide.tooltipText;
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
  window.location.href = chrome.runtime.getURL(`pptx-generator.html?recording=${currentRecording.filename}&autostart=true`);
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