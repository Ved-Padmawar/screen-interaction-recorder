// Global variables to track recording state
let isRecording = false;
let recordingTitle = "";
let recordingData = [];
let recordingStartTime = null;
let activeTabId = null; // Track the active tab ID

// Log a message to console with timestamp - only in development mode
const DEBUG_MODE = false; // Set to true for verbose logging during development
function logDebug(message) {
  if (DEBUG_MODE) {
    console.log(`[${new Date().toLocaleTimeString()}] SIR_BG: ${message}`);
  }
}

// Helper to check if the extension context is valid
function isExtensionContextValid() {
  return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
}

// Log initialization
logDebug('Background script initialized');

// Listen for tab updates to re-inject the content script when pages change during recording
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (isRecording && tabId === activeTabId && changeInfo.status === 'complete') {
    logDebug(`Tab ${tabId} completed loading, re-injecting content script`);
    try {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['contentScript.js']
      }).then(() => {
        logDebug('Content script re-injected on page navigation');
        // Notify the content script to re-initialize its recording state if necessary
        sendMessageToContentScript(tabId, { action: 'startRecording' }, (success) => {
          logDebug(`Direct message to re-initialize recording after page load ${success ? 'succeeded' : 'failed'}`);
        });
      }).catch(err => {
        logDebug(`Error re-injecting content script: ${err.message}`);
      });
    } catch (error) {
      logDebug(`Extension context error during tab update: ${error.message}`);
    }
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isExtensionContextValid()) {
    logDebug('Extension context invalidated, ignoring message.');
    sendResponse({ error: 'Extension context invalidated' });
    return false; // Indicate that sendResponse will not be called asynchronously
  }

  logDebug(`Received message: ${message.action} from ${sender.tab ? 'tab ' + sender.tab.id : 'popup/other'}`);

  switch (message.action) {
    case "getRecordingStatus":
      logDebug(`Returning recording status: ${isRecording}`);
      sendResponse({ isRecording });
      break;

    case "startRecording":
      isRecording = true;
      recordingTitle = message.title || `Recording ${new Date().toLocaleString()}`;
      recordingData = [];
      recordingStartTime = Date.now();
      logDebug(`Starting recording: ${recordingTitle}`);

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          const tabId = tabs[0].id;
          activeTabId = tabId;
          logDebug(`Starting recording on tab: ${tabId}`);
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['contentScript.js']
          }).then(() => {
            logDebug('Content script injected successfully for startRecording');
            sendMessageToContentScript(tabId, { action: 'startRecording' }, (success) => {
              logDebug(`Direct message to start recording in content script ${success ? 'succeeded' : 'failed'}`);
            });
          }).catch(err => {
            logDebug(`Error injecting content script for startRecording: ${err.message}`);
          });
        } else {
          logDebug('No active tab found for starting recording');
        }
      });
      sendResponse({ success: true });
      break;

    case "stopRecording":
      if (!isRecording) {
        logDebug('Stop requested but not recording — ignoring duplicate.');
        sendResponse({ success: false, error: 'Not recording.' });
        return true;
      }
      isRecording = false;
      logDebug(`Stopping recording: ${recordingTitle}. Collected ${recordingData.length} interactions.`);
      const currentActiveTabId = activeTabId; // Preserve for use in sendMessage
      activeTabId = null;

      const recording = {
        title: recordingTitle,
        timestamp: recordingStartTime,
        date: new Date().toISOString(),
        duration: Date.now() - recordingStartTime,
        data: recordingData,
        slideCount: recordingData.length,
        filename: `recording_${Date.now()}`
      };

      // Clear in-memory recording state immediately so any duplicate stop is a no-op
      recordingData = [];
      recordingTitle = '';

      saveRecording(recording, (success) => {
        if (currentActiveTabId) {
            sendMessageToContentScript(currentActiveTabId, { action: 'stopRecording' }, (msgSuccess) => {
            logDebug(`Direct message to stop recording in content script ${msgSuccess ? 'succeeded' : 'failed'}`);
          });
        }
        if (success) {
            const targetTabId = (sender.tab && sender.tab.id) || currentActiveTabId;
            const recordingsUrl = chrome.runtime.getURL('recordings.html');
            if (targetTabId) {
                chrome.tabs.update(targetTabId, { url: recordingsUrl }, () => {
                    logDebug('Navigated to recordings page');
                    sendResponse({ success: true });
                });
            } else {
                chrome.tabs.create({ url: recordingsUrl }, () => {
                    logDebug('Opened recordings page in new tab');
                    sendResponse({ success: true });
                });
            }
        } else {
            logDebug('Failed to save recording, not opening recordings page.');
            sendResponse({ success: false, error: 'Failed to save recording.' });
        }
      });
      return true; // Keep message channel open for async response

    case "recordInteraction":
      if (isRecording) {
        logDebug(`Recording interaction: ${message.data.type}`);
        if (message.data.id === 'sir-tooltip-popup' || (message.data.className && typeof message.data.className === 'string' && message.data.className.includes('sir-'))) {
            logDebug('Ignoring interaction with extension UI element.');
            sendResponse({ success: true });
            return true;
        }

        recordingData.push({
          ...message.data,
          timestamp: Date.now() - recordingStartTime
        });
        sendResponse({ success: true });
      } else {
        logDebug('Ignoring interaction: not recording');
        sendResponse({ success: false, error: 'Not recording' });
      }
      break;

    case "takeScreenshot":
      logDebug('Request to take screenshot received.');
      let requestingTabId = sender?.tab?.id;

      if (!requestingTabId) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0]) {
                requestingTabId = tabs[0].id;
                logDebug(`No sender tab ID, using active tab ${requestingTabId} for screenshot.`);
                proceedWithScreenshot(requestingTabId, sendResponse);
            } else {
                logDebug('No sender tab ID and no active tab found for screenshot.');
                sendResponse({ screenshot: null, error: 'No tab ID available for screenshot' });
            }
        });
      } else {
        proceedWithScreenshot(requestingTabId, sendResponse);
      }
      return true;

    case "getRecordings":
      logDebug('Getting recordings from storage');
      chrome.storage.local.get(['recordings'], (result) => {
        if (chrome.runtime.lastError) {
            logDebug(`Error getting recordings: ${chrome.runtime.lastError.message}`);
            sendResponse({ recordings: [], error: chrome.runtime.lastError.message });
            return;
        }
        const recordings = result.recordings || [];
        logDebug(`Found ${recordings.length} recordings in storage`);
        sendResponse({ recordings: recordings });
      });
      return true;

    case "getRecordingSlides":
      logDebug(`Getting slides for recording: ${message.filename}`);
      chrome.storage.local.get(['recordings'], (result) => {
        if (chrome.runtime.lastError) {
            logDebug(`Error getting recordings for slides: ${chrome.runtime.lastError.message}`);
            sendResponse({ slides: [], error: chrome.runtime.lastError.message });
            return;
        }
        const recordings = result.recordings || [];
        const recording = recordings.find(r => r.filename === message.filename);
        if (recording && recording.data) {
          logDebug(`Found recording with ${recording.data.length} interactions`);
          const slides = recording.data.map((interaction, index) => ({
            index: index,
            image: interaction.screenshot || '',
            clickX: interaction.clickXPercent !== undefined ? interaction.clickXPercent : (interaction.exactClickX !== undefined ? interaction.exactClickX * 100 : (interaction.clickX > 1 ? interaction.clickX : interaction.clickX * 100)),
            clickY: interaction.clickYPercent !== undefined ? interaction.clickYPercent : (interaction.exactClickY !== undefined ? interaction.exactClickY * 100 : (interaction.clickY > 1 ? interaction.clickY : interaction.clickY * 100)),
            tooltipText: interaction.tooltipText || null,
            originalClientX: interaction.originalClientX,
            originalClientY: interaction.originalClientY,
            originalViewportWidth: interaction.originalViewportWidth,
            originalViewportHeight: interaction.originalViewportHeight,
            exactClickX: interaction.exactClickX,
            exactClickY: interaction.exactClickY,
            timestamp: interaction.timestamp,
            type: interaction.type,
            details: {
              url: interaction.pageUrl,
              title: interaction.pageTitle,
              elementType: interaction.tagName,
              elementId: interaction.id,
              elementClass: interaction.className,
              elementText: interaction.text,
              scrollX: interaction.scrollX,
              scrollY: interaction.scrollY
            }
          }));
          logDebug(`Generated ${slides.length} slides`);
          sendResponse({ slides: slides });
        } else {
          logDebug('Recording not found or no interaction data');
          sendResponse({ slides: [] });
        }
      });
      return true;

    case "updateRecording": // New message handler
        logDebug(`Updating recording: ${message.updatedRecording?.filename}`);
        if (!message.updatedRecording || !message.updatedRecording.filename) {
            logDebug('Error: No updated recording data or filename provided.');
            sendResponse({ success: false, error: 'Invalid data for update.' });
            return true;
        }
        chrome.storage.local.get(['recordings'], (result) => {
            if (chrome.runtime.lastError) {
                logDebug(`Error getting recordings for update: ${chrome.runtime.lastError.message}`);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
                return;
            }
            let recordings = result.recordings || [];
            const recordingIndex = recordings.findIndex(r => r.filename === message.updatedRecording.filename);

            if (recordingIndex > -1) {
                recordings[recordingIndex] = message.updatedRecording; // Replace the old recording
                chrome.storage.local.set({ recordings }, () => {
                    if (chrome.runtime.lastError) {
                        logDebug(`Error saving updated recordings: ${chrome.runtime.lastError.message}`);
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        logDebug(`Recording ${message.updatedRecording.filename} updated successfully.`);
                        sendResponse({ success: true });
                    }
                });
            } else {
                logDebug(`Error: Recording to update not found - ${message.updatedRecording.filename}`);
                sendResponse({ success: false, error: 'Recording not found for update.' });
            }
        });
        return true; // Keep channel open for async response

    case "generatePowerPoint":
      logDebug(`Generating PowerPoint for recording: ${message.filename}`);
      chrome.storage.local.get(['recordings'], (result) => {
        const recordings = result.recordings || [];
        const recording = recordings.find(r => r.filename === message.filename);
        if (recording) {
          logDebug(`Found recording: ${recording.title}, opening pptx-generator.html`);
          const targetTabId = (sender.tab && sender.tab.id) || currentActiveTabId;
          const pptxUrl = chrome.runtime.getURL(`pptx-generator.html?recording=${message.filename}&autostart=true`);
          if (targetTabId) {
            chrome.tabs.update(targetTabId, { url: pptxUrl });
          } else {
            chrome.tabs.create({ url: pptxUrl });
          }
          sendResponse({ success: true });
        } else {
          logDebug(`Recording not found for PowerPoint generation: ${message.filename}`);
          sendResponse({ success: false, error: 'Recording not found' });
        }
      });
      return true;

    case "exportHtml":
      logDebug(`Exporting HTML for recording: ${message.recording?.title}`);
      if (message.recording && message.slides && message.slides.length > 0) {
        try {
          const htmlContent = generateHTMLSlideshow(message.recording, message.slides);
          const safeFilename = (message.recording.title || "recording").replace(/[^a-z0-9]/gi, '_').toLowerCase();
          chrome.downloads.download({
            url: `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`,
            filename: `${safeFilename}_slideshow.html`,
            saveAs: true
          }, downloadId => {
            if (chrome.runtime.lastError) {
              logDebug(`Error creating download: ${chrome.runtime.lastError.message}`);
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              logDebug(`HTML download initiated with ID: ${downloadId}`);
              sendResponse({ success: true, downloadId });
            }
          });
        } catch (error) {
          logDebug(`Error generating HTML: ${error.message}`);
          sendResponse({ success: false, error: error.message });
        }
      } else {
        logDebug('Export HTML failed: missing recording data or slides');
        sendResponse({ success: false, error: 'Missing recording data or slides' });
      }
      return true;

    case "deleteRecording":
      if (message.filename) {
        logDebug(`Deleting recording: ${message.filename}`);
        deleteRecording(message.filename, (success) => {
          logDebug(`Delete operation ${success ? 'succeeded' : 'failed'}`);
          sendResponse({ success });
        });
        return true;
      }
      logDebug('Delete recording failed: no filename provided');
      sendResponse({ success: false });
      break;

    case "deleteRecordings":
      if (Array.isArray(message.filenames) && message.filenames.length > 0) {
        logDebug(`Bulk deleting ${message.filenames.length} recordings`);
        deleteRecordings(message.filenames, (result) => {
          sendResponse(result);
        });
        return true;
      }
      sendResponse({ success: false, error: 'No filenames provided' });
      break;

    default:
      logDebug(`Unknown action: ${message.action}`);
      sendResponse({ error: `Unknown action: ${message.action}` });
  }
  return true;
});

function proceedWithScreenshot(tabId, sendResponse) {
    takeScreenshot(tabId)
      .then(dataUrl => {
        logDebug(`Screenshot taken successfully for tab ${tabId}.`);
        sendResponse({ screenshot: dataUrl });
      })
      .catch(error => {
        logDebug(`Error taking screenshot for tab ${tabId}: ${error.message || 'Unknown error'}`);
        sendResponse({ screenshot: null, error: error.message });
      });
}

function takeScreenshot(tabId) {
  return new Promise((resolve, reject) => {
    if (!isExtensionContextValid()) {
      logDebug('Extension context invalidated before taking screenshot.');
      return reject(new Error('Extension context invalidated'));
    }
    if (typeof tabId !== 'number') {
        logDebug(`Invalid tabId for screenshot: ${tabId}`);
        return reject(new Error('Invalid tabId for screenshot'));
    }

    try {
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, dataUrl => {
        if (!isExtensionContextValid()) {
          logDebug('Extension context invalidated during screenshot capture.');
          return reject(new Error('Extension context invalidated during screenshot capture'));
        }
        if (chrome.runtime.lastError) {
          logDebug(`chrome.runtime.lastError during screenshot: ${chrome.runtime.lastError.message}`);
          if (chrome.runtime.lastError.message.includes("No tab with id") || chrome.runtime.lastError.message.includes("No current window")) {
             chrome.tabs.query({active: true, currentWindow: true}, (activeTabs) => {
                if (activeTabs && activeTabs[0]) {
                    logDebug(`Retrying screenshot with active tab: ${activeTabs[0].id}`);
                    chrome.tabs.captureVisibleTab(activeTabs[0].windowId, { format: 'png' }, retryDataUrl => {
                        if (chrome.runtime.lastError) {
                            logDebug(`Retry screenshot failed: ${chrome.runtime.lastError.message}`);
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(retryDataUrl);
                        }
                    });
                } else {
                    reject(chrome.runtime.lastError);
                }
             });
          } else {
            reject(chrome.runtime.lastError);
          }
        } else {
          resolve(dataUrl);
        }
      });
    } catch (error) {
      logDebug(`Error in takeScreenshot try-catch block: ${error.message}`);
      reject(error);
    }
  });
}

function sendMessageToContentScript(tabId, message, callback) {
  if (typeof tabId !== 'number') {
    logDebug(`Invalid tabId for sendMessageToContentScript: ${tabId}`);
    if (callback) callback(false, { error: 'Invalid tabId' });
    return;
  }
  logDebug(`Sending direct message to tab ${tabId}: ${JSON.stringify(message)}`);
  chrome.tabs.sendMessage(tabId, message, (response) => {
    if (chrome.runtime.lastError) {
      logDebug(`Error sending message to content script (tab ${tabId}): ${chrome.runtime.lastError.message}`);
      if (callback) callback(false, chrome.runtime.lastError);
    } else {
      logDebug(`Message sent to tab ${tabId} successfully, response: ${JSON.stringify(response)}`);
      if (callback) callback(true, response);
    }
  });
}

function saveRecording(recording, callback) {
  logDebug(`Saving recording: ${recording.title}`);
  chrome.storage.local.get(['recordings'], (result) => {
    if (chrome.runtime.lastError) {
        logDebug(`Error getting recordings for saving: ${chrome.runtime.lastError.message}`);
        if (callback) callback(false);
        return;
    }
    const recordings = result.recordings || [];
    logDebug(`Found ${recordings.length} existing recordings in storage`);
    recordings.push(recording);
    chrome.storage.local.set({ recordings }, () => {
      if (chrome.runtime.lastError) {
        logDebug(`Error saving to storage: ${chrome.runtime.lastError.message}`);
        if (callback) callback(false);
      } else {
        logDebug(`Successfully saved ${recordings.length} recordings to storage`);
        if (callback) callback(true);
      }
    });
  });
}

function deleteRecording(filename, callback) {
  logDebug(`Attempting to delete recording: ${filename}`);
  chrome.storage.local.get(['recordings'], (result) => {
    if (chrome.runtime.lastError) {
        logDebug(`Error getting recordings for deletion: ${chrome.runtime.lastError.message}`);
        if (callback) callback(false);
        return;
    }
    const recordings = result.recordings || [];
    logDebug(`Current recordings count: ${recordings.length}`);
    const initialLength = recordings.length;
    const updatedRecordings = recordings.filter(r => r.filename !== filename);

    if (updatedRecordings.length < initialLength) {
      logDebug(`Recording removed from array, new count: ${updatedRecordings.length}`);
      chrome.storage.local.set({ recordings: updatedRecordings }, () => {
        if (chrome.runtime.lastError) {
          logDebug(`Error saving updated recordings to storage: ${chrome.runtime.lastError.message}`);
          if (callback) callback(false);
        } else {
          logDebug(`Successfully saved updated recordings to storage`);
          if (callback) callback(true);
        }
      });
    } else {
      logDebug(`Recording not found with filename: ${filename}`);
      if (callback) callback(false);
    }
  });
}

function deleteRecordings(filenames, callback) {
  chrome.storage.local.get(['recordings'], (result) => {
    if (chrome.runtime.lastError) {
      if (callback) callback({ success: false, error: chrome.runtime.lastError.message });
      return;
    }
    const recordings = result.recordings || [];
    const filenameSet = new Set(filenames);
    const updated = recordings.filter(r => !filenameSet.has(r.filename));
    const deletedCount = recordings.length - updated.length;

    chrome.storage.local.set({ recordings: updated }, () => {
      if (chrome.runtime.lastError) {
        if (callback) callback({ success: false, error: chrome.runtime.lastError.message });
      } else {
        logDebug(`Bulk delete removed ${deletedCount} recordings`);
        if (callback) callback({ success: true, deleted: deletedCount });
      }
    });
  });
}

function generateHTMLSlideshow(recording, slides) {
  logDebug(`Generating HTML slideshow for ${recording.title} with ${slides.length} slides`);

  // Determine the fixed dimensions from the first slide, with fallbacks
  let frameWidth = 1280; // Default width
  let frameHeight = 720;  // Default height
  if (slides && slides[0] && slides[0].originalViewportWidth && slides[0].originalViewportHeight) {
    frameWidth = slides[0].originalViewportWidth;
    frameHeight = slides[0].originalViewportHeight;
  } else if (slides && slides[0] && slides[0].viewportWidth && slides[0].viewportHeight) {
    // Fallback to viewportWidth if original is not available (older recordings)
    frameWidth = slides[0].viewportWidth;
    frameHeight = slides[0].viewportHeight;
  }
  logDebug(`Slideshow frame dimensions: ${frameWidth}x${frameHeight}`);


  const slidesHtml = slides.map((slide, index) => {
    const tooltipHtml = slide.tooltipText
      ? `<div class="tooltip-bubble"><div class="tooltip-text">${slide.tooltipText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div></div>`
      : '';
    const clickX = slide.clickX; // Already a percentage
    const clickY = slide.clickY; // Already a percentage

    return `
      <div class="slide" id="slide-${index + 1}" style="display: ${index === 0 ? 'flex' : 'none'};">
        <img class="slide-image-instance" src="${slide.image}" alt="Slide ${index + 1}">
        <div class="click-indicator ${slide.tooltipText ? 'has-tooltip' : ''}"
             style="left: ${clickX}%; top: ${clickY}%;">
          ${tooltipHtml}
        </div>
        <div class="slide-number">${index + 1} / ${slides.length}</div>
      </div>`;
  }).join('\n');

  const tooltipAdjustScript = `
    function adjustAllTooltips() {
      const activeSlide = document.querySelector('.slide.active');
      if (!activeSlide) return;
      const indicator = activeSlide.querySelector('.click-indicator.has-tooltip');
      if (!indicator) return;
      const tooltip = indicator.querySelector('.tooltip-bubble');
      if (!tooltip) return;

      const slideFrame = document.querySelector('.slideshow-frame'); // Use the fixed frame
      if (!slideFrame) return;

      const frameRect = slideFrame.getBoundingClientRect();
      const indicatorScreenX = indicator.getBoundingClientRect().left; // Screen X of dot
      const tooltipRect = tooltip.getBoundingClientRect();   // Relative to viewport initially

      // Check if tooltip (when positioned to the right of the dot) extends beyond right edge of the frame
      if (indicatorScreenX + (indicator.offsetWidth / 2) + 28 + tooltip.offsetWidth > frameRect.right - 10) { // 10px buffer from image edge
        tooltip.classList.add('flip-left');
      } else {
        tooltip.classList.remove('flip-left');
      }
      // Basic vertical check (can be improved)
      if (tooltipRect.top < frameRect.top + 10) {
          tooltip.style.top = '10px'; // Push down a bit from top edge of frame
      } else if (tooltipRect.bottom > frameRect.bottom - 10) {
          tooltip.style.bottom = '10px'; // Push up a bit from bottom edge of frame
          tooltip.style.top = 'auto';
      }
    }
    document.addEventListener('DOMContentLoaded', () => { if (totalSlides > 0) showSlide(0); });
    window.addEventListener('resize', () => { if (totalSlides > 0) adjustAllTooltips(); });
    function updateTooltipsAfterSlideChange() { setTimeout(adjustAllTooltips, 50); }
  `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${recording.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background-color: #0a0a0a;
      color: white;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      padding: 20px; /* Padding around the fixed frame */
    }
    .slideshow-frame {
      width: ${frameWidth}px;
      height: ${frameHeight}px;
      max-width: calc(100vw - 40px); /* Ensure frame fits in viewport, considering body padding */
      max-height: calc(100vh - 40px);/* Ensure frame fits in viewport, considering body padding */
      position: relative;
      overflow: hidden; /* Clips content if image is larger than frame before object-fit */
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 20px rgba(0,0,0,0.7);
      background-color: #000; /* Background for letter/pillar boxing */
    }
    .slide {
      position: absolute; /* Stack slides on top of each other */
      top: 0; left: 0;
      width: 100%; /* Fill the slideshow-frame */
      height: 100%; /* Fill the slideshow-frame */
      display: none; /* Initially hidden */
      align-items: center;
      justify-content: center;
    }
    .slide.active {
      display: flex; /* Show the active slide */
      z-index: 1;
    }
    .slide-image-instance {
      display: block;
      width: 100%; /* Image attempts to fill slide div */
      height: 100%;/* Image attempts to fill slide div */
      object-fit: contain; /* Scales image down to fit, maintains aspect ratio */
      cursor: pointer;
    }
    .click-indicator {
      position: absolute;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background-color: rgba(108, 110, 247, 0.9);
      border: 2px solid rgb(108, 110, 247);
      transform: translate(-50%, -50%);
      cursor: pointer;
      z-index: 200;
      box-shadow: 0 0 10px rgba(108, 110, 247, 0.3);
    }
    .tooltip-bubble {
      position: absolute;
      left: 28px; /* Position relative to the dot's edge */
      top: 50%;
      transform: translateY(-50%);
      background-color: #6c6ef7;
      color: white;
      padding: 8px 12px;
      border-radius: 12px;
      min-width: 150px;
      max-width: 280px;
      font-size: 14px;
      line-height: 1.3;
      word-wrap: break-word;
      white-space: pre-wrap;
      font-family: 'Arial', sans-serif;
      z-index: 210;
      filter: drop-shadow(0 1px 4px rgba(0,0,0,0.25));
      pointer-events: auto;
      cursor: pointer;
      animation: tooltipPop 0.3s ease-out;
    }
    @keyframes tooltipPop { 0% { transform: scale(0.5) translateY(-50%); opacity: 0; } 100% { transform: scale(1) translateY(-50%); opacity: 1; } }
    .tooltip-bubble::before {
      content: "";
      position: absolute;
      top: 50%;
      left: -8px;
      transform: translateY(-50%);
      border-width: 8px 8px 8px 0;
      border-style: solid;
      border-color: transparent #6c6ef7 transparent transparent;
    }
    .tooltip-bubble.flip-left {
      left: auto;
      right: 28px;
    }
    .tooltip-bubble.flip-left::before {
      left: auto;
      right: -8px;
      border-color: transparent transparent transparent #6c6ef7;
      border-width: 8px 0 8px 8px;
    }
    .slide-number {
      position: absolute;
      bottom: 10px;
      left: 10px;
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 13px;
      z-index: 220; /* Ensure it's above image and tooltip */
    }
  </style>
</head>
<body>
  <div class="slideshow-frame">
    ${slidesHtml}
  </div>
  <script>
    let currentSlideIndex = 0;
    const totalSlides = ${slides.length};
    const slidesElements = document.querySelectorAll('.slide');
    const slideFrame = document.querySelector('.slideshow-frame');

    function showSlide(index) {
      if (index < 0 || index >= totalSlides) return;
      slidesElements.forEach((s, i) => {
        s.style.display = (i === index) ? 'flex' : 'none'; // Use flex to center image via CSS
        s.classList.toggle('active', i === index);
      });
      currentSlideIndex = index;
      updateTooltipsAfterSlideChange();
    }

    function showNextSlide() { if (currentSlideIndex < totalSlides - 1) showSlide(currentSlideIndex + 1); }
    function showPrevSlide() { if (currentSlideIndex > 0) showSlide(currentSlideIndex - 1); }

    slideFrame.addEventListener('click', function(e) {
      if (e.target.classList.contains('slide-image-instance') || e.target.classList.contains('click-indicator') || e.target.closest('.tooltip-bubble')) {
        // If click is on image, dot, or tooltip, advance slide
        e.stopPropagation(); // Prevent advancing twice if dot/tooltip is over image
        showNextSlide();
      } else if (e.target === slideFrame || e.target.classList.contains('slide')) {
        // If click is on the frame background or slide background (empty area), also advance
        showNextSlide();
      }
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowLeft') showPrevSlide();
      else if (e.key === 'ArrowRight' || e.key === ' ') showNextSlide();
    });

    ${tooltipAdjustScript}
    if (totalSlides > 0) showSlide(0);
  </script>
</body>
</html>`;
}
