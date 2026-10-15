import type { ViewerOpenMode } from '../config'

interface Props {
  value: ViewerOpenMode
  onChange: (mode: ViewerOpenMode) => void
}

export default function ViewerModeToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex items-center rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-0.5 text-xs">
      {(['tab', 'window'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`rounded px-2.5 py-1 font-medium capitalize transition-colors ${
            value === mode
              ? 'bg-[var(--color-accent)] text-[#06110f]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          {mode === 'tab' ? 'New tab' : 'New window'}
        </button>
      ))}
    </div>
  )
}
