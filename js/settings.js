// Screen Interaction Recorder Settings Manager

// Default configuration
const DEFAULT_CONFIG = {
  CAPTURE_SHORTCUT: 'alt+c',
  SHOW_RECORDING_INDICATOR: false,
  DEBUG_MODE: false
};

// DOM elements
document.addEventListener('DOMContentLoaded', function() {
  const shortcutInput = document.getElementById('shortcut-input');
  const showIndicatorCheckbox = document.getElementById('show-indicator');
  const saveButton = document.getElementById('save-settings');
  const resetButton = document.getElementById('reset-settings');
  const statusMessage = document.getElementById('status-message');
  const backButton = document.getElementById('back-button');
  
  // Load current settings
  loadSettings();
  
  // Event listeners
  saveButton.addEventListener('click', saveSettings);
  resetButton.addEventListener('click', resetSettings);
  backButton.addEventListener('click', navigateBack);
  
  // Load settings from storage
  function loadSettings() {
    chrome.storage.sync.get('sirConfig', function(data) {
      const config = data.sirConfig || DEFAULT_CONFIG;
      shortcutInput.value = config.CAPTURE_SHORTCUT;
      showIndicatorCheckbox.checked = config.SHOW_RECORDING_INDICATOR;
    });
  }
  
  // Save settings to storage
  function saveSettings() {
    const shortcut = shortcutInput.value.trim().toLowerCase();
    
    // Validate shortcut
    if (!isValidShortcut(shortcut)) {
      showStatus('Invalid shortcut format. Use format like "alt+c", "ctrl+shift+s", etc.', 'error');
      return;
    }
    
    const config = {
      CAPTURE_SHORTCUT: shortcut,
      SHOW_RECORDING_INDICATOR: showIndicatorCheckbox.checked,
      DEBUG_MODE: false // Not exposing this in the UI for simplicity
    };
    
    chrome.storage.sync.set({ sirConfig: config }, function() {
      showStatus('Settings saved successfully!', 'success');
    });
  }
  
  // Reset settings to default
  function resetSettings() {
    chrome.storage.sync.set({ sirConfig: DEFAULT_CONFIG }, function() {
      shortcutInput.value = DEFAULT_CONFIG.CAPTURE_SHORTCUT;
      showIndicatorCheckbox.checked = DEFAULT_CONFIG.SHOW_RECORDING_INDICATOR;
      showStatus('Settings reset to default', 'success');
    });
  }
  
  // Navigate back to recordings page
  function navigateBack() {
    window.location.href = 'recordings.html';
  }
  
  // Validate shortcut format
  function isValidShortcut(shortcut) {
    // At minimum, must be a single key
    if (!shortcut) return false;
    
    const parts = shortcut.split('+');
    
    // Check if the key part is valid (last part)
    const key = parts[parts.length - 1];
    if (!key || key.length !== 1) return false;
    
    // Check modifiers are valid
    const modifiers = parts.slice(0, -1);
    for (const mod of modifiers) {
      if (!['ctrl', 'control', 'alt', 'shift'].includes(mod)) {
        return false;
      }
    }
    
    return true;
  }
  
  // Show status message
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message ' + type;
    statusMessage.style.display = 'block';
    
    setTimeout(() => {
      statusMessage.style.opacity = '0';
      setTimeout(() => {
        statusMessage.style.display = 'none';
        statusMessage.style.opacity = '1';
      }, 500);
    }, 2000);
  }
}); 