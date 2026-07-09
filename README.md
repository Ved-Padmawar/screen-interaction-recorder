# Screen Interaction Recorder

Chrome extension for capturing user interaction flows and exporting them as guided HTML walkthroughs.

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Dexie / IndexedDB for screenshot blob storage
- Lucide React icons
- Chrome Extension Manifest V3

## Development

```powershell
pnpm install
pnpm run lint
pnpm run build
```

The extension build is emitted to `dist/`. Load `dist/` as an unpacked extension in Chrome or Edge.

## Storage Model

Small settings stay in `chrome.storage.sync`.

Recording metadata stays lightweight. Screenshot images are optimized in the content script, converted to blobs, and stored in IndexedDB. Recording slide records keep `screenshotId` references instead of embedding large base64 strings.

## Export

The app exports standalone HTML walkthroughs. PowerPoint/PPTX generation has been removed.
