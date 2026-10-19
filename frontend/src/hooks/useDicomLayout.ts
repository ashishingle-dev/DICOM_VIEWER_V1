import { useCallback, useEffect, useRef, useState } from 'react'
import type { StackViewport } from '@cornerstonejs/core'
import {
  DEFAULT_NAV_BINDINGS,
  activateMeasurementTool,
  clearAllAnnotations,
  deleteSelectedAnnotations,
  ensureCornerstoneInitialized,
  exitMeasurementMode,
  getAnnotationCount,
  getNavBindings,
  getRenderingEngine,
  onAnnotationsChanged,
  purgeFileManager,
  setNavBindings,
  type MeasurementToolName,
  type NavBindingConfig,
} from '../lib/cornerstoneSetup'
import { startCine, stopCine } from '../lib/cine'
import { clearSeriesImageCache } from '../lib/seriesImageCache'
import { SINGLE, makeCells, type CellState, type GridSize } from '../types/layout'
import type { SeriesRecord } from '../types/dicom'

export interface OverlayState {
  imageIndex: number
  imageCount: number
  windowWidth: number
  windowCenter: number
  zoomPercent: number
  invert: boolean
}

export const INITIAL_OVERLAY: OverlayState = {
  imageIndex: 0,
  imageCount: 0,
  windowWidth: 0,
  windowCenter: 0,
  zoomPercent: 100,
  invert: false,
}

export function useDicomLayout() {
  const [isReady, setIsReady] = useState(false)
  const [outerLayout, setOuterLayoutState] = useState<GridSize>(SINGLE)
  const [cells, setCells] = useState<CellState[]>(() => makeCells(SINGLE, []))
  const [activeCellIndex, setActiveCellIndex] = useState(0)
  const [activeTileIndex, setActiveTileIndex] = useState(0)
  const [cellOverlays, setCellOverlays] = useState<OverlayState[]>(() => [INITIAL_OVERLAY])
  const [navBindings, setNavBindingsState] = useState<NavBindingConfig>(DEFAULT_NAV_BINDINGS)
  const [activeMeasurementTool, setActiveMeasurementTool] = useState<MeasurementToolName | null>(null)
  const [annotationCount, setAnnotationCount] = useState(0)

  // Cine (movie play). `playingCells` tracks which OUTER cells currently
  // have cine running — driven from tile 0 of each cell, whose sibling
  // tiles (if the cell is itself tiled into a sub-grid) follow along
  // automatically through the existing handleIndexChanged sync below, since
  // cine advances the driving tile's image index exactly the same way
  // manual scrolling does.
  const [playingCells, setPlayingCells] = useState<boolean[]>(() => [false])
  const [cineFps, setCineFpsState] = useState(10)
  const [cineLoop, setCineLoopState] = useState(true)
  const [simultaneousPlay, setSimultaneousPlayState] = useState(false)

  // --- Viewport Synchronization ---
  const [syncEnabled, setSyncEnabled] = useState(false)
  const syncEnabledRef = useRef(syncEnabled)
  syncEnabledRef.current = syncEnabled
  const isSyncingRef = useRef(false)
  const playingCellsRef = useRef(playingCells)
  playingCellsRef.current = playingCells

  // --- Double-Click-To-Explode (1x1 full viewport view) ---
  const [explodedCellIndex, setExplodedCellIndex] = useState<number | null>(null)

  const viewportsRef = useRef<Map<string, StackViewport>>(new Map())
  const cellsRef = useRef<CellState[]>(cells)
  cellsRef.current = cells
  const activeCellIndexRef = useRef(activeCellIndex)
  activeCellIndexRef.current = activeCellIndex
  const activeTileIndexRef = useRef(activeTileIndex)
  activeTileIndexRef.current = activeTileIndex
  /** Index (within its series) shown by tile 0 of each cell — the other
   *  tiles in that cell always show consecutive images after this one. Kept
   *  in a ref (not React state) since it's pure bookkeeping for synchronized
   *  scrolling, updated at native event speed. */
  const cellBaseIndexRef = useRef<number[]>([0])

  // Cornerstone init is independent of any specific DOM element — safe to
  // kick off once and let tiles attach themselves to it as they mount.
  useEffect(() => {
    let cancelled = false
    ensureCornerstoneInitialized().then(() => {
      if (!cancelled) {
        setNavBindingsState(getNavBindings())
        setIsReady(true)
      }
    })
    return () => {
      cancelled = true
      purgeFileManager()
      clearSeriesImageCache()
    }
  }, [])

  useEffect(() => {
    if (!isReady) return
    const handler = () => {
      setAnnotationCount(getAnnotationCount())
      for (const vp of viewportsRef.current.values()) vp.render()
    }
    handler()
    return onAnnotationsChanged(handler)
  }, [isReady])

  const registerViewport = useCallback((tileId: string, viewport: StackViewport) => {
    viewportsRef.current.set(tileId, viewport)
  }, [])

  const unregisterViewport = useCallback((tileId: string) => {
    viewportsRef.current.delete(tileId)
  }, [])

  const activeTileId = `${cells[activeCellIndex]?.id ?? 'cell-0'}__tile-${activeTileIndex}`

  const setOuterLayout = useCallback((layout: GridSize) => {
    setExplodedCellIndex(null)
    setCells((prev) => {
      const next = makeCells(layout, prev)
      cellBaseIndexRef.current = next.map((_, i) => cellBaseIndexRef.current[i] ?? 0)
      setCellOverlays((prevOverlays) =>
        next.map((_, i) => prevOverlays[i] ?? INITIAL_OVERLAY)
      )
      // Any cell dropped by shrinking the grid was already torn down by its
      // tiles unmounting (which stops their cine via ViewportTile's own
      // cleanup) — just trim our bookkeeping array to match.
      setPlayingCells((prev) => next.map((_, i) => prev[i] ?? false))
      setActiveCellIndex((idx) => {
        const clampedIdx = Math.min(idx, next.length - 1)
        const tileCount = next[clampedIdx]
          ? next[clampedIdx].imageLayout.rows * next[clampedIdx].imageLayout.cols
          : 1
        setActiveTileIndex((tileIdx) => Math.min(tileIdx, tileCount - 1))
        return clampedIdx
      })
      return next
    })
    setOuterLayoutState(layout)
  }, [])

  const setCellImageLayout = useCallback((cellIndex: number, layout: GridSize) => {
    setCells((prev) =>
      prev.map((cell, idx) => (idx === cellIndex ? { ...cell, imageLayout: layout } : cell))
    )
    cellBaseIndexRef.current[cellIndex] = 0
    setCellOverlays((prev) =>
      prev.map((o, idx) => (idx === cellIndex ? INITIAL_OVERLAY : o))
    )
    // Tile 0 (the cine "driving" tile) remounts when the sub-layout changes,
    // which tears down any running cine on it via ViewportTile's own
    // cleanup — just mirror that in our own playing-state bookkeeping.
    setPlayingCells((prev) => prev.map((p, idx) => (idx === cellIndex ? false : p)))
    if (cellIndex === activeCellIndexRef.current) {
      setActiveTileIndex((idx) => Math.min(idx, layout.rows * layout.cols - 1))
    }
  }, [])

  const assignSeriesToCell = useCallback(
    (cellIndex: number, seriesInstanceUID: string) => {
      setCells((prev) =>
        prev.map((cell, idx) =>
          idx === cellIndex ? { ...cell, seriesInstanceUID } : cell
        )
      )
      cellBaseIndexRef.current[cellIndex] = 0
      setCellOverlays((prev) => prev.map((o, idx) => (idx === cellIndex ? INITIAL_OVERLAY : o)))
      setPlayingCells((prev) => prev.map((p, idx) => (idx === cellIndex ? false : p)))
      if (cellIndex === activeCellIndexRef.current) {
        setActiveTileIndex(0)
      }
    },
    []
  )

  const assignSeriesToActiveCell = useCallback(
    (series: SeriesRecord) => {
      assignSeriesToCell(activeCellIndexRef.current, series.seriesInstanceUID)
    },
    [assignSeriesToCell]
  )

  const activateTile = useCallback((cellIndex: number, tileOffset: number) => {
    setActiveCellIndex(cellIndex)
    setActiveTileIndex(tileOffset)
  }, [])

  /** A tile reports its stats whenever they change; we only keep it if the
   *  tile is the "representative" one for its cell (the active tile, if this
   *  is the active cell — otherwise tile 0) so each cell's overlay reflects
   *  a single consistent viewport rather than whichever tile last fired. */
  const handleTileOverlay = useCallback((cellIndex: number, tileOffset: number, overlay: OverlayState) => {
    const representative = cellIndex === activeCellIndexRef.current ? activeTileIndexRef.current : 0
    if (tileOffset !== representative) return
    setCellOverlays((prev) => {
      if (cellIndex >= prev.length) return prev
      const next = [...prev]
      next[cellIndex] = overlay
      return next
    })
  }, [])

  /** Keeps every tile in a cell showing consecutive images: when any one of
   *  them scrolls (wheel, drag, or the stack-scroll tool via any bound
   *  button), the rest are pushed to keep the same relative offset. */
  const handleIndexChanged = useCallback((cellIndex: number, tileOffset: number, newIndex: number) => {
    const cell = cellsRef.current[cellIndex]
    if (!cell) return
    const tileCount = cell.imageLayout.rows * cell.imageLayout.cols
    if (tileCount <= 1) {
      cellBaseIndexRef.current[cellIndex] = newIndex
      return
    }
    const newBase = newIndex - tileOffset
    if (cellBaseIndexRef.current[cellIndex] === newBase) return
    cellBaseIndexRef.current[cellIndex] = newBase

    for (let k = 0; k < tileCount; k++) {
      if (k === tileOffset) continue
      const siblingId = `${cell.id}__tile-${k}`
      const vp = viewportsRef.current.get(siblingId)
      if (!vp) continue
      const imageIds = vp.getImageIds()
      if (imageIds.length === 0) continue
      const targetIdx = Math.min(Math.max(newBase + k, 0), imageIds.length - 1)
      if (vp.getCurrentImageIdIndex() !== targetIdx) {
        vp.setImageIdIndex(targetIdx).catch(() => {})
      }
    }
  }, [])

  const handleCameraModified = useCallback((sourceTileId: string) => {
    if (!syncEnabledRef.current || isSyncingRef.current) return
    const sourceVp = viewportsRef.current.get(sourceTileId)
    if (!sourceVp) return
    isSyncingRef.current = true
    try {
      const zoom = sourceVp.getZoom()
      const pan = sourceVp.getPan()
      for (const [id, targetVp] of viewportsRef.current.entries()) {
        if (id === sourceTileId) continue
        if (targetVp.getImageIds().length === 0) continue
        targetVp.setZoom(zoom)
        targetVp.setPan(pan)
        targetVp.render()
      }
    } catch {
      // ignore
    } finally {
      isSyncingRef.current = false
    }
  }, [])

  const handleVoiModified = useCallback((sourceTileId: string) => {
    if (!syncEnabledRef.current || isSyncingRef.current) return
    const sourceVp = viewportsRef.current.get(sourceTileId)
    if (!sourceVp) return
    isSyncingRef.current = true
    try {
      const props = sourceVp.getProperties()
      if (!props.voiRange) return
      for (const [id, targetVp] of viewportsRef.current.entries()) {
        if (id === sourceTileId) continue
        if (targetVp.getImageIds().length === 0) continue
        targetVp.setProperties({
          voiRange: { ...props.voiRange },
          invert: props.invert,
        })
        targetVp.render()
      }
    } catch {
      // ignore
    } finally {
      isSyncingRef.current = false
    }
  }, [])

  const handleStackNewImage = useCallback((sourceTileId: string) => {
    if (!syncEnabledRef.current || isSyncingRef.current) return
    if (playingCellsRef.current.some(Boolean)) return
    const sourceVp = viewportsRef.current.get(sourceTileId)
    if (!sourceVp) return
    const sourceImages = sourceVp.getImageIds()
    if (sourceImages.length <= 1) return

    isSyncingRef.current = true
    try {
      const sourceIdx = sourceVp.getCurrentImageIdIndex()
      const ratio = sourceIdx / (sourceImages.length - 1)

      for (const [id, targetVp] of viewportsRef.current.entries()) {
        if (id === sourceTileId) continue
        const targetImages = targetVp.getImageIds()
        if (targetImages.length <= 1) continue
        const targetIdx = Math.round(ratio * (targetImages.length - 1))
        if (targetVp.getCurrentImageIdIndex() !== targetIdx) {
          targetVp.setImageIdIndex(targetIdx).catch(() => {})
        }
      }
    } catch {
      // ignore
    } finally {
      setTimeout(() => {
        isSyncingRef.current = false
      }, 50)
    }
  }, [])

  const toggleSync = useCallback(() => {
    setSyncEnabled((prev) => {
      const next = !prev
      if (next) {
        // Immediately sync from current active tile to other loaded viewports
        const currentActiveCell = cellsRef.current[activeCellIndexRef.current]
        const activeTile = `${currentActiveCell?.id ?? 'cell-0'}__tile-${activeTileIndexRef.current}`
        const activeVp = viewportsRef.current.get(activeTile)
        if (activeVp && activeVp.getImageIds().length > 0) {
          isSyncingRef.current = true
          try {
            const zoom = activeVp.getZoom()
            const pan = activeVp.getPan()
            const props = activeVp.getProperties()
            const images = activeVp.getImageIds()
            const idx = activeVp.getCurrentImageIdIndex()
            const ratio = images.length > 1 ? idx / (images.length - 1) : 0

            for (const [id, targetVp] of viewportsRef.current.entries()) {
              if (id === activeTile) continue
              const targetImages = targetVp.getImageIds()
              if (targetImages.length === 0) continue
              targetVp.setZoom(zoom)
              targetVp.setPan(pan)
              if (props.voiRange) {
                targetVp.setProperties({ voiRange: { ...props.voiRange }, invert: props.invert })
              }
              if (targetImages.length > 1 && ratio > 0) {
                const targetIdx = Math.round(ratio * (targetImages.length - 1))
                targetVp.setImageIdIndex(targetIdx).catch(() => {})
              }
              targetVp.render()
            }
          } catch {
            // ignore
          } finally {
            setTimeout(() => {
              isSyncingRef.current = false
            }, 50)
          }
        }
      } else {
        isSyncingRef.current = false
      }
      return next
    })
  }, [])

  // --- Double-Click-To-Explode (1x1 full viewport view) ---

  const toggleExplodeCell = useCallback((cellIndex: number) => {
    const isSingleOuter = outerLayout.rows === 1 && outerLayout.cols === 1
    const cell = cellsRef.current[cellIndex]
    const isSingleTile = !cell || (cell.imageLayout.rows === 1 && cell.imageLayout.cols === 1)
    if (isSingleOuter && isSingleTile) {
      return
    }

    setExplodedCellIndex((current) => {
      const next = current === cellIndex ? null : cellIndex
      if (next !== null) {
        setActiveCellIndex(cellIndex)
      }
      requestAnimationFrame(() => {
        const engine = getRenderingEngine()
        if (engine) {
          try {
            engine.resize(true, true)
            for (const c of cellsRef.current) {
              const tileCount = c.imageLayout.rows * c.imageLayout.cols
              for (let t = 0; t < tileCount; t++) {
                const vp = engine.getViewport(`${c.id}__tile-${t}`)
                vp?.render()
              }
            }
          } catch {
            // ignore
          }
        }
      })
      return next
    })
  }, [outerLayout.rows, outerLayout.cols])

  const scrollCellToIndex = useCallback(
    (cellIndex: number, newIndex: number) => {
      const cell = cellsRef.current[cellIndex]
      if (!cell) return
      const tile0Id = `${cell.id}__tile-0`
      const vp = viewportsRef.current.get(tile0Id)
      if (!vp) return
      const imageIds = vp.getImageIds()
      if (imageIds.length === 0) return
      const targetIdx = Math.min(Math.max(newIndex, 0), imageIds.length - 1)
      if (vp.getCurrentImageIdIndex() !== targetIdx) {
        vp.setImageIdIndex(targetIdx)
          .then(() => {
            if (syncEnabledRef.current) {
              handleStackNewImage(tile0Id)
            }
          })
          .catch(() => {})
      }
    },
    [handleStackNewImage],
  )

  const updateNavBindings = useCallback((config: NavBindingConfig) => {
    setNavBindings(config)
    setNavBindingsState(config)
  }, [])

  // --- Cine (movie play) -----------------------------------------------

  const getDrivingElement = useCallback((cellIndex: number): HTMLDivElement | null => {
    const cell = cellsRef.current[cellIndex]
    if (!cell) return null
    const viewport = viewportsRef.current.get(`${cell.id}__tile-0`)
    return viewport?.element ?? null
  }, [])

  const playCell = useCallback(
    (cellIndex: number, fps: number, loop: boolean) => {
      const cell = cellsRef.current[cellIndex]
      if (!cell?.seriesInstanceUID) return
      const element = getDrivingElement(cellIndex)
      if (!element) return
      startCine(element, { framesPerSecond: fps, loop })
      setPlayingCells((prev) => {
        const next = [...prev]
        next[cellIndex] = true
        return next
      })
    },
    [getDrivingElement]
  )

  const pauseCell = useCallback(
    (cellIndex: number) => {
      const element = getDrivingElement(cellIndex)
      if (element) stopCine(element)
      setPlayingCells((prev) => {
        if (!prev[cellIndex]) return prev
        const next = [...prev]
        next[cellIndex] = false
        return next
      })
    },
    [getDrivingElement]
  )

  /** The single Play/Pause control's scope depends on `simultaneousPlay`:
   *  off — toggles only the active cell; on — toggles every cell that has a
   *  series loaded, so a 2×2 (etc.) grid of series plays back in lockstep. */
  const togglePlayback = useCallback(() => {
    if (simultaneousPlay) {
      const anyPlaying = playingCells.some(Boolean)
      cellsRef.current.forEach((cell, idx) => {
        if (!cell.seriesInstanceUID) return
        if (anyPlaying) pauseCell(idx)
        else playCell(idx, cineFps, cineLoop)
      })
    } else {
      const idx = activeCellIndexRef.current
      if (playingCells[idx]) pauseCell(idx)
      else playCell(idx, cineFps, cineLoop)
    }
  }, [simultaneousPlay, playingCells, cineFps, cineLoop, playCell, pauseCell])

  /** Restarts whichever cells are currently playing with a new fps/loop —
   *  Cornerstone's playClip already stops-then-restarts on the same
   *  element, so this is just "call playCell again on the playing ones". */
  const restartPlayingCells = useCallback(
    (fps: number, loop: boolean) => {
      playingCells.forEach((playing, idx) => {
        if (playing) playCell(idx, fps, loop)
      })
    },
    [playingCells, playCell]
  )

  const setCineFps = useCallback(
    (fps: number) => {
      const clamped = Math.min(Math.max(Math.round(fps), 1), 60)
      setCineFpsState(clamped)
      restartPlayingCells(clamped, cineLoop)
    },
    [cineLoop, restartPlayingCells]
  )

  const setCineLoop = useCallback(
    (loop: boolean) => {
      setCineLoopState(loop)
      restartPlayingCells(cineFps, loop)
    },
    [cineFps, restartPlayingCells]
  )

  /** Turning simultaneous ON while something is already playing extends
   *  playback to every other series-bearing cell, for continuity. Turning
   *  it OFF pauses every cell except the active one, so switching back to
   *  "single" mode doesn't silently leave several panes playing at once. */
  const setSimultaneousPlay = useCallback(
    (value: boolean) => {
      setSimultaneousPlayState(value)
      if (value) {
        if (playingCells.some(Boolean)) {
          cellsRef.current.forEach((cell, idx) => {
            if (cell.seriesInstanceUID && !playingCells[idx]) playCell(idx, cineFps, cineLoop)
          })
        }
      } else {
        const activeIdx = activeCellIndexRef.current
        playingCells.forEach((playing, idx) => {
          if (playing && idx !== activeIdx) pauseCell(idx)
        })
      }
    },
    [playingCells, cineFps, cineLoop, playCell, pauseCell]
  )

  /** Tile 0 of a cell reports CLIP_STARTED/CLIP_STOPPED so our playing-state
   *  stays correct even when cine stops itself (non-looping clip reaching
   *  the end) rather than through our own pauseCell(). */
  const handleCineStateChanged = useCallback((cellIndex: number, playing: boolean) => {
    setPlayingCells((prev) => {
      if (prev[cellIndex] === playing) return prev
      const next = [...prev]
      next[cellIndex] = playing
      return next
    })
  }, [])

  // Stop every playing cine on unmount (leaving the viewer page entirely) —
  // per-cell stops on series/layout change are handled above, and per-tile
  // stops on ordinary unmount are handled in ViewportTile itself, but this
  // covers stopping cleanly rather than relying on element teardown order.
  useEffect(() => {
    return () => {
      for (const vp of viewportsRef.current.values()) {
        stopCine(vp.element)
      }
    }
  }, [])

  // --- End cine -----------------------------------------------------------

  const selectMeasurementTool = useCallback((toolName: MeasurementToolName) => {
    activateMeasurementTool(toolName)
    setActiveMeasurementTool(toolName)
  }, [])

  const exitMeasurement = useCallback(() => {
    exitMeasurementMode()
    setActiveMeasurementTool(null)
  }, [])

  const clearAnnotations = useCallback(() => {
    clearAllAnnotations()
    for (const vp of viewportsRef.current.values()) vp.render()
  }, [])

  const deleteSelected = useCallback(() => {
    const removed = deleteSelectedAnnotations()
    for (const vp of viewportsRef.current.values()) vp.render()
    return removed
  }, [])

  const resetActiveView = useCallback(() => {
    const viewport = viewportsRef.current.get(activeTileId)
    if (!viewport) return
    viewport.resetCamera()
    viewport.resetProperties()
    viewport.render()
  }, [activeTileId])

  const toggleInvertActive = useCallback(() => {
    const viewport = viewportsRef.current.get(activeTileId)
    if (!viewport) return
    const props = viewport.getProperties()
    viewport.setProperties({ invert: !props.invert })
    viewport.render()
  }, [activeTileId])

  return {
    isReady,
    outerLayout,
    setOuterLayout,
    cells,
    setCellImageLayout,
    assignSeriesToActiveCell,
    assignSeriesToCell,
    activeCellIndex,
    activeTileIndex,
    activateTile,
    cellOverlays,
    activeOverlay: cellOverlays[activeCellIndex] ?? INITIAL_OVERLAY,
    handleTileOverlay,
    handleIndexChanged,
    scrollCellToIndex,
    navBindings,
    updateNavBindings,
    activeMeasurementTool,
    selectMeasurementTool,
    exitMeasurement,
    annotationCount,
    clearAnnotations,
    deleteSelected,
    resetActiveView,
    toggleInvertActive,
    registerViewport,
    unregisterViewport,
    // sync
    syncEnabled,
    toggleSync,
    setSyncEnabled,
    handleCameraModified,
    handleVoiModified,
    handleStackNewImage,
    // explode
    explodedCellIndex,
    toggleExplodeCell,
    setExplodedCellIndex,
    // cine
    playingCells,
    isActiveCellPlaying: playingCells[activeCellIndex] ?? false,
    isAnyCellPlaying: playingCells.some(Boolean),
    cineFps,
    cineLoop,
    simultaneousPlay,
    togglePlayback,
    setCineFps,
    setCineLoop,
    setSimultaneousPlay,
    handleCineStateChanged,
  }
}
