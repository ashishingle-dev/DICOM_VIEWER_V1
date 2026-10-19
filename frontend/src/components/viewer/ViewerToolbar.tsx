import {
  Contrast,
  RotateCcw,
  Ruler,
  Angle as AngleIcon,
  Diameter,
  MoveDiagonal2,
  RectangleHorizontal,
  Ellipse,
  Circle,
  Spline,
  ArrowUpRight,
  Crosshair,
  Eraser,
  ChevronsUpDown,
  Trash2,
  XCircle,
  Box,
} from 'lucide-react'

import {
  MAX_GRID,
  type GridSize,
} from '../../types/layout'

import {
  MEASUREMENT_TOOLS,
  type MeasurementToolName,
  type NavBindingConfig,
} from '../../lib/cornerstoneSetup'

import MouseBindingSettings from './MouseBindingSettings'
import TouchToolSettings from './TouchToolSettings'
import LayoutPicker from './LayoutPicker'
import CineControls from './CineControls'
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice'

interface Props {
  outerLayout: GridSize
  activeCellImageLayout: GridSize

  onOuterLayoutChange: (
    size: GridSize,
  ) => void

  onActiveCellImageLayoutChange: (
    size: GridSize,
  ) => void

  invert: boolean

  navBindings: NavBindingConfig

  onNavBindingsChange: (
    config: NavBindingConfig,
  ) => void

  onReset: () => void
  onToggleInvert: () => void

  activeMeasurementTool:
    | MeasurementToolName
    | null

  onSelectMeasurementTool: (
    tool: MeasurementToolName,
  ) => void

  onExitMeasurement: () => void

  annotationCount: number
  onClearAll: () => void
  onDeleteSelected: () => void

  // cine
  isPlaying: boolean
  onTogglePlayback: () => void
  cineFps: number
  onCineFpsChange: (fps: number) => void
  cineLoop: boolean
  onCineLoopChange: (loop: boolean) => void
  simultaneousPlay: boolean
  onSimultaneousPlayChange: (value: boolean) => void

  // mpr
  mprActive: boolean
  onToggleMpr: () => void
  mprCapable: boolean
}

const MEASUREMENT_ITEMS: {
  tool: MeasurementToolName
  label: string
  icon: typeof Ruler
}[] = [
  {
    tool: MEASUREMENT_TOOLS.Length,
    label: 'Length',
    icon: Ruler,
  },
  {
    tool: MEASUREMENT_TOOLS.Angle,
    label: 'Angle',
    icon: AngleIcon,
  },
  {
    tool: MEASUREMENT_TOOLS.CobbAngle,
    label: 'Cobb',
    icon: Diameter,
  },
  {
    tool: MEASUREMENT_TOOLS.Bidirectional,
    label: 'Bidirect.',
    icon: MoveDiagonal2,
  },
  {
    tool: MEASUREMENT_TOOLS.Rectangle,
    label: 'Rect.',
    icon: RectangleHorizontal,
  },
  {
    tool: MEASUREMENT_TOOLS.Ellipse,
    label: 'Ellipse',
    icon: Ellipse,
  },
  {
    tool: MEASUREMENT_TOOLS.Circle,
    label: 'Circle',
    icon: Circle,
  },
  {
    tool: MEASUREMENT_TOOLS.Freehand,
    label: 'Freehand',
    icon: Spline,
  },
  {
    tool: MEASUREMENT_TOOLS.Arrow,
    label: 'Arrow',
    icon: ArrowUpRight,
  },
  {
    tool: MEASUREMENT_TOOLS.Probe,
    label: 'Probe',
    icon: Crosshair,
  },
  {
    tool: MEASUREMENT_TOOLS.Eraser,
    label: 'Eraser',
    icon: Eraser,
  },
]

const itemClass = (active: boolean) =>
  `flex w-14 shrink-0 flex-col items-center gap-0.5 rounded-md px-1.5 py-1.5 text-[10px] font-medium transition-colors ${
    active
      ? 'text-[var(--color-accent)]'
      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
  }`

const Divider = () => (
  <div className="mx-1 h-8 w-px shrink-0 bg-[var(--color-border-strong)]" />
)

export default function ViewerToolbar({
  outerLayout,
  activeCellImageLayout,
  onOuterLayoutChange,
  onActiveCellImageLayoutChange,
  invert,
  navBindings,
  onNavBindingsChange,
  onReset,
  onToggleInvert,
  activeMeasurementTool,
  onSelectMeasurementTool,
  onExitMeasurement,
  annotationCount,
  onClearAll,
  onDeleteSelected,
  isPlaying,
  onTogglePlayback,
  cineFps,
  onCineFpsChange,
  cineLoop,
  onCineLoopChange,
  simultaneousPlay,
  onSimultaneousPlayChange,
  mprActive,
  onToggleMpr,
  mprCapable,
}: Props) {
  // Mouse-button bindings (left/middle/right) are a meaningless concept on
  // a touchscreen, so touch/tablet devices get a different control here —
  // which single-finger tool is active, with two-finger pinch-zoom always
  // on and shown as a static hint (see TouchToolSettings).
  const isTouch = useIsTouchDevice()

  return (
    <div
      className="flex flex-nowrap items-center gap-1 overflow-x-auto border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 lg:flex-wrap lg:overflow-visible lg:border-b lg:border-t-0"
      style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        title="Invert grayscale (active viewport)"
        onClick={onToggleInvert}
        className={itemClass(invert)}
      >
        <Contrast className="h-4 w-4" />
        Invert
      </button>

      <button
        type="button"
        title={mprCapable ? (mprActive ? 'Exit MPR (Multi-Planar Reconstruction)' : 'MPR (Multi-Planar Reconstruction)') : 'MPR unavailable — series needs ≥ 3 slices'}
        onClick={onToggleMpr}
        disabled={!mprCapable}
        className={`${itemClass(mprActive)} ${!mprCapable ? 'cursor-not-allowed opacity-40' : ''}`}
      >
        <Box className="h-4 w-4" />
        MPR
      </button>

      <Divider />

      <LayoutPicker
        outerLayout={outerLayout}
        imageLayout={activeCellImageLayout}
        max={MAX_GRID}
        label="Layout"
        onOuterLayoutChange={onOuterLayoutChange}
        onImageLayoutChange={
          onActiveCellImageLayoutChange
        }
      />

  <button
        type="button"
        title="Reset pan/zoom/window (active viewport)"
        onClick={onReset}
        className={itemClass(false)}
      >
        <RotateCcw className="h-4 w-4" />
        Reset
      </button>

      <Divider />

      <CineControls
        isPlaying={isPlaying}
        onTogglePlayback={onTogglePlayback}
        fps={cineFps}
        onFpsChange={onCineFpsChange}
        loop={cineLoop}
        onLoopChange={onCineLoopChange}
        simultaneous={simultaneousPlay}
        onSimultaneousChange={onSimultaneousPlayChange}
      />

      <Divider />

      <button
        type="button"
        title="Navigate (exit measurement mode)"
        onClick={onExitMeasurement}
        className={itemClass(
          activeMeasurementTool === null,
        )}
      >
        <ChevronsUpDown className="h-4 w-4" />
        Stack
      </button>

      {MEASUREMENT_ITEMS.map(
        ({ tool, label, icon: Icon }) => (
          <button
            key={tool}
            type="button"
            title={label}
            onClick={() =>
              onSelectMeasurementTool(tool)
            }
            className={itemClass(
              activeMeasurementTool === tool,
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ),
      )}


      <Divider />

      <button
        type="button"
        title="Delete selected annotation"
        onClick={onDeleteSelected}
        className={itemClass(false)}
      >
        <XCircle className="h-4 w-4" />
        Delete
      </button>

      <button
        type="button"
        title="Clear all annotations"
        onClick={onClearAll}
        className={itemClass(false)}
      >
        <Trash2 className="h-4 w-4" />
        Clear all
      </button>

      <span
        title="Annotations on the active viewport's current image"
        className="hidden mx-1 shrink-0 font-mono text-[10px] text-[var(--color-text-dim)]"
      >
        {annotationCount}
      </span>

      <Divider />

      {isTouch ? (
        <TouchToolSettings
          bindings={navBindings}
          onChange={onNavBindingsChange}
        />
      ) : (
        <MouseBindingSettings
          bindings={navBindings}
          onChange={onNavBindingsChange}
        />
      )}
    </div>
  )
}