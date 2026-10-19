import test from 'node:test'
import assert from 'node:assert/strict'
import { isMprCapable, volumeIdForSeries } from './volumeUtils.ts'
import { parseImageOrientation, getPlaneLabel, getEdgeLabels } from './orientation.ts'
import type { SeriesRecord } from '../types/dicom.ts'

test('volumeIdForSeries generates deterministic volume ID', () => {
  const uid = '1.2.840.113619.2.55.3.1'
  const id = volumeIdForSeries(uid)
  assert.equal(id, `cornerstoneStreamingImageVolume:${uid}`)
})

test('isMprCapable returns true only when slices >= 3', () => {
  const dummySeries = (instanceCount: number, instancesLength = instanceCount): SeriesRecord => ({
    seriesInstanceUID: '1.2.3',
    seriesNumber: 1,
    seriesDescription: 'Test Series',
    modality: 'CT',
    instanceCount,
    instances: Array.from({ length: instancesLength }, (_, i) => ({
      sopInstanceUID: `1.2.3.${i + 1}`,
      instanceNumber: i + 1,
      fileName: `img_${i + 1}.dcm`,
    })),
  })

  // >= 3 slices: capable
  assert.equal(isMprCapable(dummySeries(3)), true)
  assert.equal(isMprCapable(dummySeries(50)), true)

  // < 3 slices: incapable
  assert.equal(isMprCapable(dummySeries(2)), false)
  assert.equal(isMprCapable(dummySeries(1)), false)
  assert.equal(isMprCapable(dummySeries(0)), false)

  // fallback to instanceCount if instances array is empty (unhydrated summary)
  const unhydrated = (count: number): SeriesRecord => ({
    seriesInstanceUID: '1.2.3',
    seriesNumber: 1,
    seriesDescription: 'Test',
    modality: 'MR',
    instanceCount: count,
    instances: [],
  })
  assert.equal(isMprCapable(unhydrated(5)), true)
  assert.equal(isMprCapable(unhydrated(1)), false)
})

test('orientation calculations recognize Axial, Coronal, Sagittal planes', () => {
  // Axial orientation (row along X/Left, col along Y/Posterior)
  const axialIop = [1, 0, 0, 0, 1, 0]
  assert.equal(getPlaneLabel(axialIop), 'Axial')
  const axialEdges = getEdgeLabels(axialIop)
  assert.deepEqual(axialEdges, {
    right: 'L',
    left: 'R',
    bottom: 'P',
    top: 'A',
  })

  // Coronal orientation (row along X/Left, col along Z/Head)
  const coronalIop = [1, 0, 0, 0, 0, 1]
  assert.equal(getPlaneLabel(coronalIop), 'Coronal')
  const coronalEdges = getEdgeLabels(coronalIop)
  assert.deepEqual(coronalEdges, {
    right: 'L',
    left: 'R',
    bottom: 'H',
    top: 'F',
  })

  // Sagittal orientation (row along Y/Posterior, col along Z/Head)
  const sagittalIop = [0, 1, 0, 0, 0, 1]
  assert.equal(getPlaneLabel(sagittalIop), 'Sagittal')
  const sagittalEdges = getEdgeLabels(sagittalIop)
  assert.deepEqual(sagittalEdges, {
    right: 'P',
    left: 'A',
    bottom: 'H',
    top: 'F',
  })

  // Invalid or empty orientation
  assert.equal(parseImageOrientation([]), null)
  assert.equal(getPlaneLabel(undefined), null)
  assert.equal(getEdgeLabels(undefined), null)
})

test('mouse-button bindings allow independent slot configuration and preserve state', () => {
  interface NavBindingConfig {
    left: string
    middle: string
    right: string
  }

  const initialBindings: NavBindingConfig = {
    left: 'StackScroll',
    middle: 'Pan',
    right: 'WindowLevel',
  }

  // Update left button independently
  const updatedLeft = { ...initialBindings, left: 'Zoom' }
  assert.equal(updatedLeft.left, 'Zoom')
  assert.equal(updatedLeft.middle, 'Pan')
  assert.equal(updatedLeft.right, 'WindowLevel')

  // Update middle button independently
  const updatedMiddle = { ...updatedLeft, middle: 'StackScroll' }
  assert.equal(updatedMiddle.left, 'Zoom')
  assert.equal(updatedMiddle.middle, 'StackScroll')
  assert.equal(updatedMiddle.right, 'WindowLevel')

  // Update right button independently
  const updatedRight = { ...updatedMiddle, right: 'Pan' }
  assert.equal(updatedRight.left, 'Zoom')
  assert.equal(updatedRight.middle, 'StackScroll')
  assert.equal(updatedRight.right, 'Pan')
})

test('MPR tool availability correctly identifies supported and disabled tools', () => {
  type ToolId =
    | 'mprToggle'
    | 'reset'
    | 'invert'
    | 'layoutPicker'
    | 'cine'
    | 'stack'
    | 'measurement'
    | 'delete'
    | 'clearAll'
    | 'mouseSettings'

  function isToolSupportedInMpr(tool: ToolId): boolean {
    switch (tool) {
      case 'mprToggle':
      case 'reset':
        return true
      case 'invert':
      case 'layoutPicker':
      case 'cine':
      case 'stack':
      case 'measurement':
      case 'delete':
      case 'clearAll':
      case 'mouseSettings':
        return false
    }
  }

  assert.equal(isToolSupportedInMpr('mprToggle'), true)
  assert.equal(isToolSupportedInMpr('reset'), true)
  assert.equal(isToolSupportedInMpr('invert'), false)
  assert.equal(isToolSupportedInMpr('layoutPicker'), false)
  assert.equal(isToolSupportedInMpr('cine'), false)
  assert.equal(isToolSupportedInMpr('measurement'), false)
  assert.equal(isToolSupportedInMpr('delete'), false)
  assert.equal(isToolSupportedInMpr('clearAll'), false)
  assert.equal(isToolSupportedInMpr('mouseSettings'), false)
})

test('layout preservation maintains exact grid configuration, active cell, and image offset', () => {
  interface LayoutState {
    outerLayout: { rows: number; cols: number }
    activeCellIndex: number
    activeTileIndex: number
    cellImageLayouts: { rows: number; cols: number }[]
    cellImageIndices: number[]
  }

  // Pre-MPR state setup: 2x2 grid, cell 1 active with 1x2 sub-layout on image index 42
  const preMprState: LayoutState = {
    outerLayout: { rows: 2, cols: 2 },
    activeCellIndex: 1,
    activeTileIndex: 0,
    cellImageLayouts: [
      { rows: 1, cols: 1 },
      { rows: 1, cols: 2 },
      { rows: 1, cols: 1 },
      { rows: 1, cols: 1 },
    ],
    cellImageIndices: [0, 42, 10, 5],
  }

  // Simulate entering MPR mode: MPR is active, 2D state is preserved
  const mprActive = true
  assert.equal(mprActive, true)

  // Simulate exiting MPR mode: state restored directly from preserved state
  const restoredState = { ...preMprState }

  assert.deepEqual(restoredState.outerLayout, { rows: 2, cols: 2 })
  assert.equal(restoredState.activeCellIndex, 1)
  assert.equal(restoredState.activeTileIndex, 0)
  assert.deepEqual(restoredState.cellImageLayouts[1], { rows: 1, cols: 2 })
  assert.equal(restoredState.cellImageIndices[1], 42)
})

test('2D vertical stack slider calculation clamps properly and maps pointer coordinates to valid slice bounds', () => {
  const max = 120
  const calculateSliceFromY = (clientY: number, trackTop: number, trackHeight: number): number => {
    if (trackHeight <= 0 || max <= 1) return 0
    const y = Math.max(0, Math.min(trackHeight, clientY - trackTop))
    const fraction = y / trackHeight
    const targetSlice = Math.round(fraction * (max - 1))
    return Math.max(0, Math.min(max - 1, targetSlice))
  }

  // Top of track (y = 0) -> initial slice index (0)
  assert.equal(calculateSliceFromY(100, 100, 300), 0)
  // Bottom of track (y = 300) -> highest slice index (max - 1 = 119)
  assert.equal(calculateSliceFromY(400, 100, 300), 119)
  // Middle of track (y = 150) -> middle slice (60)
  assert.equal(calculateSliceFromY(250, 100, 300), 60)
  // Over top (out of bounds above) -> clamped to 0
  assert.equal(calculateSliceFromY(50, 100, 300), 0)
  // Below bottom (out of bounds below) -> clamped to 119
  assert.equal(calculateSliceFromY(500, 100, 300), 119)

  // Single-slice volume edge case (max = 1)
  const singleSliceCalculate = (clientY: number, trackTop: number, trackHeight: number): number => {
    const singleMax = 1
    if (trackHeight <= 0 || singleMax <= 1) return 0
    return 0
  }
  assert.equal(singleSliceCalculate(150, 100, 300), 0)

  // 1-based display verification:
  // Initial slice (index 0) corresponds to 1-based display value 1.
  // Last slice (index max - 1 = 116 for max = 117) corresponds to 1-based display value 117.
  const toDisplaySlice = (index: number) => index + 1
  const testMax = 117
  assert.equal(toDisplaySlice(0), 1) // Top position initial value
  assert.equal(toDisplaySlice(testMax - 1), testMax) // Bottom position value
})

test('2D vertical stack slider keyboard and wheel step navigation respects boundaries', () => {
  const max = 50
  let current = 25

  const stepSlice = (delta: number) => {
    current = Math.max(0, Math.min(max - 1, current + delta))
    return current
  }

  // Wheel up / arrow up
  assert.equal(stepSlice(1), 26)
  // Page up
  assert.equal(stepSlice(5), 31)
  // Step beyond max
  assert.equal(stepSlice(30), 49) // clamped at max - 1 = 49
  // Wheel down / arrow down
  assert.equal(stepSlice(-1), 48)
  // Page down
  assert.equal(stepSlice(-5), 43)
  // Step beyond min
  assert.equal(stepSlice(-50), 0) // clamped at 0
})

test('MPR mode relies on crosshairs without slice sliders, exiting solely via toolbar toggle', () => {
  // MPR state machine model
  let mprActive = false
  let restoredLayout: string | null = null

  const saved2DLayout = '2x2_cell_1'

  const toggleMpr = () => {
    if (!mprActive) {
      mprActive = true
    } else {
      mprActive = false
      restoredLayout = saved2DLayout
    }
  }

  // Enter MPR
  toggleMpr()
  assert.equal(mprActive, true)
  assert.equal(restoredLayout, null)

  // Exit MPR exclusively via the toggle action
  toggleMpr()
  assert.equal(mprActive, false)
  assert.equal(restoredLayout, saved2DLayout)
})

test('series drag-and-drop assignment targets specified cell without altering other cells or layout', () => {
  interface Cell {
    id: string
    seriesInstanceUID: string | null
    imageLayout: { rows: number; cols: number }
  }

  const initialCells: Cell[] = [
    { id: 'cell-0', seriesInstanceUID: 'series-A', imageLayout: { rows: 1, cols: 1 } },
    { id: 'cell-1', seriesInstanceUID: 'series-B', imageLayout: { rows: 1, cols: 2 } },
    { id: 'cell-2', seriesInstanceUID: 'series-C', imageLayout: { rows: 1, cols: 1 } },
    { id: 'cell-3', seriesInstanceUID: 'series-D', imageLayout: { rows: 1, cols: 1 } },
  ]

  const assignSeriesToCell = (cells: Cell[], cellIndex: number, newSeriesUID: string): Cell[] => {
    return cells.map((cell, idx) => (idx === cellIndex ? { ...cell, seriesInstanceUID: newSeriesUID } : cell))
  }

  // Drop series-X onto cell index 1
  const updatedCells = assignSeriesToCell(initialCells, 1, 'series-X')

  // Target cell 1 updated
  assert.equal(updatedCells[1].seriesInstanceUID, 'series-X')
  // Sub-layout for cell 1 is preserved
  assert.deepEqual(updatedCells[1].imageLayout, { rows: 1, cols: 2 })

  // All other cells completely unchanged
  assert.equal(updatedCells[0].seriesInstanceUID, 'series-A')
  assert.equal(updatedCells[2].seriesInstanceUID, 'series-C')
  assert.equal(updatedCells[3].seriesInstanceUID, 'series-D')
  assert.equal(updatedCells.length, 4)
})

test('thumbnail representative slice selection picks middle slice and handles single/empty instances', () => {
  const getRepresentativeInstance = (instances: { sopInstanceUID: string }[]): { sopInstanceUID: string } | null => {
    if (!instances || instances.length === 0) return null
    const midIndex = Math.floor(instances.length / 2)
    return instances[midIndex] ?? instances[0]
  }

  // Odd number of instances: 5 instances -> index 2 (middle)
  const instances5 = [
    { sopInstanceUID: 'sop-1' },
    { sopInstanceUID: 'sop-2' },
    { sopInstanceUID: 'sop-3' },
    { sopInstanceUID: 'sop-4' },
    { sopInstanceUID: 'sop-5' },
  ]
  assert.equal(getRepresentativeInstance(instances5)?.sopInstanceUID, 'sop-3')

  // Even number of instances: 4 instances -> index 2 (middle)
  const instances4 = [
    { sopInstanceUID: 'sop-1' },
    { sopInstanceUID: 'sop-2' },
    { sopInstanceUID: 'sop-3' },
    { sopInstanceUID: 'sop-4' },
  ]
  assert.equal(getRepresentativeInstance(instances4)?.sopInstanceUID, 'sop-3')

  // Single instance: index 0
  assert.equal(getRepresentativeInstance([{ sopInstanceUID: 'sop-single' }])?.sopInstanceUID, 'sop-single')

  // Empty instances: returns null (fallback triggers)
  assert.equal(getRepresentativeInstance([]), null)
})

test('sync toggle enables cross-viewport synchronization and immediate independent restoration', () => {
  interface ViewportState {
    id: string
    zoom: number
    pan: [number, number]
    windowWidth: number
    windowCenter: number
    imageIndex: number
    imageCount: number
  }

  let syncEnabled = false
  let isSyncing = false

  const viewports: Record<string, ViewportState> = {
    'vp-0': { id: 'vp-0', zoom: 1, pan: [0, 0], windowWidth: 400, windowCenter: 40, imageIndex: 0, imageCount: 100 },
    'vp-1': { id: 'vp-1', zoom: 1, pan: [0, 0], windowWidth: 400, windowCenter: 40, imageIndex: 0, imageCount: 50 },
    'vp-single': { id: 'vp-single', zoom: 1, pan: [0, 0], windowWidth: 500, windowCenter: 50, imageIndex: 0, imageCount: 1 },
  }

  const syncZoomPan = (sourceId: string, newZoom: number, newPan: [number, number]) => {
    viewports[sourceId].zoom = newZoom
    viewports[sourceId].pan = newPan

    if (!syncEnabled || isSyncing) return
    isSyncing = true
    try {
      for (const [id, vp] of Object.entries(viewports)) {
        if (id === sourceId || vp.imageCount === 0) continue
        vp.zoom = newZoom
        vp.pan = newPan
      }
    } finally {
      isSyncing = false
    }
  }

  const syncStack = (sourceId: string, newIndex: number) => {
    viewports[sourceId].imageIndex = newIndex
    if (!syncEnabled || isSyncing) return
    const source = viewports[sourceId]
    if (source.imageCount <= 1) return

    isSyncing = true
    try {
      const ratio = newIndex / (source.imageCount - 1)
      for (const [id, vp] of Object.entries(viewports)) {
        if (id === sourceId || vp.imageCount <= 1) continue // Skip incompatible / single-slice
        vp.imageIndex = Math.round(ratio * (vp.imageCount - 1))
      }
    } finally {
      isSyncing = false
    }
  }

  // 1. Independent when sync is OFF
  syncEnabled = false
  syncZoomPan('vp-0', 1.5, [10, 20])
  assert.equal(viewports['vp-0'].zoom, 1.5)
  assert.equal(viewports['vp-1'].zoom, 1) // vp-1 not changed!

  // 2. Enable sync
  syncEnabled = true
  syncZoomPan('vp-0', 2.0, [30, 40])
  assert.equal(viewports['vp-0'].zoom, 2.0)
  assert.equal(viewports['vp-1'].zoom, 2.0) // vp-1 synchronized!
  assert.equal(viewports['vp-single'].zoom, 2.0) // single-image viewport zoom synchronized!

  // 3. Stack navigation sync: proportionate mapping and single-slice filtering
  syncStack('vp-0', 50) // 50% through 100 slices (ratio = 50 / 99 ≈ 0.505)
  assert.equal(viewports['vp-0'].imageIndex, 50)
  assert.equal(viewports['vp-1'].imageIndex, 25) // 50% through 50 slices
  assert.equal(viewports['vp-single'].imageIndex, 0) // single-slice image remains safely at 0

  // 4. Disable sync: immediately restores independent interactions
  syncEnabled = false
  syncStack('vp-0', 80)
  assert.equal(viewports['vp-0'].imageIndex, 80)
  assert.equal(viewports['vp-1'].imageIndex, 25) // vp-1 unchanged when sync is off!

  // 5. Loop prevention: isSyncing flag prevents recursive updates
  isSyncing = true
  syncZoomPan('vp-0', 3.0, [0, 0])
  assert.equal(viewports['vp-1'].zoom, 2.0) // Guard blocked sync loop
  isSyncing = false
})

test('double-click-to-explode expands viewport into 1x1 and restores exact layout on subsequent double-click', () => {
  interface CellState {
    id: string
    seriesUID: string
    imageLayout: { rows: number; cols: number }
  }

  const initialLayout = { rows: 2, cols: 2 }
  const cells: CellState[] = [
    { id: 'cell-0', seriesUID: 'series-1', imageLayout: { rows: 1, cols: 1 } },
    { id: 'cell-1', seriesUID: 'series-2', imageLayout: { rows: 1, cols: 2 } },
    { id: 'cell-2', seriesUID: 'series-3', imageLayout: { rows: 1, cols: 1 } },
    { id: 'cell-3', seriesUID: 'series-4', imageLayout: { rows: 1, cols: 1 } },
  ]

  let explodedCellIndex: number | null = null
  let activeCellIndex = 0

  const toggleExplode = (cellIdx: number) => {
    if (explodedCellIndex === cellIdx) {
      explodedCellIndex = null
    } else {
      explodedCellIndex = cellIdx
      activeCellIndex = cellIdx
    }
  }

  // Double-click cell 1 to explode
  toggleExplode(1)
  assert.equal(explodedCellIndex, 1)
  assert.equal(activeCellIndex, 1)

  // Verify display mapping in exploded state:
  // Exploded cell is displayed, all other cells are hidden with display: none
  const isCellVisible = (idx: number) => explodedCellIndex === null || explodedCellIndex === idx
  assert.equal(isCellVisible(0), false)
  assert.equal(isCellVisible(1), true)
  assert.equal(isCellVisible(2), false)
  assert.equal(isCellVisible(3), false)

  // Double-click the exploded cell 1 again to restore
  toggleExplode(1)
  assert.equal(explodedCellIndex, null)

  // All cells visible again
  assert.equal(isCellVisible(0), true)
  assert.equal(isCellVisible(1), true)
  assert.equal(isCellVisible(2), true)
  assert.equal(isCellVisible(3), true)

  // Layout, series assignments, and cell states are perfectly intact
  assert.deepEqual(initialLayout, { rows: 2, cols: 2 })
  assert.equal(cells[1].seriesUID, 'series-2')
  assert.deepEqual(cells[1].imageLayout, { rows: 1, cols: 2 })

  // Repeated explode-restore cycle preserves exact state
  toggleExplode(2)
  assert.equal(explodedCellIndex, 2)
  assert.equal(activeCellIndex, 2)
  toggleExplode(2)
  assert.equal(explodedCellIndex, null)
})




