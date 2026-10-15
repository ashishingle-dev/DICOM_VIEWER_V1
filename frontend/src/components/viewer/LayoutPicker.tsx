import { useRef, useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import type { GridSize } from '../../types/layout'
import AnchoredPopover from './AnchoredPopover'

interface Props {
  outerLayout: GridSize
  imageLayout: GridSize
  max: number
  onOuterLayoutChange: (layout: GridSize) => void
  onImageLayoutChange: (layout: GridSize) => void
  label?: string
}

const itemClass = (active: boolean) =>
  `flex w-14 shrink-0 touch-manipulation flex-col items-center gap-0.5 rounded-md px-1.5 py-1.5 text-[10px] font-medium transition-colors ${
    active
      ? 'text-[var(--color-accent)]'
      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
  }`

const getCellClass = (filled: boolean) =>
  `h-[18px] w-[18px] touch-manipulation rounded-sm border transition-colors ${
    filled
      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/70'
      : 'border-[var(--color-border-strong)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]/60'
  }`

interface LayoutGridProps {
  title: string
  value: GridSize
  max: number
  onChange: (layout: GridSize) => void
}

function LayoutGridSelector({
  title,
  value,
  max,
  onChange,
}: LayoutGridProps) {
  const [hover, setHover] = useState<GridSize | null>(null)

  const preview = hover ?? value

  const cells = Array.from(
    { length: max * max },
    (_, index) => ({
      row: Math.floor(index / max) + 1,
      col: (index % max) + 1,
    }),
  )

  return (
    <div className="flex min-w-0 flex-col items-center">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {title}
      </p>

      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${max}, 18px)`,
        }}
        onMouseLeave={() => setHover(null)}
      >
        {cells.map(({ row, col }) => {
          const layout: GridSize = {
            rows: row,
            cols: col,
          }

          const filled =
            row <= preview.rows &&
            col <= preview.cols

          return (
            <button
              key={`${row}-${col}`}
              type="button"
              title={`${row} × ${col}`}
              aria-label={`Set ${title.toLowerCase()} to ${row} by ${col}`}
              onMouseEnter={() => setHover(layout)}
              onClick={() => onChange(layout)}
              className={getCellClass(filled)}
            />
          )
        })}
      </div>

      <p className="mt-2 font-mono text-[11px] font-medium text-[var(--color-text)]">
        {preview.rows} × {preview.cols}
      </p>
    </div>
  )
}

export default function LayoutPicker({
  outerLayout,
  imageLayout,
  max,
  onOuterLayoutChange,
  onImageLayoutChange,
  label = 'Layout',
}: Props) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="relative">
      {/* Toolbar button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={itemClass(open)}
      >
        <LayoutGrid className="h-4 w-4" />

        <span>
          {outerLayout.rows}×{outerLayout.cols}
        </span>
      </button>

      {/* Rendered in a portal via AnchoredPopover so it can never be
          clipped by the toolbar's scroll container and always stays fully
          on-screen — see AnchoredPopover for why that matters on
          mobile/tablet. The Viewport Grid and Active Cell selectors stay
          side-by-side in one panel (no tab/toggle between them) so both are
          reachable in a single tap. */}
      <AnchoredPopover open={open} anchorRef={buttonRef} onClose={() => setOpen(false)} align="center">
        <div className="w-max max-w-[92vw] rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] p-3 shadow-2xl">
          <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text)]">
            {label}
          </p>

          <div className="flex items-start gap-4 overflow-x-auto">
            {/* Main viewport layout */}
            <LayoutGridSelector
              title="Viewport Grid"
              value={outerLayout}
              max={max}
              onChange={onOuterLayoutChange}
            />

            {/* Separator */}
            <div className="h-28 w-px shrink-0 bg-[var(--color-border-strong)]" />

            {/* Active cell layout */}
            <LayoutGridSelector
              title="Active Cell"
              value={imageLayout}
              max={max}
              onChange={onImageLayoutChange}
            />
          </div>
        </div>
      </AnchoredPopover>
    </div>
  )
}
