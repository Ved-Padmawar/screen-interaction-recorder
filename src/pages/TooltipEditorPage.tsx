import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Save } from 'lucide-react'
import { RuntimeAction, type Recording, type RecordingSlide } from '../domain/contracts'
import { getRecordingSlides, getRecordings, navigateToExtensionPage, sendRuntimeMessage } from '../platform/chrome'
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
        if (loadedSlides.length === 0) throw new Error('No slides found for this recording.')
        setRecording(match)
        setSlides(loadedSlides)
      })
      .catch((reason: Error) => setStatus(reason.message))
      .finally(() => setLoading(false))
  }, [recordingFilename])

  const updateDot = useCallback(() => {
    const image = imageRef.current
    if (!image || !currentSlide) return
    setDot(getSlideDotPosition(currentSlide, image.clientWidth, image.clientHeight))
  }, [currentSlide])

  useLayoutEffect(() => {
    const image = imageRef.current
    if (!image) return

    updateDot()
    const observer = new ResizeObserver(updateDot)
    observer.observe(image)
    return () => observer.disconnect()
  }, [updateDot])

  function updateTooltip(value: string) {
    setSlides((items) =>
      items.map((slide, slideIndex) => (slideIndex === index ? { ...slide, tooltipText: value } : slide)),
    )
  }

  async function save() {
    if (!recording) return

    // Slides carry the index of the interaction they came from; interactions
    // without a usable screenshot have no slide, so match on index rather than
    // assuming the two lists line up positionally.
    const tooltipsByInteraction = new Map(slides.map((slide) => [slide.index, slide.tooltipText]))

    const updatedRecording: Recording = {
      ...recording,
      data: recording.data.map((interaction, interactionIndex) =>
        tooltipsByInteraction.has(interactionIndex)
          ? { ...interaction, tooltipText: tooltipsByInteraction.get(interactionIndex) ?? null }
          : interaction,
      ),
    }

    const response = await sendRuntimeMessage({ action: RuntimeAction.UpdateRecording, updatedRecording })
    setStatus(response.success ? 'Changes saved.' : (response.error ?? 'Failed to save changes.'))
    if (response.success) setRecording(updatedRecording)
  }

  if (loading || !currentSlide) {
    return (
      <main className="app-page flex min-h-dvh items-center justify-center p-6">
        <p className="surface max-w-md p-6 text-center text-body">{status ?? 'Loading tooltip editor...'}</p>
      </main>
    )
  }

  return (
    <div className="app-viewport grid grid-rows-[auto_minmax(0,1fr)]">
      <header className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <Button
          aria-label="Back to recordings"
          icon={<ArrowLeft size={16} />}
          onClick={() => navigateToExtensionPage('recordings.html')}
        >
          <span className="hidden sm:inline">Recordings</span>
        </Button>

        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-sm font-semibold text-ink">Tooltip Editor</h1>
          <p className="truncate text-caption">{recording?.title}</p>
        </div>

        <ThemeToggle />
        <Button icon={<Save size={16} />} onClick={() => void save()} variant="primary">
          <span className="hidden sm:inline">Save Changes</span>
        </Button>
      </header>

      <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-1">
        <main className="flex min-h-0 items-center justify-center overflow-hidden bg-stage p-3 sm:p-6">
          <div className="relative max-h-full max-w-full leading-none">
            <img
              alt={`Slide ${index + 1}`}
              className="block max-h-full max-w-full rounded-lg object-contain shadow-raised"
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
                className="tooltip-chip absolute"
                style={{ left: dot.x + 18, top: dot.y - 10 }}
              >
                {currentSlide.tooltipText}
              </span>
            ) : null}
          </div>
        </main>

        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-line bg-surface p-4 lg:border-l lg:border-t-0">
          <div className="flex items-baseline justify-between">
            <p className="field-label">Slide</p>
            <p className="text-sm font-semibold tabular-nums text-ink">
              {index + 1} <span className="font-normal text-ink-soft">of {slides.length}</span>
            </p>
          </div>

          <label className="flex min-h-0 flex-1 flex-col gap-1.5">
            <span className="field-label">Tooltip text</span>
            <textarea
              className="field-input min-h-32 flex-1 resize-none leading-6"
              onChange={(event) => updateTooltip(event.target.value)}
              placeholder="Describe this click..."
              value={currentSlide.tooltipText ?? ''}
            />
          </label>

          {status ? <p className="text-caption">{status}</p> : null}

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
      </div>
    </div>
  )
}
