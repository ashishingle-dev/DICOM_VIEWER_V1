import { useEffect, useRef, useState } from 'react'
import { Film, AlertCircle } from 'lucide-react'
import { utilities } from '@cornerstonejs/core'
import { buildWadoUriImageId, getInstances } from '../../lib/pacs/apiClient'
import { ensureCornerstoneInitialized } from '../../lib/cornerstoneSetup'
import type { SeriesRecord } from '../../types/dicom'

interface Props {
  series: SeriesRecord
  studyUID?: string
}

// Module-level thumbnail cache (data URL by seriesInstanceUID)
const thumbnailCache = new Map<string, string>()

export default function SeriesThumbnail({ series, studyUID }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cachedUrl = thumbnailCache.get(series.seriesInstanceUID)
  const [dataUrl, setDataUrl] = useState<string | null>(cachedUrl ?? null)
  const [loading, setLoading] = useState<boolean>(!cachedUrl)
  const [hasError, setHasError] = useState<boolean>(false)

  useEffect(() => {
    // If already cached, nothing to load
    if (thumbnailCache.has(series.seriesInstanceUID)) {
      setDataUrl(thumbnailCache.get(series.seriesInstanceUID)!)
      setLoading(false)
      setHasError(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setHasError(false)

    async function generateThumbnail() {
      try {
        const studyId = series.studyInstanceUID || studyUID
        if (!studyId) {
          throw new Error('Study UID missing')
        }

        // Get instance list (metadata only, does not download files)
        let instances = series.instances
        if (!instances || instances.length === 0) {
          instances = await getInstances(studyId, series.seriesInstanceUID)
        }

        if (cancelled) return
        if (!instances || instances.length === 0) {
          throw new Error('No instances found for series')
        }

        // Pick representative instance (middle slice)
        const midIndex = Math.floor(instances.length / 2)
        const repInstance = instances[midIndex] ?? instances[0]
        if (!repInstance) {
          throw new Error('Representative instance unavailable')
        }

        const imageId = buildWadoUriImageId(
          studyId,
          series.seriesInstanceUID,
          repInstance.sopInstanceUID,
        )

        await ensureCornerstoneInitialized()
        if (cancelled) return

        // Render onto an offscreen canvas
        const offscreenCanvas = document.createElement('canvas')
        offscreenCanvas.width = 128
        offscreenCanvas.height = 128

        await utilities.loadImageToCanvas({
          canvas: offscreenCanvas,
          imageId,
          thumbnail: true,
          useCPURendering: true,
        })

        if (cancelled) return

        try {
          const url = offscreenCanvas.toDataURL('image/jpeg', 0.8)
          thumbnailCache.set(series.seriesInstanceUID, url)
          setDataUrl(url)
        } catch {
          // If toDataURL is tainted or unsupported, draw onto mounted canvas
          const mountedCanvas = canvasRef.current
          if (mountedCanvas) {
            mountedCanvas.width = 128
            mountedCanvas.height = 128
            const ctx = mountedCanvas.getContext('2d')
            ctx?.drawImage(offscreenCanvas, 0, 0)
          }
        }

        setLoading(false)
      } catch {
        if (!cancelled) {
          setHasError(true)
          setLoading(false)
        }
      }
    }

    void generateThumbnail()

    return () => {
      cancelled = true
    }
  }, [series.seriesInstanceUID, series.instances, series.studyInstanceUID, studyUID])

  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded border border-[var(--color-border)] bg-black shadow-inner flex items-center justify-center">
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={series.seriesDescription || 'Series thumbnail'}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <canvas ref={canvasRef} className={`h-full w-full object-cover ${loading ? 'hidden' : 'block'}`} />
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)]/80 animate-pulse">
          <Film className="h-4 w-4 text-[var(--color-text-dim)] animate-spin" />
        </div>
      )}

      {hasError && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--color-surface)] text-[var(--color-text-dim)] p-1 text-center"
          title="Thumbnail unavailable"
        >
          <AlertCircle className="h-3.5 w-3.5 text-[var(--color-text-dim)] opacity-70 mb-0.5" />
          <span className="font-mono text-[8px] font-semibold tracking-wider text-[var(--color-text-muted)]">
            {series.modality || 'DICOM'}
          </span>
        </div>
      )}
    </div>
  )
}
