import { X } from 'lucide-react'
import type { SeriesRecord } from '../../types/dicom'
import ModalityBadge from '../ModalityBadge'

interface Props {
  series: SeriesRecord[]
  activeSeriesUID: string | null
  onSelect: (series: SeriesRecord) => void
  /** Only passed when rendered as a mobile/tablet drawer — shows a close (X)
   *  button in the header and is otherwise omitted on desktop. */
  onClose?: () => void
}

export default function SeriesPanel({ series, activeSeriesUID, onSelect, onClose }: Props) {
  return (
    <div className="flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:w-56 lg:max-w-none">
      <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Series ({series.length})
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="inline-flex items-center rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex-1 divide-y divide-[var(--color-border)]">
        {series.map((s) => {
          const active = s.seriesInstanceUID === activeSeriesUID
          return (
            <button
              key={s.seriesInstanceUID}
              type="button"
              onClick={() => onSelect(s)}
              className={`block w-full px-3 py-2.5 text-left transition-colors ${
                active ? 'bg-[var(--color-accent-dim)]' : 'hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span
                  className={`truncate text-xs font-medium ${
                    active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'
                  }`}
                >
                  {s.seriesNumber ? `#${s.seriesNumber} · ` : ''}
                  {s.seriesDescription}
                </span>
                <ModalityBadge modality={s.modality} />
              </div>
              <p className="font-mono text-[10px] text-[var(--color-text-dim)]">
                {s.instanceCount ?? s.instances.length} image{(s.instanceCount ?? s.instances.length) === 1 ? '' : 's'}
                {s.bodyPartExamined ? ` · ${s.bodyPartExamined}` : ''}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
