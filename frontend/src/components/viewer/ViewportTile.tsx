import { useEffect, useRef } from 'react'
import { Enums as CoreEnums, EVENTS as Events } from '@cornerstonejs/core'
import type { StackViewport, Types } from '@cornerstonejs/core'
import { getRenderingEngine, getToolGroup } from '../../lib/cornerstoneSetup'
import { getSeriesImageIds } from '../../lib/seriesImageCache'
import { CINE_EVENTS, stopCine } from '../../lib/cine'
import type { SeriesRecord } from '../../types/dicom'
import { INITIAL_OVERLAY, type OverlayState } from '../../hooks/useDicomLayout'

interface Props {
  tileId: string
  cellIndex: number
  tileOffset: number
  series: SeriesRecord | null
  initialImageIndex?: number
  onActivate: (cellIndex: number, tileOffset: number) => void
  onOverlay: (cellIndex: number, tileOffset: number, overlay: OverlayState) => void
  onIndexChanged: (cellIndex: number, tileOffset: number, newIndex: number) => void
  onCineStateChanged: (cellIndex: number, playing: boolean) => void
  onViewportReady: (tileId: string, viewport: StackViewport) => void
  onViewportRemoved: (tileId: string) => void
  onCameraModified?: (tileId: string) => void
  onVoiModified?: (tileId: string) => void
  onStackNewImage?: (tileId: string) => void
}

export default function ViewportTile({
  tileId,
  cellIndex,
  tileOffset,
  series,
  initialImageIndex,
  onActivate,
  onOverlay,
  onIndexChanged,
  onCineStateChanged,
  onViewportReady,
  onViewportRemoved,
  onCameraModified,
  onVoiModified,
  onStackNewImage,
}: Props) {
  const elementRef = useRef<HTMLDivElement>(null)

  // Callback props are wrapped in refs so the mount effect (which only
  // re-runs when the tile identity or series changes) always calls the
  // latest version instead of capturing a stale closure from first mount.
  const onActivateRef = useRef(onActivate)
  onActivateRef.current = onActivate
  const onOverlayRef = useRef(onOverlay)
  onOverlayRef.current = onOverlay
  const onIndexChangedRef = useRef(onIndexChanged)
  onIndexChangedRef.current = onIndexChanged
  const onCineStateChangedRef = useRef(onCineStateChanged)
  onCineStateChangedRef.current = onCineStateChanged
  const onCameraModifiedRef = useRef(onCameraModified)
  onCameraModifiedRef.current = onCameraModified
  const onVoiModifiedRef = useRef(onVoiModified)
  onVoiModifiedRef.current = onVoiModified
  const onStackNewImageRef = useRef(onStackNewImage)
  onStackNewImageRef.current = onStackNewImage

  useEffect(() => {
    const element = elementRef.current
    const renderingEngine = getRenderingEngine()
    if (!element || !renderingEngine) return
    let cancelled = false

    renderingEngine.enableElement({
      viewportId: tileId,
      element,
      type: CoreEnums.ViewportType.STACK,
      defaultOptions: { background: [0, 0, 0] as Types.Point3 },
    })
    const toolGroup = getToolGroup()
    toolGroup?.addViewport(tileId, renderingEngine.id)
    const viewport = renderingEngine.getViewport(tileId) as StackViewport
    onViewportReady(tileId, viewport)

    const emitOverlay = () => {
      const props = viewport.getProperties()
      const imageIds = viewport.getImageIds()
      onOverlayRef.current(cellIndex, tileOffset, {
        imageIndex: viewport.getCurrentImageIdIndex(),
        imageCount: imageIds.length,
        windowWidth: props.voiRange ? Math.round(props.voiRange.upper - props.voiRange.lower) : 0,
        windowCenter: props.voiRange
          ? Math.round((props.voiRange.upper + props.voiRange.lower) / 2)
          : 0,
        zoomPercent: Math.round(viewport.getZoom() * 100),
        invert: !!props.invert,
      })
    }

    const handleOverlayEvent = () => emitOverlay()
    const handleCameraModified = () => {
      emitOverlay()
      onCameraModifiedRef.current?.(tileId)
    }
    const handleVoiModified = () => {
      emitOverlay()
      onVoiModifiedRef.current?.(tileId)
    }
    const handleNewImage = () => {
      emitOverlay()
      onIndexChangedRef.current(cellIndex, tileOffset, viewport.getCurrentImageIdIndex())
      onStackNewImageRef.current?.(tileId)
    }
    element.addEventListener(Events.STACK_NEW_IMAGE, handleNewImage as EventListener)
    element.addEventListener(Events.VOI_MODIFIED, handleVoiModified as EventListener)
    element.addEventListener(Events.CAMERA_MODIFIED, handleCameraModified as EventListener)
    element.addEventListener(Events.IMAGE_RENDERED, handleOverlayEvent as EventListener)

    // `pointerdown` (not `mousedown`) so tapping a tile activates it on
    // touch too — Cornerstone's touch tools call `preventDefault()` on the
    // underlying touch events, which can suppress the browser's synthetic
    // `mousedown` that would otherwise follow a tap.
    const handleActivate = () => onActivateRef.current(cellIndex, tileOffset)
    element.addEventListener('pointerdown', handleActivate)

    // Only tile 0 ever drives cine for a cell (see useDicomLayout's
    // playCell/pauseCell) — sibling tiles' image indices just follow along
    // via handleIndexChanged above, so only tile 0 needs to report cine
    // start/stop back up. This also catches cine stopping *itself* (a
    // non-looping clip reaching its last frame) so the Play/Pause button
    // doesn't stay stuck showing "Pause".
    let handleClipStarted: (() => void) | undefined
    let handleClipStopped: (() => void) | undefined
    if (tileOffset === 0) {
      handleClipStarted = () => onCineStateChangedRef.current(cellIndex, true)
      handleClipStopped = () => onCineStateChangedRef.current(cellIndex, false)
      element.addEventListener(CINE_EVENTS.CLIP_STARTED, handleClipStarted as EventListener)
      element.addEventListener(CINE_EVENTS.CLIP_STOPPED, handleClipStopped as EventListener)
    }

    async function load() {
      if (!series) {
        onOverlayRef.current(cellIndex, tileOffset, INITIAL_OVERLAY)
        return
      }
      const imageIds = await getSeriesImageIds(series)
      if (cancelled || imageIds.length === 0) return
      const targetIdx = initialImageIndex !== undefined
        ? Math.min(Math.max(initialImageIndex, 0), imageIds.length - 1)
        : Math.min(Math.max(tileOffset, 0), imageIds.length - 1)
      await viewport.setStack(imageIds, targetIdx)
      viewport.resetCamera()
      viewport.render()
      emitOverlay()
    }
    load()

    return () => {
      cancelled = true
      element.removeEventListener(Events.STACK_NEW_IMAGE, handleNewImage as EventListener)
      element.removeEventListener(Events.VOI_MODIFIED, handleVoiModified as EventListener)
      element.removeEventListener(Events.CAMERA_MODIFIED, handleCameraModified as EventListener)
      element.removeEventListener(Events.IMAGE_RENDERED, handleOverlayEvent as EventListener)
      element.removeEventListener('pointerdown', handleActivate)
      if (handleClipStarted) element.removeEventListener(CINE_EVENTS.CLIP_STARTED, handleClipStarted as EventListener)
      if (handleClipStopped) element.removeEventListener(CINE_EVENTS.CLIP_STOPPED, handleClipStopped as EventListener)
      // Cornerstone's cine interval keeps a reference to this element and
      // will keep firing (and erroring) against it once disableElement
      // below tears down its rendering state, if we don't explicitly stop
      // it first. Safe to call even when nothing is playing.
      stopCine(element)
      toolGroup?.removeViewports(renderingEngine.id, tileId)
      renderingEngine.disableElement(tileId)
      onViewportRemoved(tileId)
    }
    // Deliberately remount only when the tile identity or assigned series
    // changes — not on cellIndex/tileOffset (stable for a tile's lifetime)
    // or the callback props (handled via refs above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileId, series?.seriesInstanceUID])

  return (
    // touchAction: 'none' stops the browser from treating one/two-finger
    // drags here as page scroll/pinch-zoom, which would otherwise steal the
    // gesture before Cornerstone's pan/zoom/window-level/scroll tools see
    // it. Scoped to just the viewport element (not the whole page) so
    // scrolling elsewhere — the series drawer, popovers, etc. — is
    // unaffected.
    <div ref={elementRef} className="relative h-full w-full bg-black" style={{ touchAction: 'none' }}>
      {!series && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[10px] text-[var(--color-text-dim)]">Empty</span>
        </div>
      )}
    </div>
  )
}
