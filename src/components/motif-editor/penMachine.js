// penMachine — pure, headless, DOM-free geometry + selection ops for the pen
// editor's DIRECT-SELECTION (A) tool (WI-P2-3).
//
// Everything here operates in MODEL coordinates. Mapping screen↔model (via the
// SVG CTM) is PenCanvas's job, never the machine's. A "target" identifies a
// point across ALL paths:
//
//   { pathIndex, subpathIndex, anchorIndex, part: 'anchor' | 'in' | 'out' }
//
// `paths` is the working-copy paths array — each entry is
//   { d, closed, model: { subpaths: [{ anchors:[Anchor], closed }] }, dirty }
// and each Anchor is { x, y, in:{x,y}|null, out:{x,y}|null, type:'corner'|'smooth' }
// with `in`/`out` ABSOLUTE handle positions (or null) exactly as pathModel emits.
//
// Every mutating op returns a NEW paths array (structural clone along the touched
// spine — untouched entries are re-cloned too, cheap for a glyph) and NEVER
// mutates its input. Selection is kept SEPARATE from geometry: a selection is a
// serializable array of { pathIndex, subpathIndex, anchorIndex } (no `part`).
//
// This module imports NOTHING at load — pure math only; models are passed in.

// ── immutable clone helpers ─────────────────────────────────────────────────
function cloneAnchor(a) {
  return {
    x: a.x,
    y: a.y,
    in: a.in ? { x: a.in.x, y: a.in.y } : null,
    out: a.out ? { x: a.out.x, y: a.out.y } : null,
    type: a.type,
  };
}
function cloneSubpath(s) {
  return { ...s, anchors: (s.anchors || []).map(cloneAnchor) };
}
function cloneModel(m) {
  if (!m) return m;
  return { ...m, subpaths: (m.subpaths || []).map(cloneSubpath) };
}
function clonePath(p) {
  return { ...p, model: cloneModel(p.model) };
}
function clonePaths(paths) {
  return (paths || []).map(clonePath);
}

const sq = (dx, dy) => dx * dx + dy * dy;

// ── hitTest ─────────────────────────────────────────────────────────────────
// Nearest hittable target within `tol` (MODEL units), with CATEGORY priority:
// handles beat anchors even when the anchor is marginally closer (Illustrator
// direct-select feel), and both beat segments. Segment hit-testing is deferred
// to the next WI (add-anchor-on-segment) — anchors + handles cover the A tool.
export function hitTest(paths, point, tol) {
  const tol2 = tol * tol;
  let bestHandle = null;
  let bestHandleD = Infinity;
  let bestAnchor = null;
  let bestAnchorD = Infinity;
  for (let pi = 0; pi < (paths || []).length; pi++) {
    const subs = paths[pi]?.model?.subpaths || [];
    for (let si = 0; si < subs.length; si++) {
      const anchors = subs[si].anchors || [];
      for (let ai = 0; ai < anchors.length; ai++) {
        const a = anchors[ai];
        for (const part of ['in', 'out']) {
          const h = a[part];
          if (!h) continue;
          const d = sq(h.x - point.x, h.y - point.y);
          if (d <= tol2 && d < bestHandleD) {
            bestHandleD = d;
            bestHandle = { pathIndex: pi, subpathIndex: si, anchorIndex: ai, part };
          }
        }
        const da = sq(a.x - point.x, a.y - point.y);
        if (da <= tol2 && da < bestAnchorD) {
          bestAnchorD = da;
          bestAnchor = { pathIndex: pi, subpathIndex: si, anchorIndex: ai, part: 'anchor' };
        }
      }
    }
  }
  return bestHandle || bestAnchor || null;
}

// Resolve the anchor a target points at, or null if the indices are stale.
function anchorAt(paths, target) {
  return paths?.[target.pathIndex]?.model?.subpaths?.[target.subpathIndex]
    ?.anchors?.[target.anchorIndex] ?? null;
}

// ── moveAnchor ───────────────────────────────────────────────────────────────
// Set the anchor to newPoint AND translate its in/out handles by the SAME delta
// (handles ride with the anchor). Dirties the touched path.
export function moveAnchor(paths, target, newPoint) {
  const next = clonePaths(paths);
  const a = anchorAt(next, target);
  if (!a) return next;
  const dx = newPoint.x - a.x;
  const dy = newPoint.y - a.y;
  a.x = newPoint.x;
  a.y = newPoint.y;
  if (a.in) { a.in.x += dx; a.in.y += dy; }
  if (a.out) { a.out.x += dx; a.out.y += dy; }
  next[target.pathIndex].dirty = true;
  return next;
}

// ── moveHandle ────────────────────────────────────────────────────────────────
// Move the dragged handle (target.part 'in'|'out') to newPoint.
//   • With { alt }: BREAK the tangent — move ONLY the dragged handle and flip the
//     anchor's type to 'corner' (a cusp). The opposite handle is untouched.
//   • Otherwise, if the anchor is 'smooth' AND has an opposite handle: keep the
//     tangent collinear through the anchor. MIRROR RULE — reflect the dragged
//     handle's DIRECTION to the opposite side, but PRESERVE the opposite handle's
//     existing LENGTH (only its direction changes, not its arm length). This is
//     Illustrator's smooth-point behavior: dragging one arm swings the other to
//     stay a straight tangent line while its reach is left alone.
// Dirties the touched path.
export function moveHandle(paths, target, newPoint, opts = {}) {
  const { alt = false } = opts;
  const next = clonePaths(paths);
  const a = anchorAt(next, target);
  if (!a) return next;
  const part = target.part === 'in' ? 'in' : 'out';
  const opp = part === 'in' ? 'out' : 'in';
  a[part] = { x: newPoint.x, y: newPoint.y };
  if (alt) {
    a.type = 'corner';
  } else if (a.type === 'smooth' && a[opp]) {
    const dx = newPoint.x - a.x;
    const dy = newPoint.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const oppLen = Math.hypot(a[opp].x - a.x, a[opp].y - a.y);
      a[opp] = { x: a.x - (dx / len) * oppLen, y: a.y - (dy / len) * oppLen };
    }
  }
  next[target.pathIndex].dirty = true;
  return next;
}

// ── deleteAnchors ─────────────────────────────────────────────────────────────
// Remove the targeted anchors from their subpaths (neighbors rejoin). A subpath
// that drops below 2 anchors is removed; a path that loses ALL subpaths keeps an
// empty model (subpaths:[]) — never crashes. Dirties every affected path.
export function deleteAnchors(paths, targets) {
  const next = clonePaths(paths);
  const byPathSub = new Map(); // `${pi}:${si}` -> Set(anchorIndex)
  const affected = new Set();
  for (const t of targets || []) {
    const key = `${t.pathIndex}:${t.subpathIndex}`;
    if (!byPathSub.has(key)) byPathSub.set(key, new Set());
    byPathSub.get(key).add(t.anchorIndex);
    affected.add(t.pathIndex);
  }
  for (const [key, aiSet] of byPathSub) {
    const [pi, si] = key.split(':').map(Number);
    const sub = next[pi]?.model?.subpaths?.[si];
    if (!sub) continue;
    sub.anchors = (sub.anchors || []).filter((_, i) => !aiSet.has(i));
  }
  for (const pi of affected) {
    const model = next[pi]?.model;
    if (!model) continue;
    model.subpaths = (model.subpaths || []).filter(
      (s) => (s.anchors?.length || 0) >= 2
    );
    if (next[pi]) next[pi].dirty = true;
  }
  return next;
}

// ── selection ─────────────────────────────────────────────────────────────────
const selKey = (s) => `${s.pathIndex}:${s.subpathIndex}:${s.anchorIndex}`;
const bare = (t) => ({
  pathIndex: t.pathIndex,
  subpathIndex: t.subpathIndex,
  anchorIndex: t.anchorIndex,
});

// toggleSelect: additive (Shift) toggles the target's membership; non-additive
// replaces the whole selection with just the target (a plain click).
export function toggleSelect(selection, target, opts = {}) {
  const { additive = false } = opts;
  const tk = selKey(target);
  const exists = (selection || []).some((s) => selKey(s) === tk);
  if (additive) {
    return exists
      ? selection.filter((s) => selKey(s) !== tk)
      : [...(selection || []), bare(target)];
  }
  return [bare(target)];
}

// marqueeSelect: every anchor whose {x,y} lies inside the (corner-agnostic) rect.
export function marqueeSelect(paths, rect) {
  const minX = Math.min(rect.x0, rect.x1);
  const maxX = Math.max(rect.x0, rect.x1);
  const minY = Math.min(rect.y0, rect.y1);
  const maxY = Math.max(rect.y0, rect.y1);
  const sel = [];
  for (let pi = 0; pi < (paths || []).length; pi++) {
    const subs = paths[pi]?.model?.subpaths || [];
    for (let si = 0; si < subs.length; si++) {
      const anchors = subs[si].anchors || [];
      for (let ai = 0; ai < anchors.length; ai++) {
        const a = anchors[ai];
        if (a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY) {
          sel.push({ pathIndex: pi, subpathIndex: si, anchorIndex: ai });
        }
      }
    }
  }
  return sel;
}

// Membership check for a selection array (used by PenCanvas to style anchors).
export function isSelected(selection, pi, si, ai) {
  const k = `${pi}:${si}:${ai}`;
  return (selection || []).some((s) => selKey(s) === k);
}

// ── curve math (segment/cubic geometry — stays IN this module) ────────────────
const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });

// Cubic Bézier point at parameter t (control points p0,c1,c2,p3).
function cubicAt(p0, c1, c2, p3, t) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  };
}

// A segment i spans anchor[i] → anchor[i+1] (or → anchor[0] when it's the closing
// segment of a closed subpath). Cubic when EITHER bounding handle exists on that
// side (anchor[i].out or anchor[j].in); else a straight line. Returns the segment
// count for a subpath's anchor list.
function segCountOf(anchors, closed) {
  const n = anchors.length;
  if (n < 2) return 0;
  return n - 1 + (closed ? 1 : 0);
}

// Nearest parameter t on a cubic to `point` — coarse uniform sample then one
// refinement pass in the narrowed window. Returns { t, d2 }.
function nearestOnCubic(p0, c1, c2, p3, point) {
  const coarse = 40;
  let bestT = 0;
  let bestD = Infinity;
  for (let k = 0; k <= coarse; k++) {
    const t = k / coarse;
    const p = cubicAt(p0, c1, c2, p3, t);
    const d = sq(p.x - point.x, p.y - point.y);
    if (d < bestD) { bestD = d; bestT = t; }
  }
  const lo = Math.max(0, bestT - 1 / coarse);
  const hi = Math.min(1, bestT + 1 / coarse);
  const fine = 40;
  for (let k = 0; k <= fine; k++) {
    const t = lo + ((hi - lo) * k) / fine;
    const p = cubicAt(p0, c1, c2, p3, t);
    const d = sq(p.x - point.x, p.y - point.y);
    if (d < bestD) { bestD = d; bestT = t; }
  }
  return { t: bestT, d2: bestD };
}

// ── hitTestSegment ───────────────────────────────────────────────────────────
// Nearest point ON a path SEGMENT (not an anchor/handle) within `tol` (MODEL
// units). Returns { pathIndex, subpathIndex, segIndex, t } or null. Lines project
// exactly; cubics sample (De Casteljau via nearestOnCubic). segIndex is the
// segment's start-anchor index; the closing segment of a closed subpath is
// segIndex = anchors.length - 1 (→ anchor[0]).
export function hitTestSegment(paths, point, tol) {
  const tol2 = tol * tol;
  let best = null;
  let bestD = Infinity;
  for (let pi = 0; pi < (paths || []).length; pi++) {
    const subs = paths[pi]?.model?.subpaths || [];
    for (let si = 0; si < subs.length; si++) {
      const anchors = subs[si].anchors || [];
      const closed = !!subs[si].closed;
      const segs = segCountOf(anchors, closed);
      for (let seg = 0; seg < segs; seg++) {
        const j = seg < anchors.length - 1 ? seg + 1 : 0;
        const a0 = anchors[seg];
        const a1 = anchors[j];
        const isLine = !a0.out && !a1.in;
        let t;
        let d2;
        if (isLine) {
          const vx = a1.x - a0.x;
          const vy = a1.y - a0.y;
          const len2 = vx * vx + vy * vy;
          t = len2 === 0 ? 0 : ((point.x - a0.x) * vx + (point.y - a0.y) * vy) / len2;
          t = Math.max(0, Math.min(1, t));
          const px = a0.x + vx * t;
          const py = a0.y + vy * t;
          d2 = sq(px - point.x, py - point.y);
        } else {
          const c1 = a0.out || { x: a0.x, y: a0.y };
          const c2 = a1.in || { x: a1.x, y: a1.y };
          const r = nearestOnCubic(a0, c1, c2, a1, point);
          t = r.t;
          d2 = r.d2;
        }
        if (d2 <= tol2 && d2 < bestD) {
          bestD = d2;
          best = { pathIndex: pi, subpathIndex: si, segIndex: seg, t };
        }
      }
    }
  }
  return best;
}

// ── addAnchorOnSegment ───────────────────────────────────────────────────────
// Split the segment identified by segHit at segHit.t, inserting a NEW anchor.
//   • LINE  → a null-handle CORNER at the interpolated point (shape unchanged).
//   • CUBIC → De Casteljau subdivision: the curve shape is preserved exactly —
//     the endpoints' inner handles shrink to the split's A/C, the new anchor gets
//     the split's D (in) / E (out) around the split point F, type 'smooth'.
// Dirties the path. Returns { paths, target } (the new anchor's target).
export function addAnchorOnSegment(paths, segHit) {
  const next = clonePaths(paths);
  const { pathIndex, subpathIndex, segIndex, t } = segHit;
  const sub = next[pathIndex]?.model?.subpaths?.[subpathIndex];
  if (!sub) return { paths: next, target: null };
  const anchors = sub.anchors;
  const j = segIndex < anchors.length - 1 ? segIndex + 1 : 0;
  const a0 = anchors[segIndex];
  const a1 = anchors[j];
  if (!a0 || !a1) return { paths: next, target: null };
  const isLine = !a0.out && !a1.in;
  let newAnchor;
  if (isLine) {
    newAnchor = {
      x: a0.x + (a1.x - a0.x) * t,
      y: a0.y + (a1.y - a0.y) * t,
      in: null,
      out: null,
      type: 'corner',
    };
  } else {
    const c1 = a0.out || { x: a0.x, y: a0.y };
    const c2 = a1.in || { x: a1.x, y: a1.y };
    const A = lerp(a0, c1, t);
    const B = lerp(c1, c2, t);
    const C = lerp(c2, a1, t);
    const D = lerp(A, B, t);
    const E = lerp(B, C, t);
    const F = lerp(D, E, t);
    a0.out = { x: A.x, y: A.y };
    a1.in = { x: C.x, y: C.y };
    newAnchor = { x: F.x, y: F.y, in: { x: D.x, y: D.y }, out: { x: E.x, y: E.y }, type: 'smooth' };
  }
  const insertAt = segIndex < anchors.length - 1 ? segIndex + 1 : anchors.length;
  anchors.splice(insertAt, 0, newAnchor);
  next[pathIndex].dirty = true;
  return {
    paths: next,
    target: { pathIndex, subpathIndex, anchorIndex: insertAt, part: 'anchor' },
  };
}

// ── convertAnchor ────────────────────────────────────────────────────────────
// 'smooth' → synthesize symmetric handles tangent to the neighbour anchors
// (Illustrator: direction = the line through prev→next; arm length = 1/3 of the
// respective neighbour distance). An open-subpath endpoint uses its single
// neighbour's direction. 'corner' → null BOTH handles. Dirties the path.
export function convertAnchor(paths, target, toType) {
  const next = clonePaths(paths);
  const sub = next[target.pathIndex]?.model?.subpaths?.[target.subpathIndex];
  const a = sub?.anchors?.[target.anchorIndex];
  if (!a) return next;
  if (toType === 'corner') {
    a.in = null;
    a.out = null;
    a.type = 'corner';
  } else {
    const anchors = sub.anchors;
    const closed = !!sub.closed;
    const n = anchors.length;
    const i = target.anchorIndex;
    const prev = i > 0 ? anchors[i - 1] : closed ? anchors[n - 1] : null;
    const nextN = i < n - 1 ? anchors[i + 1] : closed ? anchors[0] : null;
    let dirx;
    let diry;
    if (prev && nextN) { dirx = nextN.x - prev.x; diry = nextN.y - prev.y; }
    else if (nextN) { dirx = nextN.x - a.x; diry = nextN.y - a.y; }
    else if (prev) { dirx = a.x - prev.x; diry = a.y - prev.y; }
    else { dirx = 1; diry = 0; }
    const dl = Math.hypot(dirx, diry) || 1;
    const ux = dirx / dl;
    const uy = diry / dl;
    const dNext = nextN ? Math.hypot(nextN.x - a.x, nextN.y - a.y) : prev ? Math.hypot(a.x - prev.x, a.y - prev.y) : 0;
    const dPrev = prev ? Math.hypot(a.x - prev.x, a.y - prev.y) : nextN ? Math.hypot(nextN.x - a.x, nextN.y - a.y) : 0;
    a.out = { x: a.x + ux * (dNext / 3), y: a.y + uy * (dNext / 3) };
    a.in = { x: a.x - ux * (dPrev / 3), y: a.y - uy * (dPrev / 3) };
    a.type = 'smooth';
  }
  next[target.pathIndex].dirty = true;
  return next;
}

// ── setSmoothHandle ──────────────────────────────────────────────────────────
// Convert-tool drag-pull: set the anchor's OUT handle to `outHandle` and MIRROR
// it to the IN handle at EQUAL length (symmetric), flipping type to 'smooth'.
// (moveHandle preserves the opposite arm's length — wrong for the symmetric pull,
// so this is its own op.) Dirties the path.
export function setSmoothHandle(paths, target, outHandle) {
  const next = clonePaths(paths);
  const a = anchorAt(next, target);
  if (!a) return next;
  a.out = { x: outHandle.x, y: outHandle.y };
  a.in = { x: 2 * a.x - outHandle.x, y: 2 * a.y - outHandle.y };
  a.type = 'smooth';
  next[target.pathIndex].dirty = true;
  return next;
}

// ── moveWholePath ────────────────────────────────────────────────────────────
// Translate EVERY anchor + handle of a path's subpaths by `delta` (the V tool).
// Dirties the path.
export function moveWholePath(paths, pathIndex, delta) {
  const next = clonePaths(paths);
  const p = next[pathIndex];
  if (!p?.model) return next;
  for (const sub of p.model.subpaths || []) {
    for (const a of sub.anchors || []) {
      a.x += delta.x;
      a.y += delta.y;
      if (a.in) { a.in.x += delta.x; a.in.y += delta.y; }
      if (a.out) { a.out.x += delta.x; a.out.y += delta.y; }
    }
  }
  p.dirty = true;
  return next;
}

// ── appendAnchor ─────────────────────────────────────────────────────────────
// Pen-draw: append an anchor to the active subpath addressed by `loc`
// ({ pathIndex, subpathIndex }). When `loc` is null / stale (e.g. a NEW glyph
// whose paths is []), CREATE a fresh path + subpath at the end. Appends a CORNER
// anchor at `point`, or a SMOOTH anchor when `opts.outHandle` is given (sets out,
// mirrors in at equal length). Dirties the affected path.
export function appendAnchor(paths, loc, point, opts = {}) {
  const { outHandle = null } = opts;
  const next = clonePaths(paths);
  let pathIndex;
  let subpathIndex;
  if (loc && next[loc.pathIndex]?.model?.subpaths?.[loc.subpathIndex]) {
    pathIndex = loc.pathIndex;
    subpathIndex = loc.subpathIndex;
  } else {
    next.push({ d: '', closed: false, dirty: true, model: { subpaths: [{ anchors: [], closed: false }] } });
    pathIndex = next.length - 1;
    subpathIndex = 0;
  }
  const sub = next[pathIndex].model.subpaths[subpathIndex];
  const anchor = { x: point.x, y: point.y, in: null, out: null, type: 'corner' };
  if (outHandle) {
    anchor.out = { x: outHandle.x, y: outHandle.y };
    anchor.in = { x: 2 * point.x - outHandle.x, y: 2 * point.y - outHandle.y };
    anchor.type = 'smooth';
  }
  sub.anchors.push(anchor);
  next[pathIndex].dirty = true;
  return next;
}

// ── ROOT handle helpers (WI-P2-5) ────────────────────────────────────────────
// The root is the glyph's SPROUT: `{ x, y, angle }` — a point plus a growth axis.
// It is NOT a path anchor; these helpers drive its dedicated ⊕ + arm handle.

// hitTestRoot — classify a model point against the root's two grab zones:
//   • 'arm'   near the growth-arm ENDPOINT  = root.{x,y} + armLen·(cosθ, sinθ)
//   • 'point' near the root POINT           = root.{x,y}
//   • null    beyond `tol` of both
// Ties break to whichever zone is closer (arm and point never overlap unless
// armLen < tol, which we don't do). Pure — reads root, returns a tag.
export function hitTestRoot(root, point, tol, armLen) {
  const rx = root?.x ?? 0;
  const ry = root?.y ?? 0;
  const ang = root?.angle ?? 0;
  const ax = rx + armLen * Math.cos(ang);
  const ay = ry + armLen * Math.sin(ang);
  const tol2 = tol * tol;
  const dPoint = sq(rx - point.x, ry - point.y);
  const dArm = sq(ax - point.x, ay - point.y);
  const pointHit = dPoint <= tol2;
  const armHit = dArm <= tol2;
  if (pointHit && armHit) return dArm < dPoint ? 'arm' : 'point';
  if (armHit) return 'arm';
  if (pointHit) return 'point';
  return null;
}

// constrainTo45 — snap the VECTOR origin→point to the nearest 45° increment,
// PRESERVING its length (only the direction is quantized). Used for Shift while
// dragging an anchor/handle (origin = the drag-start / anchor). Pure.
export function constrainTo45(origin, point) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: origin.x, y: origin.y };
  const step = Math.PI / 4;
  const snapped = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: origin.x + len * Math.cos(snapped), y: origin.y + len * Math.sin(snapped) };
}

// angleFromArm — the growth angle when dragging the arm: the direction from the
// root point to `point`. (Shift-snap to 45° is applied by the caller via a plain
// round of this angle to π/4 steps.) Pure.
export function angleFromArm(root, point) {
  return Math.atan2(point.y - (root?.y ?? 0), point.x - (root?.x ?? 0));
}

// ── closeSubpath ─────────────────────────────────────────────────────────────
// Mark the addressed subpath closed (serialize then emits Z). Dirties the path.
export function closeSubpath(paths, pathIndex, subpathIndex) {
  const next = clonePaths(paths);
  const sub = next[pathIndex]?.model?.subpaths?.[subpathIndex];
  if (!sub) return next;
  sub.closed = true;
  if (next[pathIndex]) {
    next[pathIndex].closed = true;
    next[pathIndex].dirty = true;
  }
  return next;
}
