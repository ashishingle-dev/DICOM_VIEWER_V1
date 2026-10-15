# Migrating to a real PACS (DICOMweb)

This app currently runs entirely client-side: files come from local upload, metadata and pixel
data live in the browser's IndexedDB, and nothing leaves the machine. This document describes
what changes when you're ready to point it at a real PACS/VNA instead.

**Nothing here is wired into the UI yet.** `src/lib/pacs/dicomWebClient.ts` is a complete,
working DICOMweb (QIDO-RS + WADO-RS) client — the protocol every major PACS speaks (Orthanc,
dcm4chee, Google Healthcare API, AWS HealthImaging, most commercial PACS with a DICOMweb
gateway) — but the worklist and viewer still read from IndexedDB. This doc is the map for
connecting the two.

## The three things that change

### 1. Worklist data source: IndexedDB studies → QIDO-RS query

Today, `WorklistPage.tsx` calls `getAllStudies()` (`src/lib/db.ts`), which reads studies parsed
from locally uploaded files. To go live:

- Replace that call with `queryStudies(pacsConfig, searchParams)` from
  `src/lib/pacs/dicomWebClient.ts`. It returns the same shape of information (patient name/ID,
  study date, description, accession number, modalities) via a QIDO-RS `GET /studies` request.
- The worklist's search/filter UI (currently just an upload dropzone) becomes a real search form
  — patient name, patient ID, date range, modality — passed straight through as QIDO-RS query
  parameters.
- Series and instances for a given study come from `querySeries()` / `queryInstances()`, called
  either eagerly when populating the worklist or lazily when a study is opened in the viewer —
  lazily is usually better for a large PACS.
- Consider polling or a "refresh" button instead of a one-time load, since a real worklist changes
  as new studies arrive.

### 2. Image loading: `dicomfile:` → `wadors:` imageIds

Today, `registerFileAsImageId()` (`src/lib/cornerstoneSetup.ts`) turns a locally-stored
`ArrayBuffer` into a `dicomfile:` imageId via Cornerstone's `wadouri.fileManager`. For DICOMweb:

- Use `buildWadoRsImageId(pacsConfig, studyUID, seriesUID, sopUID, frameNumber)` instead — it
  returns a `wadors:` imageId pointing at the PACS's WADO-RS frame endpoint. **No file bytes are
  downloaded up front**; Cornerstone fetches each frame's pixel data on demand as it's displayed,
  which is the whole point of DICOMweb (a study can be gigabytes; you don't want to download all
  of it just to browse the worklist).
- Before an imageId can be loaded, its DICOM-JSON metadata needs to be registered once via
  `registerWadoRsMetadata()` (also in `dicomWebClient.ts`) — this is what lets Cornerstone know
  the image's rows/columns/photometric interpretation/window defaults/etc. without parsing pixel
  data. Do this when a series is selected, before calling `viewport.setStack(imageIds, ...)`.
- The `wadors` loader is **already registered** — `ensureCornerstoneInitialized()` in
  `cornerstoneSetup.ts` calls `cornerstoneDICOMImageLoader.init()`, which sets up both `wadouri`
  and `wadors` loaders unconditionally. No init changes needed on the Cornerstone side.
- `src/lib/seriesImageCache.ts` (the per-series imageId cache used across tiled viewports) should
  keep working as-is — swap what's inside its resolver function from
  `registerFileAsImageId(...)` to `buildWadoRsImageId(...)` + `registerWadoRsMetadata(...)`, same
  return shape (`Promise<string[]>`).
- Multi-frame instances (`numberOfFrames > 1` from `queryInstances()`) need one imageId per frame
  number, not just one per instance — `dicomParser.ts`'s current model assumes one image per file,
  which holds for single-frame instances but not multi-frame ones (common in US, XA, NM). Worth
  handling explicitly if your PACS serves multi-frame studies.

### 3. IndexedDB's role shrinks to a cache (optional)

With a live PACS, IndexedDB (`src/lib/db.ts`) is no longer the source of truth — the PACS is. You
can either:

- **Drop it entirely** — query QIDO-RS fresh every time the worklist loads, and let Cornerstone's
  own image cache (already present, separate from our IndexedDB layer) handle in-memory reuse
  while a viewer tab is open.
- **Keep it as an offline cache** — worth doing if the app needs to work with spotty connectivity,
  caching recently-viewed studies' metadata (and optionally pixel data) locally, falling back to
  it when the PACS is unreachable. If you go this route, key cache entries by
  `studyInstanceUID`/`sopInstanceUID` exactly as today so the existing schema still applies.

## What stays the same

Everything downstream of "here's a list of imageIds" is unaffected — the grid layout system,
synchronized scroll within a tiled cell, measurement/annotation tools, mouse-button configuration,
and the four-corner overlay (including orientation labels, which read `ImageOrientationPatient`
from `SeriesRecord` regardless of where that record came from) all operate on Cornerstone
viewports and don't know or care whether their imageIds point at `IndexedDB` or a PACS.

## Auth, CORS, and other practical notes

- **CORS**: the PACS's DICOMweb gateway must allow cross-origin requests from wherever this app is
  hosted (`Access-Control-Allow-Origin`, and `Access-Control-Allow-Headers` covering `Authorization`
  if you use one). Orthanc's DICOMweb plugin and dcm4chee both support this via configuration.
- **Auth**: `PacsConfig.authorization` in `dicomWebClient.ts` is a raw header value (e.g.
  `Bearer <token>`) attached to every request. For a real deployment, token refresh/expiry needs
  handling above this layer — this client intentionally stays low-level and stateless.
- **A backend proxy is usually the right call in production** rather than hitting the PACS
  directly from the browser: it keeps credentials off the client, can normalize CORS, and can add
  caching/rate-limiting. `dicomWebClient.ts`'s `baseUrl` can just as easily point at your own
  backend's DICOMweb-shaped proxy endpoint as at the PACS directly.
- **Try it locally first**: [Orthanc](https://www.orthanc-server.com/) with its DICOMweb plugin is
  the fastest way to stand up a real PACS to develop against — a Docker one-liner
  (`docker run -p 8042:8042 -p 4242:4242 jodogne/orthanc-plugins`) gets you QIDO-RS/WADO-RS at
  `http://localhost:8042/dicom-web`.
