import { useState, useEffect, useRef } from 'react'
import {
  type CellState,
  type GridSize,
} from '../../types/layout'
import type { StudyRecord } from '../../types/dicom'
import type { OverlayState } from '../../hooks/useDicomLayout'
import type { StackViewport } from '@cornerstonejs/core'

import ViewportTile from './ViewportTile'
import DicomOverlay from './DicomOverlay'
import VerticalStackSlider from './VerticalStackSlider'

interface Props {
  cells: CellState[]
  outerLayout: GridSize
  study: StudyRecord
  activeCellIndex: number
  cellOverlays: OverlayState[]

  onActivateTile: (
    cellIndex: number,
    tileOffset: number,
  ) => void

  onTileOverlay: (
    cellIndex: number,
    tileOffset: number,
    overlay: OverlayState,
  ) => void

  onIndexChanged: (
    cellIndex: number,
    tileOffset: number,
    newIndex: number,
  ) => void

  onCineStateChanged: (
    cellIndex: number,
    playing: boolean,
  ) => void

  onViewportReady: (
    tileId: string,
    viewport: StackViewport,
  ) => void

  onViewportRemoved: (
    tileId: string,
  ) => void

  onScrollToIndex?: (
    cellIndex: number,
    newIndex: number,
  ) => void

  onAssignSeriesToCell?: (
    cellIndex: number,
    seriesInstanceUID: string,
  ) => void

  explodedCellIndex?: number | null
  onToggleExplode?: (cellIndex: number) => void
  onCameraModified?: (tileId: string) => void
  onVoiModified?: (tileId: string) => void
  onStackNewImage?: (tileId: string) => void
}

export default function ViewportGrid({
  cells,
  outerLayout,
  study,
  activeCellIndex,
  cellOverlays,
  onActivateTile,
  onTileOverlay,
  onIndexChanged,
  onCineStateChanged,
  onViewportReady,
  onViewportRemoved,
  onScrollToIndex,
  onAssignSeriesToCell,
  explodedCellIndex,
  onToggleExplode,
  onCameraModified,
  onVoiModified,
  onStackNewImage,
}: Props) {
  const [dragOverCellIndex, setDragOverCellIndex] = useState<number | null>(null)
  const isAnyExploded = explodedCellIndex !== null && explodedCellIndex !== undefined
  const lastTapTimeRef = useRef<{ [cellIndex: number]: number }>({})

  const handleCellTouchEnd = (cellIndex: number) => {
    const now = Date.now()
    const last = lastTapTimeRef.current[cellIndex] ?? 0
    if (now - last < 300) {
      onToggleExplode?.(cellIndex)
      lastTapTimeRef.current[cellIndex] = 0
    } else {
      lastTapTimeRef.current[cellIndex] = now
    }
  }

  useEffect(() => {
    const handleTouchDragOver = (e: Event) => {
      const customEvent = e as CustomEvent<{ cellIndex: number | null }>
      setDragOverCellIndex(customEvent.detail.cellIndex)
    }
    window.addEventListener('dicom:touch-drag-over', handleTouchDragOver)
    return () => {
      window.removeEventListener('dicom:touch-drag-over', handleTouchDragOver)
    }
  }, [])

  return (
    <div
      className="grid h-full w-full gap-0.5 bg-[var(--color-border)] p-0.5"
      style={
        isAnyExploded
          ? {
              gridTemplateRows: 'minmax(0, 1fr)',
              gridTemplateColumns: 'minmax(0, 1fr)',
            }
          : {
              gridTemplateRows: `repeat(${outerLayout.rows}, minmax(0, 1fr))`,
              gridTemplateColumns: `repeat(${outerLayout.cols}, minmax(0, 1fr))`,
            }
      }
    >
      {cells.map((cell, cellIndex) => {
        const series = cell.seriesInstanceUID
          ? study.series.find(
              (item) =>
                item.seriesInstanceUID ===
                cell.seriesInstanceUID,
            ) ?? null
          : null

        const tileCount =
          cell.imageLayout.rows *
          cell.imageLayout.cols

        const isActiveCell =
          cellIndex === activeCellIndex

        const isDragOver = dragOverCellIndex === cellIndex
        const isExplodedCell = isAnyExploded && explodedCellIndex === cellIndex
        const isHiddenCell = isAnyExploded && !isExplodedCell

        return (
          <div
            key={cell.id}
            data-cell-index={cellIndex}
            onDoubleClick={(e) => {
              if ((e.target as HTMLElement)?.closest('[role="slider"], button')) return
              onToggleExplode?.(cellIndex)
            }}
            onTouchEnd={(e) => {
              if ((e.target as HTMLElement)?.closest('[role="slider"], button')) return
              handleCellTouchEnd(cellIndex)
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('application/dicom-series')) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
                if (dragOverCellIndex !== cellIndex) {
                  setDragOverCellIndex(cellIndex)
                }
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverCellIndex((curr) => (curr === cellIndex ? null : curr))
              }
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDragOverCellIndex(null)
              const seriesUID = e.dataTransfer.getData('application/dicom-series')
              if (seriesUID && onAssignSeriesToCell) {
                onAssignSeriesToCell(cellIndex, seriesUID)
              }
            }}
            className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden transition-all duration-150 ${
              isHiddenCell ? 'hidden' : ''
            } ${
              isDragOver
                ? 'border-2 border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/50'
                : isActiveCell
                  ? 'border border-[var(--color-accent)]'
                  : 'border border-transparent'
            }`}
            style={
              isHiddenCell
                ? { display: 'none' }
                : isActiveCell && !isDragOver
                  ? {
                      boxShadow:
                        '0 0 0 1px var(--color-accent)',
                    }
                  : undefined
            }
            title={isExplodedCell ? 'Double-click to restore layout' : 'Double-click to expand to full 1×1 view'}
          >
            <div className="hidden min-h-[22px] items-center bg-[var(--color-surface)]/90 px-1.5 py-0.5">
              <span className="truncate font-mono text-[10px] text-[var(--color-text-muted)]">
                {series
                  ? `${series.modality} · ${series.seriesDescription}`
                  : `Cell ${cellIndex + 1}`}
              </span>
            </div>

            <div className="relative min-h-0 flex-1">
              <div
                className="grid h-full w-full gap-px bg-[var(--color-border)]"
                style={{
                  gridTemplateRows: `repeat(${cell.imageLayout.rows}, minmax(0, 1fr))`,
                  gridTemplateColumns: `repeat(${cell.imageLayout.cols}, minmax(0, 1fr))`,
                }}
              >
                {Array.from(
                  { length: tileCount },
                  (_, tileOffset) => {
                    const tileId = `${cell.id}__tile-${tileOffset}`
                    const baseIndex = cellOverlays[cellIndex]?.imageIndex ?? 0
                    const initialImageIndex = baseIndex + tileOffset

                    return (
                      <ViewportTile
                        key={tileId}
                        tileId={tileId}
                        cellIndex={cellIndex}
                        tileOffset={tileOffset}
                        series={series}
                        initialImageIndex={initialImageIndex}
                        onActivate={onActivateTile}
                        onOverlay={onTileOverlay}
                        onIndexChanged={onIndexChanged}
                        onCineStateChanged={onCineStateChanged}
                        onViewportReady={onViewportReady}
                        onViewportRemoved={onViewportRemoved}
                        onCameraModified={onCameraModified}
                        onVoiModified={onVoiModified}
                        onStackNewImage={onStackNewImage}
                      />
                    )
                  },
                )}
              </div>

              {series && (
                <DicomOverlay
                  study={study}
                  series={series}
                  overlay={cellOverlays[cellIndex]}
                />
              )}

              {series && (cellOverlays[cellIndex]?.imageCount ?? 0) > 1 && (
                <VerticalStackSlider
                  current={cellOverlays[cellIndex]?.imageIndex ?? 0}
                  max={cellOverlays[cellIndex]?.imageCount ?? 1}
                  onChange={(newIndex) => onScrollToIndex?.(cellIndex, newIndex)}
                />
              )}

              {/* Exploded 1x1 indicator badge */}
              {isExplodedCell && (
                <div className="pointer-events-none absolute left-2 top-2 z-30 flex items-center gap-1.5 rounded bg-black/80 px-2 py-0.5 font-mono text-[9px] font-medium text-white/90 border border-white/20 shadow-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
                  <span>1×1 Exploded (Double-click to restore)</span>
                </div>
              )}

              {/* Prominent drop target highlight overlay */}
              {isDragOver && (
                <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center bg-[var(--color-accent)]/20 backdrop-blur-[1px] animate-fadeIn">
                  <div className="rounded-md bg-black/90 px-3 py-2 text-xs font-semibold text-white shadow-2xl border border-[var(--color-accent)] flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[var(--color-accent)] animate-ping" />
                    <span>Drop to load series in Viewport {cellIndex + 1}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}