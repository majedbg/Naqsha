// processAnnotation — the cross-boundary hover-annotation channel (ADR 0003 #4,
// direction inverted): the LEFT PANEL's layer tree is the annotation SOURCE, the
// 3D preview is the SUBSCRIBER. Hovering a layer row writes {panelId, process}
// here; Marks.jsx tints that panel's matching process mark toward its annotation
// color and Scene3D shows the process badge. (The original 3D-side pointer hover
// was removed: discovering process colors by mousing over the artwork read as the
// render changing under the cursor — distracting on a fidelity-first proof.)
//
// WHY a module store and not props/context: the writer (shell LayerTree, 2D side)
// and the reader (Marks/Scene3D, behind the dynamic-import 3D boundary) share no
// ancestor below Studio — prop-threading would re-render the whole shell on every
// mouseenter. Same reasoning as canvas3d/bloomSelection.js, the repo's precedent
// for cross-boundary reactive state. PURE + three-free: node-testable; the React
// binding is one useSyncExternalStore hook.
import { useSyncExternalStore } from 'react';

/** @typedef {{ panelId: string|null, process: string }} ProcessAnnotation */

let current = /** @type {ProcessAnnotation|null} */ (null);
const listeners = new Set();

function sameAnnotation(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.panelId === b.panelId && a.process === b.process;
}

/**
 * Publish the hovered layer's annotation, or clear with null. No-ops (no
 * notification) when the value is unchanged, so repeated mouseenter events on
 * the same row never re-render subscribers. A truthy `process` is required to
 * set; anything else clears.
 * @param {ProcessAnnotation|null} next
 */
export function setProcessAnnotation(next) {
  const normalized = next && next.process ? { panelId: next.panelId ?? null, process: next.process } : null;
  if (sameAnnotation(current, normalized)) return;
  current = normalized;
  for (const fn of listeners) fn();
}

/** @returns {ProcessAnnotation|null} */
export function getProcessAnnotation() {
  return current;
}

/**
 * @param {() => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribeProcessAnnotation(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React binding: the current annotation, re-rendering only real changes. */
export function useProcessAnnotation() {
  return useSyncExternalStore(subscribeProcessAnnotation, getProcessAnnotation);
}
