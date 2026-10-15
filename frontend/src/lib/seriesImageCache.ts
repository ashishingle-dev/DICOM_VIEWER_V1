import { buildWadoUriImageId } from './pacs/apiClient'
import type { SeriesRecord } from '../types/dicom'

const cache = new Map<string, Promise<string[]>>()

/** Resolves (and caches) the ordered list of Cornerstone imageIds for a series.
 *  Cornerstone's file registration is per-tab, not per-series, so the first
 *  caller for a given series does the IndexedDB reads + registration; every
 *  other tile showing the same series reuses the same resolved imageIds. */
export function getSeriesImageIds(series: SeriesRecord): Promise<string[]> {
  const cached = cache.get(series.seriesInstanceUID)
  if (cached) return cached

  const promise = Promise.resolve(
    [...series.instances]
      .sort((a, b) => a.instanceNumber - b.instanceNumber)
      .map((instance) => {
        if (!series.studyInstanceUID) {
          throw new Error(`StudyInstanceUID is missing for series ${series.seriesInstanceUID}`)
        }

        return buildWadoUriImageId(
          series.studyInstanceUID,
          series.seriesInstanceUID,
          instance.sopInstanceUID,
        )
      }),
  )

  cache.set(series.seriesInstanceUID, promise)
  return promise
}

/** Call when purging the file manager (e.g. on full viewer teardown) so stale imageIds aren't reused. */
export function clearSeriesImageCache() {
  cache.clear()
}
