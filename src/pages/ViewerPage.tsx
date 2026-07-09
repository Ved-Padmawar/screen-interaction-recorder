import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { RuntimeAction, type Recording, type RecordingSlide } from '../domain/contracts'
import { extensionUrl, getRecordingSlides, getRecordings, sendRuntimeMessage } from '../platform/chrome'
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setIndex((value) => Math.max(0, value - 1))
      }
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault()
        setIndex((value) => Math.min(slides.length - 1, value + 1))
      }
      if (event.key === 'Escape') window.location.href = extensionUrl('recordings.html')
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [slides.length])

  function updateDot() {
    const image = imageRef.current
    if (!image || !currentSlide) return
    setDot(getSlideDotPosition(currentSlide, image.clientWidth, image.clientHeight))
  }

  async function exportHtml() {
    if (!recording || slides.length === 0) return
    await sendRuntimeMessage({ action: RuntimeAction.ExportHtml, recording, slides })
  }

  if (loading || error) {
    return (
      <main className="app-page flex min-h-screen items-center justify-center p-6">
        <div className="surface max-w-md p-6 text-center text-body">{error ?? 'Loading recording...'}</div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#10141f] text-white">
      <header className="flex min-h-14 items-center gap-2 border-b border-white/10 px-4">
        <Button
          icon={<ArrowLeft size={16} />}
          onClick={() => (window.location.href = extensionUrl('recordings.html'))}
          variant="secondary"
        >
          Recordings
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{recording?.title}</h1>
          <p className="text-xs text-white/55">
            {index + 1} / {slides.length}
          </p>
        </div>
        <Button icon={<Download size={16} />} onClick={() => void exportHtml()} variant="primary">
          Export HTML
        </Button>
        <ThemeToggle />
      </header>

      <section className="flex min-h-0 flex-1 items-center justify-center p-4">
        <div className="relative max-h-full max-w-full" onClick={() => setIndex((value) => Math.min(slides.length - 1, value + 1))}>
          <img
            alt={`Slide ${index + 1}`}
            className="block max-h-[calc(100vh-132px)] max-w-full rounded-md object-contain shadow-2xl"
            onLoad={updateDot}
            ref={imageRef}
            src={currentSlide.image}
          />
          <button
            aria-label="Next slide"
            className="absolute size-6 rounded-full border-2 border-brand bg-brand/40"
            onClick={(event) => {
              event.stopPropagation()
              setIndex((value) => Math.min(slides.length - 1, value + 1))
            }}
            style={{ left: dot.x, top: dot.y, transform: 'translate(-50%, -50%)' }}
            type="button"
          >
            {currentSlide.tooltipText ? (
              <span
                className="absolute left-7 top-[-8px] min-w-40 max-w-72 rounded-md border border-white/10 bg-[#182033] px-3 py-2 text-left text-xs font-medium leading-5 text-white shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                {currentSlide.tooltipText}
              </span>
            ) : null}
          </button>
        </div>
      </section>

      <footer className="flex items-center justify-center gap-2 border-t border-white/10 px-4 py-3">
        <Button disabled={index === 0} icon={<ChevronLeft size={16} />} onClick={() => setIndex(index - 1)}>
          Previous
        </Button>
        <div className="h-2 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-brand" style={{ width: `${((index + 1) / slides.length) * 100}%` }} />
        </div>
        <Button disabled={index === slides.length - 1} icon={<ChevronRight size={16} />} onClick={() => setIndex(index + 1)}>
          Next
        </Button>
      </footer>
    </main>
  )
}
