import {
  parsePathD, pathDFromPoints,
  simplifyPaths, mergeLines, reorderPaths,
  pathStats, estimateTimeSec,
} from './pathOps.js';

// -------------- Affine transform helpers --------------
// 2D affine matrix stored as [a, b, c, d, e, f] meaning
//   x' = a*x + c*y + e
//   y' = b*x + d*y + f
const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

function multiply(A, B) {
  return [
    A[0] * B[0] + A[2] * B[1],
    A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3],
    A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4],
    A[1] * B[4] + A[3] * B[5] + A[5],
  ];
}

function applyMatrix(M, p) {
  return [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]];
}

// Parses an SVG `transform` attribute into a single affine matrix.
// Handles translate(...), rotate(angle [, cx, cy]), scale(...), matrix(...).
function parseTransformAttr(str) {
  if (!str) return IDENTITY.slice();
  let M = IDENTITY.slice();
  const re = /(translate|rotate|scale|matrix)\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    const fn = m[1];
    const args = m[2].trim().split(/[\s,]+/).map(parseFloat).filter((n) => !Number.isNaN(n));
    let T = IDENTITY.slice();
    if (fn === 'translate') {
      T = [1, 0, 0, 1, args[0] || 0, args[1] || 0];
    } else if (fn === 'scale') {
      const sx = args[0] || 1;
      const sy = args.length > 1 ? args[1] : sx;
      T = [sx, 0, 0, sy, 0, 0];
    } else if (fn === 'rotate') {
      const a = (args[0] || 0) * Math.PI / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      T = [c, s, -s, c, 0, 0];
      if (args.length >= 3) {
        const cx = args[1]; const cy = args[2];
        T = multiply([1, 0, 0, 1, cx, cy], multiply(T, [1, 0, 0, 1, -cx, -cy]));
      }
    } else if (fn === 'matrix') {
      if (args.length === 6) T = args;
    }
    M = multiply(M, T);
  }
  return M;
}

// Extract pattern <path/> elements from a layer's SVG group string.
// Returns: { prefix, suffix, paths: [{ points, closed, attrs }] }
// The prefix is everything up to the first <path/>; suffix is everything
// after the last <path/>. Caller re-assembles as `prefix + renderPaths(...) + suffix`.
// This is surgical by design — we mutate only the path block, so every
// surrounding <g transform="..."> wrapper is preserved verbatim.
const PATH_RE = /<path\s+d="([^"]*)"([^/]*)\/>/g;

export function splitGroup(svgGroup) {
  const paths = [];
  const matches = [];
  let m;
  PATH_RE.lastIndex = 0;
  while ((m = PATH_RE.exec(svgGroup)) !== null) {
    const parsed = parsePathD(m[1]);
    paths.push({ points: parsed.points, closed: parsed.closed, attrs: m[2] });
    matches.push({ start: m.index, end: m.index + m[0].length });
  }
  if (matches.length === 0) {
    return { prefix: svgGroup, suffix: '', paths: [] };
  }
  const prefix = svgGroup.slice(0, matches[0].start);
  const suffix = svgGroup.slice(matches[matches.length - 1].end);
  return { prefix, suffix, paths };
}

export function renderPaths(paths, indent = '    ') {
  return paths
    .filter((p) => p.points && p.points.length >= 2)
    .map((p) => `${indent}<path d="${pathDFromPoints(p.points, p.closed)}"${p.attrs}/>`)
    .join('\n');
}

// Public: run optimizations on a layer group and return { svg, stats }
export function optimizeGroup(svgGroup, opts = {}) {
  const { prefix, suffix, paths: original } = splitGroup(svgGroup);
  if (!original.length) {
    return {
      svg: svgGroup,
      stats: { before: emptyStats(), after: emptyStats(), applied: [] },
    };
  }
  const before = summarize(original);
  let paths = original;
  const applied = [];

  if (opts.simplify?.enabled && opts.simplify.tolerance > 0) {
    paths = simplifyPaths(paths, opts.simplify.tolerance);
    applied.push(`simplify(${opts.simplify.tolerance}mm)`);
  }
  if (opts.merge?.enabled && opts.merge.tolerance > 0) {
    paths = mergeLines(paths, opts.merge.tolerance);
    applied.push(`merge(${opts.merge.tolerance}mm)`);
  }
  if (opts.reorder?.enabled) {
    paths = reorderPaths(paths);
    applied.push(`reorder`);
  }

  const after = summarize(paths);
  const svg = `${prefix}\n${renderPaths(paths)}\n${suffix}`;
  return { svg, stats: { before, after, applied } };
}

function summarize(paths) {
  const s = pathStats(paths);
  return { ...s, seconds: estimateTimeSec(s) };
}

function emptyStats() {
  return { paths: 0, points: 0, drawMm: 0, travelMm: 0, seconds: 0 };
}

// Utility — does one optimization at a time, so the UI can show isolated
// before/after stats per control. The `only` flag lets us pretend the other
// optimizations aren't enabled, even if they are in the global opts.
export function previewOne(svgGroup, only, opts) {
  const isolated = {
    simplify: { enabled: false },
    merge:    { enabled: false },
    reorder:  { enabled: false },
  };
  isolated[only] = { ...opts[only], enabled: true };
  return optimizeGroup(svgGroup, isolated);
}

// Walk the inner structure of a layer `<g id="layer-...">` group and return
// a flat list of polylines already transformed into the outer viewBox
// coordinate space. For designs with radial symmetry the single inner path
// block is replicated N times here — one polyline per symmetry copy — so
// the consumer (plot preview, overlap check, travel estimator) sees what
// the plotter will actually draw, not the raw pre-transform shape.
export function extractRenderedPaths(svgGroup) {
  if (!svgGroup || typeof DOMParser === 'undefined') {
    // Fall back to untransformed extraction outside the browser (tests / node).
    return splitGroup(svgGroup).paths.map((p) => ({
      points: p.points,
      closed: p.closed,
      color: extractStrokeFromAttrs(p.attrs),
    }));
  }
  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg">${svgGroup}</svg>`;
  const doc = new DOMParser().parseFromString(wrapped, 'image/svg+xml');
  const root = doc.documentElement;
  const out = [];

  function walk(node, M, inheritedStroke) {
    const children = node.children || [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      let nextM = M;
      const tAttr = child.getAttribute && child.getAttribute('transform');
      if (tAttr) nextM = multiply(M, parseTransformAttr(tAttr));
      const strokeAttr = child.getAttribute && child.getAttribute('stroke');
      const stroke = strokeAttr || inheritedStroke;
      if (child.tagName && child.tagName.toLowerCase() === 'path') {
        const d = child.getAttribute('d') || '';
        const parsed = parsePathD(d);
        const pts = parsed.points.map((p) => applyMatrix(nextM, p));
        out.push({ points: pts, closed: parsed.closed, color: stroke || '#888' });
      } else {
        walk(child, nextM, stroke);
      }
    }
  }
  walk(root, IDENTITY.slice(), null);
  return out;
}

function extractStrokeFromAttrs(attrs) {
  if (!attrs) return '#888';
  const m = attrs.match(/stroke="([^"]*)"/);
  return m ? m[1] : '#888';
}

// Short, human-readable format for stats strips (the before/after chips).
export function formatSeconds(s) {
  if (!Number.isFinite(s) || s <= 0) return '0s';
  if (s < 60) return `${s.toFixed(0)}s`;
  const min = Math.floor(s / 60);
  const sec = Math.round(s - min * 60);
  return sec === 0 ? `${min}m` : `${min}m ${sec}s`;
}
