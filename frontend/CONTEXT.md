# CONTEXT.md — quick orientation for future sessions

Read this first. Read `README.md` for the general "how it works" (IndexedDB, tab/window
open flow) and `PACS_MIGRATION.md` for the DICOMweb migration path. This file is about the
**viewer's structure and conventions** — where to look before changing something.

## Stack
React 19 + Vite + TypeScript, Tailwind CSS v4, Cornerstone3D `^5.7.0`
(`@cornerstonejs/core` + `@cornerstonejs/tools` + `@cornerstonejs/dicom-image-loader`), `dcmjs`
for parsing, `idb` for IndexedDB. No backend — everything is client-side (see README).

## Directory map
```
src/
  config.ts                        App-wide config (viewer open-mode, rendering engine id)
  types/
    dicom.ts                       StudyRecord / SeriesRecord / InstanceRecord
    layout.ts                      GridSize, CellState, MAX_GRID (=4), makeCells()
  lib/
    db.ts                          IndexedDB persistence
    dicomParser.ts                 dcmjs-based parsing + study/series grouping
    cornerstoneSetup.ts            Cornerstone init, tool group, mouse+touch bindings ★
    seriesImageCache.ts            Per-series imageId cache shared across tiled viewports
    pacs/dicomWebClient.ts         DICOMweb client (not wired into UI yet — see PACS_MIGRATION.md)
  hooks/
    useDicomLayout.ts              Multi-viewport layout state, active tile, tool switching
    useIsTouchDevice.ts            Reactive `(pointer: coarse)` check — drives touch-vs-mouse UI ★
  pages/
    WorklistPage.tsx, ViewerPage.tsx
  components/
    viewer/
      ViewerToolbar.tsx            Top-level toolbar; branches MouseBindingSettings vs TouchToolSettings
      LayoutPicker.tsx             Outer grid + per-cell layout picker (one popover, both grids side-by-side)
      MouseBindingSettings.tsx     Desktop-only: left/middle/right → tool mapping
      TouchToolSettings.tsx        Touch-only: single-finger tool switcher + static pinch-zoom hint
      AnchoredPopover.tsx          Shared portal-based popover used by the two above ★
      ViewportGrid.tsx             Renders the outer grid of cells, each cell tiled per its imageLayout
      ViewportTile.tsx             One Cornerstone stack viewport; mount/unmount, event wiring
      DicomOverlay.tsx             Text overlay (WW/WL, zoom%, image index) on the active tile
      SeriesPanel.tsx              Series list — always-visible column on desktop, drawer on mobile

★ = touched by the mobile/tablet touch-support work described below; read these first if you're
    debugging pan/zoom/window-level or a popover on a phone/tablet.
```

## Layout model
Two nested grids, both user-configurable, both 1..`MAX_GRID` (4) per axis:
- **Outer grid** (`outerLayout`, `useDicomLayout`): how many *cells* — each cell holds one series.
- **Per-cell image layout** (`cell.imageLayout`): how many *tiles* within the active cell, for
  scrolling several consecutive images of that series at once (e.g. a 2×2 of consecutive slices).
`LayoutPicker` edits both from one popover — "Viewport Grid" (outer) and "Active Cell" (per-cell)
side-by-side, not tabs/toggle. Keep it that way if asked to touch this UI again; a toggle between
the two was explicitly removed/avoided because it slows down a workflow radiologists do constantly.

## Touch/tablet support — how it works
Desktop uses configurable **mouse-button bindings** (`NavBindingConfig`: left/middle/right →
Window/Level, Pan, Zoom, or Stack Scroll), persisted to `localStorage` and applied via
`applyNavBindingsToToolGroup()` in `cornerstoneSetup.ts`. Touch has no buttons, so:

- **1 finger** — Cornerstone's own touch dispatcher (`getActiveToolForTouchEvent`, inside
  `@cornerstonejs/tools`) automatically routes a single-finger drag to whatever tool is bound to
  the *primary* mouse button (i.e. the `left` slot) — no extra binding needed on our side. So on
  touch, `TouchToolSettings` just writes to `bindings.left`, same as picking "Left Mouse" on
  desktop; the underlying tool group config is identical.
- **2 fingers** — always Zoom, via an unconditional `{ numTouchPoints: 2 }` binding added in
  `applyNavBindingsToToolGroup()`, independent of the user's mouse mapping (touch has no
  Ctrl+wheel fallback the way desktop does). ZoomTool's default config (`pinchToZoom: true,
  pan: true`) makes this one binding handle pinch-zoom *and* two-finger pan together. Not
  user-configurable — shown as a static hint in `TouchToolSettings`, not a picker.
- **`touch-action: none`** is set inline on each `ViewportTile`'s element — without it the
  browser treats drags as page scroll/pinch-zoom and Cornerstone never sees the gesture. Don't
  add this globally; it's scoped to the canvas so the series drawer etc. still scroll normally.
- **Tile activation** (which cell/tile is "active") listens on `pointerdown`, not `mousedown` —
  Cornerstone's touch handlers call `preventDefault()`, which can suppress the synthetic
  `mousedown` a tap would otherwise produce.
- `useIsTouchDevice()` (matchMedia `(pointer: coarse)`, reactive) decides `MouseBindingSettings`
  vs `TouchToolSettings` in `ViewerToolbar`. Don't gate touch *bindings* on this hook — those are
  applied unconditionally in `cornerstoneSetup.ts` so a touch+mouse hybrid device (Surface-style
  laptop) gets both. Only the *settings UI* is conditional.

## Popovers — always use `AnchoredPopover`
`LayoutPicker` and `MouseBindingSettings` render their dropdown panels through
`AnchoredPopover` (portals to `document.body`, `position: fixed`, clamped to the viewport).
**Do not** go back to an in-place `absolute` popover inside the toolbar. Reason: the toolbar is
`overflow-x-auto` below the `lg` breakpoint (so its buttons scroll horizontally on mobile), and
per the CSS overflow spec, setting only `overflow-x` forces `overflow-y` to compute as `auto`
too — there's no "scroll on one axis, visible on the other." That silently clipped anything
popping upward out of the toolbar, which is exactly what these popovers do. Any *new* toolbar
popover should use `AnchoredPopover` too, for the same reason plus the touch-friendly
`pointerdown` outside-close it already handles.

## Conventions worth knowing
- Toolbar item styling is a small `itemClass(active: boolean)` helper, duplicated per-file
  (ViewerToolbar, LayoutPicker, MouseBindingSettings, TouchToolSettings) rather than shared —
  intentional, kept each file self-contained; if you add a 5th toolbar sub-component, duplicating
  it again is fine and matches the existing pattern.
- `NavBindingConfig` / nav tool constants live in `cornerstoneSetup.ts`, not `types/`, since
  they're tightly coupled to the Cornerstone tool group setup.
- Cell/tile ids are string-composed (`cell-N__tile-M`), not numeric — see `ViewportGrid.tsx`.
- `useDicomLayout.ts` keeps per-cell "base index" bookkeeping in a `ref`, not state, for
  synchronized multi-tile scrolling at native event speed — see its comments before changing.

## Backend integration
The production data source is now the ASP.NET Core DICOM backend, not IndexedDB. Worklist metadata comes from `/api/studies`, study/series/instance metadata comes from `/api/...`, uploads go to STOW-style `/dicomweb/studies`, and Cornerstone uses `wadouri:` imageIds pointing at the backend WADO endpoint. IndexedDB/db.ts remains in the repository only for legacy/offline work and is not the source of truth for the live worklist/viewer.
Set `VITE_API_BASE_URL` for the API origin (default local development: `http://localhost:5243`).
