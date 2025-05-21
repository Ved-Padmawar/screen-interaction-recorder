// Check if script is already initialized
if (typeof window._sirContentScriptLoaded !== 'undefined') {
  console.log('Screen Interaction Recorder content script already loaded. Skipping initialization.');
} else {
  // Mark as loaded
  window._sirContentScriptLoaded = true;
  
  // Reset on page unload to ensure proper re-initialization on new pages
  window.addEventListener('beforeunload', () => {
    window._sirContentScriptLoaded = undefined;
  });
  
  // Flag to track whether recording is active
  let isRecording = false;
  
  // Flag to prevent capturing while showing tooltip input
  let isShowingTooltip = false;
  
  // Store pending interactions awaiting tooltip text
  let pendingInteraction = null;
  
  // Helper to check if extension context is still valid
  function isExtensionContextValid() {
    return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
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
    document.addEventListener('click', recordClickEvent, true);
    document.addEventListener('contextmenu', handleRightClick, true);
    document.addEventListener('submit', recordSubmitEvent, true);
    document.addEventListener('change', recordChangeEvent, true);
  }

  // Remove interaction event listeners
  function removeInteractionListeners() {
    document.removeEventListener('click', recordClickEvent, true);
    document.removeEventListener('contextmenu', handleRightClick, true);
    document.removeEventListener('submit', recordSubmitEvent, true);
    document.removeEventListener('change', recordChangeEvent, true);
  }

  // Show a visual indicator that recording is in progress
  function showRecordingIndicator(show) {
    // Function intentionally disabled to hide recording indicator
    // Remove any existing indicator if it exists
    const indicator = document.getElementById('sir-recording-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  // Record a click event
  function recordClickEvent(event) {
    if (!isRecording || isShowingTooltip) return;
    
    // Prevent multiple popups from appearing
    if (document.getElementById('sir-tooltip-popup') || pendingInteraction !== null) {
      return;
    }
    
    // Check if the click is on our tooltip popup or its children
    const tooltipPopup = document.getElementById('sir-tooltip-popup');
    if (tooltipPopup && (tooltipPopup === event.target || tooltipPopup.contains(event.target))) {
      return; // Ignore clicks on the tooltip popup
    }
    
    // Get exact click position and store it immediately
    const clickX = event.clientX;
    const clickY = event.clientY;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Exact click as percentage of viewport
    const exactClickX = clickX / viewportWidth;
    const exactClickY = clickY / viewportHeight;
    
    // Store the UI state at click time
    const element = event.target;
    const rect = element.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    
    // Check if it's an input element to avoid blocking typing
    const isInputElement = element.tagName === 'INPUT' || 
                          element.tagName === 'TEXTAREA' || 
                          element.tagName === 'SELECT' ||
                          element.isContentEditable ||
                          (element.tagName === 'DIV' && element.getAttribute('role') === 'textbox');
    
    // Step 1: Take a screenshot first - BEFORE showing any popup
    // This ensures the screenshot won't have the tooltip popup in it
    takeScreenshot().then(screenshot => {
      // Step 2: Prepare complete interaction data
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
        
        // Store all position data for accuracy
        clientX: clickX,
        clientY: clickY,
        exactClickX: exactClickX,
        exactClickY: exactClickY,
        pageX: event.pageX,
        pageY: event.pageY,
        offsetX: event.offsetX,
        offsetY: event.offsetY,
        
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
      
      // Step 3A: For input elements, use generic text and send immediately
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
        
        // Send and don't show popup for input elements
        sendInteractionToBackground(interactionData);
      } 
      // Step 3B: For regular elements, show tooltip popup
      else {
        // Set flag to prevent capturing during tooltip input
        isShowingTooltip = true;
        
        // Show tooltip popup to get user input
        showTooltipInputPopup(clickX, clickY, tooltipText => {
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

  // Handle right-click and show tooltip input popup
  function handleRightClick(event) {
    if (!isRecording || isShowingTooltip) return;
    
    // Prevent multiple popups from appearing
    if (document.getElementById('sir-tooltip-popup') || pendingInteraction !== null) {
      return;
    }
    
    // Prevent the default context menu
    event.preventDefault();
    
    // Get exact click position immediately
    const clickX = event.clientX;
    const clickY = event.clientY;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const exactClickX = clickX / viewportWidth;
    const exactClickY = clickY / viewportHeight;
    
    const element = event.target;
    const rect = element.getBoundingClientRect();
    
    // Take screenshot immediately before showing any popup
    takeScreenshot().then(screenshot => {
      // Prepare interaction data
      const interactionData = {
        type: 'rightClick',
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
        
        // Store all position data 
        clientX: clickX,
        clientY: clickY,
        exactClickX: exactClickX,
        exactClickY: exactClickY,
        pageX: event.pageX,
        pageY: event.pageY,
        offsetX: event.offsetX,
        offsetY: event.offsetY,
        
        // Element and window state
        elementRect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        },
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        viewportWidth: viewportWidth,
        viewportHeight: viewportHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight
      };
      
      // Set flag to prevent capturing during tooltip input
      isShowingTooltip = true;
      
      // Show tooltip popup to get text input
      showTooltipInputPopup(clickX, clickY, tooltipText => {
        if (tooltipText) {
          interactionData.tooltipText = tooltipText;
        }
        sendInteractionToBackground(interactionData);
        
        // Reset tooltip showing flag
        isShowingTooltip = false;
      });
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

  // Fix the showTooltipInputPopup function to make sure it appears correctly
  function showTooltipInputPopup(x, y, callback) {
    // Remove any existing popup first - with safer checks
    try {
      const existingPopup = document.getElementById('sir-tooltip-popup');
      if (existingPopup && existingPopup.parentNode) {
        existingPopup.parentNode.removeChild(existingPopup);
      }
    } catch (error) {
      console.error('Error removing existing popup:', error);
    }

    // Create popup container
    const popup = document.createElement('div');
    popup.id = 'sir-tooltip-popup';
    popup.setAttribute('data-recording-ignore', 'true'); // Mark to ignore for recordings
    popup.style.cssText = `
      position: fixed;
      top: ${Math.min(y, window.innerHeight - 200)}px;
      left: ${Math.min(x, window.innerWidth - 300)}px;
      background-color: white;
      padding: 12px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      z-index: 999999;
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
    
    // Function to safely remove the popup
    function safelyRemovePopup() {
      try {
        if (popup && popup.parentNode) {
          popup.parentNode.removeChild(popup);
        }
      } catch (error) {
        console.error('Error removing popup:', error);
      }
    }
    
    // Prevent events from bubbling up
    popup.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault(); // Prevent any capture of this click
    });
    
    // Add click handlers with event prevention
    skipButton.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault(); // Prevent any capture of this click
      callback(null);
      safelyRemovePopup();
    });
    
    saveButton.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault(); // Prevent any capture of this click
      callback(input.value.trim());
      safelyRemovePopup();
    });
    
    // Close on Escape key
    function handleKeydown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        callback(null);
        safelyRemovePopup();
        document.removeEventListener('keydown', handleKeydown);
      } else if (e.key === 'Enter' && e.ctrlKey) {
        e.stopPropagation();
        callback(input.value.trim());
        safelyRemovePopup();
        document.removeEventListener('keydown', handleKeydown);
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
    
    // Focus the input
    setTimeout(() => {
      try {
        if (input && document.contains(input)) {
          input.focus();
        }
      } catch (error) {
        console.error('Error focusing input:', error);
      }
    }, 100);
  }

  // Take a screenshot of the current viewport - with improved error handling
  function takeScreenshot() {
    return new Promise(resolve => {
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
          if (!isExtensionContextValid()) {
            console.error('Extension context invalidated during screenshot');
            resolve(null);
            return;
          }
          
          if (chrome.runtime.lastError) {
            console.error('Error taking screenshot:', chrome.runtime.lastError?.message || 'Extension context invalidated');
            resolve(null);
            return;
          }
          
          if (response && response.screenshot) {
            resolve(response.screenshot);
          } else {
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