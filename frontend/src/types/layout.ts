export interface GridSize {
  rows: number
  cols: number
}

export interface CellState {
  /** Stable id for this outer grid cell, e.g. "cell-0". */
  id: string
  seriesInstanceUID: string | null
  /** Sub-layout for tiling multiple images from this cell's series, e.g. 2x2. */
  imageLayout: GridSize
}

export const SINGLE: GridSize = { rows: 1, cols: 1 }
export const MAX_GRID = 4

export function gridSizeEqual(a: GridSize, b: GridSize): boolean {
  return a.rows === b.rows && a.cols === b.cols
}

export function makeCells(layout: GridSize, previous: CellState[]): CellState[] {
  const count = layout.rows * layout.cols
  const next: CellState[] = []
  for (let i = 0; i < count; i++) {
    next.push(
      previous[i] ?? {
        id: `cell-${i}`,
        seriesInstanceUID: null,
        imageLayout: { ...SINGLE },
      }
    )
  }
  return next
}
