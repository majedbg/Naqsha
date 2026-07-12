// etchStackEditor — PURE document-state ops on an Etch Stack array (Raster Etch
// S2, #81). These are the reducer-style transforms the Inspector's Etch Stack
// rack calls to add / remove / reorder / bypass / retune Stages; keeping them
// pure and DOM-free makes the rack's behaviour node-testable without rendering
// (jsdom can't drive real drag-and-drop, so reorder is proven here and the drag
// gesture is verified in the browser). Every op returns a NEW array / NEW Stage
// object and never mutates its input, matching React state discipline.
//
// Vocabulary is LAW (ADR-0007): this edits an Etch **Stack** of **Stages** — the
// distinct raster subsystem, sharing no code with the motif Chain/Block editor.

/** Append a Stage to the Stack (immutable). */
export function addStage(stack, stage) {
  return [...(stack || []), stage];
}

/** Remove the Stage with the given id (immutable). */
export function removeStage(stack, id) {
  return (stack || []).filter((s) => s.id !== id);
}

/**
 * Move a Stage from `fromIndex` to `toIndex` — the reorder that makes Stack order
 * document state (paper-before-vs-after-dither reads differently, ADR-0007).
 * Out-of-range indices are clamped/ignored so a stray drag never throws.
 */
export function reorderStage(stack, fromIndex, toIndex) {
  const arr = [...(stack || [])];
  if (fromIndex < 0 || fromIndex >= arr.length) return arr;
  const to = toIndex < 0 ? 0 : toIndex >= arr.length ? arr.length - 1 : toIndex;
  const [moved] = arr.splice(fromIndex, 1);
  arr.splice(to, 0, moved);
  return arr;
}

/** Set a Stage's `bypassed` flag (immutable; only the targeted Stage changes). */
export function setBypass(stack, id, bypassed) {
  return (stack || []).map((s) => (s.id === id ? { ...s, bypassed } : s));
}

/**
 * Merge a params patch into a Stage (immutable). Top-level params shallow-merge;
 * the nested `levels` object DEEP-merges so patching one handle (e.g. gamma)
 * keeps the other two (black/white) — the Levels control edits one handle at a
 * time.
 */
export function patchStageParams(stack, id, patch) {
  return (stack || []).map((s) => {
    if (s.id !== id) return s;
    const params = { ...s.params, ...patch };
    if (patch.levels) params.levels = { ...s.params.levels, ...patch.levels };
    return { ...s, params };
  });
}
