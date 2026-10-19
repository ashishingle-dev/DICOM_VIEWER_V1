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
  Link2,
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

  // sync
  syncEnabled: boolean
  onToggleSync: () => void
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
  `flex min-w-[3.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-medium leading-tight transition-colors ${
    active
      ? 'text-[var(--color-accent)]'
      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
  }`

const Divider = () => (
  <div className="mx-1 h-7 w-px shrink-0 bg-[var(--color-border-strong)]" />
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
  syncEnabled,
  onToggleSync,
}: Props) {
  // Mouse-button bindings (left/middle/right) are a meaningless concept on
  // a touchscreen, so touch/tablet devices get a different control here —
  // which single-finger tool is active, with two-finger pinch-zoom always
  // on and shown as a static hint (see TouchToolSettings).
  const isTouch = useIsTouchDevice()

  return (
    <div
      className="flex flex-nowrap items-center gap-1 overflow-x-auto overflow-y-hidden border-t border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 lg:border-b lg:border-t-0"
      style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        title={mprActive ? 'Invert is not supported in MPR mode' : 'Invert grayscale (active viewport)'}
        onClick={!mprActive ? onToggleInvert : undefined}
        disabled={mprActive}
        className={`${itemClass(invert && !mprActive)} ${mprActive ? 'cursor-not-allowed opacity-40' : ''}`}
      >
        <Contrast className="h-5 w-5" />
        Invert
      </button>

      <button
        type="button"
        title={
          mprActive
            ? 'Exit MPR (Multi-Planar Reconstruction) and return to previous layout'
            : mprCapable
            ? 'MPR (Multi-Planar Reconstruction)'
            : 'MPR unavailable — series needs ≥ 3 slices'
        }
        onClick={onToggleMpr}
        disabled={!mprCapable && !mprActive}
        className={`${itemClass(mprActive)} min-w-[3.5rem] ${
          !mprCapable && !mprActive ? 'cursor-not-allowed opacity-40' : ''
        } ${
          mprActive
            ? 'rounded-md ring-1 ring-[var(--color-accent)] bg-[var(--color-accent)]/15 font-semibold text-[var(--color-accent)]'
            : ''
        }`}
      >
        <Box className="h-5 w-5" />
        {mprActive ? 'Exit MPR' : 'MPR'}
      </button>

      <Divider />

      <LayoutPicker
        outerLayout={outerLayout}
        imageLayout={activeCellImageLayout}
        max={MAX_GRID}
        label="Layout"
        onOuterLayoutChange={onOuterLayoutChange}
        onImageLayoutChange={onActiveCellImageLayoutChange}
        disabled={mprActive}
        disabledTooltip="Layout is fixed to tri-planar orthogonal view in MPR mode"
      />

      <button
        type="button"
        title={mprActive ? 'Reset pan/zoom/window (all MPR planes)' : 'Reset pan/zoom/window (active viewport)'}
        onClick={onReset}
        className={itemClass(false)}
      >
        <RotateCcw className="h-5 w-5" />
        Reset
      </button>

      <button
        type="button"
        title={
          mprActive
            ? 'Synchronization is automatic via orthogonal crosshairs in MPR mode'
            : syncEnabled
            ? 'Sync viewports (Enabled) — click to unlink independent viewports'
            : 'Sync viewports — synchronize zoom, pan, window/level, and slice scrolling across viewports'
        }
        onClick={!mprActive ? onToggleSync : undefined}
        disabled={mprActive}
        className={`${itemClass(syncEnabled && !mprActive)} ${
          mprActive ? 'cursor-not-allowed opacity-40' : ''
        } ${
          syncEnabled && !mprActive
            ? 'rounded-md ring-1 ring-[var(--color-accent)] bg-[var(--color-accent)]/15 font-semibold text-[var(--color-accent)]'
            : ''
        }`}
      >
        <Link2 className="h-5 w-5" />
        Sync
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
        disabled={mprActive}
        disabledTooltip="Cine playback is not supported in MPR mode"
      />

      <Divider />

      <button
        type="button"
        title={mprActive ? 'Stack navigation is handled by crosshairs in MPR mode' : 'Navigate (exit measurement mode)'}
        onClick={!mprActive ? onExitMeasurement : undefined}
        disabled={mprActive}
        className={`${itemClass(!mprActive && activeMeasurementTool === null)} ${
          mprActive ? 'cursor-not-allowed opacity-40' : ''
        }`}
      >
        <ChevronsUpDown className="h-5 w-5" />
        Stack
      </button>

      {MEASUREMENT_ITEMS.map(({ tool, label, icon: Icon }) => (
        <button
          key={tool}
          type="button"
          title={mprActive ? `${label} measurement is not supported in MPR mode` : label}
          onClick={!mprActive ? () => onSelectMeasurementTool(tool) : undefined}
          disabled={mprActive}
          className={`${itemClass(!mprActive && activeMeasurementTool === tool)} ${
            mprActive ? 'cursor-not-allowed opacity-40' : ''
          }`}
        >
          <Icon className="h-5 w-5" />
          {label}
        </button>
      ))}

      <Divider />

      <button
        type="button"
        title={mprActive ? 'Annotation deletion is not supported in MPR mode' : 'Delete selected annotation'}
        onClick={!mprActive ? onDeleteSelected : undefined}
        disabled={mprActive}
        className={`${itemClass(false)} ${mprActive ? 'cursor-not-allowed opacity-40' : ''}`}
      >
        <XCircle className="h-5 w-5" />
        Delete
      </button>

      <button
        type="button"
        title={mprActive ? 'Clearing annotations is not supported in MPR mode' : 'Clear all annotations'}
        onClick={!mprActive ? onClearAll : undefined}
        disabled={mprActive}
        className={`${itemClass(false)} ${mprActive ? 'cursor-not-allowed opacity-40' : ''}`}
      >
        <Trash2 className="h-5 w-5" />
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
          disabled={mprActive}
          disabledTooltip="Touch gestures are fixed in MPR mode"
        />
      ) : (
        <MouseBindingSettings
          bindings={navBindings}
          onChange={onNavBindingsChange}
          disabled={mprActive}
          disabledTooltip="Mouse bindings are fixed in MPR mode (Left: Crosshairs, Right: Window/Level, Middle: Pan)"
        />
      )}
    </div>
  )
}