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
  let isShowingTooltip = false;
  
  // Store pending interactions awaiting tooltip text
  let pendingInteraction = null;
  
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
    } else if (message.action === 'promptForTooltip' && pendingInteraction) {
      // Show tooltip prompt after screenshot was taken
      const { clientX, clientY } = pendingInteraction;
      
      showTooltipInputPopup(clientX, clientY, tooltipText => {
        if (tooltipText) {
          pendingInteraction.tooltipText = tooltipText;
        }
        sendInteractionToBackground(pendingInteraction);
        pendingInteraction = null;
        // Reset tooltip showing flag
        isShowingTooltip = false;
      });
      
      sendResponse({ success: true });
    } else if (message.action === 'resetTooltipFlag') {
      // Add explicit way for background to reset the tooltip flag
      isShowingTooltip = false;
      pendingInteraction = null;
      sendResponse({ success: true });
    }
    
    return true;
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
    // Listen for the keyboard shortcut defined in env.js
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
    
    // Remove any existing indicator if it exists
    const indicator = document.getElementById('sir-recording-indicator');
    if (indicator) {
      indicator.remove();
    }
    
    if (show) {
      // Create a new indicator
      const recordingIndicator = document.createElement('div');
      recordingIndicator.id = 'sir-recording-indicator';
      recordingIndicator.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background-color: rgba(255, 0, 0, 0.7);
        color: white;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 999999;
        font-family: Arial, sans-serif;
      `;
      recordingIndicator.textContent = 'Recording';
      document.body.appendChild(recordingIndicator);
    }
  }
  
  // Handle keyboard shortcut for capturing
  function handleKeyboardShortcut(event) {
    // Check if the keyboard shortcut matches
    if (!isRecording || isShowingTooltip) return;
    
    // Check if shortcut keys match the configuration
    const isShortcutPressed = 
      (captureKey.ctrl === event.ctrlKey) && 
      (captureKey.alt === event.altKey) && 
      (captureKey.shift === event.shiftKey) && 
      (event.key.toLowerCase() === captureKey.key);
    
    if (!isShortcutPressed) return;
    
    // Prevent default behavior for the shortcut
    event.preventDefault();
    
    // Capture at current mouse position
    captureInteraction(mouseX, mouseY);
  }
  
  // Capture interaction at the specified coordinates
  function captureInteraction(clientX, clientY) {
    // Additional safety check - force reset the flag if it's been set for too long
    const now = Date.now();
    if (isShowingTooltip && window._lastTooltipTime && (now - window._lastTooltipTime > 60000)) {
      console.log('Tooltip flag stuck for over 60 seconds, forcing reset');
      isShowingTooltip = false;
    }
    
    if (!isRecording || isShowingTooltip) return;
    
    // Get elements at cursor position
    const element = document.elementFromPoint(clientX, clientY);
    if (!element) return;
    
    // Check if the click is on our tooltip popup or its children
    const tooltipPopup = document.getElementById('sir-tooltip-popup');
    if (tooltipPopup && (tooltipPopup === element || tooltipPopup.contains(element))) {
      return; // Ignore clicks on the tooltip popup
    }
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Exact click as percentage of viewport (ensure it's a value between 0-1)
    const exactClickX = clientX / viewportWidth;
    const exactClickY = clientY / viewportHeight;
    
    // Store additional percentage values for absolute clarity (0-100 scale)
    const clickXPercent = (clientX / viewportWidth) * 100;
    const clickYPercent = (clientY / viewportHeight) * 100;
    
    // Store the UI state at click time
    const rect = element.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    
    // Check if it's an input element
    const isInputElement = element.tagName === 'INPUT' || 
                          element.tagName === 'TEXTAREA' || 
                          element.tagName === 'SELECT' ||
                          element.isContentEditable ||
                          (element.tagName === 'DIV' && element.getAttribute('role') === 'textbox');
    
    // Take a screenshot first
    takeScreenshot().then(screenshot => {
      // Prepare complete interaction data
      const interactionData = {
        type: 'click',
        tagName: element.tagName.toLowerCase(),
        id: element.id || null,
        className: element.className || null,
        text: element.textContent?.trim() || null,
        value: element.value || null,
        timestamp: Date.now(),
        pageUrl: window.location.href,
        pageTitle: document.title,
        tooltipText: null,
        screenshot: screenshot,
        isInputElement: isInputElement,
        
        // Enhanced position data for better accuracy
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
        
        // Element details and window state
        elementRect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        },
        scrollX: scrollX,
        scrollY: scrollY,
        viewportWidth: viewportWidth,
        viewportHeight: viewportHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight
      };
      
      // Extra details for form elements
      if (element.tagName === 'A') {
        interactionData.href = element.href;
      } else if (element.tagName === 'BUTTON') {
        interactionData.buttonType = element.type;
        interactionData.buttonName = element.name;
      } else if (element.tagName === 'INPUT') {
        interactionData.inputType = element.type;
        interactionData.inputName = element.name;
      }
      
      // For input elements, add generic placeholder tooltip text
      if (isInputElement) {
        if (element.tagName === 'INPUT') {
          if (element.type === 'text' || element.type === 'search') {
            interactionData.tooltipText = `Typing in ${element.placeholder || 'text field'}`;
          } else if (element.type === 'checkbox') {
            interactionData.tooltipText = element.checked ? 'Checked the box' : 'Unchecked the box';
          } else if (element.type === 'radio') {
            interactionData.tooltipText = `Selected option: ${element.value || 'radio button'}`;
          } else {
            interactionData.tooltipText = `Interacted with ${element.type || 'input field'}`;
          }
        } else if (element.tagName === 'TEXTAREA') {
          interactionData.tooltipText = `Typing in text area`;
        } else if (element.tagName === 'SELECT') {
          interactionData.tooltipText = `Selecting from dropdown`;
        } else if (element.isContentEditable) {
          interactionData.tooltipText = `Typing in editable area`;
        } else {
          interactionData.tooltipText = `Interacting with text field`;
        }
        
        // Send immediately for input elements
        sendInteractionToBackground(interactionData);
      } else {
        // Show tooltip popup for non-input elements
        isShowingTooltip = true;
        
        // Show tooltip popup to get user input
        showTooltipInputPopup(clientX, clientY, tooltipText => {
          // Add tooltip text to data and send
          if (tooltipText) {
            interactionData.tooltipText = tooltipText;
          }
          sendInteractionToBackground(interactionData);
          
          // Reset tooltip showing flag
          isShowingTooltip = false;
        });
      }
    });
  }

  // Record a form submission event
  function recordSubmitEvent(event) {
    if (!isRecording || isShowingTooltip) return;
    
    const form = event.target;
    const formData = {};
    
    // Collect form field values (non-sensitive only)
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
      screenshot: null
    };
    
    takeScreenshot().then(screenshot => {
      interactionData.screenshot = screenshot;
      sendInteractionToBackground(interactionData);
    });
  }

  // Record a change event (dropdown selections, checkbox toggles, etc.)
  function recordChangeEvent(event) {
    if (!isRecording || isShowingTooltip) return;
    
    const element = event.target;
    
    // Skip password fields
    if (element.type === 'password') return;
    
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
      screenshot: null
    };
    
    takeScreenshot().then(screenshot => {
      interactionData.screenshot = screenshot;
      sendInteractionToBackground(interactionData);
    });
  }

  // Show tooltip input popup with fallback to native prompt
  function showTooltipInputPopup(x, y, callback) {
    // Record when we showed the tooltip
    window._lastTooltipTime = Date.now();
    
    // Set flag immediately
    isShowingTooltip = true;
    
    // Track if callback was already called
    let callbackCalled = false;
    
    function safeCallback(value) {
      if (callbackCalled) return;
      callbackCalled = true;
      
      // Reset tooltip flag
      isShowingTooltip = false;
      
      // Double-ensure the flag is reset after a short delay
      setTimeout(() => {
        isShowingTooltip = false;
      }, 200);
      
      // Call the callback
      if (typeof callback === 'function') {
        try {
          callback(value);
        } catch (e) {
          console.error('Error in tooltip callback:', e);
        }
      }
    }
    
    // First try: Use our custom tooltip UI
    try {
      // Remove any existing popup
      const existingPopup = document.getElementById('sir-tooltip-popup');
      if (existingPopup) existingPopup.remove();
      
      // Create popup container
      const popup = document.createElement('div');
      popup.id = 'sir-tooltip-popup';
      popup.setAttribute('data-recording-ignore', 'true');
      popup.style.cssText = `
        position: fixed;
        top: ${Math.min(y, window.innerHeight - 200)}px;
        left: ${Math.min(x, window.innerWidth - 300)}px;
        background-color: white;
        padding: 12px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        z-index: 2147483647;
        font-family: Arial, sans-serif;
        max-width: 280px;
        width: 280px;
      `;
      
      // Add title
      const title = document.createElement('h3');
      title.textContent = 'Add Explanation';
      title.style.cssText = `
        margin: 0 0 8px 0;
        font-size: 16px;
        color: #333;
        font-weight: bold;
      `;
      
      // Add text input
      const input = document.createElement('textarea');
      input.placeholder = 'Explain what this click does...';
      input.style.cssText = `
        width: 100%;
        height: 70px;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 14px;
        margin-bottom: 12px;
        resize: none;
        box-sizing: border-box;
      `;
      
      // Add buttons
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        gap: 8px;
      `;
      
      const skipButton = document.createElement('button');
      skipButton.textContent = 'Skip';
      skipButton.style.cssText = `
        background-color: #f2f2f2;
        color: #333;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        flex: 1;
      `;
      
      const saveButton = document.createElement('button');
      saveButton.textContent = 'Save';
      saveButton.style.cssText = `
        background-color: #4285f4;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        flex: 1;
      `;
      
      // Function to remove the popup
      function removePopup() {
        try {
          if (popup && popup.parentNode) {
            popup.parentNode.removeChild(popup);
          }
        } catch (e) {
          console.warn('Error removing popup:', e);
        }
      }
      
      // Handle clicks on buttons
      skipButton.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        removePopup();
        safeCallback(null);
      });
      
      saveButton.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        removePopup();
        safeCallback(input.value.trim());
      });
      
      // Prevent events from bubbling
      popup.addEventListener('click', function(e) {
        e.stopPropagation();
      });
      
      // Handle keyboard events
      function handleKeydown(e) {
        if (e.key === 'Escape') {
          e.stopPropagation();
          removePopup();
          document.removeEventListener('keydown', handleKeydown);
          safeCallback(null);
        } else if (e.key === 'Enter' && e.ctrlKey) {
          e.stopPropagation();
          removePopup();
          document.removeEventListener('keydown', handleKeydown);
          safeCallback(input.value.trim());
        }
      }
      
      document.addEventListener('keydown', handleKeydown);
      
      // Assemble popup
      buttonContainer.appendChild(skipButton);
      buttonContainer.appendChild(saveButton);
      
      popup.appendChild(title);
      popup.appendChild(input);
      popup.appendChild(buttonContainer);
      
      // Add to page
      document.body.appendChild(popup);
      
      // Check if we can get focus on the input - if not, we'll fall back to native prompt
      let customUIWorks = false;
      let focusAttempts = 0;
      const maxFocusAttempts = 3;
      
      function attemptFocus() {
        try {
          focusAttempts++;
          input.focus();
          
          // We'll check after a short delay if the focus was actually applied
          setTimeout(() => {
            if (document.activeElement === input) {
              // Focus succeeded, mark that our custom UI works
              customUIWorks = true;
              console.log('Custom tooltip UI is working properly');
            } else if (focusAttempts < maxFocusAttempts) {
              // Try again
              console.log(`Focus attempt ${focusAttempts} failed, retrying...`);
              attemptFocus();
            } else {
              // We've tried multiple times and couldn't get focus, switch to native prompt
              console.log('Focus attempts failed, falling back to native prompt');
              removePopup();
              document.removeEventListener('keydown', handleKeydown);
              
              // Small delay before showing native prompt
              setTimeout(() => {
                if (!callbackCalled) {
                  useNativePrompt();
                }
              }, 100);
            }
          }, 50);
        } catch (e) {
          console.warn('Error attempting focus:', e);
          useNativePrompt();
        }
      }
      
      // Start focus attempts
      attemptFocus();
      
    } catch (e) {
      console.error('Error creating custom tooltip:', e);
      useNativePrompt();
    }
    
    // Fallback function to use native browser prompt
    function useNativePrompt() {
      try {
        console.log('Using native browser prompt as fallback');
        const tooltipText = window.prompt('Enter an explanation for this interaction:', '');
        
        if (tooltipText === null) {
          console.log('User cancelled the prompt');
          safeCallback(null);
        } else {
          console.log('User entered text:', tooltipText);
          safeCallback(tooltipText.trim());
        }
      } catch (e) {
        console.error('Error showing native prompt:', e);
        safeCallback(null);
      } finally {
        // Ensure the flag is reset even in error cases
        isShowingTooltip = false;
        
        // Schedule an additional flag reset after a short delay
        // This helps with complex scenarios where the reset might not take effect immediately
        setTimeout(() => {
          isShowingTooltip = false;
        }, 500);
      }
    }
  }

  // Take a screenshot of the current viewport - with improved error handling
  function takeScreenshot() {
    return new Promise(resolve => {
      // Check extension context first before attempting screenshot
      if (!isExtensionContextValid()) {
        console.error('Extension context invalid, cannot take screenshot');
        resolve(null);
        return;
      }
      
      try {
        chrome.runtime.sendMessage({
          action: 'takeScreenshot'
        }, response => {
          // Handle case where Chrome runtime might have an error
          if (chrome.runtime.lastError) {
            console.error('Error taking screenshot:', chrome.runtime.lastError?.message || 'Extension error');
            resolve(null);
            return;
          }
          
          // Check again if context is still valid
          if (!isExtensionContextValid()) {
            console.error('Extension context invalidated during screenshot');
            resolve(null);
            return;
          }
          
          if (response && response.screenshot) {
            resolve(response.screenshot);
          } else {
            console.warn('No screenshot in response');
            resolve(null);
          }
        });
      } catch (error) {
        console.error('Failed to take screenshot:', error);
        resolve(null);
      }
    });
  }

  // Send interaction data to background script - with improved error handling
  function sendInteractionToBackground(data) {
    if (!isExtensionContextValid()) {
      console.error('Extension context invalid, cannot send interaction');
      return;
    }
    
    try {
      chrome.runtime.sendMessage({
        action: 'recordInteraction',
        data: data
      }, response => {
        // Check for extension context before handling response
        if (!isExtensionContextValid()) {
          console.error('Extension context invalidated during response');
          return;
        }
        
        if (chrome.runtime.lastError) {
          console.error('Error sending interaction data:', chrome.runtime.lastError);
        } else if (response && response.success) {
          console.log('Interaction recorded successfully');
        }
      });
    } catch (error) {
      console.error('Failed to send interaction to background:', error);
    }
  }
}