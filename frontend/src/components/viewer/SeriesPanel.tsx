import { useState, useRef, useCallback } from 'react'
import { X, GripVertical } from 'lucide-react'
import type { SeriesRecord } from '../../types/dicom'
import ModalityBadge from '../ModalityBadge'
import SeriesThumbnail from './SeriesThumbnail'

interface Props {
  series: SeriesRecord[]
  activeSeriesUID: string | null
  studyUID?: string
  cellCount?: number
  onSelect: (series: SeriesRecord) => void
  onAssignSeriesToCell?: (cellIndex: number, seriesInstanceUID: string) => void
  /** Only passed when rendered as a mobile/tablet drawer — shows a close (X)
   *  button in the header and is otherwise omitted on desktop. */
  onClose?: () => void
}

export default function SeriesPanel({
  series,
  activeSeriesUID,
  studyUID,
  cellCount = 1,
  onSelect,
  onAssignSeriesToCell,
  onClose,
}: Props) {
  // Touch drag state
  const [touchDragging, setTouchDragging] = useState<SeriesRecord | null>(null)
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(null)
  const [touchTargetCell, setTouchTargetCell] = useState<number | null>(null)
  const pointerStartRef = useRef<{ x: number; y: number; series: SeriesRecord } | null>(null)
  const isDraggingRef = useRef<boolean>(false)

  const handlePointerDown = (e: React.PointerEvent, s: SeriesRecord) => {
    // Only capture primary pointer (finger or left button)
    if (e.button !== 0 && e.pointerType === 'mouse') return
    pointerStartRef.current = { x: e.clientX, y: e.clientY, series: s }
    isDraggingRef.current = false
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointerStartRef.current) return
    const dx = e.clientX - pointerStartRef.current.x
    const dy = e.clientY - pointerStartRef.current.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > 8) {
      isDraggingRef.current = true
      const s = pointerStartRef.current.series
      setTouchDragging(s)
      setTouchPos({ x: e.clientX, y: e.clientY })

      // Detect which viewport cell is under the pointer
      const element = document.elementFromPoint(e.clientX, e.clientY)
      const cellElem = element?.closest('[data-cell-index]')
      if (cellElem) {
        const idx = Number(cellElem.getAttribute('data-cell-index'))
        setTouchTargetCell(idx)
        window.dispatchEvent(
          new CustomEvent('dicom:touch-drag-over', { detail: { cellIndex: idx } }),
        )
      } else {
        setTouchTargetCell(null)
        window.dispatchEvent(
          new CustomEvent('dicom:touch-drag-over', { detail: { cellIndex: null } }),
        )
      }
    }
  }

  const handlePointerUp = useCallback(() => {
    if (isDraggingRef.current && pointerStartRef.current && touchTargetCell !== null) {
      const s = pointerStartRef.current.series
      onAssignSeriesToCell?.(touchTargetCell, s.seriesInstanceUID)
      onClose?.()
    }
    // Clean up
    pointerStartRef.current = null
    isDraggingRef.current = false
    setTouchDragging(null)
    setTouchPos(null)
    setTouchTargetCell(null)
    window.dispatchEvent(
      new CustomEvent('dicom:touch-drag-over', { detail: { cellIndex: null } }),
    )
  }, [touchTargetCell, onAssignSeriesToCell, onClose])

  return (
    <div
      className="flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:w-60 lg:max-w-none select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Series ({series.length})
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="inline-flex items-center rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 divide-y divide-[var(--color-border)]">
        {series.map((s) => {
          const active = s.seriesInstanceUID === activeSeriesUID

          return (
            <div
              key={s.seriesInstanceUID}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/dicom-series', s.seriesInstanceUID)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onPointerDown={(e) => handlePointerDown(e, s)}
              onClick={() => {
                if (!isDraggingRef.current) {
                  onSelect(s)
                }
              }}
              className={`group relative flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 transition-colors ${
                active ? 'bg-[var(--color-accent-dim)]' : 'hover:bg-[var(--color-surface-hover)]'
              }`}
              title="Click to display in active viewport, or drag onto any viewport"
            >
              {/* Drag handle affordance */}
              <div
                className="shrink-0 text-[var(--color-text-dim)] group-hover:text-[var(--color-text)] cursor-grab active:cursor-grabbing"
                title="Drag to any viewport"
              >
                <GripVertical className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
              </div>

              {/* Series Thumbnail */}
              <SeriesThumbnail
                series={s}
                studyUID={studyUID || s.studyInstanceUID}
              />

              {/* Series Info */}
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center justify-between gap-1">
                  <span
                    className={`truncate text-xs font-medium ${
                      active ? 'text-[var(--color-accent)] font-semibold' : 'text-[var(--color-text)]'
                    }`}
                  >
                    {s.seriesNumber ? `#${s.seriesNumber} · ` : ''}
                    {s.seriesDescription}
                  </span>
                  <ModalityBadge modality={s.modality} />
                </div>

                <p className="font-mono text-[10px] text-[var(--color-text-dim)] truncate">
                  {s.instanceCount ?? s.instances.length} image{(s.instanceCount ?? s.instances.length) === 1 ? '' : 's'}
                  {s.bodyPartExamined ? ` · ${s.bodyPartExamined}` : ''}
                </p>

                {/* Quick viewport assign pills if multiple viewports exist */}
                {cellCount > 1 && onAssignSeriesToCell && (
                  <div className="mt-1 flex items-center gap-1">
                    <span className="text-[9px] text-[var(--color-text-dim)] uppercase">To:</span>
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: cellCount }, (_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onAssignSeriesToCell(idx, s.seriesInstanceUID)
                            onClose?.()
                          }}
                          className="rounded border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] px-1.5 py-0.2 font-mono text-[9px] font-medium text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white transition-colors"
                          title={`Assign to Viewport ${idx + 1}`}
                        >
                          V{idx + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Touch drag floating badge */}
      {touchDragging && touchPos && (
        <div
          className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-1/2 rounded-md bg-black/90 border-2 border-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-sm flex items-center gap-2"
          style={{ left: touchPos.x, top: touchPos.y }}
        >
          <GripVertical className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          <span className="truncate max-w-[150px]">{touchDragging.seriesDescription}</span>
          {touchTargetCell !== null && (
            <span className="rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
              Viewport {touchTargetCell + 1}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
