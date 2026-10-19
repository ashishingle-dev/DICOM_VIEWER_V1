/**
 * Volume loading utilities for MPR (Multi-Planar Reconstruction).
 *
 * Loads all slices of a DICOM series into a Cornerstone3D volume so that
 * coronal and sagittal planes can be reconstructed from the original axial
 * (or whichever orientation the series was acquired in) data.
 *
 * Uses the existing WADO-URI imageId infrastructure and auth layer —
 * no new backend endpoints or fetch paths are needed.
 */
import {
  volumeLoader,
  cache as cornerstoneCache,
} from '@cornerstonejs/core'
import { getSeriesImageIds } from './seriesImageCache'
import type { SeriesRecord } from '../types/dicom'
import { volumeIdForSeries, isMprCapable } from './volumeUtils'

export { volumeIdForSeries, isMprCapable }

export interface VolumeLoadResult {
  volumeId: string
  imageIds: string[]
}

/**
 * Loads (or re-uses) a volume for the given series.
 *
 * The volume is registered in Cornerstone's global cache under a
 * deterministic ID so multiple viewports can share the same data.
 * On the first call the DICOM bytes are streamed from the server;
 * subsequent calls return instantly with the cached volume.
 *
 * @param onProgress Optional callback for loading progress (0–100).
 */
export async function loadSeriesVolume(
  series: SeriesRecord,
  onProgress?: (pct: number) => void,
): Promise<VolumeLoadResult> {
  const volumeId = volumeIdForSeries(series.seriesInstanceUID)
  const imageIds = await getSeriesImageIds(series)

  if (imageIds.length === 0) {
    throw new Error('Series has no images — cannot create a volume.')
  }

  // If the volume is already cached, just return it.
  const existing = cornerstoneCache.getVolume(volumeId)
  if (existing) {
    return { volumeId, imageIds }
  }

  // Create the volume. Cornerstone's streaming volume loader fetches
  // each imageId via the configured loader (WADO-URI + bearer auth).
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  })

  // Start streaming pixel data into the volume.
  // The `load` callback fires progress events we can surface to the UI.
  const loadPromise = volume.load((...args: unknown[]) => {
    const evt = args[0] as { loaded?: number; total?: number } | undefined
    if (onProgress && evt && typeof evt.loaded === 'number' && typeof evt.total === 'number' && evt.total > 0) {
      onProgress(Math.round((evt.loaded / evt.total) * 100))
    }
  })

  await loadPromise

  return { volumeId, imageIds }
}

/**
 * Evicts a series volume from Cornerstone's cache, freeing GPU + CPU memory.
 * Safe to call even if the volume doesn't exist (no-op).
 */
export function unloadSeriesVolume(seriesInstanceUID: string): void {
  const volumeId = volumeIdForSeries(seriesInstanceUID)
  try {
    cornerstoneCache.removeVolumeLoadObject(volumeId)
  } catch {
    // Already removed or never loaded — ignore.
  }
}
