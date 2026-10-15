# PROJECT_CONTEXT.md — DICOM Viewer Backend

## Purpose

This backend is the server-side foundation for the existing React/Cornerstone DICOM viewer.
The frontend currently has a client-side IndexedDB implementation and a DICOMweb client seam.
The backend is intended to replace browser-local persistence for studies and DICOM objects.

## Current architecture

- ASP.NET Core 10
- SQL Server metadata store
- ADO.NET + stored procedures (not EF Core)
- Fellow Oak DICOM for DICOM parsing
- Local filesystem DICOM object storage for development
- OpenAPI via Microsoft.AspNetCore.OpenApi
- Scalar API docs
- Modular monolith: Api / Application / Domain / Infrastructure

## Storage rule

SQL Server stores metadata and references only.
Actual DICOM bytes live behind `IDicomObjectStore`.
The current implementation is `LocalFileDicomObjectStore` using `Storage:RootPath`.
StorageKey is relative to that root.
Do not store DICOM pixel data in SQL Server.

## Frontend boundary

Frontend responsibilities:
- Cornerstone rendering
- viewport/layout state
- navigation/measurement tools
- browser-side image cache
- responsive UI

Backend responsibilities:
- study/series/instance metadata
- DICOM object retrieval
- DICOM ingestion/indexing
- authorization (future)
- audit (future)
- workflow (future)

## APIs

REST:
- GET /api/studies
- GET /api/studies/{studyUid}
- GET /api/studies/{studyUid}/series
- GET /api/studies/{studyUid}/series/{seriesUid}/instances
- GET /api/studies/{studyUid}/series/{seriesUid}/instances/{sopUid}

DICOMweb-style:
- GET /dicomweb/studies (QIDO-style study search)
- GET /dicomweb/studies/{studyUid}/series/{seriesUid}/instances/{sopUid} (WADO-style instance retrieve)

Admin development endpoint:
- POST /api/admin/import-local-folder

## Performance rules

1. Do not load entire DICOM files into memory for retrieval.
2. Stream DICOM instance responses.
3. Use CancellationToken through HTTP -> Application -> SQL/storage.
4. Use pagination for worklist queries.
5. Keep hot query fields indexed in SQL Server.
6. Avoid N+1 queries.
7. Keep DICOM bytes outside SQL Server.
8. Treat local filesystem as a development adapter only; production should use durable shared/object storage.
9. Long-running ingestion should eventually move to a durable queue/worker.
10. Do not introduce microservices prematurely; keep the modular monolith until scale requires decomposition.

## Future production path

- OIDC/OAuth2 authentication
- role/tenant authorization
- audit trail
- Redis cache where measurements justify it
- durable ingestion queue
- object storage
- full QIDO-RS/WADO-RS/STOW-RS support
- optional DIMSE integration for modality/PACS interoperability
- OpenTelemetry metrics/traces/log correlation

## Important non-goals

Do not couple SQL Server entities directly to HTTP DTOs.
Do not let controllers contain business logic.
Do not let domain code depend on SQL, HTTP, filesystem, Redis, or DICOM library types.
Do not use Base64 for DICOM pixel transfer.

## Backend build notes
- `DicomViewer.Infrastructure` is a class library and therefore uses explicit `Microsoft.Extensions.Configuration` / `Microsoft.Extensions.Logging` usings where those abstractions are injected.
- `Microsoft.OpenApi` must stay on a patched release (2.7.5+ on the 2.x line) because older 2.x releases are affected by CVE-2026-49451 / GHSA-v5pm-xwqc-g5wc.
- `Instance.StorageKey` is `NVARCHAR(1024)` and must not be used as a normal nonclustered index key because SQL Server limits nonclustered index key size to 1700 bytes.
- Local filesystem storage is a development adapter; SQL Server stores metadata and storage keys, not DICOM pixel data.
