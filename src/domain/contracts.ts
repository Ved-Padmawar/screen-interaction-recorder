export const AppView = {
  Home: 'home',
  Popup: 'popup',
  Recordings: 'recordings',
  Viewer: 'viewer',
  TooltipEditor: 'tooltip-editor',
} as const

export type AppView = (typeof AppView)[keyof typeof AppView]

export const ThemeMode = {
  Light: 'light',
  Dark: 'dark',
} as const

export type ThemeMode = (typeof ThemeMode)[keyof typeof ThemeMode]

export const RuntimeAction = {
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

export type RuntimeAction = (typeof RuntimeAction)[keyof typeof RuntimeAction]

export type CaptureSettings = {
  CAPTURE_SHORTCUT: string
  SHOW_RECORDING_INDICATOR: boolean
  DEBUG_MODE: boolean
}

export type InteractionDetails = {
  url?: string
  title?: string
  elementType?: string
  elementId?: string
  elementClass?: string
  elementText?: string
  scrollX?: number
  scrollY?: number
}

export type RecordingInteraction = {
  type?: string
  timestamp?: number
  screenshot?: string | null
  screenshotId?: string
  clickX?: number
  clickY?: number
  clickXPercent?: number
  clickYPercent?: number
  exactClickX?: number
  exactClickY?: number
  clientX?: number
  clientY?: number
  originalClientX?: number
  originalClientY?: number
  originalViewportWidth?: number
  originalViewportHeight?: number
  tooltipText?: string | null
  pageUrl?: string
  pageTitle?: string
  tagName?: string
  id?: string | null
  className?: string | null
  text?: string | null
  value?: string | boolean | null
  name?: string | null
  href?: string
  buttonType?: string
  buttonName?: string
  inputType?: string
  inputName?: string
  formAction?: string | null
  formMethod?: string
  formData?: Record<string, string>
  isInputElement?: boolean
  pageX?: number
  pageY?: number
  offsetX?: number
  offsetY?: number
  elementRect?: {
    left: number
    top: number
    width: number
    height: number
  }
  viewportWidth?: number
  viewportHeight?: number
  documentWidth?: number
  documentHeight?: number
  scrollX?: number
  scrollY?: number
}

export type Recording = {
  title: string
  timestamp?: number
  date: string
  duration?: number
  data: RecordingInteraction[]
  slideCount?: number
  filename: string
}

export type RecordingSlide = {
  index: number
  image: string
  screenshotId?: string
  clickX?: number
  clickY?: number
  clickXPercent?: number
  clickYPercent?: number
  exactClickX?: number
  exactClickY?: number
  clientX?: number
  clientY?: number
  originalClientX?: number
  originalClientY?: number
  originalViewportWidth?: number
  originalViewportHeight?: number
  tooltipText?: string | null
  timestamp?: number
  type?: string
  details?: InteractionDetails
}

export type RuntimeRequest =
  | { action: typeof RuntimeAction.DeleteRecording; filename: string }
  | { action: typeof RuntimeAction.DeleteRecordings; filenames: string[] }
  | { action: typeof RuntimeAction.ExportHtml; recording: Recording; slides: RecordingSlide[] }
  | { action: typeof RuntimeAction.GetRecordingSlides; filename: string }
  | { action: typeof RuntimeAction.GetRecordingStatus }
  | { action: typeof RuntimeAction.GetRecordings }
  | { action: typeof RuntimeAction.RecordInteraction; data: RecordingInteraction }
  | { action: typeof RuntimeAction.StartRecording; title: string }
  | { action: typeof RuntimeAction.StopRecording }
  | { action: typeof RuntimeAction.TakeScreenshot }
  | { action: typeof RuntimeAction.UpdateRecording; updatedRecording: Recording }

export type RuntimeResponseMap = {
  [RuntimeAction.DeleteRecording]: { success: boolean; error?: string }
  [RuntimeAction.DeleteRecordings]: { success: boolean; error?: string }
  [RuntimeAction.ExportHtml]: { success: boolean; error?: string; downloadId?: number }
  [RuntimeAction.GetRecordingSlides]: { slides: RecordingSlide[]; error?: string }
  [RuntimeAction.GetRecordingStatus]: { isRecording: boolean }
  [RuntimeAction.GetRecordings]: { recordings: Recording[]; error?: string }
  [RuntimeAction.RecordInteraction]: { success: boolean; error?: string }
  [RuntimeAction.StartRecording]: { success: boolean; error?: string }
  [RuntimeAction.StopRecording]: { success: boolean; error?: string }
  [RuntimeAction.TakeScreenshot]: { screenshot: string | null; error?: string }
  [RuntimeAction.UpdateRecording]: { success: boolean; error?: string }
}

export type ContentScriptRequest =
  | { action: typeof RuntimeAction.StartRecording }
  | { action: typeof RuntimeAction.StopRecording }

export type DeleteRecordingsResponse = { success: boolean; deleted?: number; error?: string }

export type ScreenshotRecord = {
  id: string
  recordingFilename: string
  createdAt: string
  mimeType: string
  blob: Blob
}

export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
  CAPTURE_SHORTCUT: 'shift+c',
  SHOW_RECORDING_INDICATOR: false,
  DEBUG_MODE: false,
}
