// Get elements from the DOM
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const recordingsGrid = document.getElementById('recordings-grid');
const backButton = document.getElementById('back-button');
const settingsButton = document.getElementById('settings-button'); // Get settings button
const recordingCardTemplate = document.getElementById('recording-card-template');

// Recordings data
let recordings = [];

// Initialize recordings page
document.addEventListener('DOMContentLoaded', () => {
  console.log('Recordings page initialized');

  // Set up event listeners
  backButton.addEventListener('click', navigateToRecorder);
  settingsButton.addEventListener('click', navigateToSettings); // Add listener for settings

  // Add debug info to page
  if (loadingState) { // Check if element exists
    const debugDiv = document.createElement('div');
    debugDiv.id = "debug-info";
    debugDiv.style.cssText = "margin-top: 10px; font-size: 12px; color: #666; max-height: 100px; overflow-y: auto;";
    loadingState.appendChild(debugDiv);
  }


  // Load recordings
  loadRecordings();
});

// Load all recordings
function loadRecordings() {
  console.log('Loading recordings...');
  showLoading(true);
  updateDebugInfo('Sending getRecordings message to background script...');

  if (!chrome.runtime || !chrome.runtime.sendMessage) {
    updateDebugInfo('Error: chrome.runtime or sendMessage is not available', true);
    showEmpty(true);
    showLoading(false);
    return;
  }

  chrome.runtime.sendMessage({ action: "getRecordings" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Runtime error:', chrome.runtime.lastError);
      updateDebugInfo(`Error: ${chrome.runtime.lastError.message}`, true);
      showEmpty(true);
      showLoading(false);
      return;
    }

    console.log('Got response:', response);
    updateDebugInfo(`Received response: ${response ? JSON.stringify(response).substring(0, 200) + '...' : 'undefined'}`);

    if (response && response.recordings) {
      updateDebugInfo(`Found ${response.recordings.length} recordings`);
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

  setTimeout(() => {
    if (loadingState && loadingState.style.display === 'block') {
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
    debugInfo.scrollTop = debugInfo.scrollHeight; // Auto-scroll
    console.log(message);
  }
}

// Render recordings list
function renderRecordings() {
  console.log('Rendering recordings:', recordings);
  updateDebugInfo('Rendering recordings list...');
  recordingsGrid.innerHTML = '';

  if (recordings.length === 0) {
    updateDebugInfo('No recordings to display');
    showEmpty(true);
    return;
  }
  showEmpty(false);

  try {
    recordings.forEach((recording) => {
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
    const card = recordingCardTemplate.content.cloneNode(true);
    const cardElement = card.querySelector('.recording-card');
    cardElement.setAttribute('data-filename', recording.filename);

    card.querySelector('.recording-title').textContent = recording.title || 'Untitled Recording';
    card.querySelector('.recording-date').textContent = formatDate(recording.date);

    if (recording.slideCount && recording.slideCount > 0) {
      card.querySelector('.slide-count').textContent = `${recording.slideCount} slide${recording.slideCount > 1 ? 's' : ''}`;
    } else {
      card.querySelector('.slide-count').style.display = 'none';
    }

    cardElement.addEventListener('click', () => viewRecording(recording.filename));

    // New "Edit Tooltips" button
    const editButton = card.querySelector('.edit-tooltips');
    if (editButton) {
        editButton.addEventListener('click', (e) => {
            e.stopPropagation();
            editRecordingTooltips(recording.filename);
        });
    }


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
    throw error; // Re-throw to be caught by renderRecordings
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
  if (loadingState) loadingState.style.display = show ? 'block' : 'none';
  if (recordingsGrid) recordingsGrid.style.display = show ? 'none' : 'grid';
}

// Show/hide the empty state
function showEmpty(show) {
  if (emptyState) emptyState.style.display = show ? 'block' : 'none';
  if (recordingsGrid) recordingsGrid.style.display = show ? 'none' : 'grid';
}

// Navigate back to the recorder popup
function navigateToRecorder() {
  // For extensions, opening the popup programmatically is tricky.
  // A common approach is to guide the user or open the options page if that's more suitable.
  // For now, let's assume it might try to open the popup's URL if it were a regular page.
  // This might not work as expected for a browser action popup.
  // A better UX might be to just close this tab if it's the only one related to the extension.
  // Or, if popup.html can be opened as a tab (depends on manifest and intent):
  try {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    window.close(); // Close the recordings tab
  } catch (e) {
    updateDebugInfo("Could not navigate to recorder, perhaps close this tab manually.", true);
  }
}

// Navigate to settings page
function navigateToSettings() {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html')});
}


// View a recording (opens viewer.html)
function viewRecording(filename) {
  chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?recording=${filename}`) });
}

// Navigate to tooltip editor page
function editRecordingTooltips(filename) {
    chrome.tabs.create({ url: chrome.runtime.getURL(`tooltip-editor.html?recording=${filename}`) });
}


// Export a recording to HTML
function exportToHtml(filename) {
  console.log(`Exporting HTML for recording: ${filename}`);
  updateDebugInfo(`Exporting HTML for recording: ${filename}`);

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
      const recording = recordings.find(r => r.filename === filename);
      if (!recording) {
        updateDebugInfo(`Recording not found: ${filename}`, true);
        alert('Recording not found');
        return;
      }
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
        updateDebugInfo(`HTML export initiated successfully for ${filename}`);
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
      if (chrome.runtime.lastError) {
        console.error('Runtime error:', chrome.runtime.lastError);
        updateDebugInfo(`Error deleting recording: ${chrome.runtime.lastError.message}`, true);
        alert(`Error deleting recording: ${chrome.runtime.lastError.message}`);
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
        const originalLength = recordings.length;
        recordings = recordings.filter(r => r.filename !== filename);
        if (recordings.length === originalLength) {
          updateDebugInfo(`Warning: Recording was not found in local data after delete confirmation: ${filename}`, true);
        }
        renderRecordings();
      } else {
        console.error('Failed to delete recording:', response);
        updateDebugInfo(`Failed to delete recording: ${response ? JSON.stringify(response) : 'No response'}`, true);
        alert('Failed to delete recording. Please try again.');
        if (cardElement) {
          cardElement.style.opacity = '1';
          const buttons = cardElement.querySelectorAll('button');
          buttons.forEach(button => button.disabled = false);
        }
      }
    });
  }
}
