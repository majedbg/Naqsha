// useMotifEditor — the pen-editor's WORKING-COPY hook (WI-P2-2).
//
// The modal edits a CLONE of the custom glyph (Photoshop-filter / human-in-the-
// loop model): the real document mutates only on Save. This hook owns that clone
// and the commit helpers. THIS slice renders the path read-only — no geometry
// editing yet — so the fidelity contract below is the whole point: opening a
// glyph and serializing it back must round-trip the `d` strings BYTE-FOR-BYTE.
//
// FIDELITY CONTRACT
//   Working-copy path = { d /* verbatim original */, closed, model, dirty:false }.
//   serialize() emits d = verbatim `d` when dirty===false, else anchorsToD(model).
//   No path is dirty in this WI (editing arrives in WI-P2-3/4), so serialize
//   returns the input `d` unchanged. Later WIs flip `dirty` + mutate `model`.
//
// The anchor model (`model`) is produced by an INJECTED `parseD` (pathModel.js's
// `parseDToAnchors`, wired by a later WI). It is intentionally optional here:
// nothing in the read-only slice consumes `model`, so `parseD` absent → model
// null, and the hook still works standalone. We do NOT import pathModel directly
// (that module is a sibling WI's sole-writer file — a hard import would couple
// this slice to its landing).

import { useState, useCallback, useRef } from 'react';

/** Default root for glyphs (e.g. built-ins) that carry none: origin, no angle. */
export const DEFAULT_ROOT = { x: 0, y: 0, angle: 0 };

/**
 * Layers referencing this glyph by id (a motif layer binds via params.glyphRef).
 * Drives the modal's "used by N layers" badge. Pure — lives here (not in the
 * component file) so the modal stays a components-only module (react-refresh).
 */
export function usedByCount(layers, glyphId) {
  return (layers || []).filter((l) => l?.params?.glyphRef === glyphId).length;
}

/**
 * Bounds over a working copy's geometry + root, for the editor viewBox. When a
 * path carries a parsed anchor `model` (the live case — parseD is wired), bounds
 * come from the EXACT anchor + handle points, which is correct for every command
 * kind (H/V/A included — the model is normalized to absolute-coord cubic anchors,
 * so unlike a naive `d` number-scan it never mis-pairs H/V's single coordinate or
 * an arc's flag digits). Handle points are included so a curve that bows outward
 * past its anchors isn't clipped. A path WITHOUT a model (e.g. read-only preview
 * before parseD is injected) falls back per-path to the legacy number-pair scan —
 * display-only framing where curve control points merely over-pad the view.
 * Falls back to a viewRadius box when nothing carries coordinates.
 * @param {ReturnType<typeof makeWorkingCopy>} working
 */
export function boundsFromWorkingCopy(working) {
  const nums = [];
  const pushPt = (x, y) => {
    if (Number.isFinite(x) && Number.isFinite(y)) nums.push(x, y);
  };
  for (const p of working.paths || []) {
    if (p?.model?.subpaths?.length) {
      // Exact: every anchor + its in/out handle points from the parsed model.
      for (const sp of p.model.subpaths) {
        for (const a of sp?.anchors || []) {
          pushPt(a.x, a.y);
          if (a.in) pushPt(a.in.x, a.in.y);
          if (a.out) pushPt(a.out.x, a.out.y);
        }
      }
    } else {
      // Fallback: naive number-pair scan of the verbatim `d`.
      const matches = String(p.d ?? '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
      const vals = matches.map(Number).filter(Number.isFinite);
      for (let i = 0; i + 1 < vals.length; i += 2) nums.push(vals[i], vals[i + 1]);
    }
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const rx = working.root?.x ?? 0;
  const ry = working.root?.y ?? 0;
  if (rx < minX) minX = rx;
  if (rx > maxX) maxX = rx;
  if (ry < minY) minY = ry;
  if (ry > maxY) maxY = ry;
  if (!Number.isFinite(minX)) {
    const r = working.viewRadius || 10;
    return { minX: -r, minY: -r, maxX: r, maxY: r };
  }
  return { minX, minY, maxX, maxY };
}

/**
 * D7-reconcile: viewRadius = the max distance from `root` to any glyph point
 * across every subpath (the bounding circle centred at the sprout point, since
 * compose folds T(−root) in before scale). Includes anchor points AND their
 * in/out bezier HANDLES: the control polygon is a convex hull of a cubic, so
 * this can only OVER-estimate reach, never clip a curve that bulges past its
 * anchors. (Anchors-only would under-estimate such curves, so the persisted
 * viewRadius would jump — motif shrinking/overflowing — on the first edit vs the
 * curve-sampled value importMotif computes. Handles keep them consistent.)
 * Reads the parsed anchor model; never parses `d`, so it's usable the moment a
 * path has a `model`.
 * @param {{model?:{subpaths?:{anchors?:{x:number,y:number,in?:{x,y}|null,out?:{x,y}|null}[]}[]}}[]} paths
 * @param {{x:number,y:number}} root
 * @returns {number}
 */
export function recomputeViewRadius(paths, root) {
  const rx = root?.x ?? 0;
  const ry = root?.y ?? 0;
  let max = 0;
  const consider = (pt) => {
    if (!pt) return;
    const dist = Math.hypot(pt.x - rx, pt.y - ry);
    if (dist > max) max = dist;
  };
  for (const p of paths || []) {
    for (const sp of p?.model?.subpaths || []) {
      for (const a of sp?.anchors || []) {
        consider(a);
        consider(a.in);
        consider(a.out);
      }
    }
  }
  return max;
}

/**
 * Build the working copy from a glyph. Each path keeps its VERBATIM `d`, parses
 * a render/edit `model` (via injected parseD; null when absent), and starts
 * un-dirtied. Root falls back to {0,0,0} for built-ins that carry none.
 * @param {import('../../lib/motif/glyphs').Glyph} glyph
 * @param {(d:string)=>any} [parseD]
 */
export function makeWorkingCopy(glyph, parseD) {
  const r = glyph?.root ?? DEFAULT_ROOT;
  return {
    name: glyph?.name ?? '',
    tradition: glyph?.tradition ?? 'custom',
    viewRadius: glyph?.viewRadius ?? 0,
    root: { x: r.x ?? 0, y: r.y ?? 0, angle: r.angle ?? 0 },
    paths: (glyph?.paths ?? []).map((p) => ({
      d: p.d,
      closed: !!p.closed,
      model: parseD ? parseD(p.d) : null,
      dirty: false,
    })),
  };
}

/**
 * Serialize a working copy back to a persistable glyph (no `id` — the store
 * stamps that). Un-dirtied paths emit their verbatim `d`; dirtied paths
 * re-emit from the model via injected anchorsToD.
 * @param {ReturnType<typeof makeWorkingCopy>} working
 * @param {(model:any)=>string} [anchorsToD]
 */
export function serializeWorkingCopy(working, anchorsToD) {
  return {
    name: working.name,
    tradition: working.tradition,
    viewRadius: working.viewRadius,
    root: { ...working.root },
    paths: working.paths.map((p) => ({
      d: p.dirty && anchorsToD ? anchorsToD(p.model) : p.d,
      closed: p.closed,
    })),
  };
}

/**
 * The hook. Holds the working copy for the lifetime of an edit session (the
 * modal keys by glyphId, so a fresh session re-inits cleanly). Exposes the copy
 * for rendering, a `setName` (a cheap real edit — rename does NOT dirty
 * geometry), and `serialize()` for the Save/Save-as-copy commit.
 * @param {import('../../lib/motif/glyphs').Glyph} glyph
 * @param {{parseD?:(d:string)=>any, anchorsToD?:(m:any)=>string}} [ops]
 */
export default function useMotifEditor(glyph, ops = {}) {
  const { parseD, anchorsToD } = ops;
  const [working, setWorking] = useState(() => makeWorkingCopy(glyph, parseD));

  // MODAL-LOCAL undo history (two stacks). These NEVER touch document history:
  // the document mutates only when the modal's Save fires updateCustomGlyph. A
  // snapshot is a whole working copy (paths + viewRadius + name + root).
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Selection = serializable [{ pathIndex, subpathIndex, anchorIndex }]. Kept
  // OUT of the working copy (and out of undo snapshots) — it's ephemeral UI.
  const [selection, setSelection] = useState([]);

  // Gesture baseline: the committed working copy captured at the FIRST preview
  // of a drag, so applyEdit snapshots the PRE-DRAG state (not the last preview
  // frame) → one drag = exactly one undo step. Null between gestures.
  const baselineRef = useRef(null);

  // Rename: a real edit, but geometry-neutral — paths (and their dirty flags)
  // are untouched, so serialize still round-trips the verbatim `d` strings.
  const setName = useCallback((name) => {
    setWorking((w) => ({ ...w, name }));
  }, []);

  // Live-drag preview: swap paths transiently WITHOUT snapshotting. The FIRST
  // preview of a gesture records the pre-drag committed copy as the baseline the
  // eventual commit snapshots (so many previews + one applyEdit = one undo step).
  const previewPaths = useCallback(
    (nextPaths) => {
      if (baselineRef.current === null) baselineRef.current = working;
      setWorking((w) => ({ ...w, paths: nextPaths }));
    },
    [working]
  );

  // DISCRETE edit commit (drag-END / delete): replace paths, recompute
  // viewRadius (D7-reconcile), push the PRE-DRAG snapshot onto undo, clear redo.
  // The snapshot is the gesture baseline when a drag preceded this commit, else
  // the current committed copy (e.g. a delete with no preview).
  const applyEdit = useCallback(
    (nextPaths) => {
      const base = baselineRef.current ?? working;
      baselineRef.current = null;
      setUndoStack((s) => [...s, base]);
      setRedoStack([]);
      setWorking((w) => ({
        ...w,
        paths: nextPaths,
        viewRadius: recomputeViewRadius(nextPaths, w.root),
      }));
    },
    [working]
  );

  // Live root-drag preview: swap the root transiently WITHOUT snapshotting (the
  // sibling of previewPaths). The FIRST preview of a gesture records the pre-drag
  // committed copy as the baseline the eventual applyRoot snapshots — so many
  // previewRoot frames + one applyRoot = one undo step.
  const previewRoot = useCallback(
    (nextRoot) => {
      if (baselineRef.current === null) baselineRef.current = working;
      setWorking((w) => ({ ...w, root: nextRoot }));
    },
    [working]
  );

  // ROOT commit (drag-END). Set the root, recompute viewRadius from the CURRENT
  // paths + the NEW root (mirror of applyEdit, which uses new paths + old root):
  // moving the sprout point changes the max distance to every anchor, so the
  // placement scale must track it. Pushes the PRE-drag snapshot (baseline when a
  // preview preceded this, else the current copy) onto the SAME modal-local undo
  // stack as geometry edits — never document history.
  const applyRoot = useCallback(
    (nextRoot) => {
      const base = baselineRef.current ?? working;
      baselineRef.current = null;
      setUndoStack((s) => [...s, base]);
      setRedoStack([]);
      setWorking((w) => ({
        ...w,
        root: nextRoot,
        viewRadius: recomputeViewRadius(w.paths, nextRoot),
      }));
    },
    [working]
  );

  // Undo/redo pop/repush whole-working-copy snapshots on the MODAL-LOCAL stacks
  // only — never document history. Selection is cleared: a snapshot swap can
  // strand indices at anchors that no longer exist.
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    baselineRef.current = null;
    setRedoStack((r) => [...r, working]);
    setUndoStack(undoStack.slice(0, -1));
    setWorking(prev);
    setSelection([]);
  }, [undoStack, working]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextWc = redoStack[redoStack.length - 1];
    baselineRef.current = null;
    setUndoStack((u) => [...u, working]);
    setRedoStack(redoStack.slice(0, -1));
    setWorking(nextWc);
    setSelection([]);
  }, [redoStack, working]);

  const serialize = useCallback(
    () => serializeWorkingCopy(working, anchorsToD),
    [working, anchorsToD]
  );

  return {
    working,
    setName,
    serialize,
    // edit + modal-local undo
    previewPaths,
    applyEdit,
    previewRoot,
    applyRoot,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    // selection
    selection,
    setSelection,
  };
}
