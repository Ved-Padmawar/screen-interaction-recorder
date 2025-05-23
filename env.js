// Screen Interaction Recorder Environment Configuration

// Keyboard shortcut configuration
window.ENV = {
  // The key to press to capture a screenshot and register a click at cursor position
  // Format: control+alt+key or alt+shift+key or just a single key like 'c'
  CAPTURE_SHORTCUT: 'alt+c',
  
  // Other configuration options can be added here
  SHOW_RECORDING_INDICATOR: false,  // Whether to show a recording indicator on the page
  DEBUG_MODE: false,                // Enable debug logging
};

// Parse the shortcut into components for event listener
function parseShortcut(shortcutString) {
  const parts = shortcutString.toLowerCase().split('+');
  return {
    key: parts[parts.length - 1],
    ctrl: parts.includes('control') || parts.includes('ctrl'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift')
  };
}

// Export the parsed shortcut for easier usage
window.CAPTURE_KEY = parseShortcut(window.ENV.CAPTURE_SHORTCUT);

// Make these variables accessible to contentScript.js
console.log('Environment configuration loaded. Shortcut:', window.ENV.CAPTURE_SHORTCUT);

// For module environments
if (typeof module !== 'undefined') {
  module.exports = { ENV: window.ENV, CAPTURE_KEY: window.CAPTURE_KEY };
} 