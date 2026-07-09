import Dexie, { type EntityTable } from 'dexie'
import type { Recording, ScreenshotRecord } from '../domain/contracts'

class ScreenRecorderDatabase extends Dexie {
  screenshots!: EntityTable<ScreenshotRecord, 'id'>

  constructor() {
    super('screen-interaction-recorder')

    this.version(1).stores({
      screenshots: 'id, recordingFilename, createdAt',
    })
  }
}

export const db = new ScreenRecorderDatabase()

export async function saveScreenshot(record: ScreenshotRecord) {
  await db.screenshots.put(record)
}

export async function getScreenshot(id: string) {
  return db.screenshots.get(id)
}

export async function deleteScreenshotsForRecordings(recordingFilenames: string[]) {
  if (recordingFilenames.length === 0) return

  await db.screenshots.where('recordingFilename').anyOf(recordingFilenames).delete()
}

/**
 * Resolves a preview image for a recording's first interaction. Returns an object
 * URL (cheap handle) for stored blobs, or the inline data URL for legacy
 * recordings captured before screenshots moved to IndexedDB. Callers must pass
 * the result to `releaseThumbnail` when done.
 */
export async function getRecordingThumbnail(recording: Recording): Promise<string | null> {
  const first = recording.data.find((interaction) => interaction.screenshot || interaction.screenshotId)
  if (!first) return null

  if (first.screenshot) return first.screenshot
  if (!first.screenshotId) return null

  const screenshot = await getScreenshot(first.screenshotId)
  return screenshot ? URL.createObjectURL(screenshot.blob) : null
}

export function releaseThumbnail(url: string | null) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}
