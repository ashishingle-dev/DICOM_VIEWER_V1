import { useRef, useState } from 'react'
import { Play, Pause, ChevronDown, Minus, Plus } from 'lucide-react'
import AnchoredPopover from './AnchoredPopover'

interface Props {
  isPlaying: boolean
  onTogglePlayback: () => void
  fps: number
  onFpsChange: (fps: number) => void
  loop: boolean
  onLoopChange: (loop: boolean) => void
  simultaneous: boolean
  onSimultaneousChange: (value: boolean) => void
}

const itemClass = (active: boolean) =>
  `flex w-14 shrink-0 touch-manipulation flex-col items-center gap-0.5 rounded-md px-1.5 py-1.5 text-[10px] font-medium transition-colors ${
    active
      ? 'text-[var(--color-accent)]'
      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
  }`

const FPS_STEP = 5
const FPS_MIN = 1
const FPS_MAX = 60

/** A settings row inside the dropdown: a label on the left, an on/off pill
 *  button on the right — reads the same way as a switch without needing a
 *  separate switch component. */
function ToggleRow({
  label,
  active,
  onToggle,
}: {
  label: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-[var(--color-text)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        onClick={onToggle}
        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
          active
            ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
            : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
        }`}
      >
        {active ? 'On' : 'Off'}
      </button>
    </div>
  )
}

/**
 * Cine (movie play) controls. Play/Pause is the one control a user reaches
 * for constantly, so it's a normal toolbar button; loop, simultaneous
 * playback, and speed are settings changed far less often, so they live in
 * a small dropdown instead of three more permanent toolbar slots — keeps
 * the toolbar to a single row instead of wrapping.
 */
export default function CineControls({
  isPlaying,
  onTogglePlayback,
  fps,
  onFpsChange,
  loop,
  onLoopChange,
  simultaneous,
  onSimultaneousChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        title={isPlaying ? 'Pause cine' : 'Play cine'}
        onClick={onTogglePlayback}
        className={itemClass(isPlaying)}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {isPlaying ? 'Pause' : 'Play'}
      </button>

      <button
        ref={triggerRef}
        type="button"
        title="Cine settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-6 shrink-0 touch-manipulation items-center justify-center self-stretch rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] ${
          open ? 'text-[var(--color-accent)]' : ''
        }`}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      <AnchoredPopover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} align="end">
        <div className="w-56 max-w-[85vw] rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] p-3 shadow-2xl">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text)]">
            Cine
          </p>

          <ToggleRow label="Loop" active={loop} onToggle={() => onLoopChange(!loop)} />
          <ToggleRow
            label="Play all series boxes"
            active={simultaneous}
            onToggle={() => onSimultaneousChange(!simultaneous)}
          />

          <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-xs text-[var(--color-text)]">Speed</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Slower"
                onClick={() => onFpsChange(fps - FPS_STEP)}
                disabled={fps <= FPS_MIN}
                className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:opacity-30"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-12 text-center font-mono text-xs tabular-nums text-[var(--color-text)]">
                {fps} fps
              </span>
              <button
                type="button"
                title="Faster"
                onClick={() => onFpsChange(fps + FPS_STEP)}
                disabled={fps >= FPS_MAX}
                className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:opacity-30"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </AnchoredPopover>
    </div>
  )
}
