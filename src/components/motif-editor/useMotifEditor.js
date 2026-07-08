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

import { useState, useCallback } from 'react';

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
 * Cheap numeric-pair bounds over a working copy's `d` strings + root. Built-ins
 * are origin-centred, but imported glyphs keep VERBATIM coords (root at bbox
 * bottom-centre, not origin — D7-reconcile), so a naive [-r,r] box frames them
 * wrong. Scanning number pairs is display-only framing — curve control points
 * slightly overshoot the true outline, which only pads the view (harmless).
 * Falls back to a viewRadius box when a path carries no coordinates.
 * @param {ReturnType<typeof makeWorkingCopy>} working
 */
export function boundsFromWorkingCopy(working) {
  const nums = [];
  for (const p of working.paths || []) {
    const matches = String(p.d ?? '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
    for (const m of matches) {
      const v = Number(m);
      if (Number.isFinite(v)) nums.push(v);
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
 * D7-reconcile: viewRadius = the max distance from `root` to any anchor point
 * across every subpath (the bounding circle centred at the sprout point, since
 * compose folds T(−root) in before scale). Reads the parsed anchor model; never
 * parses `d` itself, so it's usable the moment a path has a `model`.
 * @param {{model?:{subpaths?:{anchors?:{x:number,y:number}[]}[]}}[]} paths
 * @param {{x:number,y:number}} root
 * @returns {number}
 */
export function recomputeViewRadius(paths, root) {
  const rx = root?.x ?? 0;
  const ry = root?.y ?? 0;
  let max = 0;
  for (const p of paths || []) {
    for (const sp of p?.model?.subpaths || []) {
      for (const a of sp?.anchors || []) {
        const dist = Math.hypot(a.x - rx, a.y - ry);
        if (dist > max) max = dist;
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

  // Rename: a real edit, but geometry-neutral — paths (and their dirty flags)
  // are untouched, so serialize still round-trips the verbatim `d` strings.
  const setName = useCallback((name) => {
    setWorking((w) => ({ ...w, name }));
  }, []);

  const serialize = useCallback(
    () => serializeWorkingCopy(working, anchorsToD),
    [working, anchorsToD]
  );

  return { working, setName, serialize };
}
