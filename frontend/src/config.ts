export type ViewerOpenMode = 'tab' | 'window'

/**
 * Central place to tweak app behaviour without hunting through components.
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5243').replace(/\/$/, '')

export const APP_CONFIG = {
  /** Default target for launching the viewer from the worklist. */
  viewerOpenMode: 'tab' as ViewerOpenMode,
  /** Popup dimensions/chrome used when viewerOpenMode === 'window'. */
  viewerWindowFeatures:
    'width=1440,height=920,menubar=no,toolbar=no,location=no,status=no,resizable=yes',
  /** How many files to parse in parallel while ingesting a folder. */
  parseConcurrency: 6,
  /** Cornerstone rendering engine id, kept stable across the app. */
  renderingEngineId: 'dicom-viewer-engine',
  /** ASP.NET Core API base URL. Set VITE_API_BASE_URL in Netlify/Vite environment variables. */
  apiBaseUrl: API_BASE_URL,
  toolGroupId: 'dicom-viewer-tool-group',
}

const STORAGE_KEY = 'dicom-viewer:viewer-open-mode'

/** Reads the user's last-chosen open mode, falling back to APP_CONFIG's default. */
export function getViewerOpenMode(): ViewerOpenMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'tab' || stored === 'window' ? stored : APP_CONFIG.viewerOpenMode
}

export function setViewerOpenMode(mode: ViewerOpenMode) {
  localStorage.setItem(STORAGE_KEY, mode)
}
