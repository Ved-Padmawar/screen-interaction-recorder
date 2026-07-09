import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Save } from 'lucide-react'
import { RuntimeAction, type Recording, type RecordingSlide } from '../domain/contracts'
import { extensionUrl, getRecordingSlides, getRecordings, sendRuntimeMessage } from '../platform/chrome'
import { getSlideDotPosition } from '../lib/slidePosition'
import { Button } from '../ui/Button'
import { ThemeToggle } from '../ui/ThemeToggle'

export function TooltipEditorPage() {
  const recordingFilename = useMemo(() => new URLSearchParams(window.location.search).get('recording'), [])
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [slides, setSlides] = useState<RecordingSlide[]>([])
  const [index, setIndex] = useState(0)
  const [dot, setDot] = useState({ x: 0, y: 0 })
  const [loading, setLoading] = useState(Boolean(recordingFilename))
  const [status, setStatus] = useState<string | null>(recordingFilename ? null : 'No recording filename provided.')

  const currentSlide = slides[index]

  useEffect(() => {
    if (!recordingFilename) return

    Promise.all([getRecordings(), getRecordingSlides(recordingFilename)])
      .then(([items, loadedSlides]) => {
        const match = items.find((item) => item.filename === recordingFilename)
        if (!match) throw new Error('Recording not found.')
        setRecording(match)
        setSlides(loadedSlides)
      })
      .catch((reason: Error) => setStatus(reason.message))
      .finally(() => setLoading(false))
  }, [recordingFilename])

  function updateDot() {
    const image = imageRef.current
    if (!image || !currentSlide) return
    setDot(getSlideDotPosition(currentSlide, image.clientWidth, image.clientHeight))
  }

  function updateTooltip(value: string) {
    setSlides((items) => items.map((slide, slideIndex) => (slideIndex === index ? { ...slide, tooltipText: value } : slide)))
  }

  async function save() {
    if (!recording) return

    const updatedRecording: Recording = {
      ...recording,
      data: recording.data.map((interaction, interactionIndex) => ({
        ...interaction,
        tooltipText: slides[interactionIndex]?.tooltipText ?? null,
      })),
    }

    const response = await sendRuntimeMessage({ action: RuntimeAction.UpdateRecording, updatedRecording })
    setStatus(response.success ? 'Changes saved.' : response.error ?? 'Failed to save changes.')
    if (response.success) setRecording(updatedRecording)
  }

  if (loading || !currentSlide) {
    return (
      <main className="app-page flex min-h-screen items-center justify-center p-6">
        <div className="surface max-w-md p-6 text-center text-body">{status ?? 'Loading tooltip editor...'}</div>
      </main>
    )
  }

  return (
    <main className="app-page min-h-screen py-5">
      <div className="page-shell">
        <header className="mb-5 flex flex-wrap items-center gap-3">
          <Button icon={<ArrowLeft size={16} />} onClick={() => (window.location.href = extensionUrl('recordings.html'))}>
            Recordings
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-title">Tooltip Editor</h1>
            <p className="text-body">{recording?.title}</p>
          </div>
          <ThemeToggle />
          <Button icon={<Save size={16} />} onClick={() => void save()} variant="primary">
            Save Changes
          </Button>
        </header>

        {status ? <div className="mb-4 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-muted">{status}</div> : null}

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="surface flex min-h-[420px] items-center justify-center overflow-auto bg-[#10141f] p-4">
            <div className="relative max-w-full">
              <img
                alt={`Slide ${index + 1}`}
                className="block max-h-[calc(100vh-190px)] max-w-full rounded-md object-contain"
                onLoad={updateDot}
                ref={imageRef}
                src={currentSlide.image}
              />
              <span
                className="absolute size-3 rounded-full bg-brand ring-4 ring-brand/30"
                style={{ left: dot.x, top: dot.y, transform: 'translate(-50%, -50%)' }}
              />
              {currentSlide.tooltipText ? (
                <span
                  className="absolute max-w-72 rounded-md bg-[#182033] px-3 py-2 text-xs font-medium leading-5 text-white shadow-xl"
                  style={{ left: dot.x + 18, top: dot.y - 10 }}
                >
                  {currentSlide.tooltipText}
                </span>
              ) : null}
            </div>
          </div>

          <aside className="surface flex flex-col gap-4 p-4">
            <div>
              <p className="field-label">Slide</p>
              <h2 className="text-section">
                {index + 1} of {slides.length}
              </h2>
            </div>

            <label className="flex min-h-0 flex-1 flex-col gap-2">
              <span className="field-label">Tooltip text</span>
              <textarea
                className="focus-ring min-h-40 resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                onChange={(event) => updateTooltip(event.target.value)}
                placeholder="Describe this click..."
                value={currentSlide.tooltipText ?? ''}
              />
            </label>

            <div className="flex items-center gap-2">
              <Button disabled={index === 0} icon={<ChevronLeft size={16} />} onClick={() => setIndex(index - 1)}>
                Previous
              </Button>
              <Button
                className="ml-auto"
                disabled={index === slides.length - 1}
                icon={<ChevronRight size={16} />}
                onClick={() => setIndex(index + 1)}
              >
                Next
              </Button>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
