import type { SeriesRecord } from '../types/dicom'

const VOLUME_ID_PREFIX = 'cornerstoneStreamingImageVolume'

export function volumeIdForSeries(seriesInstanceUID: string): string {
  return `${VOLUME_ID_PREFIX}:${seriesInstanceUID}`
}

export function isMprCapable(series: SeriesRecord): boolean {
  const count = series.instances.length || series.instanceCount || 0
  return count >= 3
}
