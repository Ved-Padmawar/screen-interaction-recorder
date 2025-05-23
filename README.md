# Screen Interaction Recorder

A powerful Chrome extension that records user interactions with web pages and compiles them into interactive slideshows with explanatory tooltips.

![Screen Interaction Recorder](icons/icon128.png)

## Overview

Screen Interaction Recorder captures interactions with web pages, taking screenshots at each step. Using a customizable keyboard shortcut, you can capture the cursor position and add explanations in real-time, creating comprehensive visual guides that can be exported as PowerPoint presentations or interactive HTML slideshows.

## Features

- **Keyboard Shortcut Capture**: Use a customizable keyboard shortcut (default: Alt+C) to capture cursor position
- **Automatic Screenshots**: Automatically takes screenshots at each interaction point
- **Real-time Tooltips**: Add explanations immediately as you capture each interaction
- **Interactive Dots**: Purple dots indicate interaction points with tooltips
- **Multiple Export Options**:
  - Export to PowerPoint presentations
  - Export to interactive HTML slideshows
- **Responsive Design**: Works across different screen sizes and layouts
- **Navigation Support**: Automatically handles page redirects during recording
- **Intuitive Viewer**: Built-in viewer for reviewing and navigating recordings
- **Secure Processing**: All data processing happens locally in your browser
- **Configurable Settings**: Customize keyboard shortcuts and other settings

## Installation

### From Chrome Web Store

1. Visit the [Chrome Web Store](https://chrome.google.com/webstore/) (coming soon)
2. Search for "Screen Interaction Recorder"
3. Click "Add to Chrome"

### Manual Installation (Developer Mode)

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension icon should appear in your browser toolbar

## Usage

### Recording Interactions

1. Click the extension icon in your browser toolbar
2. Enter a title for your recording
3. Click "Start Recording"
4. Navigate through the website, positioning your cursor where you want to capture interactions
5. Press the keyboard shortcut (default: Alt+C) at each point you want to capture
   - A screenshot will be taken at the current cursor position
   - A tooltip popup will appear asking for an explanation
   - Enter a description and click "Save" (or press Ctrl+Enter)
   - Regular navigation without pressing the shortcut won't be recorded
6. When finished, click the extension icon again and select "Stop Recording"
7. You'll be taken to the recordings page where you can view your recording

### Form Submission and Change Events

The extension automatically detects and records:
- Form submissions (when you submit a form)
- Change events (when you modify input fields, select options, etc.)

These events are captured alongside your manual keyboard shortcut interactions.

### Customizing Settings

You can customize settings in the extension storage:

```javascript
// Default settings
const DEFAULT_CONFIG = {
  CAPTURE_SHORTCUT: 'alt+c',
  SHOW_RECORDING_INDICATOR: false,
  DEBUG_MODE: false
};
```

Valid modifier keys are `ctrl`, `alt`, and `shift`. For example:
- `alt+c` (default)
- `ctrl+shift+s`
- `ctrl+alt+x`

### Viewing and Exporting Recordings

1. Click the extension icon and select "View Saved Recordings"
2. Click on any recording card to open the viewer
3. Navigate through the slides using:
   - Arrow buttons at the bottom
   - Left/right arrow keys
   - Clicking on the image or purple dot
4. Export options:
   - "Export to PowerPoint" - Creates a PPTX file with all slides and tooltips
   - "Export to HTML" - Creates an interactive HTML slideshow

## How It Works

The extension operates in several key components:

1. **Content Script (contentScript.js)**: Injects into web pages to capture keyboard shortcut interactions, take screenshots, and display tooltip popups
2. **Background Script (background.js)**: Manages recording state, processes interactions, and handles data storage
3. **Environment Config (env.js)**: Contains configurable settings like keyboard shortcuts
4. **Popup (popup.html/js)**: Provides the user interface for starting/stopping recordings
5. **Recordings Page (recordings.html/js)**: Lists saved recordings and provides access to the viewer
6. **Viewer (viewer.html/js)**: Interactive slideshow viewer with navigation controls
7. **PowerPoint Generator (pptx-generator.html/js)**: Converts recordings to PowerPoint presentations

The extension stores all data locally in your browser using Chrome's storage API. No data is sent to external servers.

## Technical Details

### Data Structure

Each recording contains:
- Title
- Timestamp
- Duration
- Slide count
- Array of interactions, each with:
  - Screenshot (data URL)
  - Interaction type (click, submit, form change, etc.)
  - Page URL and title
  - Element information
  - Tooltip text
  - Position data

### File Structure

- `manifest.json` - Extension configuration (Manifest V3)
- `env.js` - Environment configuration with customizable settings
- `contentScript.js` - Injected into web pages to capture interactions
- `background.js` - Background service worker handling core functionality
- `popup.html/js` - Extension popup interface
- `recordings.html/js` - Recording management page
- `viewer.html/js` - Slideshow viewer
- `pptx-generator.html/js` - PowerPoint export functionality
- `css/` - Stylesheet files
- `icons/` - Extension icons and UI elements

### Permissions

The extension requires these permissions:
- `activeTab` - To access the current tab
- `scripting` - To inject scripts into web pages
- `storage` - To store recordings locally
- `downloads` - To export recordings
- `tabs` - To manage tabs and detect navigation

## Privacy

The Screen Interaction Recorder:
- Does not transmit any data to external servers
- Stores all recordings locally in your browser's storage
- Only operates on pages you explicitly choose to record
- Respects password fields and sensitive form elements

## Troubleshooting

### Common Issues

- **Recording Not Starting**: Ensure you've granted the extension necessary permissions
- **Missing Screenshots**: Some secure pages may block screenshot functionality
- **Interaction Not Recorded**: Make sure you're pressing the correct keyboard shortcut (default: Alt+C)
- **Tooltip Not Appearing**: Try adjusting your cursor position or checking if the page is using custom event handling
- **Keyboard Shortcut Not Working**: Some websites may capture keyboard shortcuts; try a different combination in the settings

### Support

For issues or feature requests, please file an issue in the repository.

## License

[MIT License](LICENSE)

---

Created with ❤️ for those who need to create visual guides quickly and effectively. 