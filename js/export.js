// Function to generate and download an HTML version of a recording
async function exportAsHTML(recording, slides) {
  try {
    // Create the HTML content
    const htmlContent = generateHTMLContent(recording, slides);
    
    // Create a Blob with the HTML content
    const blob = new Blob([htmlContent], { type: 'text/html' });
    
    // Create a URL for the Blob
    const url = URL.createObjectURL(blob);
    
    // Create a link element
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recording.filename}.html`;
    
    // Trigger a click on the link to download the file
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error("Error exporting as HTML:", error);
    return false;
  }
}

// Function to generate the HTML content
function generateHTMLContent(recording, slides) {
  // We need to keep all the original position data for accurate positioning
  const encodedSlides = slides.map((slide, index) => ({
    image: slide.image,
    clickX: slide.clickX,
    clickY: slide.clickY,
    tooltipText: slide.tooltipText || null,
    // Preserve all original position data for accuracy
    originalClientX: slide.originalClientX,
    originalClientY: slide.originalClientY,
    originalViewportWidth: slide.originalViewportWidth,
    originalViewportHeight: slide.originalViewportHeight,
    index: index
  }));
  
  // Format the recording date
  const recordingDate = new Date(recording.date).toLocaleString();
  
  // Create the HTML template
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self';">
<title>${escapeHtml(recording.title)} - Screen Interaction Recording</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    margin: 0;
    padding: 0;
    background-color: #1a1a1a;
    color: white;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  
  .slide-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 20px;
    width: 100%;
    height: 100vh;
    max-width: 100%;
    max-height: 100vh;
  }
  
  .slide {
    position: relative;
    max-width: 100%;
    max-height: 100vh;
    box-shadow: 0 5px 20px rgba(0, 0, 0, 0.5);
  }
  
  .slide img {
    max-width: 100%;
    max-height: 100vh;
    object-fit: contain;
    display: block;
  }
  
  .slide-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
    z-index: 5;
  }
  
  .click-indicator {
    position: absolute;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background-color: rgba(128, 0, 128, 0.5);
    border: 2px solid rgb(128, 0, 128);
    transform: translate(-50%, -50%);
    cursor: pointer;
    z-index: 200;
    animation: none;
  }
  
    .slide-number {    position: absolute;    bottom: 15px;    left: 15px;    background-color: rgba(0, 0, 0, 0.6);    color: white;    padding: 5px 10px;    border-radius: 4px;    font-size: 14px;    z-index: 10;  }

  /* Updated slimmer tooltip bubble styles */
  .tooltip-bubble {
    position: absolute;
    left: 25px;
    top: -10px;
    background-color: transparent;
    border-radius: 14px;
    padding: 2px;
    filter: drop-shadow(0 1px 6px rgba(0,0,0,0.2));
    min-width: 150px;
    max-width: 280px;
    z-index: 150;
    pointer-events: auto;
    transform-origin: left center;
    animation: tooltipPop 0.3s ease-out;
    cursor: pointer;
  }

  @keyframes tooltipPop {
    0% { transform: scale(0.5); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }

  .tooltip-text {
    display: inline-block;
    background-color: #8A2BE2; /* Purple color */
    color: white;
    text-align: left;
    border-radius: 12px;
    padding: 8px 12px;
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
  
  /* Pulse animation for the click indicator */
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(128, 0, 128, 0.4); }
    70% { box-shadow: 0 0 0 10px rgba(128, 0, 128, 0); }
    100% { box-shadow: 0 0 0 0 rgba(128, 0, 128, 0); }
  }
</style>
</head>
<body>
<div class="slide-container">
  <div id="current-slide" class="slide">
    <!-- Initial slide will be loaded by JavaScript -->
    <img id="slide-image" src="" alt="Loading slide...">
    <div id="click-indicator" class="click-indicator"></div>
    <div id="slide-number" class="slide-number">1 / ${slides.length}</div>
  </div>
</div>

<script>
  // Slides data
  const slidesData = ${JSON.stringify(encodedSlides)};
  let currentSlideIndex = 0;
  
  // DOM elements
  const slideImage = document.getElementById('slide-image');
  const clickIndicator = document.getElementById('click-indicator');
  const slideNumber = document.getElementById('slide-number');
  const slideContainer = document.querySelector('.slide-container');
  const slideElement = document.querySelector('.slide');
  
  // Calculate scale to fit viewport while maintaining aspect ratio
  function adjustViewportScale() {
    // No scaling needed - we're using responsive sizing now
    adjustTooltipPosition();
  }
  
  // Show a specific slide
  function showSlide(index) {
    if (!slidesData || !slidesData[index]) return;
    
    currentSlideIndex = index;
    const slide = slidesData[index];
    
    // Load image first
    slideImage.onload = function() {
      // After image loads, position the dot accurately
      positionDotAccurately(slide);
      
      // Adjust any tooltips
      setTimeout(adjustTooltipPosition, 50);
    };
    
    // Set the image source
    slideImage.src = slide.image;
    slideImage.alt = 'Slide ' + (index + 1);
    
    // Update slide number
    slideNumber.textContent = (index + 1) + ' / ' + slidesData.length;
  }
  
  // Show next slide
  function showNextSlide() {
    if (currentSlideIndex < slidesData.length - 1) {
      showSlide(currentSlideIndex + 1);
    }
  }
  
  // Show previous slide
  function showPrevSlide() {
    if (currentSlideIndex > 0) {
      showSlide(currentSlideIndex - 1);
    }
  }
  
  // Position the dot accurately based on original viewport data
  function positionDotAccurately(slide) {
    // Position using best available method
    // 1. Try exact calculated position from normalized coordinates
    if (typeof slide.clickX === 'number' && typeof slide.clickY === 'number') {
      // Handle the case if the value is already in percentage
      const isPercentage = slide.clickX > 1 || slide.clickY > 1;
      
      if (isPercentage) {
        // Already in percentage (0-100 range)
        clickIndicator.style.left = slide.clickX + '%';
        clickIndicator.style.top = slide.clickY + '%';
      } else {
        // Normalized (0-1 range)
        clickIndicator.style.left = (slide.clickX * 100) + '%';
        clickIndicator.style.top = (slide.clickY * 100) + '%';
      }
    }
    // 2. Fallback to original client coordinates with scaling ratio
    else if (slide.originalClientX !== undefined && slide.originalViewportWidth !== undefined) {
      // Convert original coordinates to percentages
      const dotXPercent = (slide.originalClientX / slide.originalViewportWidth) * 100;
      const dotYPercent = (slide.originalClientY / slide.originalViewportHeight) * 100;
      
      clickIndicator.style.left = dotXPercent + '%';
      clickIndicator.style.top = dotYPercent + '%';
    }
    
    // Ensure the transform property is set to center the dot on its position
    clickIndicator.style.transform = 'translate(-50%, -50%)';
    
    // Clear any existing tooltip
    while (clickIndicator.firstChild) {
      clickIndicator.removeChild(clickIndicator.firstChild);
    }
    
    // Add tooltip if it exists
    if (slide.tooltipText) {
      createTooltip(slide.tooltipText);
    }
  }
  
  // Create tooltip bubble
  function createTooltip(tooltipText) {
    const tooltipBubble = document.createElement('div');
    tooltipBubble.className = 'tooltip-bubble';
    tooltipBubble.style.pointerEvents = 'auto'; // Make tooltip clickable
    tooltipBubble.style.cursor = 'pointer'; // Show pointer cursor
    
    const tooltipTextElem = document.createElement('div');
    tooltipTextElem.className = 'tooltip-text';
    tooltipTextElem.textContent = tooltipText;
    
    tooltipBubble.appendChild(tooltipTextElem);
    clickIndicator.appendChild(tooltipBubble);
  }
  
  // Adjust tooltip position to keep it inside viewport
  function adjustTooltipPosition() {
    const tooltip = clickIndicator.querySelector('.tooltip-bubble');
    if (!tooltip) return;
    
    const slideRect = slideElement.getBoundingClientRect();
    const indicatorRect = clickIndicator.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    // If tooltip extends beyond right edge of slide, flip it to the left
    if (tooltipRect.right > slideRect.right - 20) {
      tooltip.classList.add('flip-left');
    } else {
      tooltip.classList.remove('flip-left');
    }
  }
  
  // Make the purple dot clickable to advance slides
  clickIndicator.addEventListener('click', function(e) {
    e.stopPropagation();
    showNextSlide();
  });
  
  // Event listeners
  slideImage.addEventListener('click', function() {
    showNextSlide();
  });
  
  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowLeft') {
      showPrevSlide();
    } else if (e.key === 'ArrowRight' || e.key === ' ') {
      showNextSlide();
    }
  });
  
  // Handle window resizing
  window.addEventListener('resize', function() {
    // Reposition dot and adjust tooltip when window is resized
    adjustViewportScale();
    const currentSlide = slidesData[currentSlideIndex];
    if (currentSlide) {
      positionDotAccurately(currentSlide);
      adjustTooltipPosition();
    }
  });
  
  // Initialize view
  document.addEventListener('DOMContentLoaded', function() {
    adjustViewportScale();
    showSlide(0);
  });
  
  // Initialize first slide and scale
  adjustViewportScale();
  showSlide(0);
</script>
</body>
</html>`;
}

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export the function
window.exportAsHTML = exportAsHTML;