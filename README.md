# DICOM Viewer — Integrated Frontend + .NET 10 Backend

## Structure
- `frontend/` React 19 + Vite + Cornerstone3D viewer.
- `backend/` ASP.NET Core 10 + SQL Server + local DICOM filesystem storage.

## Run locally
1. Start SQL Server and execute the backend SQL scripts if not already done.
2. Configure `backend/src/DicomViewer.Api/appsettings.json` with your SQL Server and DICOM root folder.
3. Start the API from `backend/`:
   `dotnet run --project .\\src\\DicomViewer.Api\\DicomViewer.Api.csproj`
4. Start the frontend from `frontend/`:
   `npm install`
   `npm run dev`
5. Copy `.env.example` to `.env.local` if needed and set `VITE_API_BASE_URL=http://localhost:5243` (use the actual HTTP API URL from launchSettings).
6. Run `backend/database/004_auth.sql` and set the auth variables described in `backend/README.md` section 8, then sign in at the frontend URL with the bootstrap admin account.
7. Open the frontend URL. The worklist reads SQL Server metadata from the API. Uploads use STOW-style multipart upload. Viewer images are streamed from the configured DICOM filesystem through the API.

## Production
Set `VITE_API_BASE_URL` to the deployed ASP.NET Core API origin in Netlify. Configure backend CORS to allow the Netlify origin. Keep DICOM storage outside the application deployment directory.
