import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { RuntimeAction, type Recording, type RecordingSlide } from '../domain/contracts'
import { getRecordingSlides, getRecordings, navigateToExtensionPage, sendRuntimeMessage } from '../platform/chrome'
import { getSlideDotPosition } from '../lib/slidePosition'
import { Button } from '../ui/Button'
import { ThemeToggle } from '../ui/ThemeToggle'

export function ViewerPage() {
  const recordingFilename = useMemo(() => new URLSearchParams(window.location.search).get('recording'), [])
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [slides, setSlides] = useState<RecordingSlide[]>([])
  const [index, setIndex] = useState(0)
  const [dot, setDot] = useState({ x: 0, y: 0 })
  const [loading, setLoading] = useState(Boolean(recordingFilename))
  const [error, setError] = useState<string | null>(recordingFilename ? null : 'No recording ID specified.')

  const currentSlide = slides[index]
  const total = slides.length

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
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [recordingFilename])

  const goTo = useCallback((next: number) => setIndex((value) => clampIndex(next, total) ?? value), [total])
  const forward = useCallback(() => goTo(index + 1), [goTo, index])
  const back = useCallback(() => goTo(index - 1), [goTo, index])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        back()
      }
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault()
        forward()
      }
      if (event.key === 'Escape') navigateToExtensionPage('recordings.html')
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [back, forward])

  const updateDot = useCallback(() => {
    const image = imageRef.current
    if (!image || !currentSlide) return
    setDot(getSlideDotPosition(currentSlide, image.clientWidth, image.clientHeight))
  }, [currentSlide])

  // The dot is positioned in rendered-image pixels, so it must be recomputed
  // whenever the image box changes size, not only when a new slide loads.
  useLayoutEffect(() => {
    const image = imageRef.current
    if (!image) return

    updateDot()
    const observer = new ResizeObserver(updateDot)
    observer.observe(image)
    return () => observer.disconnect()
  }, [updateDot])

  async function exportHtml() {
    if (!recording || slides.length === 0) return
    await sendRuntimeMessage({ action: RuntimeAction.ExportHtml, recording, slides })
  }

  if (loading || error) {
    return (
      <main className="app-page flex min-h-dvh items-center justify-center p-6">
        <p className="surface max-w-md p-6 text-center text-body">{error ?? 'Loading recording...'}</p>
      </main>
    )
  }

  return (
    <div className="app-viewport grid grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <Button
          aria-label="Back to recordings"
          icon={<ArrowLeft size={16} />}
          onClick={() => navigateToExtensionPage('recordings.html')}
        >
          <span className="hidden sm:inline">Recordings</span>
        </Button>

        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-sm font-semibold text-ink">{recording?.title}</h1>
          <p className="text-caption tabular-nums">
            Step {index + 1} of {total}
          </p>
        </div>

        <ThemeToggle />
        <Button icon={<Download size={16} />} onClick={() => void exportHtml()} variant="primary">
          <span className="hidden sm:inline">Export HTML</span>
        </Button>
      </header>

      <main className="flex min-h-0 items-center justify-center overflow-hidden bg-stage p-3 sm:p-6">
        <div className="relative max-h-full max-w-full leading-none">
          <img
            alt={`Slide ${index + 1}`}
            className="block max-h-full max-w-full cursor-pointer rounded-lg object-contain shadow-raised"
            onClick={forward}
            onLoad={updateDot}
            ref={imageRef}
            src={currentSlide.image}
          />

          <button
            aria-label="Next slide"
            className="focus-ring absolute size-5 rounded-full border-2 border-brand bg-brand/40"
            onClick={forward}
            style={{ left: dot.x, top: dot.y, transform: 'translate(-50%, -50%)' }}
            type="button"
          >
            {currentSlide.tooltipText ? (
              <span
                className="tooltip-chip absolute left-7 top-[-10px] min-w-40"
                onClick={(event) => event.stopPropagation()}
              >
                {currentSlide.tooltipText}
              </span>
            ) : null}
          </button>
        </div>
      </main>

      <footer className="flex items-center gap-3 border-t border-line bg-surface px-3 py-3 sm:px-4">
        <Button aria-label="Previous slide" disabled={index === 0} icon={<ChevronLeft size={16} />} onClick={back}>
          <span className="hidden sm:inline">Previous</span>
        </Button>

        <SlideScrubber current={index} onSelect={goTo} total={total} />

        <Button
          aria-label="Next slide"
          disabled={index === total - 1}
          icon={<ChevronRight size={16} />}
          onClick={forward}
        >
          <span className="hidden sm:inline">Next</span>
        </Button>
      </footer>
    </div>
  )
}

type SlideScrubberProps = {
  current: number
  total: number
  onSelect: (index: number) => void
}

/**
 * Progress bar doubling as a seek control: the whole track is a range input, so
 * it is draggable, clickable, and keyboard-operable for free.
 */
function SlideScrubber({ current, total, onSelect }: SlideScrubberProps) {
  const progress = total > 1 ? (current / (total - 1)) * 100 : 100

  return (
    <div className="group relative flex min-w-0 flex-1 items-center">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-200 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <span
        aria-hidden
        className="pointer-events-none absolute size-3.5 -translate-x-1/2 rounded-full border-2 border-brand bg-surface opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
        style={{ left: `${progress}%` }}
      />

      <input
        aria-label="Slide position"
        aria-valuetext={`Slide ${current + 1} of ${total}`}
        className="focus-ring absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
        max={total - 1}
        min={0}
        onChange={(event) => onSelect(Number(event.target.value))}
        step={1}
        type="range"
        value={current}
      />
    </div>
  )
}

function clampIndex(next: number, total: number) {
  if (total === 0) return null
  return Math.max(0, Math.min(total - 1, next))
}
