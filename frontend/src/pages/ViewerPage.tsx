import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, Menu } from 'lucide-react'
import { useDicomLayout } from '../hooks/useDicomLayout'
import SeriesPanel from '../components/viewer/SeriesPanel'
import ViewerToolbar from '../components/viewer/ViewerToolbar'
import ViewportGrid from '../components/viewer/ViewportGrid'
import MprView from '../components/viewer/MprView'
import { getInstances, getSeries, getStudy } from '../lib/pacs/apiClient'
import { isMprCapable } from '../lib/volumeLoader'
import type { SeriesRecord, StudyRecord } from '../types/dicom'

export default function ViewerPage() {
  const { studyInstanceUID } = useParams<{ studyInstanceUID: string }>()
  const [study, setStudy] = useState<StudyRecord | null>(null)
  const [series, setSeries] = useState<SeriesRecord[]>([])
  const [seriesPanelOpen, setSeriesPanelOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mprActive, setMprActive] = useState(false)

  const {
    isReady,
    outerLayout,
    setOuterLayout,
    cells,
    setCellImageLayout,
    assignSeriesToActiveCell,
    activeCellIndex,
    activateTile,
    cellOverlays,
    activeOverlay,
    handleTileOverlay,
    handleIndexChanged,
    navBindings,
    updateNavBindings,
    activeMeasurementTool,
    selectMeasurementTool,
    exitMeasurement,
    annotationCount,
    clearAnnotations,
    deleteSelected,
    resetActiveView,
    toggleInvertActive,
    registerViewport,
    unregisterViewport,
    isActiveCellPlaying,
    isAnyCellPlaying,
    cineFps,
    cineLoop,
    simultaneousPlay,
    togglePlayback,
    setCineFps,
    setCineLoop,
    setSimultaneousPlay,
    handleCineStateChanged,
  } = useDicomLayout()

  useEffect(() => {
    if (!studyInstanceUID) {
      setError('Study UID is missing.')
      setLoading(false)
      return
    }

    let cancelled = false
    const uid = studyInstanceUID

    async function loadStudy() {
      try {
        setLoading(true)
        setError(null)
        const [studyData, seriesData] = await Promise.all([
          getStudy(uid),
          getSeries(uid),
        ])

        if (cancelled) return
        setStudy(studyData)
        setSeries(seriesData)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load study.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadStudy()
    return () => {
      cancelled = true
    }
  }, [studyInstanceUID])

  const loadSeriesInstances = useCallback(async (seriesSummary: SeriesRecord): Promise<SeriesRecord> => {
    if (seriesSummary.instances.length > 0) return seriesSummary

    const studyUid = seriesSummary.studyInstanceUID ?? studyInstanceUID
    if (!studyUid) throw new Error('Study UID is missing.')

    const instances = await getInstances(studyUid, seriesSummary.seriesInstanceUID)
    const hydrated = { ...seriesSummary, studyInstanceUID: studyUid, instances }

    setSeries((current) =>
      current.map((item) =>
        item.seriesInstanceUID === hydrated.seriesInstanceUID ? hydrated : item,
      ),
    )

    return hydrated
  }, [studyInstanceUID])

  useEffect(() => {
    if (!study || series.length === 0 || cells[0]?.seriesInstanceUID) return

    let cancelled = false

    async function assignFirstSeries() {
      try {
        const hydrated = await loadSeriesInstances(series[0])
        if (!cancelled) assignSeriesToActiveCell(hydrated)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load the first series.')
      }
    }

    void assignFirstSeries()
    return () => {
      cancelled = true
    }
  }, [study, series, cells, assignSeriesToActiveCell, loadSeriesInstances])

  const activeCell = cells[activeCellIndex]
  const activeCellImageLayout = activeCell?.imageLayout ?? { rows: 1, cols: 1 }

  // MPR: determine the active series record and whether it's MPR-capable
  const activeSeries = activeCell?.seriesInstanceUID
    ? series.find((s) => s.seriesInstanceUID === activeCell.seriesInstanceUID) ?? null
    : null
  const mprCapable = activeSeries ? isMprCapable(activeSeries) : false

  const handleToggleMpr = useCallback(() => {
    setMprActive((prev) => !prev)
  }, [])

  const handleActiveCellImageLayoutChange = (layout: typeof activeCellImageLayout) => {
    setCellImageLayout(activeCellIndex, layout)
  }

  const handleSeriesSelect = useCallback(async (selected: SeriesRecord) => {
    try {
      setError(null)
      const hydrated = await loadSeriesInstances(selected)
      assignSeriesToActiveCell(hydrated)
      setSeriesPanelOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load series.')
    }
  }, [assignSeriesToActiveCell, loadSeriesInstances])

  if (error && !study) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-[var(--color-bg)] px-4 text-center">
        <AlertTriangle className="h-8 w-8 text-[var(--color-amber)]" />
        <p className="text-sm text-[var(--color-text)]">Unable to open this study.</p>
        <p className="max-w-lg text-xs text-[var(--color-text-muted)]">{error}</p>
        <Link
          to="/"
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to worklist
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col bg-[var(--color-bg)]">
      <header className="order-1 flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <Link
          to="/"
          title="Back to worklist"
          className="inline-flex shrink-0 items-center rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--color-text)]">
            {study ? (
              <>
                {study.patientName}{' '}
                <span className="text-[var(--color-text-dim)]">·</span>{' '}
                <span className="font-mono text-xs text-[var(--color-text-muted)]">
                  {study.patientId}
                </span>
              </>
            ) : 'Loading study…'}
          </p>
          {study && (
            <p className="truncate text-xs text-[var(--color-text-muted)]">
              {study.studyDescription}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSeriesPanelOpen(true)}
          title="Series"
          aria-label="Open series list"
          className="inline-flex shrink-0 items-center rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      <div className="order-3 z-30 min-h-[52px] min-w-0 shrink-0 overflow-hidden border-t border-[var(--color-border)] bg-[var(--color-surface)] lg:order-2 lg:min-h-0 lg:border-t-0">
        <ViewerToolbar
          outerLayout={outerLayout}
          activeCellImageLayout={activeCellImageLayout}
          onOuterLayoutChange={setOuterLayout}
          onActiveCellImageLayoutChange={handleActiveCellImageLayoutChange}
          invert={activeOverlay.invert}
          navBindings={navBindings}
          onNavBindingsChange={updateNavBindings}
          onReset={resetActiveView}
          onToggleInvert={toggleInvertActive}
          activeMeasurementTool={activeMeasurementTool}
          onSelectMeasurementTool={selectMeasurementTool}
          onExitMeasurement={exitMeasurement}
          annotationCount={annotationCount}
          onClearAll={clearAnnotations}
          onDeleteSelected={deleteSelected}
          isPlaying={simultaneousPlay ? isAnyCellPlaying : isActiveCellPlaying}
          onTogglePlayback={togglePlayback}
          cineFps={cineFps}
          onCineFpsChange={setCineFps}
          cineLoop={cineLoop}
          onCineLoopChange={setCineLoop}
          simultaneousPlay={simultaneousPlay}
          onSimultaneousPlayChange={setSimultaneousPlay}
          mprActive={mprActive}
          onToggleMpr={handleToggleMpr}
          mprCapable={mprCapable}
        />
      </div>

      <div className="order-2 flex min-h-0 min-w-0 flex-1 lg:order-3">
        {seriesPanelOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setSeriesPanelOpen(false)}
          />
        )}

        <div
          className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 lg:transition-none ${
            seriesPanelOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <SeriesPanel
            series={series}
            activeSeriesUID={activeCell?.seriesInstanceUID ?? null}
            onSelect={handleSeriesSelect}
            onClose={() => setSeriesPanelOpen(false)}
          />
        </div>

        <div className="relative min-h-0 min-w-0 flex-1 bg-black">
          {loading || !study || !isReady ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="rounded-md bg-black/60 px-3 py-1.5 font-mono text-xs text-[var(--color-text-muted)]">
                {loading ? 'Loading study…' : 'Initializing viewer…'}
              </p>
            </div>
          ) : mprActive && activeSeries ? (
            <MprView
              series={activeSeries}
              study={{ ...study, series }}
            />
          ) : (
            <ViewportGrid
              cells={cells}
              outerLayout={outerLayout}
              study={{ ...study, series }}
              activeCellIndex={activeCellIndex}
              cellOverlays={cellOverlays}
              onActivateTile={activateTile}
              onTileOverlay={handleTileOverlay}
              onIndexChanged={handleIndexChanged}
              onCineStateChanged={handleCineStateChanged}
              onViewportReady={registerViewport}
              onViewportRemoved={unregisterViewport}
            />
          )}
        </div>
      </div>

      {error && study && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-[80] -translate-x-1/2 rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-2 text-xs text-[var(--color-danger)] shadow-lg lg:bottom-4">
          {error}
        </div>
      )}
    </div>
  )
}
