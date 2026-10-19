import { useCallback, useRef, useState } from 'react'

interface Props {
  current: number
  max: number
  onChange: (newIndex: number) => void
}

const THUMB_HEIGHT = 28 // pixels

/**
 * Vertical stack slider for the 2D DICOM viewer.
 * Direction:
 * - Top of the slider = 0 (initial slice)
 * - Bottom of the slider = max (total image count)
 * - Transparent track with only the thumb and image count labels visible
 */
export default function VerticalStackSlider({ current, max, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  // Clamp current to [0, max - 1]
  const safeCurrent = Math.max(0, Math.min(Math.max(1, max) - 1, current))
  // Percentage from top: slice 0 is top (0%), slice max - 1 is bottom (100%)
  const pct = max > 1 ? (safeCurrent / (max - 1)) * 100 : 0

  const updateFromPointer = useCallback(
    (clientY: number) => {
      const track = trackRef.current
      if (!track || max <= 1) return
      const rect = track.getBoundingClientRect()
      if (rect.height <= 0) return
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top))
      const fraction = y / rect.height
      const targetSlice = Math.round(fraction * (max - 1))
      onChange(Math.max(0, Math.min(max - 1, targetSlice)))
    },
    [max, onChange],
  )

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (max <= 1) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    setIsDragging(true)
    updateFromPointer(e.clientY)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || max <= 1) return
    e.preventDefault()
    e.stopPropagation()
    updateFromPointer(e.clientY)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      setIsDragging(false)
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (max <= 1) return
    // Wheel down (deltaY > 0) moves down/forward toward max; wheel up moves up toward 0
    const delta = e.deltaY > 0 ? 1 : -1
    onChange(Math.max(0, Math.min(max - 1, safeCurrent + delta)))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (max <= 1) return
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault()
      onChange(Math.min(max - 1, safeCurrent + (e.key === 'PageDown' ? 5 : 1)))
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault()
      onChange(Math.max(0, safeCurrent - (e.key === 'PageUp' ? 5 : 1)))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onChange(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      onChange(max - 1)
    }
  }

  const displaySlice = safeCurrent + 1
  const topLabel = max > 0 ? 1 : 0

  return (
    <div
      className="absolute right-1.5 top-14 bottom-14 z-20 flex w-6 sm:w-7 flex-col items-center justify-between select-none touch-none pointer-events-auto bg-transparent"
      title={`Slice: ${displaySlice} of ${max}`}
      onWheel={handleWheel}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      tabIndex={0}
      role="slider"
      aria-label="Slice navigation"
      aria-valuenow={displaySlice}
      aria-valuemin={topLabel}
      aria-valuemax={max}
      onKeyDown={handleKeyDown}
    >
      {/* Top: initial 1-based value (1) */}
      <span className="font-mono text-[9px] sm:text-[10px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,1)] tabular-nums select-none">
        {topLabel}
      </span>

      {/* Middle: invisible track area, only the thumb is visible */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative my-1 flex-1 w-full cursor-pointer touch-none"
      >
        {/* Thumb: the only visible element of the scroll track */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-2 sm:w-2.5 rounded-full bg-[var(--color-accent)] border border-white/80 shadow-[0_1px_5px_rgba(0,0,0,0.95)] transition-[transform,background-color] duration-75 ${
            isDragging ? 'scale-125 brightness-110' : 'hover:scale-110'
          }`}
          style={{
            height: `${THUMB_HEIGHT}px`,
            top: `calc(${pct}% - ${(pct / 100) * THUMB_HEIGHT}px)`,
          }}
        />

        {/* Floating tooltip when dragging or hovered */}
        {(isDragging || isHovered) && (
          <div
            className="pointer-events-none absolute right-full mr-2 rounded bg-black/90 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white whitespace-nowrap shadow-lg border border-white/20"
            style={{
              top: `calc(${pct}% - ${(pct / 100) * THUMB_HEIGHT}px + ${THUMB_HEIGHT / 2}px)`,
              transform: 'translateY(-50%)',
            }}
          >
            {displaySlice} / {max}
          </div>
        )}
      </div>

      {/* Bottom: total slice count (max) */}
      <span className="font-mono text-[8px] sm:text-[9px] font-medium text-white/80 drop-shadow-[0_1px_3px_rgba(0,0,0,1)] tabular-nums select-none">
        {max}
      </span>
    </div>
  )
}
