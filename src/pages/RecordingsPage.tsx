import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, Download, Edit3, FileVideo, Settings, Trash2 } from 'lucide-react'
import { DEFAULT_CAPTURE_SETTINGS, RuntimeAction, type CaptureSettings, type Recording } from '../domain/contracts'
import {
  extensionUrl,
  getCaptureSettings,
  getRecordingSlides,
  getRecordings,
  saveCaptureSettings,
  sendRuntimeMessage,
} from '../platform/chrome'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { ThemeToggle } from '../ui/ThemeToggle'
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

  const selectedLabel = useMemo(() => `${selectedCount} selected`, [selectedCount])

  function toggleSelection(filename: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(filename)) next.delete(filename)
      else next.add(filename)
      return next
    })
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
    <main className="app-page py-5">
      <div className="page-shell">
        <header className="mb-5 flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-title">Recordings</h1>
            <p className="text-body">Review captures, edit tooltips, and export the HTML walkthrough.</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button
              icon={<CheckSquare size={16} />}
              onClick={() => {
                setSelectMode((value) => !value)
                setSelected(new Set())
              }}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </Button>
            <Button icon={<Settings size={16} />} onClick={() => setDialog('settings')}>
              Settings
            </Button>
          </div>
        </header>

        {status ? (
          <div className="mb-4 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-muted">{status}</div>
        ) : null}

        {loading ? <div className="surface p-8 text-center text-body">Loading recordings...</div> : null}

        {!loading && recordings.length === 0 ? (
          <div className="surface p-8 text-center">
            <FileVideo className="mx-auto mb-3 text-ink-soft" size={28} />
            <h2 className="text-section">No recordings yet</h2>
            <p className="text-body">Click the extension icon to capture your first flow.</p>
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recordings.map((recording) => {
            const isSelected = selected.has(recording.filename)
            return (
              <article
                className={cn(
                  'surface overflow-hidden transition hover:-translate-y-0.5 hover:border-brand/50',
                  selectMode && 'cursor-pointer',
                  isSelected && 'border-brand ring-2 ring-brand/20',
                )}
                key={recording.filename}
                onClick={() => {
                  if (selectMode) toggleSelection(recording.filename)
                  else window.location.href = extensionUrl(`viewer.html?recording=${recording.filename}`)
                }}
              >
                <div className="relative flex aspect-video items-center justify-center bg-surface-muted text-caption">
                  <FileVideo size={24} />
                  <span className="ml-2">Click to view</span>
                  <span className="absolute bottom-2 right-2 rounded bg-ink px-2 py-1 text-xs font-semibold text-white">
                    {recording.slideCount ?? recording.data.length} slides
                  </span>
                  {selectMode ? (
                    <span
                      className={cn(
                        'absolute left-2 top-2 flex size-6 items-center justify-center rounded border bg-surface',
                        isSelected ? 'border-brand bg-brand text-white' : 'border-line',
                      )}
                    >
                      {isSelected ? <CheckSquare size={14} /> : null}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <h2 className="line-clamp-2 text-section">{recording.title || 'Untitled Recording'}</h2>
                    <p className="text-caption">{formatDate(recording.date)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                    <Button
                      icon={<Edit3 size={14} />}
                      onClick={() => (window.location.href = extensionUrl(`tooltip-editor.html?recording=${recording.filename}`))}
                      size="sm"
                    >
                      Tooltips
                    </Button>
                    <Button icon={<Download size={14} />} onClick={() => void exportHtml(recording)} size="sm">
                      HTML
                    </Button>
                    <Button
                      aria-label="Delete recording"
                      icon={<Trash2 size={14} />}
                      onClick={() => openDelete([recording.filename])}
                      size="sm"
                      variant="ghost"
                    />
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      </div>

      {selectMode && selectedCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-4 py-3 shadow-panel">
          <div className="mx-auto flex max-w-5xl items-center gap-2">
            <span className="text-sm font-semibold text-ink">{selectedLabel}</span>
            <Button
              className="ml-auto"
              onClick={() => setSelected(allSelected ? new Set() : new Set(recordings.map((item) => item.filename)))}
              size="sm"
            >
              {allSelected ? 'Clear' : 'Select all'}
            </Button>
            <Button icon={<Trash2 size={14} />} onClick={() => openDelete(Array.from(selected))} size="sm" variant="danger">
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
          <label className="space-y-1.5">
            <span className="field-label">Capture shortcut</span>
            <input
              className="focus-ring h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
              onChange={(event) => setSettings((value) => ({ ...value, CAPTURE_SHORTCUT: event.target.value }))}
              value={settings.CAPTURE_SHORTCUT}
            />
          </label>
          <label className="flex items-start gap-3 text-sm text-ink-muted">
            <input
              checked={settings.SHOW_RECORDING_INDICATOR}
              className="mt-1 accent-brand"
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
          title="Delete recording?"
        >
          <p className="text-body">
            {pendingDelete.length === 1
              ? 'This recording will be permanently deleted.'
              : `${pendingDelete.length} recordings will be permanently deleted.`}
          </p>
        </Modal>
      ) : null}
    </main>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString()
}
