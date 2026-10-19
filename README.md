# Modern PACS DICOM Web Viewer & Archiving Solution

A full-featured, enterprise-grade medical imaging solution featuring a high-performance **React 19 + Cornerstone3D** web viewer and an **ASP.NET Core 10** REST/DICOMweb backend with **SQL Server** metadata persistence and local/object filesystem storage.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
  - [Interactive 2D Viewer & Layout Engine](#interactive-2d-viewer--layout-engine)
  - [Multi-Planar Reconstruction (MPR)](#multi-planar-reconstruction-mpr)
  - [Viewport Synchronization (Sync Toggle)](#viewport-synchronization-sync-toggle)
  - [Double-Click-to-Explode](#double-click-to-explode)
  - [Series Thumbnails & Drag-and-Drop Targeting](#series-thumbnails--drag-and-drop-targeting)
  - [Vertical Stack Slider](#vertical-stack-slider)
  - [Cine Playback & Simultaneous Multi-Series Movie](#cine-playback--simultaneous-multi-series-movie)
  - [Measurement & Annotation Suite](#measurement--annotation-suite)
  - [Configurable Mouse & Touch Bindings](#configurable-mouse--touch-bindings)
  - [Worklist & PACS Study Management](#worklist--pacs-study-management)
  - [Enterprise Authentication & Security](#enterprise-authentication--security)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Prerequisites](#prerequisites)
- [Step-by-Step Installation & Setup](#step-by-step-installation--setup)
  - [1. Database Setup](#1-database-setup)
  - [2. Configure Backend `appsettings.json`](#2-configure-backend-appsettingsjson)
  - [3. Start the Backend API](#3-start-the-backend-api)
  - [4. Import DICOM Files into Database](#4-import-dicom-files-into-database)
  - [5. Install & Run Frontend](#5-install--run-frontend)
  - [6. Sign In & Start Viewing](#6-sign-in--start-viewing)
- [API Endpoints Reference](#api-endpoints-reference)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Production Deployment Considerations](#production-deployment-considerations)

---

## Overview

This project provides a modern web-based DICOM viewing and PACS platform. It replaces legacy client-side or desktop PACS viewers with a responsive, browser-accessible architecture. Patient metadata is indexed in SQL Server, DICOM objects are streamed efficiently on demand via WADO-URI without downloading entire datasets unnecessarily, and client-side rendering leverages GPU-accelerated WebGL through Cornerstone3D.

---

## Key Features

### Interactive 2D Viewer & Layout Engine
- **Multi-Viewport Grids**: Outer layouts supporting `1×1`, `1×2`, `2×1`, `2×2`, `3×3`, and customizable sub-layouts per cell.
- **Independent Viewport Tiling**: Sub-divide any viewport into multi-frame/multi-slice tiles that advance synchronously.
- **Grayscale Inversion & Reset**: One-click active viewport or all-viewport camera and window/level reset.
- **Full Metadata Overlays**: Corner overlays displaying patient demographics, study/series descriptions, current slice index / slice total, zoom percentage, and VOI (Window Width / Window Center).

### Multi-Planar Reconstruction (MPR)
- **True Volumetric Orthogonal Slicing**: Reconstructs 3D volumes into simultaneous **Axial**, **Coronal**, and **Sagittal** orthogonal planes using Cornerstone3D VolumeViewports.
- **Synchronized Crosshairs**: Interactively scrub through any plane; reference crosshair lines update the spatial intersection across the other two orthogonal views in real time.
- **Memory & Resource Lifecycle**: MPR allocates an isolated rendering engine and tool group. Exiting cleanly tears down volume caches and GPU buffers and restores the exact previous 2D layout, active viewport, and slice positions.
- **Safety Threshold**: Validates series eligibility ($\ge 3$ slices). Single-slice or unsuited series disable the MPR toggle with explanatory feedback.

### Viewport Synchronization (Sync Toggle)
- **One-Click Synchronization**: A prominent `Sync` toggle on the toolbar links all compatible 2D viewports.
- **Comprehensive Operations**: Synchronizes canvas zoom, pan, window/level (VOI), and slice navigation.
- **Proportionate Stack Navigation**: Automatically scales slice indices proportionately across series with differing slice counts.
- **Loop & Incompatible Viewport Guards**: Internal re-entrancy locking avoids event feedback loops, safely skips single-frame images (e.g. chest X-rays or scout scans), and bypasses stack sync while Cine playback is active.
- **Immediate Independent Restoration**: Turning Sync off instantly unlinks viewports for independent navigation.

### Double-Click-to-Explode
- **Instant 1×1 Expansion**: Double-clicking any image box in a multi-viewport grid expands that cell to occupy the entire viewer area.
- **Exact Layout Restoration**: Double-clicking the exploded viewport again immediately restores the exact previous layout, grid configuration, image assignments, and active cell.
- **Touch Double-Tap Support**: Mobile and tablet devices support double-tap (within 300ms) for identical functionality.
- **Zero Image Reloading**: Non-exploded cells are toggled with CSS `display: none` rather than unmounted, ensuring WebGL contexts, image stacks, and camera states remain intact without refetching data over the network.

### Series Thumbnails & Drag-and-Drop Targeting
- **Representative Single-Slice Thumbnails**: Generates square thumbnails in the left series drawer using the middle slice (`Math.floor(instances.length / 2)`), rendered via CPU to conserve browser WebGL context limits.
- **In-Memory Caching**: Rendered thumbnails are cached as data URLs for instant display across tab visits.
- **Desktop HTML5 Drag-and-Drop**: Drag any series directly onto any viewport cell to load and display it in that specific cell without disrupting other cells or changing grid layout.
- **Touch Drag-and-Drop**: Supports pointer-event touch dragging with a floating drag badge and drop target highlight (`border-2 border-[var(--color-accent)] ring-2`).
- **Quick-Assign Buttons**: For mobile/tablet drawers, series cards feature one-tap target buttons (`V1`, `V2`, etc.) to assign series to viewports immediately.

### Vertical Stack Slider
- **1-Based Indexing**: Configured with natural top-to-bottom direction: top position displays initial slice `1` and bottom displays total count `max` (e.g. `117`).
- **Transparent Design**: Track line and container background are invisible, displaying only the draggable accent thumb pill, slice markers, and floating `${slice} / ${max}` tooltips.
- **Fluid Stepping**: Supports pointer dragging with pointer capture, mouse wheel scrolling (`deltaY`), and keyboard navigation (`ArrowUp`/`ArrowDown`, `PageUp`/`PageDown`, `Home`/`End`).

### Cine Playback & Simultaneous Multi-Series Movie
- **Playback Controls**: Play/Pause with custom frame rates (1 to 60 FPS) and loop toggling.
- **Play All Mode**: "Play All" switch runs synchronized cine loops across all loaded series simultaneously.

### Measurement & Annotation Suite
- **11 Clinical Measurement Tools**: Length, Angle, Cobb Angle, Bidirectional, Rectangle ROI, Elliptical ROI, Circle ROI, Planar Freehand ROI, Arrow Annotation, Probe, and Eraser.
- **Annotation Management**: Live annotation counters, select-to-delete, and "Clear All" with full viewport re-render.

### Configurable Mouse & Touch Bindings
- **Anchored Mouse Popover**: Compact "Mouse" control opens a popover to independently configure Left, Middle, and Right mouse buttons (`Window / Level`, `Pan`, `Zoom`, `Stack Scroll`).
- **Touchscreen Mode**: Touch devices automatically receive a single-finger tool selector, with two-finger pinch-to-zoom and pan enabled by default.

### Worklist & PACS Study Management
- **QIDO-RS Style Querying**: Fast search by Patient ID, Patient Name, Date Range, and Modality with server-side pagination.
- **Drag-and-Drop DICOM Upload**: STOW-RS multipart upload accepting `.dcm` files with instant validation and ingestion.
- **Study Deletion**: Secure study deletion restricted to `Admin` users.

### Enterprise Authentication & Security
- **JWT Authentication**: Short-lived HS256 access tokens held strictly in-memory (never in `localStorage`).
- **Rotating Refresh Token**: Transported via `HttpOnly`, `Secure`, `SameSite=Lax/None` cookie (`__Host-dv_rt`) with automatic session rotation and reuse detection.
- **Role-Based Access Control**: `Admin` (upload, delete, user creation, folder import) and `Viewer` (read-only worklist and viewer access).
- **Brute-Force & Lockout Defenses**: 5 consecutive failed attempts lock accounts for 15 minutes; rate limiting set to 10 requests/min per IP.
- **Hardened Browser Headers**: Content-Security-Policy (CSP), HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and CSRF protection headers (`X-Requested-With`).

---

## Architecture & Tech Stack

```text
┌─────────────────────────────────────────────────────────────┐
│                 React 19 + Cornerstone3D                    │
│      (Vite, Tailwind CSS v4, Lucide Icons, TypeScript)      │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / Bearer JWT + Cookie
                               v
┌─────────────────────────────────────────────────────────────┐
│                 ASP.NET Core 10 Web API                     │
│  - Fellow Oak DICOM (fo-dicom) parser                       │
│  - ADO.NET Data Repositories & SQL Stored Procedures        │
│  - WADO-URI / DICOMweb Streaming Engine                     │
│  - JWT & PBKDF2 Authentication & Lockout System             │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                v                             v
┌──────────────────────────────┐ ┌────────────────────────────┐
│         SQL Server           │ │     DICOM Object Store     │
│ - Patients, Studies, Series  │ │ - Local Filesystem or      │
│ - Instances metadata index   │ │   Network / S3 / Azure Blob│
│ - AppUsers & RefreshTokens   │ │   (via IDicomObjectStore)  │
└──────────────────────────────┘ └────────────────────────────┘
```

---

## Prerequisites

Before setting up the project, ensure you have the following installed:

1. **.NET SDK 10**: Check with `dotnet --version`.
2. **Node.js**: Version 20.x or higher (LTS recommended). Check with `node -v`.
3. **SQL Server**: SQL Server 2019+, SQL Server Express, or LocalDB.
4. **DICOM Sample Files**: A folder on your machine containing `.dcm` files.

---

## Step-by-Step Installation & Setup

### 1. Database Setup

1. Open **SQL Server Management Studio (SSMS)** or Azure Data Studio.
2. Connect to your SQL Server instance.
3. Open and execute the SQL migration scripts located in `backend/database/` in sequential order:
   - `001_schema.sql` (Creates `DicomViewer` database and core tables: `Patient`, `Study`, `Series`, `Instance`)
   - `002_procedures.sql` (Creates stored procedures for queries and upserts)
   - `003_remove_oversized_storagekey_index.sql` (Optimizes storage key indexes)
   - `004_auth.sql` (Creates `AppUser` and `RefreshToken` tables and auth procedures)
   - `005_auth_hardening.sql` (Adds account lockout columns, password change, and purge routines)

### 2. Configure Backend `appsettings.json`

Open `backend/src/DicomViewer.Api/appsettings.json` and configure:

```json
{
  "ConnectionStrings": {
    "SqlServer": "Server=localhost;Database=DicomViewer;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=False;Encrypt=False"
  },
  "Storage": {
    "RootPath": "C:\\DICOM"
  },
  "Cors": {
    "AllowedOrigins": [
      "http://localhost:5173"
    ]
  },
  "Auth": {
    "Jwt": {
      "Issuer": "dicom-viewer-api",
      "AccessAudience": "dicom-viewer-api",
      "RefreshAudience": "dicom-viewer-auth",
      "SigningKey": "YourSecretKeyMustBeAtLeast32BytesLong!",
      "AccessTokenMinutes": 15,
      "SessionRefreshHours": 12,
      "RememberMeRefreshDays": 30
    },
    "BootstrapAdmin": {
      "Username": "admin",
      "Password": "AdminPassword123!"
    },
    "Cookie": {
      "SameSite": "Lax"
    }
  }
}
```

> **Note**:
> - `Storage:RootPath`: Point this to your actual DICOM folder (e.g. `C:\DICOM` or `/var/dicom`).
> - `Auth:BootstrapAdmin`: The bootstrap admin is automatically provisioned the first time the API starts if the `AppUser` table is empty.

### 3. Start the Backend API

From the root project directory:

```powershell
cd backend
dotnet restore
dotnet run --project src/DicomViewer.Api
```

The backend API will start at:
- **HTTP**: `http://localhost:5243`
- **HTTPS**: `https://localhost:7243`
- **Interactive Scalar Docs**: `https://localhost:7243/scalar/v1`
- **OpenAPI Schema**: `https://localhost:7243/openapi/v1.json`
- **Health Check**: `https://localhost:7243/health`

### 4. Import DICOM Files into Database

To index your local DICOM files from `Storage:RootPath` into SQL Server:

1. Open Scalar docs at `https://localhost:7243/scalar/v1` (or use `curl` / Postman).
2. Log in using `POST /api/auth/login` with your `admin` credentials to obtain an access token.
3. Call the import endpoint:
   ```http
   POST /api/admin/import-local-folder
   Authorization: Bearer <your_access_token>
   ```
4. The service will scan your folder, extract DICOM tags using Fellow Oak DICOM, and populate patients, studies, series, and instances in SQL Server idempotently.

### 5. Install & Run Frontend

Open a new terminal window in the root directory:

```powershell
cd frontend
npm install
```

Create `.env.local` if you need to override the backend API URL (defaults to `http://localhost:5243`):

```env
VITE_API_BASE_URL=http://localhost:5243
```

Start the Vite development server:

```powershell
npm run dev
```

The frontend will start at: `http://localhost:5173`

### 6. Sign In & Start Viewing

1. Open `http://localhost:5173` in your browser.
2. You will be redirected to the `/login` page.
3. Sign in using the bootstrap admin credentials:
   - **Username**: `admin`
   - **Password**: `AdminPassword123!` (or the password configured in `appsettings.json`)
4. You will be redirected to the **Worklist Page**.
5. Select any study to launch the **DICOM Viewer**:
   - Double-click any viewport to explode into a 1×1 view; double-click again to restore.
   - Toggle **Sync** in the toolbar to synchronize Zoom, Pan, Window/Level, and Slices across viewports.
   - Use the **Vertical Stack Slider** on the right side of 2D viewports for 1-based slice navigation.
   - Drag series from the left panel onto any viewport.
   - Toggle **MPR** to inspect orthogonal Axial, Coronal, and Sagittal crosshair views.

---

## API Endpoints Reference

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Anonymous | Sign in, receive access token & set `__Host-dv_rt` refresh cookie |
| `POST` | `/api/auth/refresh` | Anonymous | Rotate refresh cookie & obtain fresh access token |
| `POST` | `/api/auth/logout` | Anonymous | Revoke session & clear refresh cookie |
| `GET` | `/api/auth/me` | Authenticated | Retrieve current user profile and role |
| `POST` | `/api/auth/change-password` | Authenticated | Change password & revoke all other active sessions |
| `POST` | `/api/admin/users` | Admin | Create a new user (`Admin` or `Viewer`) |
| `GET` | `/api/studies` | Authenticated | Search studies (supports patientId, patientName, modality, dates) |
| `GET` | `/api/studies/{studyUid}` | Authenticated | Retrieve metadata for a specific study |
| `DELETE`| `/api/studies/{studyUid}` | Admin | Delete study, series, instances, and associated files |
| `GET` | `/api/studies/{studyUid}/series` | Authenticated | List series records belonging to a study |
| `GET` | `/api/studies/{studyUid}/series/{seriesUid}/instances` | Authenticated | List instance metadata records |
| `GET` | `/dicomweb/studies/{studyUid}/series/{seriesUid}/instances/{sopUid}` | Authenticated | Stream single DICOM object (`application/dicom`) |
| `GET` | `/dicomweb/wado?requestType=WADO&...` | Authenticated | WADO-URI endpoint consumed by Cornerstone3D loader |
| `POST` | `/dicomweb/studies` | Admin | STOW-RS multipart/form-data DICOM file upload |
| `POST` | `/api/admin/import-local-folder` | Admin | Scan and index local DICOM directory |
| `GET` | `/health` | Anonymous | Health check status endpoint |

---

## Testing & Quality Assurance

### Frontend Testing & Verification

Run tests from the `frontend/` directory:

```powershell
cd frontend

# Run unit tests (Node.js native test runner with TypeScript strip-types)
npm test

# Run linter
npm run lint

# Run production build and type-check
npm run build
```

- **Unit Tests**: 13 automated tests covering MPR volume IDs, series threshold validation, 3D orientation matrix calculations, mouse binding preservation, MPR tool availability, layout state restoration, 2D vertical stack slider math, series drag-and-drop cell targeting, thumbnail middle-slice selection, Sync toggle state & loop prevention, and double-click-to-explode behavior.
- **Linter**: `oxlint` validates code quality and React best practices.
- **Production Build**: Verified with `tsc -b` and `vite build`.

### Backend Testing & Build

Run from the `backend/` directory:

```powershell
cd backend
dotnet build
```

---

## Production Deployment Considerations

1. **Cookie SameSite Policy**:
   - **Same-Domain (Recommended)**: Serve frontend and API under the same domain (e.g. `viewer.example.com` and `viewer.example.com/api` via reverse proxy). Use `Auth:Cookie:SameSite = "Lax"` or `"Strict"`.
   - **Cross-Domain (e.g. Netlify + Custom API)**: Set `Auth:Cookie:SameSite = "None"`. HTTPS is mandatory.
2. **Environment Variables**:
   - Store sensitive keys such as `Auth__Jwt__SigningKey` in your secret manager (e.g. Azure Key Vault or AWS Secrets Manager) rather than in repository configuration files.
3. **Storage Scaling**:
   - The backend uses the `IDicomObjectStore` interface. Replace `FileSystemDicomObjectStore` with an Azure Blob or S3 implementation when migrating to cloud environments without altering API contracts.
4. **Content Security Policy**:
   - Production deployments (see `frontend/netlify.toml`) enforce a strict CSP. Update `connect-src` to permit only your production API endpoint.
