# PROJECT_CONTEXT.md — integrated DICOM viewer architecture

## Data source
The React viewer is no longer client-authoritative for live PACS data. The ASP.NET Core 10 backend is the source of truth. SQL Server stores Patient/Study/Series/Instance metadata; the configured filesystem stores the actual DICOM objects. IndexedDB/db.ts remains legacy/offline code and is not used by the live WorklistPage or ViewerPage.

## Frontend/backend boundary
- Worklist: `src/lib/pacs/apiClient.ts` -> `GET /api/studies`
- Study: `GET /api/studies/{studyUid}`
- Series: `GET /api/studies/{studyUid}/series`
- Instances: `GET /api/studies/{studyUid}/series/{seriesUid}/instances`
- Upload: `POST /dicomweb/studies` multipart/form-data
- Delete: `DELETE /api/studies/{studyUid}`
- Image retrieval: Cornerstone uses `wadouri:` imageIds backed by `GET /dicomweb/wado?requestType=WADO&studyUID=...&seriesUID=...&objectUID=...&contentType=application/dicom`.

## Rendering
`seriesImageCache.ts` now creates server-backed WADO-URI imageIds. Cornerstone fetches individual DICOM objects on demand; DICOM bytes are not copied into browser IndexedDB.

## Layout and interaction
Keep existing two-level layout picker side-by-side (main viewport grid + active-cell grid), mobile/tablet bottom toolbar, touch tool settings, and portal-based popovers. Do not reintroduce a main/cell layout toggle.

## Backend storage
The current development object store is local filesystem storage through `IDicomObjectStore`. Replace only the Infrastructure storage adapter when moving to Azure Blob/S3/MinIO. SQL Server should remain metadata/workflow state, never the DICOM pixel store.

## DICOM ingest
- Existing folder import: `POST /api/admin/import-local-folder` for migration/indexing.
- Runtime upload: `POST /dicomweb/studies`.
- Future production ingress: DICOM C-STORE receiver/worker -> object storage + metadata indexing.

## Performance rules
- Do not download an entire study when opening the worklist.
- Lazy-load series/instance metadata when a series is selected.
- Let Cornerstone cache/render images in memory.
- Keep cancellation tokens through API/storage/DB calls.
- Keep the API stateless so it can scale horizontally later.
