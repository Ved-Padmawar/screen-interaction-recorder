import { RuntimeAction, type CaptureSettings, type RuntimeRequest, type RuntimeResponseMap } from '../domain/contracts'

export function isChromeExtension(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id)
}

export function extensionUrl(path: string): string {
  return isChromeExtension() ? chrome.runtime.getURL(path) : path
}

export function sendRuntimeMessage<T extends RuntimeRequest>(
  request: T,
): Promise<RuntimeResponseMap[T['action']]> {
  return new Promise((resolve, reject) => {
    if (!isChromeExtension()) {
      reject(new Error('Chrome extension runtime is not available.'))
      return
    }

    chrome.runtime.sendMessage(request, (response: RuntimeResponseMap[T['action']]) => {
      const message = chrome.runtime.lastError?.message

      if (message) {
        reject(new Error(message))
        return
      }

      resolve(response)
    })
  })
}

export async function getRecordings() {
  const response = await sendRuntimeMessage({ action: RuntimeAction.GetRecordings })
  return response.recordings ?? []
}

export async function getRecordingSlides(filename: string) {
  const response = await sendRuntimeMessage({ action: RuntimeAction.GetRecordingSlides, filename })
  return response.slides ?? []
}

export function navigateToExtensionPage(path: string) {
  const url = extensionUrl(path)

  if (typeof chrome !== 'undefined' && chrome.tabs?.update) {
    chrome.tabs.update({ url })
    return
  }

  window.location.href = url
}

export function openRecordingsFromPopup() {
  const url = extensionUrl('recordings.html')
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    window.location.href = url
    return
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
    const tabId = activeTabs[0]?.id

    if (tabId) {
      chrome.tabs.update(tabId, { url })
    } else {
      chrome.tabs.create({ url, active: true })
    }

    window.close()
  })
}

export function getCaptureSettings(): Promise<CaptureSettings | null> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
      resolve(null)
      return
    }

    chrome.storage.sync.get<{ sirConfig?: CaptureSettings }>('sirConfig', (data) => {
      resolve(data.sirConfig ?? null)
    })
  })
}

export function saveCaptureSettings(settings: CaptureSettings): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
      reject(new Error('Chrome sync storage is not available.'))
      return
    }

    chrome.storage.sync.set({ sirConfig: settings }, () => {
      const message = chrome.runtime.lastError?.message

      if (message) {
        reject(new Error(message))
        return
      }

      resolve()
    })
  })
}
