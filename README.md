# Screen Interaction Recorder

A powerful Chrome extension that records user interactions with web pages and compiles them into interactive slideshows with explanatory tooltips.

![Screen Interaction Recorder](icons/icon128.png)

## Overview

Screen Interaction Recorder captures clicks, form submissions, and other interactions with web pages, taking screenshots at each step. It then allows you to add explanations for each interaction, creating comprehensive visual guides that can be exported as PowerPoint presentations or interactive HTML slideshows.

## Features

- **Effortless Recording**: Capture user interactions with Shift+Click to precisely control what gets recorded
- **Automatic Screenshots**: Automatically takes screenshots at each interaction point
- **Explanatory Tooltips**: Add custom explanations for each interaction
- **Interactive Dots**: Purple dots indicate interaction points with tooltips
- **Post-Recording Editing**: Edit tooltip text after recording in a dedicated edit interface
- **Multiple Export Options**:
  - Export to PowerPoint presentations
  - Export to interactive HTML slideshows
- **Responsive Design**: Works across different screen sizes and layouts
- **Navigation Support**: Automatically handles page redirects during recording
- **Intuitive Viewer**: Built-in viewer for reviewing and navigating recordings
- **Secure Processing**: All data processing happens locally in your browser

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
4. Navigate through the website, performing the interactions you want to record
5. To capture an interaction, hold the Shift key while clicking on elements
   - The extension will take a screenshot for each Shift+Click
   - Regular clicks without Shift will not be recorded, allowing normal navigation
6. When finished, click the extension icon again and select "Stop Recording"
7. The edit page will open automatically, allowing you to:
   - Review each captured interaction
   - Add or edit tooltip text for each step
   - Save your changes or cancel to discard them

### Viewing and Exporting Recordings

1. Click the extension icon and select "View Recordings" (or it will open automatically after stopping)
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

1. **Content Script (contentScript.js)**: Injects into web pages to capture Shift+Click interactions and take screenshots
2. **Background Script (background.js)**: Manages recording state, processes interactions, and handles data storage
3. **Popup (popup.html/js)**: Provides the user interface for starting/stopping recordings
4. **Edit Page (edit-recording.html/js)**: Allows reviewing and editing of tooltip text after recording
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
  - Interaction type (click, submit, etc.)
  - Page URL and title
  - Element information
  - Tooltip text
  - Position data

### File Structure

- `manifest.json` - Extension configuration
- `contentScript.js` - Injected into web pages to capture interactions
- `background.js` - Background service worker handling core functionality
- `popup.html/js` - Extension popup interface
- `edit-recording.html/js` - Post-recording tooltip editing interface
- `recordings.html/js` - Recording management page
- `viewer.html/js` - Slideshow viewer
- `pptx-generator.html/js` - PowerPoint export functionality
- `css/` - Stylesheet files
- `icons/` - Extension icons and UI elements

## Privacy

The Screen Interaction Recorder:
- Does not transmit any data to external servers
- Stores all recordings locally in your browser
- Only operates on pages you explicitly choose to record
- Respects password fields and sensitive form elements

## Troubleshooting

### Common Issues

- **Recording Not Starting**: Ensure you've granted the extension necessary permissions
- **Missing Screenshots**: Some secure pages may block screenshot functionality
- **Interaction Not Recorded**: Make sure you're holding the Shift key while clicking
- **Tooltip Not Appearing**: For fast-navigating pages, tooltips may be added during the edit phase
- **Dot Position in Edit View**: The purple dot position in the edit view may differ slightly from the final output, but the final presentation will show correct positioning

### Support

For issues or feature requests, please file an issue in the repository.

## License

[MIT License](LICENSE)

---

Created with ❤️ for those who need to create visual guides quickly and effectively. 