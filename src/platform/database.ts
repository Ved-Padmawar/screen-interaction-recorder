import Dexie, { type EntityTable } from 'dexie'
import type { ScreenshotRecord } from '../domain/contracts'

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
