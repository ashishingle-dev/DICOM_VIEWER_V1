const MODALITY_COLORS: Record<string, string> = {
  CT: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  MR: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  US: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  CR: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  DX: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  MG: 'bg-pink-500/15 text-pink-300 ring-pink-500/30',
  PT: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  NM: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  XA: 'bg-red-500/15 text-red-300 ring-red-500/30',
}

const DEFAULT_COLOR = 'bg-[var(--color-accent-dim)] text-[var(--color-accent)] ring-[var(--color-accent-strong)]/30'

export default function ModalityBadge({ modality }: { modality: string }) {
  const color = MODALITY_COLORS[modality] ?? DEFAULT_COLOR
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-mono font-medium ring-1 ring-inset ${color}`}
    >
      {modality}
    </span>
  )
}
