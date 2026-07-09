import { useEffect, useMemo, useState } from 'react'
import { CircleDot, Library, Play, Square } from 'lucide-react'
import { RuntimeAction } from '../domain/contracts'
import { openRecordingsFromPopup, sendRuntimeMessage } from '../platform/chrome'
import { Button } from '../ui/Button'
import { ThemeToggle } from '../ui/ThemeToggle'

export function PopupPage() {
  const defaultTitle = useMemo(() => `Recording ${new Date().toLocaleString()}`, [])
  const [title, setTitle] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    sendRuntimeMessage({ action: RuntimeAction.GetRecordingStatus })
      .then((response) => setIsRecording(response.isRecording))
      .catch((reason: Error) => setError(reason.message))
  }, [])

  async function toggleRecording() {
    setError(null)

    try {
      if (isRecording) {
        const response = await sendRuntimeMessage({ action: RuntimeAction.StopRecording })
        if (response.success) {
          setIsRecording(false)
          window.setTimeout(openRecordingsFromPopup, 500)
        }
        return
      }

      const response = await sendRuntimeMessage({
        action: RuntimeAction.StartRecording,
        title: title.trim() || defaultTitle,
      })

      if (response.success) setIsRecording(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update recording state.')
    }
  }

  return (
    <main className="flex w-[336px] flex-col gap-4 bg-canvas p-4">
      <header className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <CircleDot size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold leading-5 text-ink">Screen Recorder</h1>
          <p className="text-caption">Capture click-by-click flows</p>
        </div>
        <ThemeToggle />
      </header>

      {isRecording ? (
        <p className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-danger" />
          Recording in progress
        </p>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="field-label">Recording title</span>
          <input
            className="field-input"
            onChange={(event) => setTitle(event.target.value)}
            placeholder={defaultTitle}
            value={title}
          />
        </label>
      )}

      {error ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button
          icon={isRecording ? <Square size={16} /> : <Play size={16} />}
          onClick={toggleRecording}
          variant={isRecording ? 'danger' : 'primary'}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </Button>

        <Button icon={<Library size={16} />} onClick={openRecordingsFromPopup}>
          View Saved Recordings
        </Button>
      </div>
    </main>
  )
}
