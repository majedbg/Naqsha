// SVG import — parse an SVG string into the path data we place as artwork
// (issue #12, C4). Place-as-artwork ONLY: we extract drawable outline geometry
// (the `d` of every <path>) and preserve it verbatim so curves survive export.
// Boundary/mask clipping is explicitly deferred — imported geometry is artwork.
//
// Pure and node-testable: no DOMParser dependency (the test env is `node`), so
// we extract `d` attributes with a tolerant regex in the same spirit as
// plotter/pathOps' tokenizer. Malformed/empty input is rejected with a message
// rather than throwing, so every caller (File>Import, drag-drop, paste) can
// surface a graceful failure.

// Pull the `d` attribute value out of every <path …/> element. Handles single
// or double quotes and arbitrary attribute order/whitespace.
function extractPathDs(svg) {
  const ds = [];
  const pathRe = /<path\b[^>]*?\bd\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = pathRe.exec(svg)) !== null) {
    const d = (m[2] ?? m[3] ?? '').trim();
    if (d) ds.push(d);
  }
  return ds;
}

/**
 * Parse an SVG string into normalized import data.
 *
 * @param {string} svg - raw SVG markup
 * @returns {{ ok: true, paths: string[] } | { ok: false, error: string }}
 *   On success, `paths` is the verbatim `d` data of every <path> (≥1).
 *   On failure, `error` is a human-readable message.
 */
export function parseSVGImport(svg) {
  if (typeof svg !== 'string' || svg.trim() === '') {
    return { ok: false, error: 'Empty SVG — nothing to import.' };
  }
  if (!/<svg[\s>]/i.test(svg)) {
    return { ok: false, error: 'Not a valid SVG file.' };
  }
  const paths = extractPathDs(svg);
  if (paths.length === 0) {
    return { ok: false, error: 'No path data found in this SVG.' };
  }
  return { ok: true, paths };
}

// ---------------------------------------------------------------------------
// extractMotifDrawables (P5-3) — an ENHANCED, motif-only extractor. Consumed
// SOLELY by importMotif.js. parseSVGImport above is untouched and stays the
// shared, path-only, transform-blind extractor for useLayers.js (artwork
// import) and scene/placement.js — its `{ok, paths: string[]}` contract and
// behavior are byte-for-byte unchanged.
//
// Adds, on top of parseSVGImport:
//   1. Basic-shape -> path `d` conversion: rect (incl. rounded rx/ry), circle,
//      ellipse, line, polygon (closed), polyline (open).
//   2. Transform flattening: each element's OWN `transform` attribute, composed
//      with a SINGLE top-level transform (on <svg> or the first outer <g>).
//
// An untransformed <path> keeps its `d` VERBATIM (curve-export fidelity).
// Only (a) converted basic shapes and (b) elements under a non-identity
// effective transform get a freshly-serialized `d`. To transform a `d` we
// reuse pathModel's pure anchor model (parseDToAnchors -> apply matrix to every
// anchor + handle -> anchorsToD) rather than writing per-command transform
// math — the only precision loss is the pre-existing arc/A -> cubic
// normalization (already the accepted lossy case, see DECISIONS D2).
//
// FLAGGED FOLLOW-UP (explicitly out of scope): nested/multiple <g> transform
// chains and a real DOMParser. This is a tolerant regex extractor with NO
// nesting model — only one top-level transform is honored. Anything this
// extractor can't cleanly handle (unknown element, unparseable transform,
// malformed shape) degrades gracefully to today's behavior (skip the element /
// treat as identity) and never throws.
// ---------------------------------------------------------------------------

import { parseDToAnchors, anchorsToD } from './motif/pathModel.js';

const IDENTITY_MATRIX = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function isIdentityMatrix(m) {
  return !m || (m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0);
}

// 2x3 affine matrix composition: p' = A*(B*p). Standard left-to-right matrix
// product for column-vector transforms (matches SVG's transform-list order).
function multiplyMatrix(m1, m2) {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

function applyMatrix(m, x, y) {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

function combineMatrices(top, own) {
  if (top && own) return multiplyMatrix(top, own);
  return top || own || null;
}

// Pull a single attribute value (single/double-quoted) out of a raw tag/attr
// string. Same tolerant regex spirit as extractPathDs.
function getAttr(str, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const m = re.exec(str);
  if (!m) return undefined;
  return (m[2] ?? m[3] ?? '').trim();
}

function numAttr(str, name, fallback) {
  const v = getAttr(str, name);
  if (v === undefined) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

// ---- SVG transform-attribute parsing --------------------------------------

function matrixFromTransformFn(name, argStrs) {
  const n = argStrs.map(Number);
  switch (name.toLowerCase()) {
    case 'matrix': {
      if (n.length !== 6 || n.some((v) => !Number.isFinite(v))) return null;
      return { a: n[0], b: n[1], c: n[2], d: n[3], e: n[4], f: n[5] };
    }
    case 'translate': {
      const tx = n[0];
      const ty = n.length > 1 ? n[1] : 0;
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
      return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
    }
    case 'scale': {
      const sx = n[0];
      const sy = n.length > 1 ? n[1] : sx;
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
      return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
    }
    case 'rotate': {
      const deg = n[0];
      if (!Number.isFinite(deg)) return null;
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rot = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
      if (n.length >= 3 && Number.isFinite(n[1]) && Number.isFinite(n[2])) {
        const cx = n[1];
        const cy = n[2];
        const toOrigin = { a: 1, b: 0, c: 0, d: 1, e: -cx, f: -cy };
        const back = { a: 1, b: 0, c: 0, d: 1, e: cx, f: cy };
        return multiplyMatrix(multiplyMatrix(back, rot), toOrigin);
      }
      return rot;
    }
    case 'skewx': {
      const deg = n[0];
      if (!Number.isFinite(deg)) return null;
      return { a: 1, b: 0, c: Math.tan((deg * Math.PI) / 180), d: 1, e: 0, f: 0 };
    }
    case 'skewy': {
      const deg = n[0];
      if (!Number.isFinite(deg)) return null;
      return { a: 1, b: Math.tan((deg * Math.PI) / 180), c: 0, d: 1, e: 0, f: 0 };
    }
    default:
      return null;
  }
}

// Parse a `transform="fn(args) fn(args) ..."` string into ONE composed 2x3
// matrix (left-to-right SVG order). Unrecognized/unparseable functions are
// skipped individually (graceful degradation); an entirely empty/unparseable
// string returns null (treated as identity by the caller).
function parseTransformAttr(str) {
  if (!str || typeof str !== 'string') return null;
  const fnRe = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let m;
  let acc = null;
  while ((m = fnRe.exec(str)) !== null) {
    const args = m[2].split(/[\s,]+/).filter((s) => s.length > 0);
    const mat = matrixFromTransformFn(m[1], args);
    if (!mat) continue;
    acc = acc ? multiplyMatrix(acc, mat) : mat;
  }
  return acc;
}

// Find the SINGLE top-level transform: the <svg> tag's own `transform` (rare
// but valid), else a lone outer <g transform="...">. No nesting model — this
// is the documented scope limit (see module header).
//
// Safety rail: if the document has MORE THAN ONE <g>, we do NOT know which one
// (if any) actually wraps every drawable element — guessing "the first one"
// would silently mis-apply group-1's transform to group-2's siblings (wrong
// position is worse than no transform). So multi-<g> documents skip the <g>
// path entirely and fall back to no top-level transform, matching the
// graceful-degradation contract. Flagged follow-up: a real nesting model.
function extractTopLevelTransform(svg) {
  const svgTag = /<svg\b[^>]*>/i.exec(svg);
  if (svgTag) {
    const t = getAttr(svgTag[0], 'transform');
    if (t) {
      const m = parseTransformAttr(t);
      if (m) return m;
    }
  }
  const gCount = (svg.match(/<g\b/gi) || []).length;
  if (gCount === 1) {
    const gTag = /<g\b[^>]*>/i.exec(svg);
    if (gTag) {
      const t = getAttr(gTag[0], 'transform');
      if (t) {
        const m = parseTransformAttr(t);
        if (m) return m;
      }
    }
  }
  return null;
}

// ---- basic-shape -> path `d` conversion ------------------------------------

function rectToD(attrs) {
  const x = numAttr(attrs, 'x', 0);
  const y = numAttr(attrs, 'y', 0);
  const width = numAttr(attrs, 'width', NaN);
  const height = numAttr(attrs, 'height', NaN);
  if (!(width > 0) || !(height > 0)) return null;

  let rx = getAttr(attrs, 'rx');
  let ry = getAttr(attrs, 'ry');
  rx = rx === undefined ? undefined : parseFloat(rx);
  ry = ry === undefined ? undefined : parseFloat(ry);
  if (!Number.isFinite(rx) && Number.isFinite(ry)) rx = ry;
  if (!Number.isFinite(ry) && Number.isFinite(rx)) ry = rx;
  if (!Number.isFinite(rx) || rx < 0) rx = 0;
  if (!Number.isFinite(ry) || ry < 0) ry = 0;
  rx = Math.min(rx, width / 2);
  ry = Math.min(ry, height / 2);

  if (rx === 0 || ry === 0) {
    return `M${x},${y} L${x + width},${y} L${x + width},${y + height} L${x},${y + height} Z`;
  }
  return (
    `M${x + rx},${y} ` +
    `L${x + width - rx},${y} ` +
    `A${rx},${ry} 0 0,1 ${x + width},${y + ry} ` +
    `L${x + width},${y + height - ry} ` +
    `A${rx},${ry} 0 0,1 ${x + width - rx},${y + height} ` +
    `L${x + rx},${y + height} ` +
    `A${rx},${ry} 0 0,1 ${x},${y + height - ry} ` +
    `L${x},${y + ry} ` +
    `A${rx},${ry} 0 0,1 ${x + rx},${y} Z`
  );
}

function circleToD(attrs) {
  const cx = numAttr(attrs, 'cx', 0);
  const cy = numAttr(attrs, 'cy', 0);
  const r = numAttr(attrs, 'r', NaN);
  if (!(r > 0)) return null;
  return `M${cx - r},${cy} A${r},${r} 0 1,0 ${cx + r},${cy} A${r},${r} 0 1,0 ${cx - r},${cy} Z`;
}

function ellipseToD(attrs) {
  const cx = numAttr(attrs, 'cx', 0);
  const cy = numAttr(attrs, 'cy', 0);
  const rx = numAttr(attrs, 'rx', NaN);
  const ry = numAttr(attrs, 'ry', NaN);
  if (!(rx > 0) || !(ry > 0)) return null;
  return `M${cx - rx},${cy} A${rx},${ry} 0 1,0 ${cx + rx},${cy} A${rx},${ry} 0 1,0 ${cx - rx},${cy} Z`;
}

function lineToD(attrs) {
  const x1 = numAttr(attrs, 'x1', 0);
  const y1 = numAttr(attrs, 'y1', 0);
  const x2 = numAttr(attrs, 'x2', 0);
  const y2 = numAttr(attrs, 'y2', 0);
  return `M${x1},${y1} L${x2},${y2}`;
}

function parsePointsAttr(str) {
  if (!str) return [];
  const nums = str.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) || [];
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push([parseFloat(nums[i]), parseFloat(nums[i + 1])]);
  }
  return pts;
}

function polyToD(attrs, closed) {
  const points = parsePointsAttr(getAttr(attrs, 'points'));
  if (points.length < 2) return null;
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  return closed ? `${d} Z` : d;
}

function shapeToD(tag, attrs) {
  switch (tag) {
    case 'rect':
      return rectToD(attrs);
    case 'circle':
      return circleToD(attrs);
    case 'ellipse':
      return ellipseToD(attrs);
    case 'line':
      return lineToD(attrs);
    case 'polygon':
      return polyToD(attrs, true);
    case 'polyline':
      return polyToD(attrs, false);
    default:
      return null;
  }
}

// Transform a `d` string by an effective 2x3 matrix, reusing pathModel's pure
// anchor model instead of per-command matrix math. Returns null (graceful
// fallback) on anything that fails to produce usable geometry — the caller
// then skips the element rather than throwing.
function transformD(d, matrix) {
  try {
    const model = parseDToAnchors(d);
    if (!model || !Array.isArray(model.subpaths) || model.subpaths.length === 0) return null;
    const transformed = {
      subpaths: model.subpaths.map((sub) => ({
        closed: !!sub.closed,
        anchors: (sub.anchors || []).map((a) => {
          const [x, y] = applyMatrix(matrix, a.x, a.y);
          const inH = a.in ? zipPoint(applyMatrix(matrix, a.in.x, a.in.y)) : null;
          const outH = a.out ? zipPoint(applyMatrix(matrix, a.out.x, a.out.y)) : null;
          return { x, y, in: inH, out: outH, type: a.type };
        }),
      })),
    };
    const outD = anchorsToD(transformed);
    return outD || null;
  } catch {
    return null;
  }
}

function zipPoint([x, y]) {
  return { x, y };
}

const DRAWABLE_ELEMENT_RE = /<(path|rect|circle|ellipse|line|polygon|polyline)\b([^>]*?)\/?>/gi;

/**
 * Parse an SVG string into normalized MOTIF import data — the enhanced,
 * transform- and basic-shape-aware sibling of parseSVGImport. Used ONLY by
 * importMotif.js.
 *
 * @param {string} svg - raw SVG markup
 * @returns {{ ok: true, paths: string[] } | { ok: false, error: string }}
 *   On success, `paths` is one `d` string per drawable element in document
 *   order: verbatim for untransformed <path>s, freshly-serialized otherwise.
 *   On failure, `error` is a human-readable message.
 */
export function extractMotifDrawables(svg) {
  if (typeof svg !== 'string' || svg.trim() === '') {
    return { ok: false, error: 'Empty SVG — nothing to import.' };
  }
  if (!/<svg[\s>]/i.test(svg)) {
    return { ok: false, error: 'Not a valid SVG file.' };
  }

  const topMatrix = extractTopLevelTransform(svg);
  const paths = [];
  const re = new RegExp(DRAWABLE_ELEMENT_RE.source, 'gi');
  let m;
  while ((m = re.exec(svg)) !== null) {
    const tag = m[1].toLowerCase();
    const attrs = m[2] || '';
    const ownMatrix = parseTransformAttr(getAttr(attrs, 'transform'));
    const effective = combineMatrices(topMatrix, ownMatrix);

    let d;
    if (tag === 'path') {
      const raw = getAttr(attrs, 'd');
      if (!raw) continue;
      d = raw;
    } else {
      d = shapeToD(tag, attrs);
      if (!d) continue;
    }

    if (isIdentityMatrix(effective)) {
      paths.push(d);
    } else {
      const transformed = transformD(d, effective);
      // Graceful fallback: an unparseable/degenerate transform result falls
      // back to the untransformed geometry rather than dropping the element.
      paths.push(transformed || d);
    }
  }

  if (paths.length === 0) {
    return { ok: false, error: 'No drawable geometry found in this SVG.' };
  }
  return { ok: true, paths };
}
