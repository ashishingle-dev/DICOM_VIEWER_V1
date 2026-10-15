import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
import UploadDropzone from '../components/UploadDropzone'
import StudyTable from '../components/StudyTable'
import ViewerModeToggle from '../components/ViewerModeToggle'
import UserMenu from '../components/UserMenu'
import { deleteStudy, searchStudies, uploadDicomFiles } from '../lib/pacs/apiClient'
import { APP_CONFIG, getViewerOpenMode, setViewerOpenMode, type ViewerOpenMode } from '../config'
import { useAuth } from '../lib/auth/AuthContext'
import type { IngestProgress, StudyRecord } from '../types/dicom'

export default function WorklistPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'Admin'
  const [studies, setStudies] = useState<StudyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState<IngestProgress | null>(null)
  const [openMode, setOpenMode] = useState<ViewerOpenMode>(getViewerOpenMode())
  const [error, setError] = useState<string | null>(null)

  const loadStudies = useCallback(async () => {
    setLoading(true)
    try {
      const result = await searchStudies({ page: 1, pageSize: 200 })
      setStudies(result.items)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unable to load the worklist.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStudies()
  }, [loadStudies])

  const handleModeChange = useCallback((mode: ViewerOpenMode) => {
    setOpenMode(mode)
    setViewerOpenMode(mode)
  }, [])

  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (files.length === 0) return

    setError(null)
    setProgress({ total: files.length, processed: 0, skipped: 0 })

    try {
      const result = await uploadDicomFiles(files)
      setProgress({
        total: files.length,
        processed: files.length - result.failedCount,
        skipped: result.failedCount,
      })

      if (result.failedCount > 0) {
        const firstErrors = result.failures.slice(0, 3).join(' | ')
        setError(
          `${result.imported} imported, ${result.failedCount} failed.${firstErrors ? ` ${firstErrors}` : ''}`,
        )
      }

      await loadStudies()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setProgress(null)
    }
  }, [loadStudies])

  const openViewer = useCallback(
    (study: StudyRecord) => {
      const url = `/viewer/${encodeURIComponent(study.studyInstanceUID)}`
      if (openMode === 'window') {
        window.open(url, `dicom-viewer-${study.studyInstanceUID}`, APP_CONFIG.viewerWindowFeatures)
      } else {
        window.open(url, '_blank', 'noopener')
      }
    },
    [openMode],
  )

  const handleDelete = useCallback(async (study: StudyRecord) => {
    try {
      await deleteStudy(study.studyInstanceUID)
      setStudies((prev) => prev.filter((s) => s.studyInstanceUID !== study.studyInstanceUID))
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unable to delete study.')
    }
  }, [])

  const totalImages = useMemo(
    () => studies.reduce((sum, study) => sum + (study.instanceCount ?? 0), 0),
    [studies],
  )

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Activity className="h-5 w-5 text-[var(--color-accent)]" strokeWidth={2} />
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
                DICOM Worklist Viewer
              </h1>
              <p className="font-mono text-[11px] text-[var(--color-text-dim)]">
                {studies.length} studies · {totalImages} images indexed by server
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-[var(--color-text-muted)] sm:inline">Open viewer in</span>
            <ViewerModeToggle value={openMode} onChange={handleModeChange} />
            <UserMenu />
            {studies.length > 0 && (
              <button
                type="button"
                onClick={loadStudies}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
              >
                Refresh
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {isAdmin ? (
          <UploadDropzone onFilesSelected={handleFilesSelected} disabled={!!progress} />
        ) : (
          <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-xs text-[var(--color-text-muted)]">
            Read-only access. Uploading and removing studies requires an Admin account.
          </p>
        )}

        {progress && (
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-muted)]">Uploading to server…</span>
              <span className="font-mono text-[var(--color-text-dim)]">
                {progress.processed}/{progress.total}
                {progress.skipped > 0 ? ` · ${progress.skipped} failed` : ''}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-[width]"
                style={{ width: `${(progress.processed / Math.max(progress.total, 1)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-2.5 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading worklist…</p>
        ) : (
          <StudyTable studies={studies} onOpen={openViewer} onDelete={isAdmin ? handleDelete : undefined} />
        )}
      </main>
    </div>
  )
}
