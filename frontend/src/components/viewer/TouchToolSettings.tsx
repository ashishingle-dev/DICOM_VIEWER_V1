import { Sliders, Move, ChevronsUpDown, ZoomIn } from 'lucide-react'
import { NAV_TOOLS, type NavBindingConfig, type NavToolName } from '../../lib/cornerstoneSetup'

interface Props {
  bindings: NavBindingConfig
  onChange: (config: NavBindingConfig) => void
}

/** The three tools a single finger can drive (Zoom is excluded — it's
 *  always the two-finger pinch gesture, see the static hint below and
 *  cornerstoneSetup.ts). */
const TOUCH_TOOLS: {
  tool: NavToolName
  label: string
  icon: typeof Sliders
}[] = [
  { tool: NAV_TOOLS.WindowLevel, label: 'Window / Level', icon: Sliders },
  { tool: NAV_TOOLS.Pan, label: 'Pan', icon: Move },
  { tool: NAV_TOOLS.StackScroll, label: 'Scroll', icon: ChevronsUpDown },
]

const itemClass = (active: boolean) =>
  `flex w-14 shrink-0 touch-manipulation flex-col items-center gap-0.5 rounded-md px-1.5 py-1.5 text-[10px] font-medium transition-colors ${
    active
      ? 'text-[var(--color-accent)]'
      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
  }`

/**
 * Touch/tablet equivalent of MouseBindingSettings. There's no left/middle/
 * right button on a touchscreen, so instead of a 3-way mapping this is a
 * single "what does one finger do" switch — it writes to the same `left`
 * slot of the nav-binding config, which is what Cornerstone's touch
 * dispatcher already uses for single-finger drags (see the comment in
 * cornerstoneSetup.ts). Two-finger pinch is always Zoom (+ pan) and isn't
 * user-configurable, so it's shown as a static, non-interactive hint rather
 * than a fourth option here.
 */
export default function TouchToolSettings({ bindings, onChange }: Props) {
  return (
    <div className="flex items-center gap-1">
      {TOUCH_TOOLS.map(({ tool, label, icon: Icon }) => (
        <button
          key={tool}
          type="button"
          title={`One finger: ${label}`}
          onClick={() => onChange({ ...bindings, left: tool })}
          className={itemClass(bindings.left === tool)}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}

      <div
        title="Two fingers: pinch to zoom, drag to pan"
        className="flex w-14 shrink-0 flex-col items-center gap-0.5 rounded-md px-1.5 py-1.5 text-[10px] font-medium text-[var(--color-text-dim)]"
      >
        <ZoomIn className="h-4 w-4" />
        Pinch
      </div>
    </div>
  )
}
