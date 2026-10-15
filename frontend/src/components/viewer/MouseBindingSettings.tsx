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
  `flex w-14 shrink-0 touch-manipulation flex-col items-center gap-0.5 rounded-md px-1.5 py-1.5 text-[10px] font-medium transition-colors ${
    active
      ? 'text-[var(--color-accent)]'
      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
  }`

interface SlotButtonProps {
  label: string
  shortLabel: string
  assignedTool: NavToolName
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  onSelect: (tool: NavToolName) => void
}

function SlotButton({
  label,
  shortLabel,
  assignedTool,
  isOpen,
  onToggle,
  onClose,
  onSelect,
}: SlotButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        title={`${label}: ${TOOL_LABELS[assignedTool]}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={onToggle}
        className={itemClass(isOpen)}
      >
        <div className="relative">
          <Mouse className="h-4 w-4" />

          <span className="absolute -bottom-1 -right-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-[var(--color-surface)] font-mono text-[7px] font-bold text-[var(--color-text)]">
            {shortLabel}
          </span>
        </div>

        <span className="max-w-14 truncate">
          {TOOL_LABELS[assignedTool]}
        </span>
      </button>

      <AnchoredPopover open={isOpen} anchorRef={buttonRef} onClose={onClose} align="end">
        <div className="w-52 max-w-[85vw] rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] p-3 shadow-2xl">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text)]">
            {label}
          </p>

          <select
            autoFocus
            value={assignedTool}
            onChange={(event) => onSelect(event.target.value as NavToolName)}
            className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            {TOOL_OPTIONS.map((tool) => (
              <option key={tool} value={tool}>
                {TOOL_LABELS[tool]}
              </option>
            ))}
          </select>
        </div>
      </AnchoredPopover>
    </div>
  )
}

/**
 * Desktop-only (see ViewerToolbar, which renders TouchToolSettings instead
 * on touch/coarse-pointer devices) — "left/middle/right mouse button" is a
 * meaningless concept on a touchscreen, and showing this control there was
 * dead UI a finger can't actually use.
 */
export default function MouseBindingSettings({
  bindings,
  onChange,
}: Props) {
  const [openSlot, setOpenSlot] = useState<MouseButtonSlot | null>(null)

  const handleBindingChange = (slot: MouseButtonSlot, tool: NavToolName) => {
    onChange({
      ...bindings,
      [slot]: tool,
    })
    setOpenSlot(null)
  }

  return (
    <div className="flex items-center gap-1">
      {SLOTS.map(({ slot, label, shortLabel }) => (
        <SlotButton
          key={slot}
          label={label}
          shortLabel={shortLabel}
          assignedTool={bindings[slot]}
          isOpen={openSlot === slot}
          onToggle={() => setOpenSlot((current) => (current === slot ? null : slot))}
          onClose={() => setOpenSlot(null)}
          onSelect={(tool) => handleBindingChange(slot, tool)}
        />
      ))}
    </div>
  )
}
