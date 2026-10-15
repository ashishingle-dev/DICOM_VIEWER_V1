# DICOM Worklist Viewer

A local-first DICOM worklist + viewer built with React, Vite, TypeScript, Tailwind CSS,
[dcmjs](https://github.com/dcmjs-org/dcmjs) and [Cornerstone3D](https://www.cornerstonejs.org/).

Upload DICOM files or a whole study folder, browse them in a worklist grid, and open any
study in a full DICOM image viewer — launched in a **new browser tab or a new popup window**,
your choice.

## Getting started

```bash
npm install
npm run dev
```

Open the printed local URL, drop some `.dcm` files (or a folder) onto the worklist, and click
a row to open the viewer.

```bash
npm run build     # production build to dist/
npm run preview   # serve the production build locally
```

## How it works

**Everything stays in your browser.** There is no backend — files are parsed client-side with
`dcmjs`, and both the study metadata and the raw file bytes are persisted to **IndexedDB**
(`src/lib/db.ts`). Nothing is uploaded anywhere.

**Why IndexedDB, and not just React state?** The viewer opens in a *new* browser tab/window
(`window.open`), which is a separate JavaScript context with no access to the worklist tab's
memory — a plain `File` object or in-memory array can't cross that boundary. IndexedDB is
the one storage mechanism both tabs share on disk, so the flow is:

1. Worklist tab parses uploaded files and writes study metadata + raw bytes to IndexedDB.
2. Worklist tab opens `/viewer/:studyInstanceUID` in a new tab/window.
3. Viewer tab reads that study's metadata and file bytes back out of IndexedDB on mount,
   and re-registers each file with Cornerstone's local file loader (`src/lib/cornerstoneSetup.ts`)
   — this registration is per-tab and can't be shared, but the underlying bytes are.

**Open mode is configurable** in `src/config.ts` (`APP_CONFIG.viewerOpenMode`, defaults to
`'tab'`) and can also be toggled live from the worklist header — the choice is remembered in
`localStorage`. `'window'` opens a chrome-less popup sized via `viewerWindowFeatures`.

## Project structure

```
src/
  config.ts                 App-wide config incl. viewer open-mode
  types/dicom.ts             StudyRecord / SeriesRecord / InstanceRecord types
  lib/
    db.ts                    IndexedDB persistence (idb)
    dicomParser.ts            dcmjs-based parsing + study/series grouping
    formatters.ts              DICOM date/time/person-name formatting
    cornerstoneSetup.ts       Cornerstone3D init, tool group, file->imageId
  hooks/useDicomLayout.ts    Multi-viewport layout state, active tile, tool switching
  lib/seriesImageCache.ts   Per-series imageId cache shared across tiles
  types/layout.ts            Grid layout types (outer grid + per-cell sub-layout)
  components/
    UploadDropzone.tsx        Drag-drop + file/folder pickers
    StudyTable.tsx             Worklist grid
    ViewerModeToggle.tsx       Tab vs window switch
    viewer/
      SeriesPanel.tsx           Series list/switcher
      ViewerToolbar.tsx         Invert / Reset + mouse-button config trigger
      MouseBindingSettings.tsx  Popover to reassign L/M/R mouse buttons
      MeasurementToolbar.tsx    Annotation tool row + clear/delete actions
      LayoutPicker.tsx          Hover grid-size picker (outer grid + per-cell)
      ViewportGrid.tsx          Renders outer cells + each cell's image sub-grid
      ViewportTile.tsx          One Cornerstone stack viewport (self-managed lifecycle)
      DicomOverlay.tsx          Four-corner PACS-style overlay text (active tile)
  pages/
    WorklistPage.tsx
    ViewerPage.tsx
```

## Layout

- **Grid layout**: the layout picker in the single toolbar (hover-to-pick, up to **4×4**) splits
  the main area into that many cells, each showing a series. Click a cell (or any image tile
  inside it) to activate it — it's what "activate a cell" and "series box" mean below — then pick
  a series from the left panel to load it there.
- **Per-cell image layout**: each cell that has a series shows its own small grid-layout button in
  its header — up to **4×4** images from that same series, tiled side by side.
- **Synchronized scroll within a cell**: when a cell is tiled (e.g. 2×2 = 4 images), scrolling or
  dragging with the Stack Scroll tool on *any* tile in that cell moves all of that cell's tiles
  together, keeping their relative offset (tile 0 shows image N, tile 1 shows N+1, and so on).
  Pan/zoom/window-level remain independent per tile.
- **Active cell**: outlined with an accent border. Invert/Reset and the mouse-button tools act on
  whichever tile you last clicked.
- **Per-cell overlay**: each series box has its own four-corner overlay (patient/study info,
  anatomical plane, image position, window/zoom) — not one overlay for the whole grid.

## Anatomical orientation

Each cell's overlay shows the acquisition plane (**Axial / Sagittal / Coronal**, or **Oblique**
for tilted acquisitions) and edge markers (L/R, A/P, H/F) at the image's top/bottom/left/right,
derived from the DICOM `ImageOrientationPatient` tag via the standard direction-cosine algorithm
(`src/lib/orientation.ts`) — the same technique real PACS viewers use. Series without orientation
data (e.g. some secondary captures) simply show no plane/edge labels.

## Connecting to a real PACS

Everything above runs entirely client-side today — local file upload, IndexedDB storage, no
server. `src/lib/pacs/dicomWebClient.ts` is a working DICOMweb (QIDO-RS/WADO-RS) client, ready to
wire in when you're ready to point this at a real PACS instead of local files. See
**[PACS_MIGRATION.md](./PACS_MIGRATION.md)** for exactly what changes and where.

## Viewer controls

**Everything in a single toolbar** — grid layout, mouse-button config, invert/reset, and all
measurement tools live in one row so it scales as more tools get added, rather than one row per
feature.

**Mouse buttons (configurable)** — click the mouse-button readout in the toolbar (e.g. "L:Scroll · M:Pan · R:Window") to reassign. Each of the three buttons can be set to Window/Level, Pan, Zoom, or Stack Scroll — **press and hold the button, then drag** to use whichever tool is assigned:

- **Default**: Left = Stack Scroll, Middle = Pan, Right = Window/Level
- **Mouse wheel** always scrolls through images, regardless of what's assigned to the buttons
- **Ctrl + wheel** always zooms — since there are 4 navigation tools and only 3 buttons, Zoom is reachable this way even when it isn't assigned to a button

**Measurement / annotation tools** — a second toolbar row: Length, Angle, Cobb Angle, Bidirectional, Rectangle, Ellipse, Circle, Freehand, Arrow (with a text label), Probe (pixel value readout), and Eraser. Selecting one activates it on the **left mouse button only**; middle/right stay on whatever pan/zoom/window-level tool you've configured, so you can still navigate while measuring. Click **Navigate** to leave measurement mode and restore your configured left-button tool. **Delete selected** removes the currently-selected annotation (click one to select it, or press Delete/Backspace with it selected); **Clear all** removes every annotation on the current image.

**View**:
- **Invert**: toggles grayscale inversion
- **Reset**: resets pan/zoom/window and returns to the default image

## Scope notes

- `dcmjs` is used for metadata parsing on upload; pixel rendering and decoding is handled by
  Cornerstone3D's own DICOM image loader (`@cornerstonejs/dicom-image-loader`), which already
  wraps `dicom-parser` and web-worker-based codec decoding — using both `dcmjs` and Cornerstone's
  loader for *rendering* would be redundant.
- Files that aren't valid DICOM (e.g. `DICOMDIR`, thumbnails mixed into a folder) are silently
  skipped during ingest rather than aborting the whole upload; the progress bar reports a skip count.
- No MPR, segmentation, or multi-monitor sync in this version — the viewport is a single 2D stack.
- Mouse-button assignments and viewer open-mode are both persisted per-browser in `localStorage`
  (`src/lib/cornerstoneSetup.ts` / `src/config.ts`), so preferences carry across sessions.
