# DICOM Viewer Backend — .NET 10

A development-ready modular monolith for the React/Cornerstone DICOM viewer.

## What is included

- .NET 10 ASP.NET Core API
- Built-in OpenAPI generation
- Scalar interactive API docs at `/scalar/v1`
- SQL Server metadata persistence through ADO.NET + stored procedures
- Local filesystem DICOM object storage
- Fellow Oak DICOM parsing
- Study/series/instance APIs
- QIDO-RS-style study search endpoint
- WADO-RS-style single-instance retrieval endpoint
- Local-folder metadata import endpoint
- Health endpoint
- CORS for the Netlify frontend
- CancellationToken propagation and streaming DICOM responses

## Important storage decision

You can absolutely use a folder on your development PC right now. Configure:

`Storage:RootPath`

For example:

`C:\DICOM`

The API does not copy DICOM data into SQL Server. SQL Server stores metadata and a relative `StorageKey`; the filesystem stores the actual DICOM objects.

This is appropriate for development/single-machine deployment. It is NOT highly available storage and should be replaced by network/object storage for production.

## Prerequisites

- .NET SDK 10
- SQL Server 2019+ / SQL Server Express / LocalDB
- A local folder containing DICOM files
- Windows is recommended for this local-folder development setup

## 1. Configure SQL Server

Edit `src/DicomViewer.Api/appsettings.json`.

Default connection string:

`Server=localhost;Database=DicomViewer;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=False;Encrypt=False`

Change it to match your SQL Server instance.

## 2. Configure DICOM folder

Edit:

`src/DicomViewer.Api/appsettings.json`

Set:

```json
"Storage": {
  "RootPath": "C:\\DICOM"
}
```

Use an absolute path.

Do NOT put the DICOM folder inside the application directory.

## 3. Create the database

Open SQL Server Management Studio and execute these in order:

1. `database/001_schema.sql`
2. `database/002_procedures.sql`

The scripts create the `DicomViewer` database, tables, indexes, and stored procedures.

## 4. Restore and run

From the solution directory:

```powershell
dotnet restore
dotnet run --project src/DicomViewer.Api
```

The launch profile uses:

- HTTPS: `https://localhost:7243`
- HTTP: `http://localhost:5243`
- Scalar: `https://localhost:7243/scalar/v1`
- OpenAPI JSON: `https://localhost:7243/openapi/v1.json`
- Health: `https://localhost:7243/health`

## 5. Import the existing DICOM folder

Once SQL Server and the API are running:

```http
POST /api/admin/import-local-folder
```

Open Scalar and execute it.

The service recursively scans the configured folder, parses each DICOM file, and upserts its metadata into SQL Server.

The operation is idempotent by SOP Instance UID. Running the import again updates the metadata instead of creating duplicate instance rows.

## 6. Test the APIs

All endpoints require a bearer token except `/health`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, and the OpenAPI/Scalar docs. Log in first (section 8) and send `Authorization: Bearer <accessToken>`.

### Search studies

```http
GET /api/studies?page=1&pageSize=50
```

### Get study

```http
GET /api/studies/{studyInstanceUid}
```

### Get series

```http
GET /api/studies/{studyInstanceUid}/series
```

### Get instances

```http
GET /api/studies/{studyInstanceUid}/series/{seriesInstanceUid}/instances
```

### Retrieve a DICOM instance

```http
GET /dicomweb/studies/{studyUid}/series/{seriesUid}/instances/{sopUid}
```

The response is streamed as `application/dicom` and supports range processing.

## 7. Connect the React app

Replace the current IndexedDB study/instance read path with API calls to the backend.

Use the existing `src/lib/pacs/dicomWebClient.ts` integration point in the frontend.

Recommended development topology:

React/Vite:
`http://localhost:5173`

API:
`https://localhost:7243`

Add your actual frontend URL to `Cors:AllowedOrigins`.

## Production limitations of this starter

This version intentionally does NOT include:

- Authentication/authorization
- Multi-tenancy
- Audit logging
- Redis
- Message broker
- Object storage
- TLS certificate automation
- HA SQL Server
- DICOM C-STORE SCP
- C-FIND / C-MOVE DIMSE services
- Full multipart DICOMweb study/series retrieval
- Asynchronous durable DICOM ingestion queue

Those should be added before exposing the system to a hospital network or production PHI.

## Architecture

```text
React + Cornerstone
        |
        | HTTPS / REST / DICOMweb
        v
ASP.NET Core 10 API
        |
        +---- Application services
        |
        +---- ADO.NET / Stored Procedures ----> SQL Server
        |
        +---- Local filesystem adapter ----------> DICOM folder
```

The filesystem is an infrastructure adapter. Later you can implement `IDicomObjectStore` with Azure Blob, S3, or another object store without changing the API contract.

## Frontend integration
The companion React viewer uses `VITE_API_BASE_URL` to call this API. The frontend worklist uses `/api/studies`, uploads use `POST /dicomweb/studies`, series/instance metadata uses `/api/studies/{studyUid}/series...`, and Cornerstone uses the WADO-URI-compatible `/dicomweb/wado` endpoint. This keeps SQL Server as the metadata index and the configured filesystem as DICOM object storage.

## 8. Authentication and authorization

The API uses short-lived JWT access tokens and a rotating refresh token held in an `HttpOnly` cookie. Every endpoint requires an authenticated caller by default; only the endpoints listed in section 6 and the auth endpoints below are anonymous.

### Roles

| Role     | Can do |
|----------|--------|
| `Viewer` | Browse the worklist, open studies, retrieve images |
| `Admin`  | Everything a Viewer can, plus upload (`POST /dicomweb/studies`), delete studies, run the folder import, and create users |

### Set up

1. Run `database/004_auth.sql`, then `database/005_auth_hardening.sql` (adds lockout columns and the cleanup and password procedures), after the earlier scripts.
2. Set a signing key and the first administrator as environment variables (PowerShell 7):

```powershell
$env:Auth__Jwt__SigningKey = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$env:Auth__BootstrapAdmin__Username = "admin"
$env:Auth__BootstrapAdmin__Password = "<at least 12 characters>"
```

The API refuses to start if `Auth__Jwt__SigningKey` is shorter than 32 bytes. The bootstrap admin is created only when the `AppUser` table is empty, so it is safe to leave the variables set, but removing them is better practice.

3. Start the API and sign in:

```http
POST /api/auth/login
Content-Type: application/json
X-Requested-With: dicom-viewer
Origin: https://your-frontend.example.com

{ "username": "admin", "password": "...", "rememberMe": false }
```

Response: `accessToken`, `accessTokenExpiresAtUtc`, and `user`. The refresh token is **not** in the body. It is set as the `__Host-dv_rt` cookie (`HttpOnly`, `Secure`, `Path=/`).

### Endpoints

Cookie-bearing endpoints (`/login`, `/refresh`, `/logout`, `/change-password`) require two CSRF defences: the header `X-Requested-With: dicom-viewer`, and an `Origin` header that matches `Cors:AllowedOrigins`. Requests missing either are rejected. When testing in Scalar, add the header and send from an allowed origin, or add the origin to `Cors__AllowedOrigins__0`.

| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| POST | `/api/auth/login` | anonymous, CSRF checks, rate limited (10/min per IP) | Body `{ username, password, rememberMe }`. Returns an access token and sets the refresh cookie |
| POST | `/api/auth/refresh` | anonymous, CSRF checks | Reads the refresh cookie, rotates it, returns a new access token. 401 clears the cookie |
| POST | `/api/auth/logout` | anonymous, CSRF checks | Revokes the cookie's refresh token, clears the cookie, returns 204 |
| GET | `/api/auth/me` | any signed-in user | Current user from the access token |
| POST | `/api/auth/change-password` | signed in, CSRF checks, rate limited | Body `{ currentPassword, newPassword }`. Minimum 12 characters. Revokes all other sessions and issues a fresh one for this browser |
| POST | `/api/admin/users` | Admin | Body `{ username, password, role }`, where role is `Admin` or `Viewer` |

### Lockout

Five consecutive failed logins lock the account for 15 minutes. A successful login resets the counter. During a lock, login returns the same generic error as a wrong password, so the lock does not reveal the account. Change-password returns 429 while locked. Unknown usernames take the same time to answer as wrong passwords.

### Remember me

The login form has a **Keep me signed in on this device for 30 days** checkbox, off by default.

- Unchecked: the refresh cookie is a session cookie (cleared when the browser closes). The refresh token lives 12 hours (`Auth:Jwt:SessionRefreshHours`).
- Checked: the cookie is persistent for 30 days (`Auth:Jwt:RememberMeRefreshDays`). Each refresh keeps the same setting.

### Token behaviour

- **Access token**: HS256 JWT, 15 minutes (`Auth:Jwt:AccessTokenMinutes`), audience `dicom-viewer-api`. Carries `sub`, `name`, `role`. Held in memory in the browser, never in storage.
- **Refresh token**: HS256 JWT, audience `dicom-viewer-auth`, with a `rem` claim for remember-me. Only its SHA-256 hash is stored in `dbo.RefreshToken`, so a database leak does not expose usable tokens.
- **Rotation and reuse detection**: each refresh revokes the presented token. Presenting an already-rotated token revokes every token issued from the same login.
- **Expired rows**: a background service deletes refresh-token rows past their expiry every hour.
- **Deactivation and lockout**: `dbo.AppUser.IsActive = 0` blocks login and refresh immediately. Existing access tokens expire within 15 minutes.
- **Role changes** take effect when the next access token is issued.

### SameSite and deployment

The refresh cookie uses `Auth:Cookie:SameSite`, default `Lax`. Allowed values: `Lax`, `Strict`, `None`.

- **Preferred**: serve the frontend and API under the same site (for example `app.example.com` for the app and `app.example.com/api` behind a reverse proxy). Keep `Lax` or use `Strict`.
- **Cross-site** (for example Netlify plus `api.example.com` on another site): set `None`. It requires HTTPS. Browsers that block third-party cookies may still drop the cookie, so test on the real hosts. Under `Lax`, a cross-site API will not receive the cookie.

### Frontend

The React app keeps the access token in memory only. It restores the session on page load by calling `/api/auth/refresh`, which uses the cookie. Viewer tabs opened from the worklist share the same cookie, so they start signed in. Refreshes are serialized across tabs with the Web Locks API, and sign-out is broadcast to other tabs. Image requests (WADO-URI) carry the bearer token through Cornerstone's `beforeSend` hook.

The Netlify deployment sends a strict Content-Security-Policy (see `netlify.toml`). Replace the `connect-src` placeholder with the real API origin before deploying.

### Production checklist

- Serve the API and frontend over HTTPS only. The cookie is `Secure`, and the access token travels in every request.
- Store `Auth__Jwt__SigningKey` in a secret store (Key Vault, AWS Secrets Manager, etc.), never in `appsettings.json`.
- Set `Cors__AllowedOrigins__0` (and further entries) to the exact frontend origins.
- Behind a reverse proxy, configure forwarded headers so the login rate limit and the lockout logic see the client IP rather than the proxy IP.
- Confirm the `SameSite` choice on the real hosts (see above).
- Not implemented yet: password reset (self-service), MFA, a user list or disable UI, and finer permissions than `Admin` / `Viewer`. Admins create users through `POST /api/admin/users` and manage them in the database. Account lockout can be cleared by setting `LockedUntilUtc = NULL` and `FailedLoginCount = 0` on `dbo.AppUser`.

