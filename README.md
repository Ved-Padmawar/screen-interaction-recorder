# Screen Interaction Recorder

> A Chrome extension for capturing step-by-step web interactions and turning them into visual guides.

![Screen Interaction Recorder](icons/icon128.png)

---

## What it does

Screen Interaction Recorder lets you walk through any web flow while capturing screenshots at each step. Each capture saves the cursor position, a screenshot, and an optional tooltip explanation. The result is a navigable slideshow you can review, edit, and export.

---

## Features

| | |
|---|---|
| **Shortcut capture** | Press a configurable shortcut (default: `Shift+C`) to capture the current cursor position |
| **Auto screenshots** | A full screenshot is taken at each captured step |
| **Tooltip editor** | Edit explanations for any step after recording |
| **HTML export** | Export recordings as standalone interactive HTML slideshows |
| **Bulk manage** | Multi-select and delete recordings in one action |
| **Local only** | All data stays in your browser — nothing is sent externally |

---

## Installation

### Developer Mode (manual)

1. Clone or download this repository
2. Go to `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the extension folder
5. The extension icon will appear in your toolbar

---

## Quick Start

1. Click the extension icon
2. Enter a title and click **Start Recording**
3. Navigate to the page you want to document
4. Press `Shift+C` wherever you want to capture a step — a tooltip prompt will appear
5. Enter an explanation and press **Save** (or `Ctrl+Enter`)
6. When done, click the extension icon and press **Stop Recording**
7. Your recording appears in the Recordings page

---

## Keyboard Shortcut

The default shortcut is `Shift+C`. You can change it in **Settings** (gear icon on the Recordings page).

Supported formats: `shift+key`, `ctrl+key`, `alt+key`

---

## Exporting

From the Recordings page, each card has an **Export HTML** button that generates a self-contained interactive slideshow file and downloads it.

---

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Access the current tab during recording |
| `scripting` | Inject the capture script into pages |
| `storage` | Save recordings locally |
| `downloads` | Download exported files |
| `tabs` | Track navigation between pages during a recording |

---

## Privacy

- No data leaves your browser
- Recordings are stored in `chrome.storage.local`
- The extension only activates on pages you choose to record

---

## License

[MIT](LICENSE)
