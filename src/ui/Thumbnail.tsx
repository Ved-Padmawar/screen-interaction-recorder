import { useEffect, useState } from 'react'
import { FileVideo } from 'lucide-react'
import type { Recording } from '../domain/contracts'
import { getRecordingThumbnail, releaseThumbnail } from '../platform/database'

type ThumbnailProps = {
  recording: Recording
}

export function Thumbnail({ recording }: ThumbnailProps) {
  const [source, setSource] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let created: string | null = null

    getRecordingThumbnail(recording)
      .then((url) => {
        if (!active) {
          releaseThumbnail(url)
          return
        }
        created = url
        setSource(url)
      })
      .catch(() => undefined)

    return () => {
      active = false
      releaseThumbnail(created)
    }
  }, [recording])

  if (!source) {
    return (
      <div className="flex size-full items-center justify-center text-ink-soft">
        <FileVideo size={24} />
      </div>
    )
  }

  return <img alt="" className="size-full object-cover" loading="lazy" src={source} />
}
