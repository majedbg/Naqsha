import {
  parsePathD, pathDFromPoints,
  simplifyPaths, mergeLines, reorderPaths,
  pathStats, estimateTimeSec,
} from './pathOps.js';

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

// Short, human-readable format for stats strips (the before/after chips).
export function formatSeconds(s) {
  if (!Number.isFinite(s) || s <= 0) return '0s';
  if (s < 60) return `${s.toFixed(0)}s`;
  const min = Math.floor(s / 60);
  const sec = Math.round(s - min * 60);
  return sec === 0 ? `${min}m` : `${min}m ${sec}s`;
}
