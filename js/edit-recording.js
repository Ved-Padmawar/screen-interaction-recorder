// DOM Elements
const loadingState = document.getElementById('loading-state');
const editContent = document.getElementById('edit-content');
const progressIndicator = document.getElementById('progress-indicator');
const interactionsList = document.getElementById('interactions-list');
const saveButton = document.getElementById('save-button');
const cancelButton = document.getElementById('cancel-button');
const interactionTemplate = document.getElementById('interaction-template');

// Global state
let currentRecording = null;
let recordingData = [];
let recordingId = null;

// Initialize the edit page
document.addEventListener('DOMContentLoaded', () => {
  // Get recording ID from URL
  const params = new URLSearchParams(window.location.search);
  recordingId = params.get('recording');
  
  if (!recordingId) {
    showError('No recording ID specified');
    return;
  }
  
  // Set up event listeners
  saveButton.addEventListener('click', saveTooltips);
  cancelButton.addEventListener('click', cancelEditing);
  
  // Load the recording
  loadRecording(recordingId);
});

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
            recordingData = slidesResponse.slides;
            displayInteractions(recordingData);
            showLoading(false);
          } else {
            showError('No interactions found for this recording');
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

// Display all interactions for editing
function displayInteractions(interactions) {
  // Clear existing interactions
  interactionsList.innerHTML = '';
  
  // Update progress indicator
  progressIndicator.textContent = `Edit ${interactions.length} interactions`;
  
  // Add each interaction to the list
  interactions.forEach((interaction, index) => {
    const interactionElement = createInteractionElement(interaction, index);
    interactionsList.appendChild(interactionElement);
  });
  
  // Show the edit content
  editContent.style.display = 'block';
}

// Create an interaction element from the template
function createInteractionElement(interaction, index) {
  // Clone the template
  const interactionElement = interactionTemplate.content.cloneNode(true).querySelector('.interaction-item');
  
  // Set the image source
  const imageElement = interactionElement.querySelector('img');
  imageElement.src = interaction.image;
  imageElement.alt = `Interaction ${index + 1}`;
  
  // Position the click dot
  const clickDot = interactionElement.querySelector('.click-dot');
  positionClickDot(clickDot, interaction, imageElement);
  
  // Set the interaction details
  const urlElement = interactionElement.querySelector('.interaction-url');
  urlElement.textContent = `URL: ${interaction.details?.url || 'Unknown'}`;
  
  const elementInfo = interactionElement.querySelector('.interaction-element');
  elementInfo.textContent = `Element: ${interaction.details?.elementType || 'Unknown'} ${interaction.details?.elementId ? `#${interaction.details.elementId}` : ''}`;
  
  // Set existing tooltip text if available
  const tooltipInput = interactionElement.querySelector('.tooltip-input');
  tooltipInput.value = interaction.tooltipText || '';
  tooltipInput.dataset.index = index;
  
  // Return the element
  return interactionElement;
}

// Position the click dot on the image
function positionClickDot(dot, interaction, imageElement) {
  // Ensure the image is loaded first
  if (imageElement.complete) {
    positionDot();
  } else {
    imageElement.onload = positionDot;
  }
  
  function positionDot() {
    // Get the actual displayed dimensions of the image in the preview
    const imgWidth = imageElement.width || imageElement.offsetWidth || imageElement.naturalWidth;
    const imgHeight = imageElement.height || imageElement.offsetHeight || imageElement.naturalHeight;
    
    // Get original dimensions from screenshot (if available)
    let originalWidth, originalHeight;
    
    // Try to get the original image dimensions
    if (imageElement.naturalWidth && imageElement.naturalHeight) {
      originalWidth = imageElement.naturalWidth;
      originalHeight = imageElement.naturalHeight;
    } else {
      // If natural dimensions not available, use the actual dimensions
      originalWidth = imgWidth;
      originalHeight = imgHeight;
    }
    
    // Calculate scaling factor between original and displayed sizes
    const scaleX = imgWidth / originalWidth;
    const scaleY = imgHeight / originalHeight;
    
    let dotX, dotY;
    
    // Get original click coordinates (not percentages)
    if (typeof interaction.clientX === 'number' && typeof interaction.clientY === 'number' &&
        typeof interaction.viewportWidth === 'number' && typeof interaction.viewportHeight === 'number') {
      // Use the raw client coordinates and scale them to the preview image
      const originalViewportWidth = interaction.viewportWidth;
      const originalViewportHeight = interaction.viewportHeight;
      
      // Calculate position as a ratio of the original viewport
      const ratioX = interaction.clientX / originalViewportWidth;
      const ratioY = interaction.clientY / originalViewportHeight;
      
      // Apply the ratio to the preview image dimensions
      dotX = ratioX * imgWidth;
      dotY = ratioY * imgHeight;
    }
    // Try using clickX/Y (percentages) if available
    else if (typeof interaction.clickX === 'number' && typeof interaction.clickY === 'number') {
      dotX = (interaction.clickX / 100) * imgWidth;
      dotY = (interaction.clickY / 100) * imgHeight;
    }
    // Try using exactClickX/Y (0-1 ratio values) if available
    else if (typeof interaction.exactClickX === 'number' && typeof interaction.exactClickY === 'number') {
      dotX = interaction.exactClickX * imgWidth;
      dotY = interaction.exactClickY * imgHeight;
    }
    // Fall back to using calculated positions from other fields
    else if (interaction.details && interaction.details.elementRect) {
      // Calculate center of the element using its bounding rect
      const rect = interaction.details.elementRect;
      const centerX = rect.left + (rect.width / 2);
      const centerY = rect.top + (rect.height / 2);
      
      // Scale to preview size
      dotX = (centerX / originalWidth) * imgWidth;
      dotY = (centerY / originalHeight) * imgHeight;
    }
    // Last resort - center of image
    else {
      dotX = imgWidth / 2;
      dotY = imgHeight / 2;
    }
    
    // Apply the dot position
    dot.style.left = `${dotX}px`;
    dot.style.top = `${dotY}px`;
  }
}

// Save tooltip text from all inputs
function saveTooltips() {
  // Collect all tooltip inputs
  const tooltipInputs = document.querySelectorAll('.tooltip-input');
  
  // Update recording data with tooltip text
  tooltipInputs.forEach(input => {
    const index = parseInt(input.dataset.index);
    if (!isNaN(index) && recordingData[index]) {
      recordingData[index].tooltipText = input.value;
    }
  });
  
  // Save updated recording data
  chrome.runtime.sendMessage({
    action: "updateRecordingTooltips",
    filename: recordingId,
    slides: recordingData
  }, (response) => {
    if (chrome.runtime.lastError) {
      showError(`Runtime error: ${chrome.runtime.lastError.message}`);
      return;
    }
    
    if (response && response.success) {
      // Navigate to the viewer
      navigateToViewer();
    } else {
      showError('Failed to save tooltip text');
    }
  });
}

// Navigate to the recording viewer
function navigateToViewer() {
  window.location.href = `viewer.html?recording=${recordingId}`;
}

// Cancel editing and go back to recordings
function cancelEditing() {
  window.location.href = 'recordings.html';
}

// Show/hide loading state
function showLoading(show) {
  loadingState.style.display = show ? 'block' : 'none';
  editContent.style.display = show ? 'none' : 'block';
}

// Show an error message
function showError(message) {
  loadingState.textContent = `Error: ${message}`;
  loadingState.style.color = '#f44336';
  loadingState.style.display = 'block';
  editContent.style.display = 'none';
} 