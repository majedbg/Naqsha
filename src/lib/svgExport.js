// SVG export.
// Real-world dimensions are emitted in millimeters (the community standard
// used by Inkscape, LightBurn, Glowforge, xTool, and vpype). The viewBox
// stays in the pixel coordinate space that the pattern classes already
// draw in — so path data doesn't need transforming on export.

import { optimizeGroup } from './plotter/pipeline';
import { PPI, MM_PER_IN } from './plotter/constants.js';
import { resolveOperation } from './operations.js';
import { realizeVariableWeightElements } from './variableWeight.js';
import { transformToSVG } from './transform/transformOps.js';
import { isTextLayer, textNodeFromLayer } from './text/textLayer.js';
import { TextNode } from './scene/TextNode.js';

const pxToMm = (px) => (px / PPI) * MM_PER_IN;

// Wrap a layer's rendered content in the layer's interactive transform (move /
// resize / rotate), pivoted about the canvas center — the SAME center-pivot form
// useCanvas renders with, so the exported (cut) geometry lands exactly where the
// canvas shows it. Identity transform → transformToSVG returns '' and the
// content is emitted verbatim (byte-identical to pre-transform exports).
function wrapLayerTransform(content, layer, canvasW, canvasH) {
  const svgT = transformToSVG(layer?.transform, { x: canvasW / 2, y: canvasH / 2 });
  return svgT ? `<g transform="${svgT}">${content}</g>` : content;
}

// Text layers export their glyph OUTLINE. The font must be supplied (opts.font)
// — without it glyphs can't be measured/outlined, so the layer is skipped.
// Text uses its own bbox-center pivot (NOT the canvas-center wrapLayerTransform
// patterns use), so toSVGGroup already emits the correctly-pivoted transform.
function textLayerGroup(layer, font) {
  if (!font) return '';
  const data = textNodeFromLayer(layer);
  if (!data.text || !data.text.trim()) return '';        // empty text → nothing
  const node = new TextNode({ ...data, font, transform: layer.transform });
  const local = node.localBBox();
  const x = data.x || 0, y = data.y || 0;
  const pivot = { x: x + local.w / 2, y: y + local.h / 2 };
  return node.toSVGGroup(pivot);
}

function anyOptEnabled(optimizations) {
  if (!optimizations) return false;
  return !!(
    optimizations.simplify?.enabled ||
    optimizations.merge?.enabled ||
    optimizations.reorder?.enabled
  );
}

function maybeOptimize(rawGroup, optimizations) {
  if (!anyOptEnabled(optimizations)) return rawGroup;
  try {
    const { svg } = optimizeGroup(rawGroup, optimizations);
    return svg;
  } catch {
    // If path parsing fails for any reason, fall back to the raw group so the
    // export still succeeds. Optimization is a bonus, not a prerequisite.
    return rawGroup;
  }
}

// DOM side-effect, isolated so the SVG-string builders stay pure/node-testable.
export function downloadSVG(svgString, filename) {
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatMm(mm) {
  // 2 decimals is plenty — sub-10μm precision at SVG level.
  return mm.toFixed(2).replace(/\.00$/, '');
}

function layerBgRect(layer, canvasW, canvasH) {
  if (!layer.bgOpacity || layer.bgOpacity <= 0) return '';
  return `    <rect width="${canvasW}" height="${canvasH}" fill="${layer.bgColor}" opacity="${(layer.bgOpacity / 100).toFixed(2)}"/>`;
}

function svgOpen(canvasW, canvasH, meta) {
  const w = formatMm(pxToMm(canvasW));
  const h = formatMm(pxToMm(canvasH));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${canvasW} ${canvasH}">${meta}`;
}

function buildMeta({ metadata, manifest }) {
  const parts = [];
  if (metadata) parts.push('<!-- generativearts.studio -->');
  if (manifest) {
    const safe = String(manifest).replace(/--/g, '‒‒');
    parts.push(`<!--\n${safe}\n-->`);
  }
  return parts.length ? `\n  ${parts.join('\n  ')}` : '';
}

// --- Pure SVG-string builders (no DOM, node-testable). ---------------------
// The produced strings are byte-identical to what the exporters emitted before
// this split; the only change is that the Blob/download side-effect now lives
// in the separate `downloadSVG`.

export function buildLayerSVG(layer, patternInstance, canvasW, canvasH, opts = {}) {
  const { metadata = false, manifest, optimizations } = opts;
  if (isTextLayer(layer)) {
    const placed = textLayerGroup(layer, opts.font);
    const meta = buildMeta({ metadata: opts.metadata, manifest: opts.manifest });
    return `${svgOpen(canvasW, canvasH, meta)}\n  <rect width="100%" height="100%" fill="white"/>\n  ${placed}\n</svg>`;
  }
  const bgRect = layerBgRect(layer, canvasW, canvasH);
  const rawGroup = patternInstance.toSVGGroup(layer.id, layer.color, layer.opacity);
  const group = maybeOptimize(rawGroup, optimizations);
  // Move/resize/rotate must move bg fill + geometry together (matches the canvas
  // render, which wraps both in the node transform).
  const content = `${bgRect ? `${bgRect}\n  ` : ''}${group}`;
  const placed = wrapLayerTransform(content, layer, canvasW, canvasH);
  const meta = buildMeta({ metadata, manifest });
  return `${svgOpen(canvasW, canvasH, meta)}
  <rect width="100%" height="100%" fill="white"/>
  ${placed}
</svg>`;
}

// ADDITIVE variable-weight branch (issue #17 / #4 follow-up). For a layer whose
// `variableWeight.enabled` is true on a supported profile, emit per-element band
// COLORS via realizeVariableWeightElements (one `<g>` of per-bucket-colored
// `<path>`s) instead of the single-color group. Returns null when the layer is
// not variable-weight-enabled or the profile/instance doesn't support it, so the
// caller falls back to the normal byte-stable single-color path.
function variableWeightGroup(layer, instance, profileId) {
  if (!layer?.variableWeight?.enabled) return null;
  const elements = instance?.svgElements;
  if (!Array.isArray(elements)) return null;
  const inner = realizeVariableWeightElements(elements, {
    profileId,
    n: layer.variableWeight.n,
  });
  if (inner == null) return null; // unsupported profile (e.g. dragCutter)
  return `<g id="${layer.id}" opacity="${(layer.opacity ?? 100) / 100}">\n${inner}\n  </g>`;
}

export function buildAllLayersSVG(layers, patternInstances, canvasW, canvasH, includeHidden = false, { metadata = false, manifest, optimizations, profileId, font } = {}) {
  // Reverse so bottom layers come first in SVG (matching visual order)
  const ordered = [...layers].reverse();
  const groups = ordered
    .filter((l) => includeHidden || l.visible)
    .map((l) => {
      if (isTextLayer(l)) return textLayerGroup(l, font);
      const instance = patternInstances[l.id];
      if (!instance) return '';
      const bgRect = layerBgRect(l, canvasW, canvasH);
      // Variable-weight layers export per-element band colors (additive); every
      // other layer keeps the byte-stable single-color group path.
      const vwGroup = variableWeightGroup(l, instance, profileId);
      const rawGroup = vwGroup ?? instance.toSVGGroup(l.id, l.color, l.opacity);
      const group = vwGroup ? rawGroup : maybeOptimize(rawGroup, optimizations);
      const content = (bgRect ? bgRect + '\n  ' : '') + group;
      return wrapLayerTransform(content, l, canvasW, canvasH);
    })
    .join('\n  ');
  const meta = buildMeta({ metadata, manifest });
  return `${svgOpen(canvasW, canvasH, meta)}
  <rect width="100%" height="100%" fill="white"/>
  ${groups}
</svg>`;
}

// --- Export wrappers: build pure string, then download (DOM side-effect). ---

export function exportLayerSVG(layer, patternInstance, canvasW, canvasH, opts = {}) {
  const svg = buildLayerSVG(layer, patternInstance, canvasW, canvasH, opts);
  downloadSVG(svg, opts.filename || `${layer.name.replace(/\s+/g, '_')}.svg`);
}

export function exportAllLayersSVG(layers, patternInstances, canvasW, canvasH, includeHidden = false, opts = {}) {
  const svg = buildAllLayersSVG(layers, patternInstances, canvasW, canvasH, includeHidden, opts);
  downloadSVG(svg, opts.filename || 'generative-art-all-layers.svg');
}

// Build a deterministic-ish manifest string for embedding in exported SVGs.
// Goes into an SVG comment, so anything here is machine-readable by tooling
// that grep/regexes the comment (common in the plotter community).
export function buildManifest({
  appName = 'Naqsha',
  version = '1',
  // `machineProfile` is the new field (replaces the old `outputMode` toggle);
  // `outputMode` is still accepted as a fallback for any legacy caller.
  machineProfile,
  outputMode,
  operations,
  bedW, bedH, bedUnit = 'mm',
  layers = [],
  optimizations = [],
} = {}) {
  const ts = new Date().toISOString();
  const profile = machineProfile ?? outputMode ?? 'plotter';
  // Per-layer line reflects the assigned operation (name + process) when an
  // operation library is supplied, falling back to the legacy `role` otherwise.
  const layerLines = layers.map((l) => {
    const op = operations ? resolveOperation(operations, l.operationId) : undefined;
    const opName = op ? op.name : '-';
    const process = op ? op.process : (l.role ?? '-');
    return `  layer: ${l.name || l.id} | pattern: ${l.patternType} | seed: ${l.seed} | operation: ${opName} | process: ${process} | pen: ${l.penSlot ?? '-'}`;
  });
  return [
    `${appName} export v${version}`,
    `timestamp: ${ts}`,
    `bed: ${bedW} x ${bedH} ${bedUnit}`,
    `output: ${profile}`,
    `optimizations: ${optimizations.length ? optimizations.join(', ') : 'none'}`,
    ...layerLines,
  ].join('\n');
}
