import { useEffect, useMemo, useState } from 'react'
import { Check, CheckSquare, Download, Edit3, FileVideo, Settings, Trash2 } from 'lucide-react'
import { DEFAULT_CAPTURE_SETTINGS, RuntimeAction, type CaptureSettings, type Recording } from '../domain/contracts'
import {
  getCaptureSettings,
  getRecordingSlides,
  getRecordings,
  navigateToExtensionPage,
  saveCaptureSettings,
  sendRuntimeMessage,
} from '../platform/chrome'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { ThemeToggle } from '../ui/ThemeToggle'
import { Thumbnail } from '../ui/Thumbnail'
import { cn } from '../ui/cn'

type Dialog = 'settings' | 'delete' | null

export function RecordingsPage() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [dialog, setDialog] = useState<Dialog>(null)
  const [pendingDelete, setPendingDelete] = useState<string[]>([])
  const [settings, setSettings] = useState<CaptureSettings>(DEFAULT_CAPTURE_SETTINGS)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getRecordings(), getCaptureSettings()])
      .then(([items, savedSettings]) => {
        setRecordings(items.toSorted((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))
        if (savedSettings) setSettings(savedSettings)
      })
      .finally(() => setLoading(false))
  }, [])

  const selectedCount = selected.size
  const allSelected = selectedCount > 0 && selectedCount === recordings.length

  const selectedLabel = useMemo(
    () => `${selectedCount} ${selectedCount === 1 ? 'recording' : 'recordings'} selected`,
    [selectedCount],
  )

  function toggleSelection(filename: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(filename)) next.delete(filename)
      else next.add(filename)
      return next
    })
  }

  function openRecording(filename: string) {
    navigateToExtensionPage(`viewer.html?recording=${filename}`)
  }

  function openDelete(filenames: string[]) {
    setPendingDelete(filenames)
    setDialog('delete')
  }

  async function deletePending() {
    const targets = pendingDelete
    const request =
      targets.length === 1
        ? { action: RuntimeAction.DeleteRecording, filename: targets[0] }
        : { action: RuntimeAction.DeleteRecordings, filenames: targets }

    const response = await sendRuntimeMessage(request)

    if (!response.success) {
      setStatus(response.error ?? 'Failed to delete recording.')
      return
    }

    const removed = new Set(targets)
    setRecordings((items) => items.filter((item) => !removed.has(item.filename)))
    setSelected(new Set())
    setSelectMode(false)
    setDialog(null)
  }

  async function exportHtml(recording: Recording) {
    const slides = await getRecordingSlides(recording.filename)
    if (slides.length === 0) {
      setStatus('No slides found for this recording.')
      return
    }

    const response = await sendRuntimeMessage({ action: RuntimeAction.ExportHtml, recording, slides })
    if (!response.success) setStatus(response.error ?? 'HTML export failed.')
  }

  async function saveSettings() {
    await saveCaptureSettings(settings)
    setStatus('Settings saved.')
    setDialog(null)
  }

  return (
    <div className="app-page">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-title">Recordings</h1>
            <p className="hidden text-body sm:block">
              Review captures, edit tooltips, and export the HTML walkthrough.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {recordings.length > 0 ? (
              <Button
                icon={<CheckSquare size={16} />}
                onClick={() => {
                  setSelectMode((value) => !value)
                  setSelected(new Set())
                }}
              >
                {selectMode ? 'Cancel' : 'Select'}
              </Button>
            ) : null}
            <Button icon={<Settings size={16} />} onClick={() => setDialog('settings')}>
              <span className="hidden sm:inline">Settings</span>
            </Button>
          </div>
        </div>
      </header>

      <main className={cn('px-4 py-5 sm:px-6', selectMode && selectedCount > 0 && 'pb-24')}>
        {status ? (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-muted">
            <span className="flex-1">{status}</span>
            <Button aria-label="Dismiss" onClick={() => setStatus(null)} size="sm" variant="ghost">
              Dismiss
            </Button>
          </div>
        ) : null}

        {loading ? <p className="py-20 text-center text-body">Loading recordings...</p> : null}

        {!loading && recordings.length === 0 ? (
          <div className="mx-auto max-w-sm py-20 text-center">
            <FileVideo className="mx-auto mb-3 text-ink-soft" size={28} />
            <h2 className="text-section">No recordings yet</h2>
            <p className="text-body">Click the extension icon to capture your first flow.</p>
          </div>
        ) : null}

        <section className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4">
          {recordings.map((recording) => {
            const isSelected = selected.has(recording.filename)
            const slideCount = recording.slideCount ?? recording.data.length

            return (
              <article
                className={cn(
                  'group surface flex flex-col overflow-hidden text-left transition',
                  'hover:border-ink-soft/40 hover:shadow-raised',
                  isSelected && 'border-brand ring-2 ring-brand/25',
                )}
                key={recording.filename}
              >
                <button
                  aria-label={selectMode ? `Select ${recording.title}` : `View ${recording.title}`}
                  className="focus-ring relative block aspect-video w-full overflow-hidden bg-surface-muted"
                  onClick={() =>
                    selectMode ? toggleSelection(recording.filename) : openRecording(recording.filename)
                  }
                  type="button"
                >
                  <Thumbnail recording={recording} />

                  <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    {slideCount} {slideCount === 1 ? 'slide' : 'slides'}
                  </span>

                  {selectMode ? (
                    <span
                      className={cn(
                        'absolute left-2 top-2 flex size-6 items-center justify-center rounded-md border transition',
                        isSelected
                          ? 'border-brand bg-brand text-white'
                          : 'border-white/70 bg-black/40 text-transparent backdrop-blur-sm',
                      )}
                    >
                      <Check size={14} strokeWidth={3} />
                    </span>
                  ) : null}
                </button>

                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="line-clamp-2 text-sm font-semibold leading-5 text-ink">
                      {recording.title || 'Untitled Recording'}
                    </h2>
                    <p className="mt-0.5 text-caption">{formatDate(recording.date)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      icon={<Edit3 size={14} />}
                      onClick={() => navigateToExtensionPage(`tooltip-editor.html?recording=${recording.filename}`)}
                      size="sm"
                    >
                      Tooltips
                    </Button>
                    <Button icon={<Download size={14} />} onClick={() => void exportHtml(recording)} size="sm">
                      HTML
                    </Button>
                    <Button
                      aria-label={`Delete ${recording.title}`}
                      className="ml-auto"
                      icon={<Trash2 size={14} />}
                      onClick={() => openDelete([recording.filename])}
                      size="icon-sm"
                      variant="danger-ghost"
                    />
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      </main>

      {selectMode && selectedCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">{selectedLabel}</span>
            <Button
              className="ml-auto"
              onClick={() => setSelected(allSelected ? new Set() : new Set(recordings.map((item) => item.filename)))}
              size="sm"
            >
              {allSelected ? 'Clear' : 'Select all'}
            </Button>
            <Button
              icon={<Trash2 size={14} />}
              onClick={() => openDelete(Array.from(selected))}
              size="sm"
              variant="danger"
            >
              Delete
            </Button>
          </div>
        </div>
      ) : null}

      {dialog === 'settings' ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setSettings(DEFAULT_CAPTURE_SETTINGS)}>Reset</Button>
              <Button onClick={() => void saveSettings()} variant="primary">
                Save
              </Button>
            </>
          }
          onClose={() => setDialog(null)}
          title="Settings"
        >
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Capture shortcut</span>
            <input
              className="field-input"
              onChange={(event) => setSettings((value) => ({ ...value, CAPTURE_SHORTCUT: event.target.value }))}
              value={settings.CAPTURE_SHORTCUT}
            />
            <span className="text-caption">Pressed on the page to capture a slide, e.g. shift+c</span>
          </label>
          <label className="flex items-start gap-3 text-sm text-ink-muted">
            <input
              checked={settings.SHOW_RECORDING_INDICATOR}
              className="mt-0.5 size-4 accent-brand"
              onChange={(event) =>
                setSettings((value) => ({ ...value, SHOW_RECORDING_INDICATOR: event.target.checked }))
              }
              type="checkbox"
            />
            <span>Show recording indicator on page</span>
          </label>
        </Modal>
      ) : null}

      {dialog === 'delete' ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setDialog(null)}>Cancel</Button>
              <Button icon={<Trash2 size={16} />} onClick={() => void deletePending()} variant="danger">
                Delete
              </Button>
            </>
          }
          onClose={() => setDialog(null)}
          title={pendingDelete.length === 1 ? 'Delete recording?' : 'Delete recordings?'}
        >
          <p className="text-body">
            {pendingDelete.length === 1
              ? 'This recording will be permanently deleted.'
              : `${pendingDelete.length} recordings will be permanently deleted.`}
          </p>
        </Modal>
      ) : null}
    </div>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString()
}
