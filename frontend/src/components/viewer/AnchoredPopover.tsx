import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
  /** Horizontal alignment relative to the anchor before viewport clamping. */
  align?: 'start' | 'center' | 'end'
}

const EDGE_MARGIN = 8
const ANCHOR_GAP = 6

/**
 * Renders `children` into a `document.body` portal, positioned with
 * `position: fixed` relative to `anchorRef`, instead of `position: absolute`
 * inside the toolbar.
 *
 * This fixes two real bugs the old in-place popovers had on mobile/tablet:
 *
 * 1. **Clipping.** The toolbar is `overflow-x-auto` below the `lg`
 *    breakpoint (so its buttons can scroll horizontally). Per the CSS
 *    overflow spec, setting only `overflow-x` forces the browser to compute
 *    `overflow-y` as `auto` too — there's no such thing as scrollable on one
 *    axis and visible on the other. That silently clipped anything that
 *    popped up above the toolbar's box, which is exactly what these
 *    popovers do. Rendering outside that container entirely sidesteps it.
 * 2. **Off-screen overflow.** The old popovers centered themselves under
 *    their trigger with no viewport awareness, so a button near the left or
 *    right edge (common in a horizontally-scrolled toolbar) could push the
 *    popover partly off-screen. This component measures itself and clamps
 *    its position to stay fully on-screen.
 *
 * Closing on outside interaction uses `pointerdown`, not `mousedown` — the
 * former also fires for touch/pen, so tapping outside on a touchscreen
 * closes the popover immediately instead of only responding to a mouse.
 */
export default function AnchoredPopover({ open, anchorRef, onClose, children, align = 'center' }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({
    position: 'fixed',
    top: 0,
    left: 0,
    visibility: 'hidden',
  })

  useLayoutEffect(() => {
    if (!open) return

    const reposition = () => {
      const anchor = anchorRef.current
      const popover = popoverRef.current
      if (!anchor || !popover) return

      const anchorRect = anchor.getBoundingClientRect()
      const popRect = popover.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight

      // Prefer opening above the anchor — the toolbar sits at the bottom of
      // the screen on mobile/tablet — and fall back below when there isn't
      // room (e.g. the desktop toolbar, which sits at the top).
      const fitsAbove = anchorRect.top - popRect.height - ANCHOR_GAP >= EDGE_MARGIN
      const top = fitsAbove
        ? anchorRect.top - popRect.height - ANCHOR_GAP
        : Math.min(anchorRect.bottom + ANCHOR_GAP, vh - popRect.height - EDGE_MARGIN)

      let left =
        align === 'start'
          ? anchorRect.left
          : align === 'end'
            ? anchorRect.right - popRect.width
            : anchorRect.left + anchorRect.width / 2 - popRect.width / 2

      // Clamp fully inside the viewport so it's never cut off at the edge.
      left = Math.max(EDGE_MARGIN, Math.min(left, vw - popRect.width - EDGE_MARGIN))

      setStyle({ position: 'fixed', top, left, visibility: 'visible' })
    }

    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, anchorRef, align])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose, anchorRef])

  // Reset so the next open doesn't briefly flash at the last-computed spot
  // before the layout effect above re-measures it.
  useEffect(() => {
    if (!open) setStyle((current) => ({ ...current, visibility: 'hidden' }))
  }, [open])

  if (!open) return null

  return createPortal(
    <div ref={popoverRef} style={style} className="z-[100]">
      {children}
    </div>,
    document.body,
  )
}
