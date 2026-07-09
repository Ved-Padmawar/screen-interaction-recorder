import type { RecordingSlide } from '../domain/contracts'

export type DotPosition = {
  x: number
  y: number
}

/** Slides with no recorded click point (form submit, input change) mark the center. */
const CENTER_PERCENT = 50

export function getSlideDotPosition(slide: RecordingSlide, imageWidth: number, imageHeight: number): DotPosition {
  const xPercent = slide.clickXPercent ?? CENTER_PERCENT
  const yPercent = slide.clickYPercent ?? CENTER_PERCENT

  return {
    x: clamp((xPercent / 100) * imageWidth, 0, imageWidth),
    y: clamp((yPercent / 100) * imageHeight, 0, imageHeight),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
