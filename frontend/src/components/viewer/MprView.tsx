/**
 * MPR (Multi-Planar Reconstruction) view component.
 *
 * Renders three synchronized Cornerstone3D VolumeViewports showing
 * Axial, Sagittal, and Coronal slices of the same DICOM volume.
 *
 * Features:
 * - Crosshair tool for synchronized navigation across all three planes
 * - Window/Level, Pan, Zoom via existing tool bindings (middle/right mouse)
 * - Volume loading progress indicator
 * - Graceful error handling for incompatible series
 */
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import {
  RenderingEngine,
  Enums as CoreEnums,
  setVolumesForViewports,
} from '@cornerstonejs/core'
import type { Types } from '@cornerstonejs/core'
import * as cornerstoneTools from '@cornerstonejs/tools'
import { APP_CONFIG } from '../../config'
import {
  loadSeriesVolume,
  unloadSeriesVolume,
  isMprCapable,
} from '../../lib/volumeLoader'
import { getRenderingEngine } from '../../lib/cornerstoneSetup'
import type { SeriesRecord, StudyRecord } from '../../types/dicom'

const {
  CrosshairsTool,
  ToolGroupManager,
  Enums: ToolEnums,
  WindowLevelTool,
  PanTool,
  ZoomTool,
} = cornerstoneTools

/** Unique IDs for the three MPR viewports. */
const MPR_VIEWPORT_IDS = {
  axial: 'mpr-axial',
  sagittal: 'mpr-sagittal',
  coronal: 'mpr-coronal',
} as const

const MPR_TOOL_GROUP_ID = 'mpr-tool-group'

export interface MprViewHandle {
  resetView: () => void
}

interface Props {
  series: SeriesRecord
  study: StudyRecord
}

const PLANE_COLORS: Record<string, string> = {
  [MPR_VIEWPORT_IDS.axial]: '#22d3ee',     // cyan
  [MPR_VIEWPORT_IDS.sagittal]: '#f472b6',  // pink
  [MPR_VIEWPORT_IDS.coronal]: '#a3e635',   // lime
}

const MprView = forwardRef<MprViewHandle, Props>(function MprView(
  { series, study }: Props,
  ref,
) {
  const axialRef = useRef<HTMLDivElement>(null)
  const sagittalRef = useRef<HTMLDivElement>(null)
  const coronalRef = useRef<HTMLDivElement>(null)
  const mprEngineRef = useRef<RenderingEngine | null>(null)
  const volumeIdRef = useRef<string | null>(null)
  const toolGroupCreatedRef = useRef(false)

  useImperativeHandle(
    ref,
    () => ({
      resetView: () => {
        const engine = mprEngineRef.current
        if (!engine) return
        for (const vpId of Object.values(MPR_VIEWPORT_IDS)) {
          try {
            const vp = engine.getViewport(vpId)
            if (vp) {
              vp.resetCamera()
            }
          } catch {
            // ignore
          }
        }
        engine.renderViewports(Object.values(MPR_VIEWPORT_IDS))
      },
    }),
    [],
  )

  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const capable = isMprCapable(series)

  const teardown = useCallback(() => {
    // Remove the MPR tool group
    try {
      const tg = ToolGroupManager.getToolGroup(MPR_TOOL_GROUP_ID)
      if (tg) {
        tg.removeViewports(
          mprEngineRef.current?.id ?? APP_CONFIG.renderingEngineId,
        )
        ToolGroupManager.destroyToolGroup(MPR_TOOL_GROUP_ID)
      }
    } catch {
      // Tool group may already be gone.
    }
    toolGroupCreatedRef.current = false

    // Disable viewports
    const engine = mprEngineRef.current ?? getRenderingEngine()
    if (engine) {
      for (const vpId of Object.values(MPR_VIEWPORT_IDS)) {
        try {
          engine.disableElement(vpId)
        } catch {
          // Might already be disabled.
        }
      }
    }

    // Destroy the dedicated rendering engine
    if (mprEngineRef.current) {
      try {
        mprEngineRef.current.destroy()
      } catch {
        // Already destroyed.
      }
      mprEngineRef.current = null
    }

    // Release volume memory
    unloadSeriesVolume(series.seriesInstanceUID)
  }, [series.seriesInstanceUID])

  useEffect(() => {
    if (!capable) {
      setError('This series has too few slices for MPR reconstruction.')
      setLoading(false)
      return
    }

    let cancelled = false

    async function setup() {
      try {
        setLoading(true)
        setError(null)
        setProgress(0)

        // 1. Load the volume
        const { volumeId } = await loadSeriesVolume(series, (pct) => {
          if (!cancelled) setProgress(pct)
        })
        if (cancelled) return
        volumeIdRef.current = volumeId

        // 2. Create a dedicated rendering engine for MPR so we don't
        //    interfere with the main stack engine's viewport IDs.
        const engine = new RenderingEngine('mpr-rendering-engine')
        mprEngineRef.current = engine

        const elements = {
          axial: axialRef.current,
          sagittal: sagittalRef.current,
          coronal: coronalRef.current,
        }
        if (!elements.axial || !elements.sagittal || !elements.coronal) {
          throw new Error('MPR container elements not mounted.')
        }

        // 3. Enable volume viewports
        const viewportInputArray: Types.PublicViewportInput[] = [
          {
            viewportId: MPR_VIEWPORT_IDS.axial,
            element: elements.axial,
            type: CoreEnums.ViewportType.ORTHOGRAPHIC,
            defaultOptions: {
              orientation: CoreEnums.OrientationAxis.AXIAL,
              background: [0, 0, 0] as Types.Point3,
            },
          },
          {
            viewportId: MPR_VIEWPORT_IDS.sagittal,
            element: elements.sagittal,
            type: CoreEnums.ViewportType.ORTHOGRAPHIC,
            defaultOptions: {
              orientation: CoreEnums.OrientationAxis.SAGITTAL,
              background: [0, 0, 0] as Types.Point3,
            },
          },
          {
            viewportId: MPR_VIEWPORT_IDS.coronal,
            element: elements.coronal,
            type: CoreEnums.ViewportType.ORTHOGRAPHIC,
            defaultOptions: {
              orientation: CoreEnums.OrientationAxis.CORONAL,
              background: [0, 0, 0] as Types.Point3,
            },
          },
        ]
        engine.setViewports(viewportInputArray)

        // 4. Set the volume on all three viewports
        await setVolumesForViewports(
          engine,
          [{ volumeId }],
          [
            MPR_VIEWPORT_IDS.axial,
            MPR_VIEWPORT_IDS.sagittal,
            MPR_VIEWPORT_IDS.coronal,
          ],
        )

        // 5. Setup the MPR tool group with crosshairs
        if (!toolGroupCreatedRef.current) {
          // Register tools globally (idempotent — addTool silently skips
          // if already registered).
          try { cornerstoneTools.addTool(CrosshairsTool) } catch { /* already registered */ }

          const toolGroup = ToolGroupManager.createToolGroup(MPR_TOOL_GROUP_ID)
          if (toolGroup) {
            toolGroup.addTool(CrosshairsTool.toolName, {
              getReferenceLineColor: (vpId: string) =>
                PLANE_COLORS[vpId] ?? '#ffffff',
              getReferenceLineControllable: () => true,
              getReferenceLineDraggableRotatable: () => true,
              getReferenceLineSlabThicknessControlsOn: () => false,
            })
            // Navigation tools for the MPR viewports
            toolGroup.addTool(WindowLevelTool.toolName)
            toolGroup.addTool(PanTool.toolName)
            toolGroup.addTool(ZoomTool.toolName)

            // Crosshairs on left mouse button
            toolGroup.setToolActive(CrosshairsTool.toolName, {
              bindings: [
                { mouseButton: ToolEnums.MouseBindings.Primary },
              ],
            })
            // Window/Level on right mouse button
            toolGroup.setToolActive(WindowLevelTool.toolName, {
              bindings: [
                { mouseButton: ToolEnums.MouseBindings.Secondary },
              ],
            })
            // Pan on middle button
            toolGroup.setToolActive(PanTool.toolName, {
              bindings: [
                { mouseButton: ToolEnums.MouseBindings.Auxiliary },
              ],
            })
            // Zoom on ctrl+wheel
            toolGroup.setToolActive(ZoomTool.toolName, {
              bindings: [
                {
                  mouseButton: ToolEnums.MouseBindings.Wheel,
                  modifierKey: ToolEnums.KeyboardBindings.Ctrl,
                },
                { numTouchPoints: 2 },
              ],
            })

            for (const vpId of Object.values(MPR_VIEWPORT_IDS)) {
              toolGroup.addViewport(vpId, engine.id)
            }

            toolGroupCreatedRef.current = true
          }
        }

        // 6. Render all three viewports
        engine.renderViewports(Object.values(MPR_VIEWPORT_IDS))

        if (!cancelled) {
          setLoading(false)
          setProgress(100)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load MPR volume.',
          )
          setLoading(false)
        }
      }
    }

    void setup()

    return () => {
      cancelled = true
      teardown()
    }
  }, [series, capable, teardown])

  // Graceful: series not suitable for MPR
  if (!capable) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black">
        <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-6 py-4 text-center">
          <p className="text-sm font-medium text-[var(--color-text)]">
            MPR unavailable
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            This series has fewer than 3 slices and cannot produce
            volumetric reconstructions.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-black">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80">
          <p className="font-mono text-xs text-[var(--color-text-muted)]">
            Loading volume… {progress}%
          </p>
          <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error display */}
      {error && !loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80">
          <div className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-6 py-4 text-center">
            <p className="text-sm font-medium text-[var(--color-danger)]">
              MPR Error
            </p>
            <p className="mt-1 max-w-md text-xs text-[var(--color-text-muted)]">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* Three-viewport grid: top row = axial + sagittal, bottom = coronal */}
      <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
        {/* Axial */}
        <div className="relative min-h-0 min-w-0">
          <div
            ref={axialRef}
            className="h-full w-full"
            style={{ touchAction: 'none' }}
          />
          <MprPaneLabel
            label="Axial"
            color={PLANE_COLORS[MPR_VIEWPORT_IDS.axial]}
          />
        </div>

        {/* Sagittal */}
        <div className="relative min-h-0 min-w-0">
          <div
            ref={sagittalRef}
            className="h-full w-full"
            style={{ touchAction: 'none' }}
          />
          <MprPaneLabel
            label="Sagittal"
            color={PLANE_COLORS[MPR_VIEWPORT_IDS.sagittal]}
          />
        </div>

        {/* Coronal */}
        <div className="relative min-h-0 min-w-0">
          <div
            ref={coronalRef}
            className="h-full w-full"
            style={{ touchAction: 'none' }}
          />
          <MprPaneLabel
            label="Coronal"
            color={PLANE_COLORS[MPR_VIEWPORT_IDS.coronal]}
          />
        </div>

        {/* Info pane (bottom-right quadrant) */}
        <div className="flex min-h-0 min-w-0 flex-col items-center justify-center bg-[var(--color-surface)] p-3 sm:p-4 text-center">
          <p className="text-xs sm:text-sm font-medium text-[var(--color-text)]">
            MPR — {series.seriesDescription || 'Series'}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-[var(--color-text-muted)]">
            {study.patientName} · {study.patientId}
          </p>
          <p className="mt-0.5 text-[10px] sm:text-xs text-[var(--color-text-dim)]">
            {series.modality} · {series.instances.length} slices
          </p>
          <div className="mt-3 space-y-1 text-[9px] sm:text-[10px] text-[var(--color-text-muted)] max-w-xs">
            <p>
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: PLANE_COLORS[MPR_VIEWPORT_IDS.axial] }}
              />
              Left click + drag crosshairs to scroll
            </p>
            <p>
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: PLANE_COLORS[MPR_VIEWPORT_IDS.sagittal] }}
              />
              Right click to window/level · Middle to pan
            </p>
            <p>
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: PLANE_COLORS[MPR_VIEWPORT_IDS.coronal] }}
              />
              Scroll wheel or crosshairs to navigate slices
            </p>
          </div>
        </div>
      </div>
    </div>
  )
})

export default MprView

/** Small colored label in the corner of each MPR pane. */
function MprPaneLabel({ label, color }: { label: string; color: string }) {
  return (
    <div
      className="pointer-events-none absolute left-2 top-2 select-none rounded px-1.5 py-0.5 font-mono text-[9px] sm:text-[10px] font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
      style={{
        color,
        borderColor: color,
        borderWidth: 1,
        borderStyle: 'solid',
        backgroundColor: 'rgba(0,0,0,0.5)',
      }}
    >
      {label}
    </div>
  )
}
