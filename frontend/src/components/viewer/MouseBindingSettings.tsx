import { useRef, useState } from 'react'
import { Mouse } from 'lucide-react'
import {
  NAV_TOOLS,
  type MouseButtonSlot,
  type NavBindingConfig,
  type NavToolName,
} from '../../lib/cornerstoneSetup'
import AnchoredPopover from './AnchoredPopover'

interface Props {
  bindings: NavBindingConfig
  onChange: (config: NavBindingConfig) => void
  disabled?: boolean
  disabledTooltip?: string
}

const TOOL_LABELS: Record<NavToolName, string> = {
  [NAV_TOOLS.WindowLevel]: 'Window / Level',
  [NAV_TOOLS.Pan]: 'Pan',
  [NAV_TOOLS.Zoom]: 'Zoom',
  [NAV_TOOLS.StackScroll]: 'Stack Scroll',
}

const SLOTS: {
  slot: MouseButtonSlot
  label: string
  shortLabel: string
}[] = [
  {
    slot: 'left',
    label: 'Left Mouse',
    shortLabel: 'L',
  },
  {
    slot: 'middle',
    label: 'Middle Mouse',
    shortLabel: 'M',
  },
  {
    slot: 'right',
    label: 'Right Mouse',
    shortLabel: 'R',
  },
]

const TOOL_OPTIONS = Object.values(NAV_TOOLS)

const itemClass = (active: boolean) =>
  `flex min-w-[3.25rem] shrink-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-medium leading-tight transition-colors ${
    active
      ? 'text-[var(--color-accent)]'
      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
  }`

/**
 * Desktop-only (see ViewerToolbar, which renders TouchToolSettings instead
 * on touch/coarse-pointer devices).
 *
 * Keeps independent mouse-button configuration for each button (Left, Middle, Right),
 * housed within a single compact popover triggered from the toolbar.
 */
export default function MouseBindingSettings({
  bindings,
  onChange,
  disabled = false,
  disabledTooltip,
}: Props) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const handleBindingChange = (slot: MouseButtonSlot, tool: NavToolName) => {
    onChange({
      ...bindings,
      [slot]: tool,
    })
  }

  const tooltip = disabled
    ? disabledTooltip ?? 'Mouse settings disabled'
    : `Mouse bindings (L: ${TOOL_LABELS[bindings.left]}, M: ${TOOL_LABELS[bindings.middle]}, R: ${TOOL_LABELS[bindings.right]})`

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        title={tooltip}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        className={`${itemClass(open)} ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
      >
        <Mouse className="h-5 w-5" />
        <span>Mouse</span>
      </button>

      <AnchoredPopover
        open={open && !disabled}
        anchorRef={buttonRef}
        onClose={() => setOpen(false)}
        align="end"
      >
        <div className="w-64 max-w-[90vw] rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] p-3 shadow-2xl">
          <p className="mb-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text)]">
            Mouse Button Actions
          </p>

          <div className="space-y-2">
            {SLOTS.map(({ slot, label, shortLabel }) => (
              <div
                key={slot}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--color-border-strong)] bg-[var(--color-surface)] font-mono text-[10px] font-bold text-[var(--color-accent)]">
                    {shortLabel}
                  </span>
                  <span className="truncate text-xs font-medium text-[var(--color-text)]">
                    {label}
                  </span>
                </div>

                <select
                  value={bindings[slot]}
                  onChange={(event) =>
                    handleBindingChange(slot, event.target.value as NavToolName)
                  }
                  className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
                >
                  {TOOL_OPTIONS.map((tool) => (
                    <option key={tool} value={tool}>
                      {TOOL_LABELS[tool]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </AnchoredPopover>
    </div>
  )
}
