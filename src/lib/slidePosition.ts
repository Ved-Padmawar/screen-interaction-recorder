import type { RecordingSlide } from '../domain/contracts'

export type DotPosition = {
  x: number
  y: number
}

export function getSlideDotPosition(slide: RecordingSlide, imageWidth: number, imageHeight: number): DotPosition {
  let x = imageWidth / 2
  let y = imageHeight / 2

  if (typeof slide.clickXPercent === 'number' && typeof slide.clickYPercent === 'number') {
    x = (slide.clickXPercent / 100) * imageWidth
    y = (slide.clickYPercent / 100) * imageHeight
  } else if (typeof slide.exactClickX === 'number' && typeof slide.exactClickY === 'number') {
    x = slide.exactClickX * imageWidth
    y = slide.exactClickY * imageHeight
  } else if (typeof slide.clickX === 'number' && typeof slide.clickY === 'number') {
    x = slide.clickX > 1 ? (slide.clickX / 100) * imageWidth : slide.clickX * imageWidth
    y = slide.clickY > 1 ? (slide.clickY / 100) * imageHeight : slide.clickY * imageHeight
  } else if (
    typeof slide.clientX === 'number' &&
    typeof slide.clientY === 'number' &&
    typeof slide.originalViewportWidth === 'number' &&
    typeof slide.originalViewportHeight === 'number'
  ) {
    x = slide.clientX * (imageWidth / slide.originalViewportWidth)
    y = slide.clientY * (imageHeight / slide.originalViewportHeight)
  } else if (
    typeof slide.originalClientX === 'number' &&
    typeof slide.originalClientY === 'number' &&
    typeof slide.originalViewportWidth === 'number' &&
    typeof slide.originalViewportHeight === 'number'
  ) {
    x = slide.originalClientX * (imageWidth / slide.originalViewportWidth)
    y = slide.originalClientY * (imageHeight / slide.originalViewportHeight)
  }

  return {
    x: Math.max(0, Math.min(imageWidth, x)),
    y: Math.max(0, Math.min(imageHeight, y)),
  }
}
