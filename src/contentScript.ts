import type { CaptureSettings, RecordingInteraction } from './domain/contracts'

const RuntimeAction = {
  GetRecordingStatus: 'getRecordingStatus',
  RecordInteraction: 'recordInteraction',
  StartRecording: 'startRecording',
  StopRecording: 'stopRecording',
  TakeScreenshot: 'takeScreenshot',
} as const

const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
  CAPTURE_SHORTCUT: 'shift+c',
  SHOW_RECORDING_INDICATOR: false,
  DEBUG_MODE: false,
}

const MAX_SCREENSHOT_WIDTH = 1920
const SCREENSHOT_QUALITY = 0.86

type Shortcut = {
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
}

declare global {
  interface Window {
    _sirContentScriptLoaded?: boolean
  }
}

if (!window._sirContentScriptLoaded) {
  window._sirContentScriptLoaded = true
  initializeContentScript()
}

function initializeContentScript() {
  let config: CaptureSettings = { ...DEFAULT_CAPTURE_SETTINGS }
  let captureKey = parseShortcut(config.CAPTURE_SHORTCUT)
  let isRecording = false
  let isCapturing = false
  let mouseX = 0
  let mouseY = 0

  chrome.storage.sync.get<{ sirConfig?: CaptureSettings }>('sirConfig', (data) => {
    if (!data.sirConfig) return
    config = data.sirConfig
    captureKey = parseShortcut(config.CAPTURE_SHORTCUT)
  })

  document.addEventListener('mousemove', (event) => {
    mouseX = event.clientX
    mouseY = event.clientY
  })

  window.addEventListener('beforeunload', () => {
    window._sirContentScriptLoaded = undefined
    isCapturing = false
  })

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isExtensionContextValid()) return false

    if (message.action === RuntimeAction.StartRecording) {
      startRecording()
      sendResponse({ success: true })
    }

    if (message.action === RuntimeAction.StopRecording) {
      stopRecording()
      sendResponse({ success: true })
    }

    return true
  })

  chrome.runtime.sendMessage({ action: RuntimeAction.GetRecordingStatus }, (response) => {
    if (chrome.runtime.lastError) return
    if (response?.isRecording) startRecording()
  })

  function startRecording() {
    if (isRecording) return
    isRecording = true
    document.addEventListener('keydown', handleKeyboardShortcut, true)
    document.addEventListener('submit', recordSubmitEvent, true)
    document.addEventListener('change', recordChangeEvent, true)
    showRecordingIndicator(true)
  }

  function stopRecording() {
    isRecording = false
    isCapturing = false
    document.removeEventListener('keydown', handleKeyboardShortcut, true)
    document.removeEventListener('submit', recordSubmitEvent, true)
    document.removeEventListener('change', recordChangeEvent, true)
    showRecordingIndicator(false)
  }

  function handleKeyboardShortcut(event: KeyboardEvent) {
    if (!isRecording || isCapturing) return

    const isShortcutPressed =
      captureKey.ctrl === event.ctrlKey &&
      captureKey.alt === event.altKey &&
      captureKey.shift === event.shiftKey &&
      event.key.toLowerCase() === captureKey.key

    if (!isShortcutPressed) return

    event.preventDefault()
    event.stopPropagation()
    void captureInteraction(mouseX, mouseY)
  }

  async function captureInteraction(clientX: number, clientY: number) {
    if (!isRecording || isCapturing) return

    isCapturing = true

    try {
      const element = document.elementFromPoint(clientX, clientY)
      if (!element || element.id === 'sir-recording-indicator') return

      const screenshot = await takeOptimizedScreenshot()
      const interaction = createClickInteraction(element, clientX, clientY, screenshot)

      if (!interaction.isInputElement) {
        const tooltip = window.prompt('Enter an explanation for this interaction (or leave blank):', '')
        if (tooltip !== null) interaction.tooltipText = tooltip.trim()
      }

      sendInteractionToBackground(interaction)
    } finally {
      isCapturing = false
    }
  }

  async function recordSubmitEvent(event: Event) {
    if (!isRecording || isCapturing) return

    const form = event.target
    if (!(form instanceof HTMLFormElement)) return

    isCapturing = true

    try {
      const formData: Record<string, string> = {}
      Array.from(form.elements).forEach((element) => {
        if (element instanceof HTMLInputElement && element.name && element.type !== 'password') {
          formData[element.name] = element.value
        }
      })

      sendInteractionToBackground({
        type: 'submit',
        tagName: 'form',
        id: form.id || null,
        formAction: form.action || null,
        formMethod: form.method || 'get',
        formData,
        timestamp: Date.now(),
        pageUrl: window.location.href,
        pageTitle: document.title,
        screenshot: await takeOptimizedScreenshot(),
        tooltipText: 'Form submitted',
      })
    } finally {
      isCapturing = false
    }
  }

  async function recordChangeEvent(event: Event) {
    if (!isRecording || isCapturing) return

    const element = event.target
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return
    if (element instanceof HTMLInputElement && element.type === 'password') return

    isCapturing = true

    try {
      sendInteractionToBackground({
        type: 'change',
        tagName: element.tagName.toLowerCase(),
        id: element.id || null,
        name: element.name || null,
        value: element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type) ? element.checked : element.value,
        timestamp: Date.now(),
        pageUrl: window.location.href,
        pageTitle: document.title,
        screenshot: await takeOptimizedScreenshot(),
        tooltipText: `Value changed for ${element.name || element.id || element.tagName}`,
      })
    } finally {
      isCapturing = false
    }
  }

  function showRecordingIndicator(show: boolean) {
    if (!config.SHOW_RECORDING_INDICATOR) return

    const indicatorId = 'sir-recording-indicator'
    let indicator = document.getElementById(indicatorId)

    if (show && !indicator) {
      indicator = document.createElement('div')
      indicator.id = indicatorId
      indicator.style.cssText =
        'position:fixed;top:10px;right:10px;background:rgba(220,38,38,.9);color:white;padding:6px 10px;border-radius:6px;font:12px system-ui;z-index:2147483647;'
      indicator.textContent = 'Recording'
      document.body.appendChild(indicator)
    }

    if (indicator) indicator.style.display = show ? 'block' : 'none'
  }
}

function parseShortcut(shortcutString: string): Shortcut {
  const parts = shortcutString.toLowerCase().split('+')
  return {
    key: parts[parts.length - 1],
    ctrl: parts.includes('control') || parts.includes('ctrl'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
  }
}

function isExtensionContextValid() {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id)
}

function createClickInteraction(
  element: Element,
  clientX: number,
  clientY: number,
  screenshot: string | null,
): RecordingInteraction {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const exactClickX = clientX / viewportWidth
  const exactClickY = clientY / viewportHeight
  const rect = element.getBoundingClientRect()
  const inputElement = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement

  return {
    type: 'click',
    tagName: element.tagName.toLowerCase(),
    id: element.id || null,
    className: typeof element.className === 'string' ? element.className : null,
    text: element.textContent?.trim().slice(0, 200) || null,
    value: inputElement ? element.value : null,
    timestamp: Date.now(),
    pageUrl: window.location.href,
    pageTitle: document.title,
    tooltipText: null,
    screenshot,
    isInputElement: inputElement || element.getAttribute('role') === 'textbox',
    clientX,
    clientY,
    exactClickX,
    exactClickY,
    clickXPercent: exactClickX * 100,
    clickYPercent: exactClickY * 100,
    pageX: clientX + window.scrollX,
    pageY: clientY + window.scrollY,
    offsetX: clientX - rect.left,
    offsetY: clientY - rect.top,
    originalClientX: clientX,
    originalClientY: clientY,
    originalViewportWidth: viewportWidth,
    originalViewportHeight: viewportHeight,
    elementRect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    viewportWidth,
    viewportHeight,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    ...(element instanceof HTMLAnchorElement ? { href: element.href } : {}),
    ...(element instanceof HTMLButtonElement ? { buttonType: element.type, buttonName: element.name } : {}),
    ...(element instanceof HTMLInputElement ? { inputType: element.type, inputName: element.name } : {}),
  }
}

function takeScreenshot(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: RuntimeAction.TakeScreenshot }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      resolve(response?.screenshot ?? null)
    })
  })
}

async function takeOptimizedScreenshot() {
  const screenshot = await takeScreenshot()
  if (!screenshot) return null

  return optimizeScreenshotDataUrl(screenshot)
}

function optimizeScreenshotDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image()

    image.onload = () => {
      const scale = Math.min(1, MAX_SCREENSHOT_WIDTH / image.naturalWidth)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.naturalWidth * scale)
      canvas.height = Math.round(image.naturalHeight * scale)

      const context = canvas.getContext('2d')
      if (!context) {
        resolve(dataUrl)
        return
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      try {
        resolve(canvas.toDataURL('image/webp', SCREENSHOT_QUALITY))
      } catch {
        resolve(canvas.toDataURL('image/jpeg', SCREENSHOT_QUALITY))
      }
    }

    image.onerror = () => resolve(dataUrl)
    image.src = dataUrl
  })
}

function sendInteractionToBackground(data: RecordingInteraction) {
  if (!isExtensionContextValid()) return

  chrome.runtime.sendMessage({ action: RuntimeAction.RecordInteraction, data }, () => {
    if (chrome.runtime.lastError) console.error('Error sending interaction data:', chrome.runtime.lastError.message)
  })
}
