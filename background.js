// Global variables to track recording state
let isRecording = false;
let recordingTitle = "";
let recordingData = [];
let recordingStartTime = null;
let activeTabId = null; // Track the active tab ID

// Log a message to console with timestamp - only in development mode
const DEBUG_MODE = false;
function logDebug(message) {
  if (DEBUG_MODE) {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
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
  // Only proceed if we're recording and this is the active tab we're recording
  if (isRecording && tabId === activeTabId && changeInfo.status === 'complete') {
    logDebug(`Tab ${tabId} completed loading, re-injecting content script`);
    
    // Inject the content script to the newly loaded page
    try {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['contentScript.js']
      }).then(() => {
        logDebug('Content script re-injected on page navigation');
        
        // Notify the content script to start recording
        sendMessageToContentScript({ action: 'startRecording' }, (success) => {
          logDebug(`Direct message to restart recording after page load ${success ? 'succeeded' : 'failed'}`);
          
          // Use custom event as backup
          if (!success && isExtensionContextValid()) {
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              function: notifyContentScriptToStartRecording
            }).then(() => {
              logDebug('Content script notified to start recording via event after page load');
            }).catch(err => {
              logDebug(`Error executing restart script: ${err.message}`);
            });
          }
        });
      }).catch(err => {
        logDebug(`Error re-injecting content script: ${err.message}`);
      });
    } catch (error) {
      logDebug(`Extension context error: ${error.message}`);
    }
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!isExtensionContextValid()) {
      sendResponse({ error: 'Extension context invalidated' });
      return false;
    }
    
    logDebug(`Received message: ${message.action}`);
    
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
        
        // First inject the content script if it hasn't been injected yet
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            const tabId = tabs[0].id;
            activeTabId = tabId; // Store the active tab ID for monitoring
            logDebug(`Starting recording on tab: ${tabId}`);
            
            // First inject the content script
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['contentScript.js']
            }).then(() => {
              logDebug('Content script injected successfully');
              
              // Try both notification methods for maximum reliability
              // 1. Direct message to content script
              sendMessageToContentScript({ action: 'startRecording' }, (success) => {
                logDebug(`Direct message to start recording ${success ? 'succeeded' : 'failed'}`);
                
                // 2. Custom event as backup
                if (!success) {
                  setTimeout(() => {
                    chrome.scripting.executeScript({
                      target: { tabId: tabId },
                      function: notifyContentScriptToStartRecording
                    }).then(() => {
                      logDebug('Content script notified to start recording via event');
                    }).catch(err => {
                      logDebug(`Error executing start script: ${err.message}`);
                    });
                  }, 500); // Small delay to ensure content script is fully loaded
                }
              });
            }).catch(err => {
              logDebug(`Error injecting content script: ${err.message}`);
            });
          } else {
            logDebug('No active tab found for starting recording');
          }
        });
        
        sendResponse({ success: true });
        break;
        
      case "stopRecording":
        isRecording = false;
        activeTabId = null; // Clear the active tab ID
        
        logDebug(`Stopping recording: ${recordingTitle}`);
        logDebug(`Collected ${recordingData.length} interactions`);
        
        // Save recording data to local storage
        const recording = {
          title: recordingTitle,
          timestamp: recordingStartTime,
          date: new Date().toISOString(),
          duration: Date.now() - recordingStartTime,
          data: recordingData,
          slideCount: recordingData.length,
          filename: `recording_${Date.now()}`
        };
        
        saveRecording(recording, () => {
          // Notify content script to stop recording using both methods
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
              const tabId = tabs[0].id;
              logDebug(`Stopping recording on tab: ${tabId}`);
              
              // Try direct message first
              sendMessageToContentScript({ action: 'stopRecording' }, (success) => {
                logDebug(`Direct message to stop recording ${success ? 'succeeded' : 'failed'}`);
                
                // Use custom event as backup
                if (!success) {
                  chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    function: notifyContentScriptToStopRecording
                  }).then(() => {
                    logDebug('Content script notified to stop recording via event');
                  }).catch(err => {
                    logDebug(`Error executing stop script: ${err.message}`);
                  });
                }
              });
            } else {
              logDebug('No active tab found for stopping recording');
            }
          
            // Open the recordings page instead of the edit page
            chrome.tabs.create({
              url: 'recordings.html'
            }, () => {
              logDebug('Opened recordings page');
              sendResponse({ success: true });
            });
          });
          
          return true; // Keep the message channel open for async response
        });
        return true; // Keep the message channel open for async response
        
      case "recordInteraction":
        if (isRecording) {
          logDebug(`Recording interaction: ${message.data.type}`);
          
          // Check if this is an interaction with the tooltip dialog (skip those)
          if (message.data.tagName && 
              (message.data.id === 'sir-tooltip-popup' || 
               (message.data.className && message.data.className.includes('sir-tooltip')) ||
               (message.data.tagName === 'button' && 
                (message.data.text === 'Skip' || message.data.text === 'Save')))) {
            logDebug('Ignoring interaction with tooltip dialog');
            sendResponse({ success: true });
            return true;
          }
          
          // Also check if element has data-recording-ignore attribute
          if (message.data.attributes && message.data.attributes['data-recording-ignore'] === 'true') {
            logDebug('Ignoring element with data-recording-ignore attribute');
            sendResponse({ success: true });
            return true;
          }
          
          // Record the interaction if it's not part of the tooltip UI
          recordingData.push({
            ...message.data,
            timestamp: Date.now() - recordingStartTime
          });
        } else {
          logDebug('Ignoring interaction: not recording');
        }
        sendResponse({ success: true });
        break;
        
      case "takeScreenshot":
        logDebug('Taking screenshot');
        let tabId = sender?.tab?.id;
        
        if (!tabId) {
          logDebug('No tab ID provided for screenshot');
          sendResponse({ screenshot: null, error: 'No tab ID' });
          return true;
        }
        
        takeScreenshot(tabId)
          .then(dataUrl => {
            logDebug(`Screenshot taken successfully`);
            sendResponse({ screenshot: dataUrl });
          })
          .catch(error => {
            logDebug(`Error taking screenshot: ${error.message || 'Unknown error'}`);
            sendResponse({ screenshot: null, error: error.message });
          });
        return true; // Keep the message channel open for async response
        
      case "getRecordings":
        logDebug('Getting recordings from storage');
        chrome.storage.local.get(['recordings'], (result) => {
          const recordings = result.recordings || [];
          logDebug(`Found ${recordings.length} recordings in storage`);
          sendResponse({ recordings: recordings });
        });
        return true; // Keep the message channel open for async response
      
      case "getRecordingSlides":
        logDebug(`Getting slides for recording: ${message.filename}`);
        chrome.storage.local.get(['recordings'], (result) => {
          const recordings = result.recordings || [];
          const recording = recordings.find(r => r.filename === message.filename);
          
          if (recording && recording.data) {
            logDebug(`Found recording with ${recording.data.length} interactions`);
            
            // Convert interaction data to slides
            const slides = recording.data.map((interaction, index) => {
              // Calculate the most accurate position possible for the dot
              // First try exactClickX/Y (new method), then clientX/Y as ratios, then fallback to normalized X/Y
              const clickX = (interaction.exactClickX !== undefined) 
                ? interaction.exactClickX * 100 
                : (interaction.originalClientX !== undefined && interaction.originalViewportWidth) 
                  ? (interaction.originalClientX / interaction.originalViewportWidth) * 100
                  : interaction.clickX * 100;
              
              const clickY = (interaction.exactClickY !== undefined) 
                ? interaction.exactClickY * 100 
                : (interaction.originalClientY !== undefined && interaction.originalViewportHeight) 
                  ? (interaction.originalClientY / interaction.originalViewportHeight) * 100
                  : interaction.clickY * 100;
              
              logDebug(`Slide ${index}: Click position calculated at ${clickX.toFixed(3)}, ${clickY.toFixed(3)}`);
              
              return {
                index: index,
                image: interaction.screenshot || '',
                clickX: clickX,
                clickY: clickY,
                tooltipText: interaction.tooltipText || null, // Include tooltip text
                // Original data for debugging and accurate positioning
                originalClientX: interaction.originalClientX,
                originalClientY: interaction.originalClientY,
                originalPageX: interaction.pageX,
                originalPageY: interaction.pageY,
                originalViewportWidth: interaction.viewportWidth,
                originalViewportHeight: interaction.viewportHeight,
                exactClickX: interaction.exactClickX, 
                exactClickY: interaction.exactClickY,
                // Rest of the data
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
              };
            });
            
            logDebug(`Generated ${slides.length} slides`);
            sendResponse({ slides: slides });
          } else {
            logDebug('Recording not found or no interaction data');
            sendResponse({ slides: [] });
          }
        });
        return true;
        
      case "generatePowerPoint":
        logDebug(`Generating PowerPoint for recording: ${message.filename}`);
        // Get the recording data and slides to generate the PowerPoint directly
        chrome.storage.local.get(['recordings'], (result) => {
          const recordings = result.recordings || [];
          const recording = recordings.find(r => r.filename === message.filename);
          
          if (recording) {
            // Get the slides for this recording
            logDebug(`Found recording: ${recording.title}`);
            
            chrome.runtime.sendMessage({ 
              action: "getRecordingSlides",
              filename: message.filename
            }, (slidesResponse) => {
              if (chrome.runtime.lastError) {
                logDebug(`Error getting slides: ${chrome.runtime.lastError.message}`);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
                return;
              }
              
              if (slidesResponse && slidesResponse.slides && slidesResponse.slides.length > 0) {
                logDebug(`Found ${slidesResponse.slides.length} slides, opening PowerPoint generator`);
                // We still need to open the generator page because the PptxGenJS library is loaded there
                // This is a limitation of the current architecture
                chrome.tabs.create({ 
                  url: chrome.runtime.getURL(`pptx-generator.html?recording=${message.filename}&autostart=true`)
                });
                sendResponse({ success: true });
              } else {
                logDebug('No slides found for this recording');
                sendResponse({ success: false, error: 'No slides found for this recording' });
              }
            });
            return true; // Keep the message channel open
          } else {
            logDebug(`Recording not found: ${message.filename}`);
            sendResponse({ success: false, error: 'Recording not found' });
            return true;
          }
        });
        return true;
        
      case "exportHtml":
        logDebug(`Exporting HTML for recording: ${message.recording.title}`);
        
        // Create an HTML file with the slides
        if (message.recording && message.slides && message.slides.length > 0) {
          try {
            // Generate HTML content
            const htmlContent = generateHTMLSlideshow(message.recording, message.slides);
            
            // Create a download
            chrome.downloads.download({
              url: `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`,
              filename: `${message.recording.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_slideshow.html`,
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
            return true; // Keep the channel open
          } catch (error) {
            logDebug(`Error generating HTML: ${error.message}`);
            sendResponse({ success: false, error: error.message });
            return true;
          }
        } else {
          logDebug('Export HTML failed: missing recording data or slides');
          sendResponse({ success: false, error: 'Missing recording data or slides' });
          return true;
        }
        
      case "deleteRecording":
        if (message.filename) {
          logDebug(`Deleting recording: ${message.filename}`);
          deleteRecording(message.filename, (success) => {
            logDebug(`Delete operation ${success ? 'succeeded' : 'failed'}`);
            sendResponse({ success });
          });
          return true; // Keep the message channel open for async response
        }
        logDebug('Delete recording failed: no filename provided');
        sendResponse({ success: false });
        break;
        
      case "promptForTooltip":
        logDebug('Received request to prompt for tooltip');
        // Send message back to content script to show tooltip input
        if (sender && sender.tab) {
          chrome.tabs.sendMessage(sender.tab.id, { action: 'promptForTooltip' }, response => {
            if (chrome.runtime.lastError) {
              logDebug(`Error sending prompt message: ${chrome.runtime.lastError.message}`);
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              sendResponse({ success: true });
            }
          });
          return true; // Keep message channel open
        } else {
          logDebug('No tab ID for tooltip prompt');
          sendResponse({ success: false, error: 'No tab ID' });
        }
        break;
        
      case "updateRecordingTooltips":
        // This code is no longer needed since we're not using the edit page
        // We'll keep it for backward compatibility but it won't be used
        sendResponse({ success: true });
        return true;
        
      default:
        logDebug(`Unknown action: ${message.action}`);
        sendResponse({ error: `Unknown action: ${message.action}` });
    }
  } catch (error) {
    logDebug(`Error handling message: ${error.message}`);
    sendResponse({ error: error.message });
  }
  
  return true; // Keeps the message channel open for async responses
});

// Function to take a screenshot using chrome.tabs API
function takeScreenshot(tabId) {
  return new Promise((resolve, reject) => {
    if (!isExtensionContextValid()) {
      reject(new Error('Extension context invalidated'));
      return;
    }
    
    try {
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, dataUrl => {
        if (!isExtensionContextValid()) {
          reject(new Error('Extension context invalidated during screenshot capture'));
          return;
        }
        
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(dataUrl);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Function to be injected into active tab to notify content script
function notifyContentScriptToStartRecording() {
  console.log('Notifying content script to start recording');
  window.dispatchEvent(new CustomEvent('sir-start-recording'));
  
  // For direct messaging as well
  if (window._sirInitialized) {
    console.log('Content script is initialized, direct messaging possible');
  }
}

// Function to be injected into active tab to notify content script
function notifyContentScriptToStopRecording() {
  console.log('Notifying content script to stop recording');
  window.dispatchEvent(new CustomEvent('sir-stop-recording'));
}

// Send a direct message to the content script in the active tab
function sendMessageToContentScript(message, callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const tabId = tabs[0].id;
      logDebug(`Sending direct message to tab ${tabId}: ${JSON.stringify(message)}`);
      
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          logDebug(`Error sending message to content script: ${chrome.runtime.lastError.message}`);
          if (callback) callback(false);
        } else {
          logDebug(`Message sent successfully, response: ${JSON.stringify(response)}`);
          if (callback) callback(true, response);
        }
      });
    } else {
      logDebug('No active tab found to send message');
      if (callback) callback(false);
    }
  });
}

// Save recording to chrome.storage
function saveRecording(recording, callback) {
  logDebug(`Saving recording: ${recording.title}`);
  
  chrome.storage.local.get(['recordings'], (result) => {
    const recordings = result.recordings || [];
    logDebug(`Found ${recordings.length} existing recordings in storage`);
    
    recordings.push(recording);
    
    chrome.storage.local.set({ recordings }, () => {
      if (chrome.runtime.lastError) {
        logDebug(`Error saving to storage: ${chrome.runtime.lastError.message}`);
      } else {
        logDebug(`Successfully saved ${recordings.length} recordings to storage`);
      }
      if (callback) callback();
    });
  });
}

// Delete a recording
function deleteRecording(filename, callback) {
  logDebug(`Attempting to delete recording: ${filename}`);
  
  chrome.storage.local.get(['recordings'], (result) => {
    const recordings = result.recordings || [];
    logDebug(`Current recordings count: ${recordings.length}`);
    
    // Find the index of the recording to delete
    const index = recordings.findIndex(r => r.filename === filename);
    logDebug(`Found recording at index: ${index}`);
    
    if (index !== -1) {
      // Remove the recording from the array
      recordings.splice(index, 1);
      logDebug(`Recording removed from array, new count: ${recordings.length}`);
      
      // Update storage with the modified array
      chrome.storage.local.set({ recordings }, () => {
        if (chrome.runtime.lastError) {
          logDebug(`Error saving to storage: ${chrome.runtime.lastError.message}`);
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

// Function to generate an HTML slideshow from recording data
function generateHTMLSlideshow(recording, slides) {
  logDebug(`Generating HTML slideshow for ${recording.title} with ${slides.length} slides`);
  
  // Generate slides HTML - only slides, no extra info
  const slidesHtml = slides.map((slide, index) => {
    // Tooltip HTML - conditionally include if tooltip text exists
    const tooltipHtml = slide.tooltipText 
      ? `<div class="tooltip-bubble"><div class="tooltip-text">${slide.tooltipText}</div></div>`
      : '';
    
    // Calculate the most accurate position possible for the dot
    // First try exactClickX/Y (new method), then clientX/Y as ratios, then fallback to normalized X/Y
    const clickX = (slide.exactClickX !== undefined) 
      ? slide.exactClickX * 100 
      : (slide.originalClientX !== undefined && slide.originalViewportWidth) 
        ? (slide.originalClientX / slide.originalViewportWidth) * 100
        : slide.clickX * 100;
        
    const clickY = (slide.exactClickY !== undefined) 
      ? slide.exactClickY * 100 
      : (slide.originalClientY !== undefined && slide.originalViewportHeight) 
        ? (slide.originalClientY / slide.originalViewportHeight) * 100
        : slide.clickY * 100;
    
    return `
      <div class="slide" id="slide-${index + 1}" ${index > 0 ? 'style="display:none;"' : ''}>
        <div class="slide-container">
          <img src="${slide.image}" alt="Slide ${index + 1}" class="slide-image">
          <div class="click-indicator ${slide.tooltipText ? 'has-tooltip' : ''}" 
               style="left: ${clickX}%; top: ${clickY}%; transform: translate(-50%, -50%);" 
               data-original-x="${slide.originalClientX || 0}"
               data-original-y="${slide.originalClientY || 0}"
               data-viewport-width="${slide.originalViewportWidth || 0}"
               data-viewport-height="${slide.originalViewportHeight || 0}"
               onclick="showNextSlide(); event.stopPropagation();">
            ${tooltipHtml}
          </div>
        </div>
        <div class="slide-number">${index + 1} / ${slides.length}</div>
      </div>
    `;
  }).join('\n');
  
  // Adds JavaScript to check and adjust tooltip positions
  const tooltipAdjustScript = `
    // Function to adjust tooltip positions on load and resize
    function adjustAllTooltips() {
      const indicators = document.querySelectorAll('.click-indicator.has-tooltip');
      
      indicators.forEach(indicator => {
        const tooltip = indicator.querySelector('.tooltip-bubble');
        if (!tooltip) return;
        
        const slideContainer = indicator.closest('.slide-container');
        if (!slideContainer) return;
        
        const slideRect = slideContainer.getBoundingClientRect();
        const indicatorRect = indicator.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        // If tooltip extends beyond right edge, flip it to the left
        if (tooltipRect.right > slideRect.right - 20) {
          tooltip.classList.add('flip-left');
        } else {
          tooltip.classList.remove('flip-left');
        }
      });
    }
    
    // Run when DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
      adjustAllTooltips();
    });
    
    // Run on window resize
    window.addEventListener('resize', adjustAllTooltips);
    
    // Run when showing next/previous slide
    function updateTooltipsAfterSlideChange() {
      setTimeout(adjustAllTooltips, 50);
    }
  `;
  
  // Create minimal HTML document with just the slides
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${recording.title}</title>
  <style>
    /* Reset and base styles */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background-color: #0a0a0a;
      height: 100%;
      width: 100%;
      overflow: hidden;
      margin: 0;
      padding: 0;
    }
    
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    
    /* Main viewport container - FIXED SIZE */
    .viewport-container {
      width: 100%;
      height: 100vh;
      position: relative;
      overflow: hidden;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    /* Slide styles */
    .slide {
      position: relative;
      max-width: 100%;
      max-height: 100vh;
    }
    
    .slide-container {
      position: relative;
      display: inline-block;
    }
    
    .slide-image {
      max-width: 100%;
      max-height: 100vh;
      object-fit: contain;
      display: block;
    }
    
    /* Click indicator (purple dot) */
    .click-indicator {
      position: absolute;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background-color: rgba(138, 43, 226, 0.8);
      border: 2px solid rgb(138, 43, 226);
      transform: translate(-50%, -50%); /* This centers the dot on its exact position */
      cursor: pointer;
      z-index: 200;
      box-shadow: 0 0 10px rgba(138, 43, 226, 0.3);
      pointer-events: auto;
      animation: none;
    }
    
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(138, 43, 226, 0.4); }
      70% { box-shadow: 0 0 0 10px rgba(138, 43, 226, 0); }
      100% { box-shadow: 0 0 0 0 rgba(138, 43, 226, 0); }
    }
    
    /* Chat bubble tooltip styles - STREAMLINED VERSION */
    .click-indicator.has-tooltip {
      z-index: 200;
    }
    
    .tooltip-bubble {
      position: absolute;
      left: 25px;
      top: -10px;
      background-color: transparent;
      border-radius: 14px;
      padding: 2px;
      filter: drop-shadow(0 1px 6px rgba(0, 0, 0, 0.2));
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
    
    .slide-number {
      position: absolute;
      bottom: 15px;
      left: 15px;
      background-color: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }
  </style>
</head>
<body>
  <div class="viewport-container" id="viewport-container">
    ${slidesHtml}
  </div>
  
  <script>
    // Variables to track slides
    let currentSlideIndex = 0;
    const totalSlides = ${slides.length};
    
    // Function to show a specific slide
    function showSlide(index) {
      // Hide all slides
      document.querySelectorAll('.slide').forEach(slide => {
        slide.style.display = 'none';
      });
      
      // Show the requested slide
      const slideToShow = document.getElementById('slide-' + (index + 1));
      if (slideToShow) {
        slideToShow.style.display = 'block';
        currentSlideIndex = index;
        
        // Update tooltip positions
        adjustAllTooltips();
      }
    }
    
    // Show next slide
    function showNextSlide() {
      if (currentSlideIndex < totalSlides - 1) {
        showSlide(currentSlideIndex + 1);
      }
    }
    
    // Show previous slide
    function showPrevSlide() {
      if (currentSlideIndex > 0) {
        showSlide(currentSlideIndex - 1);
      }
    }
    
    // Set up navigation
    document.addEventListener('click', function(e) {
      // Only handle clicks on slide images (not dots)
      if (e.target.classList.contains('slide-image')) {
        showNextSlide();
      }
    });
    
    // Make all dots clickable
    document.querySelectorAll('.click-indicator').forEach(dot => {
      dot.addEventListener('click', function(e) {
        e.stopPropagation();
        showNextSlide();
      });
    });
    
    // Handle keyboard navigation
    document.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowLeft') {
        showPrevSlide();
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        showNextSlide();
      }
    });
    
    // Calculate scale to fit viewport while maintaining aspect ratio
    function adjustViewportScale() {
      // No scaling needed - we're using responsive sizing now
      adjustAllTooltips();
    }
    
    // Run when DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
      adjustAllTooltips();
      showSlide(0); // Make sure to initialize the first slide
    });
    
    // Run on window resize
    window.addEventListener('resize', function() {
      adjustAllTooltips();
    });
    
    ${tooltipAdjustScript}
    
    // Initialize first slide
    showSlide(0);
  </script>
</body>
</html>`;
}