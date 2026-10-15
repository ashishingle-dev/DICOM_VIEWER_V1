import { Trash2, ScanEye } from 'lucide-react'
import type { StudyRecord } from '../types/dicom'
import { formatDicomDate, formatAge, shortenUid } from '../lib/formatters'
import ModalityBadge from './ModalityBadge'

interface Props {
  studies: StudyRecord[]
  onOpen: (study: StudyRecord) => void
  /** Omit to hide the delete control (read-only users). */
  onDelete?: (study: StudyRecord) => void
}

export default function StudyTable({ studies, onOpen, onDelete }: Props) {
  if (studies.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-16 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          No studies yet. Upload DICOM files or a folder to populate the worklist.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] text-left text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="px-4 py-2.5 font-medium">Patient</th>
            <th className="px-4 py-2.5 font-medium">Patient ID</th>
            <th className="px-4 py-2.5 font-medium">Sex / Age</th>
            <th className="px-4 py-2.5 font-medium">Study date</th>
            <th className="px-4 py-2.5 font-medium">Accession</th>
            <th className="px-4 py-2.5 font-medium">Description</th>
            <th className="px-4 py-2.5 font-medium">Modality</th>
            <th className="px-4 py-2.5 font-medium text-right">Series / Images</th>
            <th className="px-4 py-2.5 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {studies.map((study) => {
            const totalInstances = study.instanceCount ?? study.series.reduce((sum, s) => sum + (s.instanceCount ?? s.instances.length), 0)
            return (
              <tr
                key={study.studyInstanceUID}
                onClick={() => onOpen(study)}
                className="group cursor-pointer border-b border-[var(--color-border)] bg-[var(--color-bg)] transition-colors last:border-b-0 hover:bg-[var(--color-surface)]"
              >
                <td className="relative px-4 py-3 font-medium text-[var(--color-text)]">
                  <span className="absolute left-0 top-0 h-full w-0.5 scale-y-0 bg-[var(--color-accent)] transition-transform group-hover:scale-y-100" />
                  {study.patientName}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">
                  {study.patientId}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">
                  {[study.patientSex, formatAge(study.patientBirthDate, study.studyDate)]
                    .filter(Boolean)
                    .join(' / ') || '—'}
                </td>
                <td className="tabular-data px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">
                  {formatDicomDate(study.studyDate)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">
                  {study.accessionNumber || '—'}
                </td>
                <td className="px-4 py-3 text-[var(--color-text)]">{study.studyDescription}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {study.modalities.map((m) => (
                      <ModalityBadge key={m} modality={m} />
                    ))}
                  </div>
                </td>
                <td className="tabular-data px-4 py-3 text-right font-mono text-xs text-[var(--color-text-muted)]">
                  {study.seriesCount ?? study.series.length} / {totalInstances}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      title={`UID ${study.studyInstanceUID}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpen(study)
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] px-2 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
                    >
                      <ScanEye className="h-3.5 w-3.5" /> Open
                    </button>
                    {onDelete && (
                      <button
                        type="button"
                        title="Remove from worklist"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(study)
                        }}
                        className="inline-flex items-center rounded-md p-1.5 text-[var(--color-text-dim)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-2 font-mono text-[10px] text-[var(--color-text-dim)]">
        {studies.length} {studies.length === 1 ? 'study' : 'studies'} · UID e.g.{' '}
        {studies[0] ? shortenUid(studies[0].studyInstanceUID) : ''}
      </p>
    </div>
  )
}
