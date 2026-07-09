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
    <main className="w-[340px] bg-canvas p-4">
      <section className="surface space-y-4 p-4 shadow-none">
        <header className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-brand-soft text-brand">
            <CircleDot size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold leading-5 text-ink">Screen Recorder</h1>
            <p className="text-caption">Capture click-by-click flows</p>
          </div>
          <ThemeToggle />
        </header>

        {isRecording ? (
          <div className="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
            <span className="size-2 rounded-full bg-danger" />
            Recording in progress
          </div>
        ) : null}

        <label className="space-y-1.5">
          <span className="field-label">Recording title</span>
          <input
            className="focus-ring h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-soft disabled:bg-surface-muted"
            disabled={isRecording}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={defaultTitle}
            value={title}
          />
        </label>

        {error ? <p className="rounded-md bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</p> : null}

        <Button
          className="mt-2 w-full"
          icon={isRecording ? <Square size={16} /> : <Play size={16} />}
          onClick={toggleRecording}
          variant={isRecording ? 'danger' : 'primary'}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </Button>

        <Button className="w-full border border-line" icon={<Library size={16} />} onClick={openRecordingsFromPopup}>
          View Saved Recordings
        </Button>
      </section>
    </main>
  )
}
