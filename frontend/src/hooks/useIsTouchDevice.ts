import { useSyncExternalStore } from 'react'

/**
 * `(pointer: coarse)` is true for touchscreens (phones, tablets, and touch
 * laptops) and false for mouse/trackpad-driven devices — this is the
 * standard media-query signal for "the primary input is a finger, not a
 * precise pointer", and it's what we use to decide whether to show
 * mouse-button binding UI (desktop) or a touch tool switcher + pinch-zoom
 * (mobile/tablet).
 *
 * Reactive via `useSyncExternalStore` + `matchMedia`'s change event, not a
 * one-time check on mount: a 2-in-1 laptop or an iPad with a trackpad can
 * switch primary input mid-session, and Chrome DevTools device emulation
 * toggles it live too.
 */
const QUERY = '(pointer: coarse)'

function subscribe(callback: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot() {
  return false
}

export function useIsTouchDevice(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
