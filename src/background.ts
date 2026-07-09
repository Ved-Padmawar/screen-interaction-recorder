import {
  RuntimeAction,
  type ContentScriptRequest,
  type DeleteRecordingsResponse,
  type Recording,
  type RecordingInteraction,
  type RecordingSlide,
  type RuntimeRequest,
} from './domain/contracts'
import { blobToDataUrl, dataUrlToBlob } from './lib/blob'
import { deleteScreenshotsForRecordings, getScreenshot, saveScreenshot } from './platform/database'

let isRecording = false
let recordingTitle = ''
let recordingData: RecordingInteraction[] = []
let recordingStartTime: number | null = null
let activeTabId: number | null = null

function logError(message: string) {
  console.error(`[screen-interaction-recorder] ${message}`)
}

function isExtensionContextValid() {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id)
}

function getChromeError() {
  return chrome.runtime.lastError?.message
}

function getStoredRecordings(): Promise<Recording[]> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get<{ recordings?: Recording[] }>(['recordings'], (result) => {
      const error = getChromeError()
      if (error) reject(new Error(error))
      else resolve(result.recordings ?? [])
    })
  })
}

function setStoredRecordings(recordings: Recording[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ recordings }, () => {
      const error = getChromeError()
      if (error) reject(new Error(error))
      else resolve()
    })
  })
}

async function saveRecording(recording: Recording) {
  const recordings = await getStoredRecordings()
  await setStoredRecordings([...recordings, recording])
}

async function deleteRecording(filename: string) {
  const recordings = await getStoredRecordings()
  const updated = recordings.filter((recording) => recording.filename !== filename)
  await setStoredRecordings(updated)
  await deleteScreenshotsForRecordings([filename])
  return updated.length < recordings.length
}

async function deleteRecordings(filenames: string[]): Promise<DeleteRecordingsResponse> {
  const recordings = await getStoredRecordings()
  const filenameSet = new Set(filenames)
  const updated = recordings.filter((recording) => !filenameSet.has(recording.filename))
  await setStoredRecordings(updated)
  await deleteScreenshotsForRecordings(filenames)

  return {
    success: true,
    deleted: recordings.length - updated.length,
  }
}

/**
 * Builds renderable slides, dropping interactions whose screenshot capture
 * failed — a slide with no image has nothing to show.
 */
async function toSlides(recording: Recording): Promise<RecordingSlide[]> {
  const slides = await Promise.all(
    recording.data.map(async (interaction, index): Promise<RecordingSlide | null> => {
      const image = await resolveScreenshotImage(interaction)
      if (!image) return null

      return {
        index,
        image,
        screenshotId: interaction.screenshotId,
        clickXPercent: interaction.clickXPercent,
        clickYPercent: interaction.clickYPercent,
        tooltipText: interaction.tooltipText ?? null,
        timestamp: interaction.timestamp,
        type: interaction.type,
        details: {
          url: interaction.pageUrl,
          title: interaction.pageTitle,
          elementType: interaction.tagName,
          elementId: interaction.id ?? undefined,
          elementText: interaction.text ?? undefined,
        },
      }
    }),
  )

  return slides.filter((slide) => slide !== null)
}

async function resolveScreenshotImage(interaction: RecordingInteraction) {
  if (!interaction.screenshotId) return ''

  const screenshot = await getScreenshot(interaction.screenshotId)
  return screenshot ? blobToDataUrl(screenshot.blob) : ''
}

function takeScreenshot(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
      const error = getChromeError()
      if (error) reject(new Error(error))
      else if (dataUrl) resolve(dataUrl)
      else reject(new Error('Screenshot capture returned no data.'))
    })
  })
}

function sendMessageToContentScript(tabId: number, message: ContentScriptRequest) {
  chrome.tabs.sendMessage(tabId, message, () => {
    const error = getChromeError()
    if (error) logError(`Content script message failed for tab ${tabId}: ${error}`)
  })
}

function injectContentScript(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    files: ['contentScript.js'],
  })
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!isRecording || tabId !== activeTabId || changeInfo.status !== 'complete') return

  injectContentScript(tabId)
    .then(() => sendMessageToContentScript(tabId, { action: RuntimeAction.StartRecording }))
    .catch((error: Error) => logError(`Content script reinjection failed: ${error.message}`))
})

chrome.runtime.onMessage.addListener((message: RuntimeRequest, sender, sendResponse) => {
  if (!isExtensionContextValid()) {
    sendResponse({ error: 'Extension context invalidated' })
    return false
  }

  void handleRuntimeMessage(message, sender)
    .then(sendResponse)
    .catch((error: Error) => {
      logError(error.message)
      sendResponse({ success: false, error: error.message })
    })

  return true
})

async function handleRuntimeMessage(message: RuntimeRequest, sender: chrome.runtime.MessageSender) {
  switch (message.action) {
    case RuntimeAction.GetRecordingStatus:
      return { isRecording }

    case RuntimeAction.StartRecording:
      return startRecording(message.title)

    case RuntimeAction.StopRecording:
      return stopRecording(sender)

    case RuntimeAction.RecordInteraction:
      return recordInteraction(message.data)

    case RuntimeAction.TakeScreenshot:
      return takeScreenshot()
        .then((screenshot) => ({ screenshot }))
        .catch((error: Error) => ({ screenshot: null, error: error.message }))

    case RuntimeAction.GetRecordings:
      return getStoredRecordings()
        .then((recordings) => ({ recordings }))
        .catch((error: Error) => ({ recordings: [], error: error.message }))

    case RuntimeAction.GetRecordingSlides: {
      const recordings = await getStoredRecordings()
      const recording = recordings.find((item) => item.filename === message.filename)
      return { slides: recording ? await toSlides(recording) : [] }
    }

    case RuntimeAction.UpdateRecording:
      return updateRecording(message.updatedRecording)

    case RuntimeAction.ExportHtml:
      return exportHtml(message.recording, message.slides)

    case RuntimeAction.DeleteRecording:
      return { success: await deleteRecording(message.filename) }

    case RuntimeAction.DeleteRecordings:
      return deleteRecordings(message.filenames)
  }
}

async function startRecording(title: string) {
  isRecording = true
  recordingTitle = title || `Recording ${new Date().toLocaleString()}`
  recordingData = []
  recordingStartTime = Date.now()

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id
    if (!tabId) return

    activeTabId = tabId
    injectContentScript(tabId)
      .then(() => sendMessageToContentScript(tabId, { action: RuntimeAction.StartRecording }))
      .catch((error: Error) => logError(`Content script injection failed: ${error.message}`))
  })

  return { success: true }
}

async function stopRecording(sender: chrome.runtime.MessageSender) {
  if (!isRecording || recordingStartTime === null) {
    return { success: false, error: 'Not recording.' }
  }

  isRecording = false
  const stoppedTabId = activeTabId
  activeTabId = null

  const filename = `recording_${Date.now()}`
  const interactions = await persistInteractionScreenshots(filename, recordingData)

  const recording: Recording = {
    title: recordingTitle,
    timestamp: recordingStartTime,
    date: new Date().toISOString(),
    duration: Date.now() - recordingStartTime,
    data: interactions,
    slideCount: interactions.length,
    filename,
  }

  recordingData = []
  recordingTitle = ''
  recordingStartTime = null

  await saveRecording(recording)

  if (stoppedTabId) sendMessageToContentScript(stoppedTabId, { action: RuntimeAction.StopRecording })

  const targetTabId = sender.tab?.id ?? stoppedTabId
  const recordingsUrl = chrome.runtime.getURL('recordings.html')

  if (targetTabId) chrome.tabs.update(targetTabId, { url: recordingsUrl })
  else chrome.tabs.create({ url: recordingsUrl })

  return { success: true }
}

function recordInteraction(data: RecordingInteraction) {
  if (!isRecording || recordingStartTime === null) {
    return { success: false, error: 'Not recording' }
  }

  recordingData.push({
    ...data,
    timestamp: Date.now() - recordingStartTime,
  })

  return { success: true }
}

/**
 * Moves each captured screenshot out of the in-memory data URL and into
 * IndexedDB, leaving only its id on the interaction. Interactions whose capture
 * failed carry no screenshot and pass through untouched.
 */
async function persistInteractionScreenshots(recordingFilename: string, interactions: RecordingInteraction[]) {
  return Promise.all(
    interactions.map(async (interaction, index): Promise<RecordingInteraction> => {
      if (!interaction.screenshot) return interaction

      const screenshotId = `${recordingFilename}_screenshot_${index}_${Date.now()}`
      const blob = dataUrlToBlob(interaction.screenshot)

      await saveScreenshot({
        id: screenshotId,
        recordingFilename,
        createdAt: new Date().toISOString(),
        mimeType: blob.type || 'image/png',
        blob,
      })

      return {
        ...interaction,
        screenshot: null,
        screenshotId,
      }
    }),
  )
}

async function updateRecording(updatedRecording: Recording) {
  const recordings = await getStoredRecordings()
  const index = recordings.findIndex((recording) => recording.filename === updatedRecording.filename)

  if (index === -1) return { success: false, error: 'Recording not found for update.' }

  const updated = [...recordings]
  updated[index] = updatedRecording
  await setStoredRecordings(updated)

  return { success: true }
}

function exportHtml(recording: Recording, slides: RecordingSlide[]) {
  if (!recording || slides.length === 0) return { success: false, error: 'Missing recording data or slides' }

  const htmlContent = generateHTMLSlideshow(recording, slides)
  const safeFilename = (recording.title || 'recording').replace(/[^a-z0-9]/gi, '_').toLowerCase()

  return new Promise((resolve) => {
    chrome.downloads.download(
      {
        url: `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`,
        filename: `${safeFilename}_walkthrough.html`,
        saveAs: true,
      },
      (downloadId) => {
        const error = getChromeError()
        resolve(error ? { success: false, error } : { success: true, downloadId })
      },
    )
  })
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Serialises a payload for embedding in an inline <script>. `<` is escaped so a
 * tooltip containing a closing script tag cannot end the block early, and the JS
 * line terminators are escaped because JSON.stringify leaves them raw.
 */
const SCRIPT_UNSAFE = new RegExp('[<' + String.fromCharCode(0x2028, 0x2029) + ']', 'g')

function escapeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(
    SCRIPT_UNSAFE,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )
}

function generateHTMLSlideshow(recording: Recording, slides: RecordingSlide[]) {
  const encodedSlides = escapeScriptJson(
    slides.map((slide) => ({
      image: slide.image,
      clickX: slide.clickXPercent ?? 50,
      clickY: slide.clickYPercent ?? 50,
      tooltipText: slide.tooltipText ?? '',
    })),
  )

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(recording.title)} | Walkthrough</title>
  <style>
    :root {
      color-scheme: light dark;
      --canvas: #f7f8fb;
      --surface: #ffffff;
      --ink: #18202f;
      --ink-muted: #5d687a;
      --line: #dbe2ea;
      --brand: #2563eb;
      --stage: #eef1f6;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --canvas: #0f141d;
        --surface: #151b26;
        --ink: #edf2f7;
        --ink-muted: #aeb8c7;
        --line: #2b3545;
        --brand: #60a5fa;
        --stage: #0b0f17;
      }
    }

    /* The tooltip floats over an arbitrary screenshot rather than over the
       page's own surfaces, so it keeps one fixed high-contrast treatment in both
       colour schemes. Declared outside :root's theme blocks precisely so it is
       never inverted -- a pale chip disappears into a pale capture. */
    :root {
      --tip-bg: #1e2635;
      --tip-ink: #f5f7fa;
      --tip-line: #ffffff26;
    }

    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; }
    body {
      display: flex;
      flex-direction: column;
      background: var(--canvas);
      color: var(--ink);
      font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
    }

    header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--line);
      background: var(--surface);
    }
    header h1 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .counter {
      margin-left: auto;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      color: var(--ink-muted);
    }

    .stage {
      flex: 1;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: var(--stage);
    }
    .frame { position: relative; line-height: 0; }
    .frame img {
      display: block;
      max-width: 100%;
      max-height: 100%;
      border-radius: 8px;
      object-fit: contain;
    }

    /* Matches the in-app viewer's click dot: 20px, 2px brand border, 40% fill. */
    .dot {
      position: absolute;
      width: 20px;
      height: 20px;
      padding: 0;
      border-radius: 999px;
      background: color-mix(in srgb, var(--brand) 40%, transparent);
      border: 2px solid var(--brand);
      transform: translate(-50%, -50%);
      cursor: pointer;
    }

    .tip {
      position: absolute;
      left: 28px;
      top: -10px;
      min-width: 160px;
      max-width: 300px;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid var(--tip-line);
      background: var(--tip-bg);
      /* The tip lives inside a <button>, which does not inherit body colour --
         it would otherwise fall back to the UA's black buttontext. */
      color: var(--tip-ink);
      font-size: 13px;
      font-weight: 500;
      line-height: 1.45;
      text-align: left;
      text-wrap: pretty;
      white-space: normal;
      box-shadow: 0 12px 28px rgb(0 0 0 / 0.28);
    }

    footer {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-top: 1px solid var(--line);
      background: var(--surface);
    }
    .nav {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 36px;
      padding: 0 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      color: var(--ink);
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    .nav:hover:not(:disabled) { background: var(--canvas); }
    .nav:disabled { opacity: 0.45; cursor: not-allowed; }

    .track {
      flex: 1;
      height: 6px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--ink) 12%, transparent);
      overflow: hidden;
    }
    .bar {
      height: 100%;
      width: 0;
      border-radius: 999px;
      background: var(--brand);
      transition: width 180ms ease;
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(recording.title)}</h1>
    <span class="counter" id="counter"></span>
  </header>

  <main class="stage">
    <div class="frame" id="frame">
      <img id="image" alt="">
      <button id="dot" class="dot" type="button" aria-label="Next step"></button>
    </div>
  </main>

  <footer>
    <button class="nav" id="prev" type="button">Previous</button>
    <div class="track"><div class="bar" id="bar"></div></div>
    <button class="nav" id="next" type="button">Next</button>
  </footer>

  <script>
    const slides = ${encodedSlides};
    let index = 0;

    const image = document.getElementById('image');
    const dot = document.getElementById('dot');
    const counter = document.getElementById('counter');
    const bar = document.getElementById('bar');
    const prev = document.getElementById('prev');
    const next = document.getElementById('next');

    function show(target) {
      if (target < 0 || target >= slides.length) return;
      index = target;

      const slide = slides[index];
      image.src = slide.image;
      dot.style.left = slide.clickX + '%';
      dot.style.top = slide.clickY + '%';

      dot.textContent = '';
      if (slide.tooltipText) {
        const tip = document.createElement('span');
        tip.className = 'tip';
        tip.textContent = slide.tooltipText;
        tip.addEventListener('click', (event) => event.stopPropagation());
        dot.appendChild(tip);
      }

      counter.textContent = (index + 1) + ' / ' + slides.length;
      bar.style.width = ((index + 1) / slides.length) * 100 + '%';
      prev.disabled = index === 0;
      next.disabled = index === slides.length - 1;
    }

    const forward = () => show(Math.min(slides.length - 1, index + 1));
    const back = () => show(Math.max(0, index - 1));

    prev.addEventListener('click', back);
    next.addEventListener('click', forward);
    dot.addEventListener('click', forward);
    image.addEventListener('click', forward);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); back(); }
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); forward(); }
    });

    show(0);
  </script>
</body>
</html>`
}
