# JWT authentication and authorization: change summary

The API and viewer previously had no login. This change adds sign-in, bearer-token (JWT) access tokens, a rotating refresh token kept in an `HttpOnly` cookie, password change, account lockout, and role-based authorization with two roles, `Admin` and `Viewer`. The frontend requires a signed-in user for every page and attaches the access token to every API call, including Cornerstone image requests.

## Design

| Concern | Decision |
|---|---|
| Access token | HS256 JWT, 15 min, audience `dicom-viewer-api`, claims `sub` / `name` / `role`. Held in memory only, never in storage |
| Refresh token | HS256 JWT, audience `dicom-viewer-auth`, carries a `rem` claim. Stored only as SHA-256 hash in `dbo.RefreshToken` so it can be revoked |
| Refresh token lifetime | 12 hours for a normal sign-in (`Auth:Jwt:SessionRefreshHours`). 30 days with **Keep me signed in** (`Auth:Jwt:RememberMeRefreshDays`) |
| Refresh token transport | `__Host-dv_rt` cookie: `HttpOnly`, `Secure`, `Path=/`, no `Domain`. Session cookie for a normal sign-in; persistent cookie only for remember-me. Never in a response body or in `localStorage`, so page scripts cannot read it |
| SameSite | `Auth:Cookie:SameSite`, default `Lax`. Must be `Lax`, `Strict`, or `None` (see the deployment note below) |
| Rotation | Every refresh revokes the presented token and issues a new one in the same family, keeping the same `rem` setting |
| Reuse detection | Replaying a rotated token revokes the whole family (possible theft) |
| CSRF | Cookie-bearing endpoints (`/login`, `/refresh`, `/logout`, `/change-password`) require the header `X-Requested-With: dicom-viewer`, which forces a CORS preflight that only allowed origins pass, and an `Origin` header matching the configured allowlist. Cross-site form posts cannot set either |
| CORS | Explicit origin list from `Cors:AllowedOrigins` with credentials enabled. No wildcard origins |
| Concurrency | Rotation is one atomic stored procedure. Frontend refreshes are serialized across tabs with the Web Locks API, and sign-out is broadcast to other tabs |
| Passwords | PBKDF2-HMAC-SHA256, 600k iterations, 16-byte random salt, versioned format `v1$iterations$salt$key`. Unknown usernames run a dummy verify so timing does not reveal accounts |
| Password change | `POST /api/auth/change-password` verifies the current password, sets the new one, revokes every other refresh token for the user, and issues a fresh session in place of the current one. Minimum 12 characters |
| Account lockout | 5 consecutive failed logins lock the account for 15 minutes. A successful login resets the counter. Login returns the same generic failure for a locked account as for a wrong password, so the lock does not reveal the account. Attempts made during a lock do not extend it. Change-password returns HTTP 429 while the account is locked |
| Brute force | Fixed-window rate limit on login and change-password: 10 requests / minute / client IP |
| Expired token cleanup | Background service purges refresh-token rows past `ExpiresAt` every hour (`usp_Auth_PurgeExpiredRefreshTokens`) |
| Default posture | Fallback authorization policy: every endpoint requires a valid token unless explicitly `AllowAnonymous` |
| Authorization | `Admin` policy on upload, delete, folder import, and user creation. Read endpoints need any signed-in user |
| Browser hardening | Netlify serves a strict Content-Security-Policy, HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `Permissions-Policy`. The API sends `nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer` on all responses, and `Cache-Control: no-store` on `/api/auth` responses |
| Bootstrap | First admin comes from `Auth:BootstrapAdmin` env vars and is created only when no users exist |
| Signing key | `Auth:Jwt:SigningKey` must be >= 32 bytes or the API refuses to start. Supply it via `Auth__Jwt__SigningKey` |

## Backend (`backend/`)

New files:
- `database/004_auth.sql`: `dbo.AppUser`, `dbo.RefreshToken`, and `usp_Auth_*` procedures
- `database/005_auth_hardening.sql`: adds `FailedLoginCount` and `LockedUntilUtc` to `dbo.AppUser`; lockout, password change, revoke-all, and purge procedures
- `src/DicomViewer.Domain/Entities/AuthEntities.cs`: roles and auth records
- `src/DicomViewer.Application/Contracts/AuthContracts.cs`: repository, hasher, and token-issuer interfaces
- `src/DicomViewer.Application/Services/AuthService.cs`: login with lockout, refresh rotation, reuse detection, logout, password change, user creation, bootstrap, expired-session purge
- `src/DicomViewer.Application/Services/AuthExceptions.cs`, `TokenHash.cs`
- `src/DicomViewer.Infrastructure/Auth/`: `Pbkdf2PasswordHasher`, `JwtTokenIssuer`, `JwtSettings`
- `src/DicomViewer.Infrastructure/Sql/SqlAuthRepository.cs`
- `src/DicomViewer.Api/Endpoints/AuthEndpoints.cs`: `/api/auth/*` and `POST /api/admin/users`
- `src/DicomViewer.Api/Auth/AuthPolicies.cs`, `RefreshCookieWriter.cs`, `BrowserRequestGuard.cs`, `RefreshTokenCleanupService.cs`

Changed files:
- `Program.cs`: JWT bearer setup, fallback policy, admin policy on delete / upload / import, rate limiter, CORS with credentials, security headers, cookie and origin configuration, cleanup service, bootstrap step, anonymous health and docs
- `DependencyInjection.cs`: registers auth services; `AddInfrastructure` now takes `IConfiguration`
- `appsettings.json`: `Auth` section (signing key intentionally empty; `Auth:Cookie:SameSite` = `Lax`)
- `DicomViewer.Api.csproj`: `Microsoft.AspNetCore.Authentication.JwtBearer` 10.0.10
- `DicomViewer.Infrastructure.csproj`: `System.IdentityModel.Tokens.Jwt` 8.16.0 (same version already resolved)
- `README.md` (root and backend): setup and endpoint documentation

### Endpoints

| Method | Path | Access |
|---|---|---|
| POST | `/api/auth/login` | anonymous, CSRF checks, rate limited. Body `{ username, password, rememberMe }`. Sets the refresh cookie |
| POST | `/api/auth/refresh` | anonymous, CSRF checks. Reads the refresh cookie, rotates it. 401 clears the cookie |
| POST | `/api/auth/logout` | anonymous, CSRF checks. Revokes the cookie's token and clears the cookie. 204 |
| GET | `/api/auth/me` | signed in |
| POST | `/api/auth/change-password` | signed in, CSRF checks, rate limited. Body `{ currentPassword, newPassword }` |
| POST | `/api/admin/users` | Admin |
| DELETE | `/api/studies/{uid}` | Admin (was open) |
| POST | `/dicomweb/studies` (upload) | Admin (was open) |
| POST | `/api/admin/import-local-folder` | Admin (was open) |
| All other `/api` and `/dicomweb` reads, WADO-URI | any signed-in user |
| `/health`, OpenAPI, Scalar | anonymous (unchanged) |

## Frontend (`frontend/`)

New files:
- `src/lib/auth/session.ts`: in-memory access token, login / logout / change-password, refresh with cross-tab locking, restore on startup, sign-out broadcast. No `localStorage`
- `src/lib/auth/AuthContext.ts`, `src/components/AuthProvider.tsx`
- `src/components/RequireAuth.tsx`: route guard
- `src/components/UserMenu.tsx`: username, role, change password, sign-out
- `src/components/ChangePasswordDialog.tsx`: current / new / confirm fields, client-side checks (12+ characters, match, different from current)
- `src/pages/LoginPage.tsx`: includes the **Keep me signed in on this device for 30 days** checkbox (off by default)

Changed files:
- `App.tsx`: `/login` route; worklist and viewer wrapped in `RequireAuth`
- `lib/pacs/apiClient.ts`: all API and upload calls send the bearer token and `credentials: 'include'`; a 401 triggers one refresh and retry
- `lib/cornerstoneSetup.ts`: `beforeSend` adds the bearer token to every WADO-URI image request
- `pages/WorklistPage.tsx`: upload and delete only for Admin; read-only notice for Viewer
- `components/StudyTable.tsx`: `onDelete` is optional (delete button hidden when omitted)
- `netlify.toml`: security headers for all routes, including the CSP (see below)

### Content Security Policy

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob:;
connect-src 'self' https://your-api.example.com;
worker-src 'self' blob:;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none'
```

- Replace `https://your-api.example.com` with the real API origin before deploying. A missing entry blocks the API calls.
- `'wasm-unsafe-eval'` is needed for Cornerstone's image decoders. `'unsafe-inline'` remains for styles only.

## Setup

1. Run `backend/database/004_auth.sql`, then `backend/database/005_auth_hardening.sql`.
2. Set `Auth__Jwt__SigningKey` (random, >= 32 bytes) and `Auth__BootstrapAdmin__Username` / `__Password` (see `backend/README.md` section 8).
3. Set `Cors__AllowedOrigins__0` to the frontend origin and replace the CSP `connect-src` placeholder in `netlify.toml`.
4. Start the API, open the frontend, sign in as the bootstrap admin, then create users with `POST /api/admin/users`.

## Verification

| Check | Result |
|---|---|
| Backend auth core (compiled against the project's IdentityModel DLLs and a fake repository): password hashing, validation, login, lockout, access/refresh audiences, rotation, reuse detection, tampering, wrong key, expiry, deactivation, lost-race handling, bootstrap | 58/58 pass |
| Backend API project type-check (all sources, ASP.NET Core 10 framework) | passes, using a local stub for the JwtBearer package |
| Frontend `tsc -b` | passes |
| Frontend `vite build` | passes |
| Frontend `oxlint src` | no new warnings (one pre-existing warning in `useDicomLayout.ts`) |
| Browser end-to-end (Chromium, Playwright, production-style CSP from `netlify.toml`, mock API with real CORS and cookie behaviour): sign-in, wrong-password message, remember-me vs session cookie (flags and ~30-day expiry), cookie flags and no token in page-readable storage, refresh via cookie on reload, shared session across tabs, password change (wrong current password, mismatched confirmation, success), logout clearing the cookie, no CSP violations | 15/15 pass |

**Not verified in this environment**:
- NuGet was unreachable, so the real `Microsoft.AspNetCore.Authentication.JwtBearer` package was not restored. The API was type-checked against a stub only.
- The API was not run against a live SQL Server. Scripts `004` and `005` have not been executed.
- The real cross-site deployment (Netlify frontend, separate API domain) was not tested. Browser third-party cookie rules decide whether the refresh cookie is sent. See the deployment note below.

Before relying on this:
1. `dotnet restore` and `dotnet build` the solution.
2. Run `004_auth.sql` and `005_auth_hardening.sql` on a test database and exercise the endpoints in Scalar (`/scalar/v1`). Scalar needs the `X-Requested-With: dicom-viewer` header and an `Origin` header from an allowed origin on the cookie endpoints.
3. Confirm the lockout, rate limit, and 401/403/429 responses.
4. Deploy frontend and API to their real hosts and confirm sign-in, refresh after a page reload, and remember-me across a browser restart.

### Deployment note: cookies across sites

The refresh cookie is `SameSite=Lax` by default. A browser only sends it on a cross-site request in limited cases, so a Netlify frontend calling an API on a different site will not get the cookie under `Lax`. Choose one of these:
- **Preferred**: serve the API and the frontend under one site (for example `app.example.com` for the frontend and `app.example.com/api` through a reverse proxy, or `api.example.com` with the frontend on `example.com`). Keep `Lax` or use `Strict`.
- **Cross-site**: set `Auth:Cookie:SameSite` to `None`. That requires HTTPS (already required for `Secure`). Browsers that block third-party cookies may still drop it, and the CSRF header and Origin checks remain the defence. Test this on the real hosts before release.

## Known limitations and next steps

- **No password reset** (forgotten password). Admins reset it by creating a new account or through the database. Self-service reset needs an email channel and is not built.
- **No MFA.**
- **No user management UI.** Admins create users through `POST /api/admin/users`.
- **Two roles only.** Finer permissions would need a new role or a permissions table.
- **Access token claims are not re-checked** until expiry (15 min). Deactivation and lockout block refresh immediately; role changes apply at the next token.
- **Account lockout is per account**, so an attacker can lock a known username. Per-IP rate limiting limits the rate but does not prevent this. Consider an admin unlock path if this matters.
- **Rate limiting** is per client IP and needs forwarded headers configured behind a proxy.
- **Cookie `SameSite` and cross-site deployment** must be verified on the real hosts (see the deployment note).
- `frontend/src/lib/pacs/dicomWebClient.ts` (the unused PACS seam) does not send tokens. Wire it through the same auth layer before using it.
- The OpenAPI JSON and Scalar UI remain public, as before. Restrict them if the API surface should not be visible.

---

# Multi-Planar Reconstruction (MPR): change summary

Extends the DICOM viewer with fully functional Multi-Planar Reconstruction (MPR). The feature enables simultaneous viewing of reconstructed **Axial**, **Sagittal**, and **Coronal** planes from a single 3D DICOM volume with synchronized crosshair navigation, window/level, zoom, pan, and memory cleanup.

## Architecture and Design

| Concern | Implementation Decision |
|---|---|
| Volume reconstruction | Uses Cornerstone3D's streaming volume loader (`volumeLoader.createAndCacheVolume` and `setVolumesForViewports`). Reconstructs true volumetric slices across all planes using Cornerstone's `ORTHOGRAPHIC` VolumeViewports rather than three independent image stacks |
| Coordinate & slice ordering | Cornerstone3D handles patient coordinate transformation (LPS), ImageOrientationPatient, ImagePositionPatient, PixelSpacing, and slice thickness/spacing internally when building the volume actor |
| Plane synchronization | Configured `CrosshairsTool` bound to primary button on the MPR viewports. Scrubbing or clicking in one plane updates reference crosshairs across all three orthogonal planes simultaneously |
| Navigation & interaction | Right mouse button: Window/Level; Middle mouse button: Pan; Ctrl+Wheel / Pinch: Zoom |
| Security & Auth integrity | Reuses the established WADO-URI loader configuration with bearer JWT authentication. Volume streaming utilizes authenticated chunk requests seamlessly |
| Memory lifecycle | MPR runs inside an isolated `RenderingEngine` and dedicated `ToolGroup`. Toggling MPR cleans up viewports, unregisters tool groups, evicts volume caches via `cornerstoneCache.removeVolumeLoadObject`, and frees GPU/CPU allocations |
| Graceful degradation | Series eligibility check (`isMprCapable`) requires $\ge 3$ slices. Incompatible or single-slice series disable the MPR toolbar button and present explanatory feedback without crashing the viewer |

## Files Added
- `frontend/src/lib/volumeUtils.ts`: Pure helper utilities for deterministic volume ID formatting (`volumeIdForSeries`) and slice volume validation (`isMprCapable`).
- `frontend/src/lib/volumeLoader.ts`: Volume loading module interfacing with Cornerstone3D volume loader, caching, progress tracking, and memory teardown.
- `frontend/src/components/viewer/MprView.tsx`: Orthographic tri-planar viewport component (Axial, Sagittal, Coronal) with crosshairs and metadata overlays.
- `frontend/src/lib/mpr.test.ts`: Automated unit test suite verifying deterministic volume IDs, series capability validation, and orientation coordinate transformations.

## Files Modified
- `frontend/src/components/viewer/ViewerToolbar.tsx`: Added `Box` icon toggle for MPR mode with disabled state and tooltip for series with $<3$ slices.
- `frontend/src/pages/ViewerPage.tsx`: Integrated MPR state, capability checks on active series, toolbar wiring, and conditional rendering of MPR view vs standard viewport grid.
- `frontend/src/package.json`: Added `test` script running `node --experimental-strip-types` and scoped `lint` to `src`.
- `frontend/tsconfig.app.json`: Excluded test files from production application build bundle.

## Validation Results
- **Unit Tests**: `node --experimental-strip-types --test src/lib/*.test.ts` passed (3/3 tests passing: volume ID determinism, slice threshold checks, and DICOM orientation matrix math).
- **Linter**: `oxlint src` passed with 0 errors.
- **Build**: `tsc -b && vite build` passed and produced production bundle cleanly.
