/**
 * Client-side session for the DICOM API.
 *
 * - The access token (short-lived JWT) lives only in memory. JavaScript never sees the refresh token.
 * - The refresh token is an HttpOnly cookie set by the API. The browser sends it automatically (credentials:
 *   'include'), so a new tab opened from the worklist restores the session without any stored secret.
 * - Refreshes are serialized across tabs with the Web Locks API. The API rotates the cookie on every refresh,
 *   so two tabs must never present the same token. The lock makes each refresh read the latest cookie.
 */
import { APP_CONFIG } from '../../config'

export type UserRole = 'Admin' | 'Viewer'

export interface AuthUser {
  id: number
  username: string
  role: UserRole
}

interface SessionResponse {
  accessToken: string
  accessTokenExpiresAtUtc: string
  user: AuthUser
}

/** Refresh the access token this long before it expires, so requests never race the expiry. */
const REFRESH_MARGIN_MS = 60_000
const REFRESH_LOCK_NAME = 'dicom-viewer:auth-refresh'
const CHANNEL_NAME = 'dicom-viewer:auth'

/**
 * Sent on every cookie-bearing request. A cross-site page cannot add this header without a CORS preflight,
 * which the API only grants to its allowed origins (see BrowserRequestGuard on the server).
 */
const CSRF_HEADERS = { 'X-Requested-With': 'dicom-viewer' } as const

export class AuthError extends Error {}

let accessToken: string | null = null
let accessTokenExpiresAt = 0
let currentUser: AuthUser | null = null
let inFlightRefresh: Promise<boolean> | null = null
const listeners = new Set<() => void>()

// Tells other tabs of this browser that the user signed out, so they drop their in-memory session too.
let channel: BroadcastChannel | null = null
try {
  channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (event.data === 'signed-out') dropLocalSession()
  }
} catch {
  channel = null // BroadcastChannel unavailable: other tabs learn of sign-out when their next refresh fails
}

function notify() {
  listeners.forEach((listener) => listener())
}

/** Subscribe to sign-in / sign-out changes (used with useSyncExternalStore). */
export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getCurrentUser(): AuthUser | null {
  return currentUser
}

/** .NET serializes DateTimes with 7 fractional digits; Date.parse is only reliable with 3. */
function parseUtc(value: string): number {
  return Date.parse(value.replace(/(\.\d{3})\d+/, '$1'))
}

function applySession(session: SessionResponse) {
  accessToken = session.accessToken
  accessTokenExpiresAt = parseUtc(session.accessTokenExpiresAtUtc)
  currentUser = session.user
  notify()
}

function dropLocalSession() {
  accessToken = null
  accessTokenExpiresAt = 0
  currentUser = null
  notify()
}

/** Ends the session in this tab and in every other tab of the browser. */
export function clearSession() {
  dropLocalSession()
  channel?.postMessage('signed-out')
}

/** Reads a useful message from an error response. The API returns plain strings as JSON, so unwrap those. */
export async function errorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  if (!text) return `${response.status} ${response.statusText}`.trim()
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'string') return parsed
    if (parsed && typeof parsed === 'object' && 'detail' in parsed && typeof parsed.detail === 'string') return parsed.detail
  } catch {
    /* not JSON */
  }
  return text
}

async function authPost(path: string, body?: unknown): Promise<Response> {
  return fetch(`${APP_CONFIG.apiBaseUrl}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...CSRF_HEADERS,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export async function login(username: string, password: string, rememberMe: boolean): Promise<AuthUser> {
  const response = await authPost('/api/auth/login', { username, password, rememberMe })
  if (response.status === 401) throw new AuthError('Invalid username or password.')
  if (response.status === 429) throw new AuthError('Too many sign-in attempts. Wait a few minutes and try again.')
  if (response.status === 403) throw new AuthError('This site is not allowed to sign in to the API.')
  if (!response.ok) throw new AuthError(await errorMessage(response))

  const session = (await response.json()) as SessionResponse
  applySession(session)
  return session.user
}

export async function logout(): Promise<void> {
  clearSession()
  await authPost('/api/auth/logout').catch(() => undefined)
}

/** Changes the password. The API signs out every other session; this browser receives a fresh one. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const token = await getAccessToken()
  const response = await fetch(`${APP_CONFIG.apiBaseUrl}/api/auth/change-password`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...CSRF_HEADERS,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  if (response.status === 401) {
    clearSession()
    throw new AuthError('Your session has expired. Please sign in again.')
  }
  if (!response.ok) throw new AuthError(await errorMessage(response))
  applySession((await response.json()) as SessionResponse)
}

/** Runs inside the cross-tab lock. The browser attaches the newest cookie, so the request uses the latest token. */
async function refreshWithCookie(): Promise<boolean> {
  const response = await authPost('/api/auth/refresh')
  if (response.status === 401) {
    clearSession() // no valid refresh cookie: expired, revoked, or reused
    return false
  }
  if (!response.ok) {
    throw new Error(await errorMessage(response))
  }
  applySession((await response.json()) as SessionResponse)
  return true
}

/** Rotates the refresh cookie and obtains a new access token. Concurrent callers share one attempt. */
export function refreshSession(): Promise<boolean> {
  if (inFlightRefresh) return inFlightRefresh

  const run = () => refreshWithCookie()
  const promise = (navigator.locks ? navigator.locks.request(REFRESH_LOCK_NAME, run) : run()).finally(() => {
    inFlightRefresh = null
  })
  inFlightRefresh = promise
  return promise
}

/** Returns a usable access token, refreshing it first when it is missing or about to expire. */
export async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < accessTokenExpiresAt - REFRESH_MARGIN_MS) return accessToken

  const refreshed = await refreshSession()
  if (!refreshed || !accessToken) throw new AuthError('Your session has expired. Please sign in again.')
  return accessToken
}

/** Forces the next call to getAccessToken() to refresh (used after an unexpected 401). */
export function invalidateAccessToken() {
  accessToken = null
  accessTokenExpiresAt = 0
}

/** Called once on startup: restores the session from the refresh cookie, if the browser still has one. */
export async function restoreSession(): Promise<AuthUser | null> {
  try {
    return (await refreshSession()) ? currentUser : null
  } catch {
    return null // API unreachable: show the sign-in page
  }
}
