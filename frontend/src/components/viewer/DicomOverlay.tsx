import type { StudyRecord, SeriesRecord } from '../../types/dicom'
import type { OverlayState } from '../../hooks/useDicomLayout'
import { getEdgeLabels, getPlaneLabel } from '../../lib/orientation'

interface Props {
  study: StudyRecord
  series: SeriesRecord | null
  overlay: OverlayState
}

export default function DicomOverlay({ study, series, overlay }: Props) {
  const textClass =
    'font-mono text-[10px] leading-[1.4] text-[var(--color-accent)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]'

  const plane = series ? getPlaneLabel(series.imageOrientationPatient) : null
  const edges = series ? getEdgeLabels(series.imageOrientationPatient) : null

  return (
    <div className="pointer-events-none absolute inset-0 select-none p-2">
      {/* top-left: patient identity */}
      <div className={`absolute left-2 top-2 ${textClass}`}>
        <div className="truncate max-w-[45vw]">{study.patientName}</div>
        <div>{study.patientId}</div>
      </div>

      {/* top-right: series + orientation plane */}
      <div className={`absolute right-2 top-2 text-right ${textClass}`}>
        <div>{series ? series.modality : '—'}</div>
        {plane && <div>{plane}</div>}
      </div>

      {/* bottom-left: image position */}
      <div className={`absolute bottom-2 left-2 ${textClass}`}>
        <div>
          Img {overlay.imageCount === 0 ? 0 : overlay.imageIndex + 1} / {overlay.imageCount}
        </div>
      </div>

      {/* bottom-right: window/zoom */}
      <div className={`absolute bottom-2 right-2 text-right ${textClass}`}>
        <div>
          WW {overlay.windowWidth} / WL {overlay.windowCenter}
        </div>
        <div>
          Zoom {overlay.zoomPercent}%{overlay.invert ? ' · INV' : ''}
        </div>
      </div>

      {/* anatomical edge markers, derived from ImageOrientationPatient */}
      {edges && (
        <>
          <div className={`absolute left-1/2 top-1 -translate-x-1/2 ${textClass}`}>{edges.top}</div>
          <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 ${textClass}`}>
            {edges.bottom}
          </div>
          <div className={`absolute left-1 top-1/2 -translate-y-1/2 ${textClass}`}>{edges.left}</div>
          <div className={`absolute right-1 top-1/2 -translate-y-1/2 ${textClass}`}>
            {edges.right}
          </div>
        </>
      )}
    </div>
  )
}
