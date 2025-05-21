// Get elements from the DOM
const recordingButton = document.getElementById('recording-button');
const titleInput = document.getElementById('recording-title');
const recordingIndicator = document.getElementById('recording-indicator');
const viewRecordingsButton = document.getElementById('view-recordings');

// Track recording state
let isRecording = false;

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  // Set default title
  const defaultTitle = `Recording ${new Date().toLocaleString()}`;
  titleInput.placeholder = defaultTitle;
  
  // Check current recording status
  chrome.runtime.sendMessage({ action: "getRecordingStatus" }, (response) => {
    if (response && response.isRecording) {
      setRecordingState(true);
    }
  });
  
  // Set up event listeners
  recordingButton.addEventListener('click', toggleRecording);
  viewRecordingsButton.addEventListener('click', openRecordings);
});

// Toggle recording state
function toggleRecording() {
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
}

// Start recording
function startRecording() {
  const title = titleInput.value || titleInput.placeholder;
  
  chrome.runtime.sendMessage({ 
    action: "startRecording",
    title: title
  }, (response) => {
    if (response && response.success) {
      setRecordingState(true);
    }
  });
}

// Stop recording
function stopRecording() {
  chrome.runtime.sendMessage({ 
    action: "stopRecording" 
  }, (response) => {
    if (response && response.success) {
      setRecordingState(false);
      
      // Open recordings page in a new tab
      setTimeout(() => {
        openRecordings();
      }, 500);
    }
  });
}

// Update UI to reflect recording state
function setRecordingState(recording) {
  isRecording = recording;
  
  if (isRecording) {
    recordingButton.textContent = 'Stop Recording';
    recordingButton.classList.add('recording');
    recordingIndicator.style.display = 'flex';
    titleInput.disabled = true;
  } else {
    recordingButton.textContent = 'Start Recording';
    recordingButton.classList.remove('recording');
    recordingIndicator.style.display = 'none';
    titleInput.disabled = false;
  }
}

// Open recordings page in a new tab
function openRecordings() {
  const recordingsUrl = chrome.runtime.getURL('recordings.html');
  
  chrome.tabs.create({ 
    url: recordingsUrl,
    active: true
  });
  
  // Close the popup
  window.close();
}