import { init as coreInit, RenderingEngine, Enums as CoreEnums, eventTarget } from '@cornerstonejs/core'
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader'
import * as cornerstoneTools from '@cornerstonejs/tools'
import { APP_CONFIG } from '../config'
import { getAccessToken } from './auth/session'

const {
  PanTool,
  ZoomTool,
  WindowLevelTool,
  StackScrollTool,
  LengthTool,
  AngleTool,
  CobbAngleTool,
  BidirectionalTool,
  RectangleROITool,
  EllipticalROITool,
  CircleROITool,
  PlanarFreehandROITool,
  ArrowAnnotateTool,
  ProbeTool,
  EraserTool,
  ToolGroupManager,
  annotation,
  Enums: ToolEnums,
} = cornerstoneTools

let initialized = false
let renderingEngine: RenderingEngine | null = null

/**
 * Cornerstone3D's core, tool, and DICOM-loader modules each keep module-level
 * singleton state (web worker pools, tool registries, the rendering engine).
 * We only want to spin that up once per browser tab, so every entry point
 * routes through this guarded initializer instead of calling each library's
 * init() directly.
 */
export async function ensureCornerstoneInitialized(): Promise<RenderingEngine> {
  if (initialized && renderingEngine) {
    return renderingEngine
  }

  coreInit()
  cornerstoneDICOMImageLoader.init({
    maxWebWorkers: Math.min(navigator.hardwareConcurrency || 1, 4),
    // The default "naturalized metadata" pixel-data pipeline in this version
    // of the loader has a bug extracting native (uncompressed) PixelData —
    // it expects PixelData to always come back as an array of per-frame
    // buffers and errors with "no pixel data in NATURALIZED" otherwise.
    // The legacy provider uses the same dicom-parser-based path Cornerstone
    // has shipped for years and doesn't have this issue.
    useLegacyMetadataProvider: true,
    // Every WADO-URI image request is an XHR made by the loader itself. Attach the bearer token to each one.
    beforeSend: async (_xhr, _imageId, defaultHeaders) => ({
      ...defaultHeaders,
      Authorization: `Bearer ${await getAccessToken()}`,
    }),
  })
  cornerstoneTools.init()

  // Navigation tools (configurable mouse-button bindings).
  cornerstoneTools.addTool(PanTool)
  cornerstoneTools.addTool(ZoomTool)
  cornerstoneTools.addTool(WindowLevelTool)
  cornerstoneTools.addTool(StackScrollTool)

  // Measurement / annotation tools (always activate on the primary/left
  // button while selected — see activateMeasurementTool below).
  cornerstoneTools.addTool(LengthTool)
  cornerstoneTools.addTool(AngleTool)
  cornerstoneTools.addTool(CobbAngleTool)
  cornerstoneTools.addTool(BidirectionalTool)
  cornerstoneTools.addTool(RectangleROITool)
  cornerstoneTools.addTool(EllipticalROITool)
  cornerstoneTools.addTool(CircleROITool)
  cornerstoneTools.addTool(PlanarFreehandROITool)
  cornerstoneTools.addTool(ArrowAnnotateTool)
  cornerstoneTools.addTool(ProbeTool)
  cornerstoneTools.addTool(EraserTool)

  const toolGroup = ToolGroupManager.createToolGroup(APP_CONFIG.toolGroupId)
  if (toolGroup) {
    for (const toolName of Object.values(NAV_TOOLS)) {
      toolGroup.addTool(toolName)
    }
    for (const toolName of Object.values(MEASUREMENT_TOOLS)) {
      toolGroup.addTool(toolName)
    }
    applyNavBindingsToToolGroup(toolGroup, getNavBindings())
  }

  renderingEngine = new RenderingEngine(APP_CONFIG.renderingEngineId)
  initialized = true
  return renderingEngine
}

export function getToolGroup() {
  return cornerstoneTools.ToolGroupManager.getToolGroup(APP_CONFIG.toolGroupId)
}

/** The four "navigation" tools whose mouse-button assignment is user-configurable. */
export const NAV_TOOLS = {
  WindowLevel: WindowLevelTool.toolName,
  Pan: PanTool.toolName,
  Zoom: ZoomTool.toolName,
  StackScroll: StackScrollTool.toolName,
} as const

export type NavToolName = (typeof NAV_TOOLS)[keyof typeof NAV_TOOLS]

/** Kept as an alias so any existing imports of the old name keep working. */
export const ACTIVE_TOOLS = NAV_TOOLS
export type ActiveToolName = NavToolName

/** Measurement / annotation tools, each mapped to a short label + lucide icon key. */
export const MEASUREMENT_TOOLS = {
  Length: LengthTool.toolName,
  Angle: AngleTool.toolName,
  CobbAngle: CobbAngleTool.toolName,
  Bidirectional: BidirectionalTool.toolName,
  Rectangle: RectangleROITool.toolName,
  Ellipse: EllipticalROITool.toolName,
  Circle: CircleROITool.toolName,
  Freehand: PlanarFreehandROITool.toolName,
  Arrow: ArrowAnnotateTool.toolName,
  Probe: ProbeTool.toolName,
  Eraser: EraserTool.toolName,
} as const

export type MeasurementToolName = (typeof MEASUREMENT_TOOLS)[keyof typeof MEASUREMENT_TOOLS]

export type MouseButtonSlot = 'left' | 'middle' | 'right'

export interface NavBindingConfig {
  left: NavToolName
  middle: NavToolName
  right: NavToolName
}

export const DEFAULT_NAV_BINDINGS: NavBindingConfig = {
  left: NAV_TOOLS.StackScroll,
  middle: NAV_TOOLS.Pan,
  right: NAV_TOOLS.WindowLevel,
}

const NAV_BINDINGS_STORAGE_KEY = 'dicom-viewer:nav-bindings'

export function getNavBindings(): NavBindingConfig {
  try {
    const stored = localStorage.getItem(NAV_BINDINGS_STORAGE_KEY)
    if (!stored) return DEFAULT_NAV_BINDINGS
    const parsed = JSON.parse(stored) as Partial<NavBindingConfig>
    const values = Object.values(NAV_TOOLS) as string[]
    if (
      parsed.left && values.includes(parsed.left) &&
      parsed.middle && values.includes(parsed.middle) &&
      parsed.right && values.includes(parsed.right)
    ) {
      return parsed as NavBindingConfig
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_NAV_BINDINGS
}

function saveNavBindings(config: NavBindingConfig) {
  localStorage.setItem(NAV_BINDINGS_STORAGE_KEY, JSON.stringify(config))
}

const SLOT_TO_MOUSE_BUTTON: Record<MouseButtonSlot, number> = {
  left: ToolEnums.MouseBindings.Primary,
  middle: ToolEnums.MouseBindings.Auxiliary,
  right: ToolEnums.MouseBindings.Secondary,
}

/**
 * Applies a left/middle/right -> tool mapping to the tool group. Two bindings
 * are always added on top of the user's mapping, regardless of what they've
 * chosen for the three buttons:
 *  - the mouse wheel always scrolls through images (near-universal
 *    expectation in image viewers), in addition to whichever button is
 *    mapped to Stack Scroll, if any;
 *  - Ctrl + wheel always zooms, so Zoom stays reachable even when it isn't
 *    assigned to one of the three buttons (there are 4 tools and only 3
 *    buttons, so one is always "the odd one out" by default).
 */
function applyNavBindingsToToolGroup(
  toolGroup: ReturnType<typeof getToolGroup>,
  config: NavBindingConfig,
  options?: { skipLeft?: boolean }
) {
  if (!toolGroup) return

  // IMPORTANT: setToolActive() *merges* new bindings with whatever bindings
  // the tool already had — it does not replace them — and the default
  // setToolPassive() only strips the primary/left binding, not all of them.
  // Re-applying a changed mapping without a hard reset first left stale
  // bindings active underneath the new ones (e.g. Stack Scroll would keep
  // responding to the left button even after reassigning left to something
  // else) — this was the bug where mouse-button changes silently didn't
  // take effect until a full page reload reset the tool group from scratch.
  // setToolEnabled() unconditionally resets a tool to `bindings: []`, so we
  // use it here as a clean slate before reapplying the current mapping.
  for (const toolName of Object.values(NAV_TOOLS)) {
    toolGroup.setToolEnabled(toolName)
  }

  type ToolBinding = { mouseButton?: number; modifierKey?: number; numTouchPoints?: number }
  const bindingsByTool = new Map<NavToolName, ToolBinding[]>()
  const addBinding = (tool: NavToolName, binding: ToolBinding) => {
    const list = bindingsByTool.get(tool) ?? []
    list.push(binding)
    bindingsByTool.set(tool, list)
  }

  ;(Object.entries(config) as [MouseButtonSlot, NavToolName][]).forEach(([slot, tool]) => {
    if (options?.skipLeft && slot === 'left') return
    addBinding(tool, { mouseButton: SLOT_TO_MOUSE_BUTTON[slot] })
  })
  addBinding(NAV_TOOLS.StackScroll, { mouseButton: ToolEnums.MouseBindings.Wheel })
  addBinding(NAV_TOOLS.Zoom, {
    mouseButton: ToolEnums.MouseBindings.Wheel,
    modifierKey: ToolEnums.KeyboardBindings.Ctrl,
  })

  // Touch has no left/middle/right buttons, so the mapping above doesn't
  // reach it — EXCEPT for a single finger, which Cornerstone's touch
  // dispatcher automatically routes to whichever tool owns the *primary*
  // (left) mouse button (see getActiveToolForTouchEvent in
  // @cornerstonejs/tools), so that part "just works" once a tool is bound
  // to `left` above. Two fingers have no such fallback, so we bind Zoom to
  // `numTouchPoints: 2` unconditionally here, independent of the user's
  // mouse mapping and never dropped by `skipLeft`. ZoomTool's default
  // configuration (`pinchToZoom: true`, `pan: true`) makes this single
  // binding handle pinch-to-zoom AND two-finger pan together, which is the
  // only way either is reachable on a touchscreen — there's no third
  // "button" to spare the way Ctrl+wheel gives Zoom a home on desktop.
  addBinding(NAV_TOOLS.Zoom, { numTouchPoints: 2 })

  for (const toolName of Object.values(NAV_TOOLS)) {
    const bindings = bindingsByTool.get(toolName)
    if (bindings && bindings.length > 0) {
      toolGroup.setToolActive(toolName, { bindings })
    }
    // else: already reset to Enabled with no bindings above — inert.
  }
}

/** Updates and persists the left/middle/right mouse-button mapping for the
 *  four navigation tools (Window/Level, Pan, Zoom, Stack Scroll). */
export function setNavBindings(config: NavBindingConfig) {
  saveNavBindings(config)
  applyNavBindingsToToolGroup(getToolGroup(), config)
}

/**
 * Activates a measurement/annotation tool on the primary (left) mouse
 * button, deactivating any other measurement tool and temporarily taking
 * over whichever navigation tool currently owns the left button — pan/zoom/
 * window-level on the other two buttons keep working while measuring.
 * Call exitMeasurementMode() to return to pure navigation.
 */
export function activateMeasurementTool(toolName: MeasurementToolName) {
  const toolGroup = getToolGroup()
  if (!toolGroup) return
  // Same merge-not-replace hazard as applyNavBindingsToToolGroup — fully
  // reset every measurement tool before activating the chosen one so a
  // previously-selected tool can't keep responding to clicks underneath it.
  for (const name of Object.values(MEASUREMENT_TOOLS)) {
    toolGroup.setToolEnabled(name)
  }
  toolGroup.setToolActive(toolName, {
    bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
  })
  // Re-apply the nav bindings with the left slot dropped, so whichever tool
  // is configured for the middle/right buttons (and wheel-scroll/ctrl-zoom)
  // keep working, but nothing else fights the measurement tool for the left
  // button. Reset-then-reapply (not setToolPassive) for the same reason as above.
  applyNavBindingsToToolGroup(toolGroup, getNavBindings(), { skipLeft: true })
}

/** Deactivates all measurement tools and restores the configured navigation bindings. */
export function exitMeasurementMode() {
  const toolGroup = getToolGroup()
  if (!toolGroup) return
  for (const name of Object.values(MEASUREMENT_TOOLS)) {
    toolGroup.setToolEnabled(name)
  }
  applyNavBindingsToToolGroup(toolGroup, getNavBindings())
}

export function clearAllAnnotations() {
  annotation.state.removeAllAnnotations()
}

/** Deletes whichever annotation(s) are currently selected (click an annotation to select it). */
export function deleteSelectedAnnotations(): number {
  const selected = annotation.selection.getAnnotationsSelected()
  for (const uid of selected) {
    annotation.state.removeAnnotation(uid)
  }
  return selected.length
}

export function getAnnotationCount(): number {
  return annotation.state.getAllAnnotations().length
}

/** Subscribes to annotation add/remove/selection-change events (fired on the
 *  core global event target, not the element) — used to keep UI badges/counts live. */
export function onAnnotationsChanged(callback: () => void): () => void {
  const events = [
    ToolEnums.Events.ANNOTATION_ADDED,
    ToolEnums.Events.ANNOTATION_REMOVED,
    ToolEnums.Events.ANNOTATION_MODIFIED,
  ]
  for (const evt of events) {
    eventTarget.addEventListener(evt, callback as EventListener)
  }
  return () => {
    for (const evt of events) {
      eventTarget.removeEventListener(evt, callback as EventListener)
    }
  }
}

/**
 * Turns a stored file's raw bytes into a Cornerstone imageId. Each browser
 * tab has its own in-memory fileManager, so this must be called again in
 * whichever tab is doing the rendering — the Blob itself comes from IndexedDB.
 */
export function registerFileAsImageId(data: ArrayBuffer, fileName: string): string {
  const blob = new Blob([data], { type: 'application/dicom' })
  const file = new File([blob], fileName, { type: 'application/dicom' })
  return cornerstoneDICOMImageLoader.wadouri.fileManager.add(file)
}

export function purgeFileManager() {
  cornerstoneDICOMImageLoader.wadouri.fileManager.purge()
}

export { CoreEnums }
export function getRenderingEngine() {
  return renderingEngine
}
