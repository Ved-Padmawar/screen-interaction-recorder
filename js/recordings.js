// Get elements from the DOM
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const recordingsGrid = document.getElementById('recordings-grid');
const backButton = document.getElementById('back-button');
const recordingCardTemplate = document.getElementById('recording-card-template');

// Recordings data
let recordings = [];

// Initialize recordings page
document.addEventListener('DOMContentLoaded', () => {
  console.log('Recordings page initialized');
  
  // Set up event listeners
  backButton.addEventListener('click', navigateToRecorder);
  
  // Add debug info to page
  loadingState.innerHTML = 'Loading recordings... <div id="debug-info" style="margin-top: 10px; font-size: 12px; color: #666;"></div>';
  
  // Load recordings
  loadRecordings();
});

// Load all recordings
function loadRecordings() {
  console.log('Loading recordings...');
  showLoading(true);
  updateDebugInfo('Sending getRecordings message to background script...');
  
  // Check if chrome.runtime is available
  if (!chrome.runtime) {
    updateDebugInfo('Error: chrome.runtime is not available', true);
    showEmpty(true);
    showLoading(false);
    return;
  }
  
  chrome.runtime.sendMessage({ action: "getRecordings" }, (response) => {
    // Check for runtime error
    if (chrome.runtime.lastError) {
      console.error('Runtime error:', chrome.runtime.lastError);
      updateDebugInfo(`Error: ${chrome.runtime.lastError.message}`, true);
      showEmpty(true);
      showLoading(false);
      return;
    }
    
    console.log('Got response:', response);
    updateDebugInfo(`Received response: ${JSON.stringify(response)}`);
    
    if (response && response.recordings) {
      updateDebugInfo(`Found ${response.recordings.length} recordings`);
      
      // Sort recordings by date (newest first)
      recordings = response.recordings.sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );
      
      renderRecordings();
    } else {
      updateDebugInfo('No recordings found or invalid response');
      showEmpty(true);
    }
    
    showLoading(false);
  });
  
  // Backup timeout to handle case where response never arrives
  setTimeout(() => {
    if (loadingState.style.display === 'block') {
      console.error('Timeout waiting for getRecordings response');
      updateDebugInfo('Error: Timeout waiting for response from background script', true);
      showEmpty(true);
      showLoading(false);
    }
  }, 5000);
}

// Update debug info
function updateDebugInfo(message, isError = false) {
  const debugInfo = document.getElementById('debug-info');
  if (debugInfo) {
    const entry = document.createElement('div');
    entry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
    if (isError) {
      entry.style.color = '#d32f2f';
    }
    debugInfo.appendChild(entry);
    console.log(message);
  }
}

// Render recordings list
function renderRecordings() {
  console.log('Rendering recordings:', recordings);
  updateDebugInfo('Rendering recordings list...');
  
  // Clear grid
  recordingsGrid.innerHTML = '';
  
  if (recordings.length === 0) {
    updateDebugInfo('No recordings to display');
    showEmpty(true);
    return;
  }
  
  showEmpty(false);
  
  try {
    // Create and append recording cards
    recordings.forEach((recording, index) => {
      updateDebugInfo(`Creating card for recording: ${recording.title}`);
      const card = createRecordingCard(recording);
      recordingsGrid.appendChild(card);
    });
    updateDebugInfo('All recording cards rendered successfully');
  } catch (error) {
    console.error('Error rendering recordings:', error);
    updateDebugInfo(`Error rendering recordings: ${error.message}`, true);
  }
}

// Create a recording card element
function createRecordingCard(recording) {
  try {
    // Clone the template
    const card = recordingCardTemplate.content.cloneNode(true);
    
    // Set data attributes
    const cardElement = card.querySelector('.recording-card');
    cardElement.setAttribute('data-filename', recording.filename);
    
    // Set content
    card.querySelector('.recording-title').textContent = recording.title;
    card.querySelector('.recording-date').textContent = formatDate(recording.date);
    
    // Set slide count if available
    if (recording.slideCount && recording.slideCount > 0) {
      card.querySelector('.slide-count').textContent = `${recording.slideCount} slides`;
    } else {
      card.querySelector('.slide-count').style.display = 'none';
    }
    
    // Add event listeners
    cardElement.addEventListener('click', () => viewRecording(recording.filename));
    
    card.querySelector('.export-html').addEventListener('click', (e) => {
      e.stopPropagation();
      exportToHtml(recording.filename);
    });
    
    card.querySelector('.delete-recording').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteRecording(recording.filename);
    });
    
    return card;
  } catch (error) {
    console.error('Error creating recording card:', error);
    updateDebugInfo(`Error creating card: ${error.message}`, true);
    throw error;
  }
}

// Format date for display
function formatDate(dateString) {
  try {
    return new Date(dateString).toLocaleString();
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Unknown date';
  }
}

// Show/hide the loading state
function showLoading(show) {
  loadingState.style.display = show ? 'block' : 'none';
}

// Show/hide the empty state
function showEmpty(show) {
  emptyState.style.display = show ? 'block' : 'none';
  recordingsGrid.style.display = show ? 'none' : 'grid';
}

// Navigate back to the recorder
function navigateToRecorder() {
  chrome.tabs.update({ url: chrome.runtime.getURL('popup.html') });
}

// View a recording
function viewRecording(filename) {
  chrome.tabs.update({ url: chrome.runtime.getURL(`viewer.html?recording=${filename}`) });
}

// Export a recording to PowerPoint
function exportToPowerPoint(filename) {
  chrome.tabs.create({ 
    url: chrome.runtime.getURL(`pptx-generator.html?recording=${filename}`)
  });
}

// Export a recording to HTML
function exportToHtml(filename) {
  console.log(`Exporting HTML for recording: ${filename}`);
  updateDebugInfo(`Exporting HTML for recording: ${filename}`);
  
  // Get the recording data first
  chrome.runtime.sendMessage({ 
    action: "getRecordingSlides",
    filename: filename
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Runtime error:', chrome.runtime.lastError);
      updateDebugInfo(`Error getting slides: ${chrome.runtime.lastError.message}`, true);
      alert(`Error exporting HTML: ${chrome.runtime.lastError.message}`);
      return;
    }
    
    if (response && response.slides && response.slides.length > 0) {
      // Get the recording metadata
      const recording = recordings.find(r => r.filename === filename);
      if (!recording) {
        updateDebugInfo(`Recording not found: ${filename}`, true);
        alert('Recording not found');
        return;
      }
      
      // Send the export HTML message to background script
      chrome.runtime.sendMessage({ 
        action: "exportHtml",
        recording: recording,
        slides: response.slides
      }, (exportResponse) => {
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          updateDebugInfo(`Error exporting HTML: ${chrome.runtime.lastError.message}`, true);
          alert(`Error exporting HTML: ${chrome.runtime.lastError.message}`);
          return;
        }
        
        updateDebugInfo(`HTML export initiated successfully`);
      });
    } else {
      updateDebugInfo(`No slides found for recording: ${filename}`, true);
      alert('No slides found for this recording');
    }
  });
}

// Delete a recording
function deleteRecording(filename) {
  if (confirm('Are you sure you want to delete this recording?')) {
    console.log(`Deleting recording: ${filename}`);
    updateDebugInfo(`Attempting to delete recording: ${filename}`);
    
    // Show loading state or disable buttons while deleting
    const cardElement = document.querySelector(`.recording-card[data-filename="${filename}"]`);
    if (cardElement) {
      cardElement.style.opacity = '0.5';
      const buttons = cardElement.querySelectorAll('button');
      buttons.forEach(button => button.disabled = true);
    }
    
    chrome.runtime.sendMessage({ 
      action: "deleteRecording",
      filename: filename
    }, (response) => {
      // Check for runtime error
      if (chrome.runtime.lastError) {
        console.error('Runtime error:', chrome.runtime.lastError);
        updateDebugInfo(`Error deleting recording: ${chrome.runtime.lastError.message}`, true);
        alert(`Error deleting recording: ${chrome.runtime.lastError.message}`);
        
        // Reset card if it exists
        if (cardElement) {
          cardElement.style.opacity = '1';
          const buttons = cardElement.querySelectorAll('button');
          buttons.forEach(button => button.disabled = false);
        }
        return;
      }
      
      if (response && response.success) {
        console.log(`Successfully deleted recording: ${filename}`);
        updateDebugInfo(`Successfully deleted recording: ${filename}`);
        
        // Remove from local array
        const originalLength = recordings.length;
        recordings = recordings.filter(r => r.filename !== filename);
        
        // Check if anything was actually removed
        if (recordings.length === originalLength) {
          updateDebugInfo(`Warning: Recording was not found in local data: ${filename}`, true);
        }
        
        // Re-render the list
        renderRecordings();
      } else {
        console.error('Failed to delete recording:', response);
        updateDebugInfo(`Failed to delete recording: ${JSON.stringify(response)}`, true);
        alert('Failed to delete recording. Please try again.');
        
        // Reset card if it exists
        if (cardElement) {
          cardElement.style.opacity = '1';
          const buttons = cardElement.querySelectorAll('button');
          buttons.forEach(button => button.disabled = false);
        }
      }
    });
  }
}