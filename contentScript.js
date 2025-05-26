// Check if script is already initialized
if (typeof window._sirContentScriptLoaded !== 'undefined') {
  console.log('Screen Interaction Recorder content script already loaded. Skipping initialization.');
} else {
  // Mark as loaded
  window._sirContentScriptLoaded = true;

  // Default configuration
  const DEFAULT_CONFIG = {
    CAPTURE_SHORTCUT: 'alt+c',
    SHOW_RECORDING_INDICATOR: false,
    DEBUG_MODE: false
  };

  // Parse a shortcut string into its components
  function parseShortcut(shortcutString) {
    const parts = shortcutString.toLowerCase().split('+');
    return {
      key: parts[parts.length - 1],
      ctrl: parts.includes('control') || parts.includes('ctrl'),
      alt: parts.includes('alt'),
      shift: parts.includes('shift')
    };
  }

  // Configuration variables - will be populated from storage
  let config = {...DEFAULT_CONFIG};
  let captureKey = parseShortcut(DEFAULT_CONFIG.CAPTURE_SHORTCUT);

  // Load configuration from storage
  try {
    chrome.storage.sync.get('sirConfig', function(data) {
      if (data.sirConfig) {
        config = data.sirConfig;
        captureKey = parseShortcut(config.CAPTURE_SHORTCUT);
        console.log('Loaded configuration from storage, shortcut:', config.CAPTURE_SHORTCUT);
      } else {
        console.log('Using default configuration, shortcut:', DEFAULT_CONFIG.CAPTURE_SHORTCUT);
      }
    });
  } catch (e) {
    console.error('Error loading configuration from storage:', e);
  }

  // Reset on page unload to ensure proper re-initialization on new pages
  window.addEventListener('beforeunload', () => {
    window._sirContentScriptLoaded = undefined;
    isShowingTooltip = false; // Ensure flag is reset on page unload
  });

  // Flag to track whether recording is active
  let isRecording = false;

  // Flag to prevent capturing while showing tooltip input
  let isShowingTooltip = false; // This flag might still be useful to prevent double captures

  // Store pending interactions awaiting tooltip text
  // let pendingInteraction = null; // This might not be needed if prompt is synchronous

  // Store mouse position for keyboard shortcut capture
  let mouseX = 0;
  let mouseY = 0;

  // Track mouse position at all times
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // Helper to check if extension context is still valid
  function isExtensionContextValid() {
    try {
      return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false; // Any exception means the context is invalid
    }
  }

  // Listen for start/stop recording events from the background script
  window.addEventListener('sir-start-recording', () => {
    startRecording();
  });

  window.addEventListener('sir-stop-recording', () => {
    stopRecording();
  });

  // Also listen for direct messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isExtensionContextValid()) return false;

    if (message.action === 'startRecording') {
      startRecording();
      sendResponse({ success: true });
    } else if (message.action === 'stopRecording') {
      stopRecording();
      sendResponse({ success: true });
    }
    // The 'promptForTooltip' message from background.js might no longer be needed
    // if window.prompt is called directly within captureInteraction.
    // However, keeping it for now in case background.js still uses it.
    // If captureInteraction is fully synchronous with window.prompt, this case can be removed.
    else if (message.action === 'promptForTooltip') {
        // This case might need re-evaluation.
        // If captureInteraction now handles the prompt directly, this might be redundant.
        // For now, let's assume it might still be called.
        console.warn("Received 'promptForTooltip'. Ensure this is still the intended flow.");
        // Directly calling window.prompt here if background expects content script to initiate
        const tooltipText = window.prompt('Enter an explanation for this interaction:', '');
        // We need a way to associate this text with the correct interaction.
        // This part of the logic needs careful review based on how background.js handles it.
        // For now, just sending back a generic success.
        sendResponse({ success: true, tooltipText: tooltipText });
    } else if (message.action === 'resetTooltipFlag') {
      isShowingTooltip = false;
      // pendingInteraction = null; // If pendingInteraction is removed
      sendResponse({ success: true });
    }

    return true; // Keep channel open for async response if needed
  });

  // Start recording interactions
  function startRecording() {
    isRecording = true;
    addInteractionListeners();
    showRecordingIndicator(true);
  }

  // Stop recording interactions
  function stopRecording() {
    isRecording = false;
    removeInteractionListeners();
    showRecordingIndicator(false);
  }

  // Add event listeners for capturing interactions
  function addInteractionListeners() {
    document.addEventListener('keydown', handleKeyboardShortcut, true);
    document.addEventListener('submit', recordSubmitEvent, true);
    document.addEventListener('change', recordChangeEvent, true);
  }

  // Remove interaction event listeners
  function removeInteractionListeners() {
    document.removeEventListener('keydown', handleKeyboardShortcut, true);
    document.removeEventListener('submit', recordSubmitEvent, true);
    document.removeEventListener('change', recordChangeEvent, true);
  }

  // Show a visual indicator that recording is in progress
  function showRecordingIndicator(show) {
    if (!config.SHOW_RECORDING_INDICATOR) return;

    const indicatorId = 'sir-recording-indicator';
    let indicator = document.getElementById(indicatorId);

    if (show) {
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = indicatorId;
        indicator.style.cssText = `
          position: fixed;
          top: 10px;
          right: 10px;
          background-color: rgba(255, 0, 0, 0.7);
          color: white;
          padding: 5px 10px;
          border-radius: 4px;
          font-size: 12px;
          z-index: 2147483647; /* Max z-index */
          font-family: Arial, sans-serif;
        `;
        document.body.appendChild(indicator);
      }
      indicator.textContent = 'Recording';
      indicator.style.display = 'block';
    } else {
      if (indicator) {
        indicator.style.display = 'none';
      }
    }
  }

  // Handle keyboard shortcut for capturing
  function handleKeyboardShortcut(event) {
    if (!isRecording || isShowingTooltip) return;

    const isShortcutPressed =
      (captureKey.ctrl === event.ctrlKey) &&
      (captureKey.alt === event.altKey) &&
      (captureKey.shift === event.shiftKey) &&
      (event.key.toLowerCase() === captureKey.key);

    if (!isShortcutPressed) return;

    event.preventDefault();
    event.stopPropagation(); // Prevent website from handling this shortcut

    captureInteraction(mouseX, mouseY);
  }

  // Capture interaction at the specified coordinates
  function captureInteraction(clientX, clientY) {
    if (!isRecording || isShowingTooltip) return;

    isShowingTooltip = true; // Prevent further captures until this one is done

    const element = document.elementFromPoint(clientX, clientY);
    if (!element) {
        isShowingTooltip = false;
        return;
    }

    // Check if the click is on our recording indicator
    if (element.id === 'sir-recording-indicator') {
        isShowingTooltip = false;
        return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const exactClickX = clientX / viewportWidth;
    const exactClickY = clientY / viewportHeight;
    const clickXPercent = exactClickX * 100;
    const clickYPercent = exactClickY * 100;
    const rect = element.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const isInputElement = element.tagName === 'INPUT' ||
                          element.tagName === 'TEXTAREA' ||
                          element.tagName === 'SELECT' ||
                          element.isContentEditable ||
                          (element.tagName === 'DIV' && element.getAttribute('role') === 'textbox');

    takeScreenshot().then(screenshot => {
      const interactionData = {
        type: 'click',
        tagName: element.tagName.toLowerCase(),
        id: element.id || null,
        className: element.className || null,
        text: element.textContent?.trim().substring(0, 200) || null, // Limit text length
        value: element.value || null,
        timestamp: Date.now(),
        pageUrl: window.location.href,
        pageTitle: document.title,
        tooltipText: null,
        screenshot: screenshot,
        isInputElement: isInputElement,
        clientX: clientX,
        clientY: clientY,
        exactClickX: exactClickX,
        exactClickY: exactClickY,
        clickXPercent: clickXPercent,
        clickYPercent: clickYPercent,
        pageX: clientX + scrollX,
        pageY: clientY + scrollY,
        offsetX: clientX - rect.left,
        offsetY: clientY - rect.top,
        originalClientX: clientX,
        originalClientY: clientY,
        originalViewportWidth: viewportWidth,
        originalViewportHeight: viewportHeight,
        elementRect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        },
        scrollX: scrollX,
        scrollY: scrollY,
        viewportWidth: viewportWidth,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight
      };

      if (element.tagName === 'A') interactionData.href = element.href;
      else if (element.tagName === 'BUTTON') {
        interactionData.buttonType = element.type;
        interactionData.buttonName = element.name;
      } else if (element.tagName === 'INPUT') {
        interactionData.inputType = element.type;
        interactionData.inputName = element.name;
      }

      if (isInputElement) {
        // For input elements, we might not need a tooltip or use a default one
        // Or, you can decide to prompt for input elements as well
        // For now, let's assume no prompt for direct input interactions.
        sendInteractionToBackground(interactionData);
        isShowingTooltip = false; // Reset flag
      } else {
        // Use window.prompt for non-input elements
        // A short delay can sometimes help ensure the prompt appears reliably after other operations.
        setTimeout(() => {
            try {
                const tooltipText = window.prompt('Enter an explanation for this interaction (or leave blank):', '');
                // window.prompt returns null if Cancel is clicked, or a string (empty if OK with no input)
                if (tooltipText !== null) { // User did not cancel
                    interactionData.tooltipText = tooltipText.trim();
                }
                // Else, if user canceled, tooltipText remains null in interactionData

                sendInteractionToBackground(interactionData);
            } catch (e) {
                console.error("Error with window.prompt:", e);
                // Send interaction without tooltip if prompt fails
                sendInteractionToBackground(interactionData);
            } finally {
                isShowingTooltip = false; // Reset flag
            }
        }, 100); // 100ms delay
      }
    }).catch(error => {
        console.error("Screenshot failed:", error);
        isShowingTooltip = false; // Reset flag if screenshot fails
    });
  }


  // Record a form submission event
  function recordSubmitEvent(event) {
    if (!isRecording || isShowingTooltip) return;
    isShowingTooltip = true; // Prevent other captures

    const form = event.target;
    const formData = {};
    Array.from(form.elements).forEach(element => {
      if (element.name && element.type !== 'password') {
        formData[element.name] = element.value;
      }
    });

    const interactionData = {
      type: 'submit',
      tagName: 'form',
      id: form.id || null,
      formAction: form.action || null,
      formMethod: form.method || 'get',
      formData: formData,
      timestamp: Date.now(),
      pageUrl: window.location.href,
      pageTitle: document.title,
      screenshot: null,
      tooltipText: "Form submitted" // Default tooltip for submit
    };

    takeScreenshot().then(screenshot => {
      interactionData.screenshot = screenshot;
      sendInteractionToBackground(interactionData);
      isShowingTooltip = false; // Reset flag
    }).catch(error => {
        console.error("Screenshot failed for submit event:", error);
        sendInteractionToBackground(interactionData); // Send without screenshot
        isShowingTooltip = false; // Reset flag
    });
  }

  // Record a change event
  function recordChangeEvent(event) {
    if (!isRecording || isShowingTooltip) return;
    isShowingTooltip = true; // Prevent other captures

    const element = event.target;
    if (element.type === 'password') {
        isShowingTooltip = false;
        return;
    }

    const interactionData = {
      type: 'change',
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      name: element.name || null,
      value: element.type === 'checkbox' || element.type === 'radio'
        ? element.checked
        : element.value,
      timestamp: Date.now(),
      pageUrl: window.location.href,
      pageTitle: document.title,
      screenshot: null,
      tooltipText: `Value changed for ${element.name || element.id || element.tagName}` // Default tooltip
    };

    takeScreenshot().then(screenshot => {
      interactionData.screenshot = screenshot;
      sendInteractionToBackground(interactionData);
      isShowingTooltip = false; // Reset flag
    }).catch(error => {
        console.error("Screenshot failed for change event:", error);
        sendInteractionToBackground(interactionData); // Send without screenshot
        isShowingTooltip = false; // Reset flag
    });
  }

  // Take a screenshot of the current viewport
  function takeScreenshot() {
    return new Promise((resolve, reject) => {
      if (!isExtensionContextValid()) {
        console.error('Extension context invalid, cannot take screenshot');
        return reject(new Error('Extension context invalid'));
      }
      try {
        chrome.runtime.sendMessage({ action: 'takeScreenshot' }, response => {
          if (chrome.runtime.lastError) {
            console.error('Error taking screenshot:', chrome.runtime.lastError?.message || 'Extension error');
            return reject(chrome.runtime.lastError);
          }
          if (response && response.screenshot) {
            resolve(response.screenshot);
          } else {
            console.warn('No screenshot in response. Error: ' + (response ? response.error : 'Unknown'));
            resolve(null); // Resolve with null if screenshot failed but no runtime error
          }
        });
      } catch (error) {
        console.error('Failed to send takeScreenshot message:', error);
        reject(error);
      }
    });
  }

  // Send interaction data to background script
  function sendInteractionToBackground(data) {
    if (!isExtensionContextValid()) {
      console.error('Extension context invalid, cannot send interaction');
      return;
    }
    try {
      chrome.runtime.sendMessage({ action: 'recordInteraction', data: data }, response => {
        if (chrome.runtime.lastError) {
          console.error('Error sending interaction data:', chrome.runtime.lastError.message);
        } else if (response && response.success) {
          // console.log('Interaction recorded successfully by background');
        } else {
          // console.warn('Background script did not confirm interaction recording.');
        }
      });
    } catch (error) {
      console.error('Failed to send interaction to background:', error);
    }
  }

  // Attempt to start recording if background script indicates it should be active
  // This handles cases where the content script is injected into an already recording tab (e.g., after navigation)
  if (isExtensionContextValid()) {
      chrome.runtime.sendMessage({ action: "getRecordingStatus" }, (response) => {
          if (chrome.runtime.lastError) {
              console.warn("Error getting recording status on load:", chrome.runtime.lastError.message);
              return;
          }
          if (response && response.isRecording) {
              console.log("Content script loaded into an active recording tab. Initializing recording state.");
              startRecording();
          }
      });
  }

} // End of main else block for _sirContentScriptLoaded
