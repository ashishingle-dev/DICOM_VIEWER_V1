import * as cornerstoneTools from '@cornerstonejs/tools'

const { cine } = cornerstoneTools.utilities
export const CINE_EVENTS = cine.Events

export interface CineOptions {
  framesPerSecond: number
  loop: boolean
}

/** Starts (or restarts, e.g. after an fps/loop change) cine playback on one
 *  viewport's element. Cornerstone's own playClip already stops any
 *  previous playback on the same element before starting the new one, so
 *  this is safe to call again on an already-playing element. */
export function startCine(element: HTMLDivElement, options: CineOptions): void {
  cine.playClip(element, {
    framesPerSecond: options.framesPerSecond,
    loop: options.loop,
    reverse: false,
    bounce: false,
    dynamicCineEnabled: false,
  })
}

/** Stops cine playback on one viewport's element. Safe to call even if
 *  nothing is currently playing on it (a no-op in that case). */
export function stopCine(element: HTMLDivElement): void {
  cine.stopClip(element)
}
