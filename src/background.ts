import type { DeleteRecordingsResponse, Recording, RecordingInteraction, RecordingSlide, RuntimeRequest } from './domain/contracts'
import { blobToDataUrl, dataUrlToBlob } from './lib/blob'
import { deleteScreenshotsForRecordings, getScreenshot, saveScreenshot } from './platform/database'

const RuntimeAction = {
  DeleteRecording: 'deleteRecording',
  DeleteRecordings: 'deleteRecordings',
  ExportHtml: 'exportHtml',
  GetRecordingSlides: 'getRecordingSlides',
  GetRecordingStatus: 'getRecordingStatus',
  GetRecordings: 'getRecordings',
  RecordInteraction: 'recordInteraction',
  StartRecording: 'startRecording',
  StopRecording: 'stopRecording',
  TakeScreenshot: 'takeScreenshot',
  UpdateRecording: 'updateRecording',
} as const

type ContentScriptRequest =
  | { action: typeof RuntimeAction.StartRecording }
  | { action: typeof RuntimeAction.StopRecording }

let isRecording = false
let recordingTitle = ''
let recordingData: RecordingInteraction[] = []
let recordingStartTime: number | null = null
let activeTabId: number | null = null

const DEBUG_MODE = false

function logDebug(message: string) {
  if (DEBUG_MODE) console.log(`[${new Date().toLocaleTimeString()}] SIR_BG: ${message}`)
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

async function toSlides(recording: Recording): Promise<RecordingSlide[]> {
  return Promise.all(recording.data.map(async (interaction, index) => ({
    index,
    image: await resolveScreenshotImage(interaction),
    screenshotId: interaction.screenshotId,
    clickX:
      interaction.clickXPercent ??
      (interaction.exactClickX !== undefined
        ? interaction.exactClickX * 100
        : interaction.clickX !== undefined
          ? interaction.clickX > 1
            ? interaction.clickX
            : interaction.clickX * 100
          : 50),
    clickY:
      interaction.clickYPercent ??
      (interaction.exactClickY !== undefined
        ? interaction.exactClickY * 100
        : interaction.clickY !== undefined
          ? interaction.clickY > 1
            ? interaction.clickY
            : interaction.clickY * 100
          : 50),
    tooltipText: interaction.tooltipText ?? null,
    originalClientX: interaction.originalClientX,
    originalClientY: interaction.originalClientY,
    originalViewportWidth: interaction.originalViewportWidth,
    originalViewportHeight: interaction.originalViewportHeight,
    exactClickX: interaction.exactClickX,
    exactClickY: interaction.exactClickY,
    timestamp: interaction.timestamp,
    type: interaction.type,
    details: {
      url: interaction.pageUrl,
      title: interaction.pageTitle,
      elementType: interaction.tagName,
      elementId: interaction.id ?? undefined,
      elementClass: interaction.className ?? undefined,
      elementText: interaction.text ?? undefined,
      scrollX: interaction.scrollX,
      scrollY: interaction.scrollY,
    },
  })))
}

async function resolveScreenshotImage(interaction: RecordingInteraction) {
  if (interaction.screenshot) return interaction.screenshot
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

function sendMessageToContentScript(tabId: number, message: ContentScriptRequest, callback?: (success: boolean) => void) {
  chrome.tabs.sendMessage(tabId, message, () => {
    const error = getChromeError()
    if (error) logDebug(`Content script message failed for tab ${tabId}: ${error}`)
    callback?.(!error)
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
    .catch((error: Error) => logDebug(`Content script reinjection failed: ${error.message}`))
})

chrome.runtime.onMessage.addListener((message: RuntimeRequest, sender, sendResponse) => {
  if (!isExtensionContextValid()) {
    sendResponse({ error: 'Extension context invalidated' })
    return false
  }

  void handleRuntimeMessage(message, sender)
    .then(sendResponse)
    .catch((error: Error) => {
      logDebug(error.message)
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
      .catch((error: Error) => logDebug(`Content script injection failed: ${error.message}`))
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

  if (data.id === 'sir-tooltip-popup' || data.className?.includes('sir-')) {
    return { success: true }
  }

  recordingData.push({
    ...data,
    timestamp: Date.now() - recordingStartTime,
  })

  return { success: true }
}

async function persistInteractionScreenshots(recordingFilename: string, interactions: RecordingInteraction[]) {
  return Promise.all(
    interactions.map(async (interaction, index) => {
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

function generateHTMLSlideshow(recording: Recording, slides: RecordingSlide[]) {
  const encodedSlides = JSON.stringify(
    slides.map((slide) => ({
      image: slide.image,
      clickX: slide.clickX ?? 50,
      clickY: slide.clickY ?? 50,
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
    *{box-sizing:border-box}html,body{height:100%;margin:0;background:#10141f;color:#fff;font-family:Inter,system-ui,sans-serif}
    body{display:flex;align-items:center;justify-content:center;padding:20px}.frame{position:relative;max-width:100%;max-height:100%;box-shadow:0 20px 60px #0008}
    img{display:block;max-width:calc(100vw - 40px);max-height:calc(100vh - 40px);object-fit:contain}.dot{position:absolute;width:24px;height:24px;border-radius:999px;background:#2563ebaa;border:2px solid #2563eb;transform:translate(-50%,-50%);cursor:pointer}
    .tip{position:absolute;left:30px;top:-8px;min-width:160px;max-width:300px;border-radius:8px;background:#182033;padding:8px 12px;font-size:13px;line-height:1.45;box-shadow:0 12px 28px #0008}.count{position:absolute;left:10px;bottom:10px;border-radius:6px;background:#0009;padding:4px 8px;font-size:12px}
  </style>
</head>
<body>
  <div class="frame" id="frame"><img id="image" alt=""><button id="dot" class="dot" type="button"></button><div id="count" class="count"></div></div>
  <script>
    const slides=${encodedSlides};let index=0;const image=document.getElementById('image');const dot=document.getElementById('dot');const count=document.getElementById('count');
    function show(next){if(next<0||next>=slides.length)return;index=next;const slide=slides[index];image.src=slide.image;dot.style.left=slide.clickX+'%';dot.style.top=slide.clickY+'%';dot.innerHTML=slide.tooltipText?'<span class="tip"></span>':'';const tip=dot.querySelector('.tip');if(tip)tip.textContent=slide.tooltipText;count.textContent=(index+1)+' / '+slides.length}
    function forward(){show(Math.min(slides.length-1,index+1))}function back(){show(Math.max(0,index-1))}
    document.addEventListener('keydown',event=>{if(event.key==='ArrowLeft')back();if(event.key==='ArrowRight'||event.key===' ')forward()});document.getElementById('frame').addEventListener('click',forward);show(0);
  </script>
</body>
</html>`
}
