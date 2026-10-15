import {
  type CellState,
  type GridSize,
} from '../../types/layout'
import type { StudyRecord } from '../../types/dicom'
import type { OverlayState } from '../../hooks/useDicomLayout'
import type { StackViewport } from '@cornerstonejs/core'

import ViewportTile from './ViewportTile'
import DicomOverlay from './DicomOverlay'

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
}: Props) {
  return (
    <div
      className="grid h-full w-full gap-0.5 bg-[var(--color-border)] p-0.5"
      style={{
        gridTemplateRows: `repeat(${outerLayout.rows}, minmax(0, 1fr))`,
        gridTemplateColumns: `repeat(${outerLayout.cols}, minmax(0, 1fr))`,
      }}
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

        return (
          <div
            key={cell.id}
            className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden ${
              isActiveCell
                ? 'border border-[var(--color-accent)]'
                : 'border border-transparent'
            }`}
            style={
              isActiveCell
                ? {
                    boxShadow:
                      '0 0 0 1px var(--color-accent)',
                  }
                : undefined
            }
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

                    return (
                      <ViewportTile
                        key={tileId}
                        tileId={tileId}
                        cellIndex={cellIndex}
                        tileOffset={tileOffset}
                        series={series}
                        onActivate={onActivateTile}
                        onOverlay={onTileOverlay}
                        onIndexChanged={onIndexChanged}
                        onCineStateChanged={onCineStateChanged}
                        onViewportReady={onViewportReady}
                        onViewportRemoved={onViewportRemoved}
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
            </div>
          </div>
        )
      })}
    </div>
  )
}