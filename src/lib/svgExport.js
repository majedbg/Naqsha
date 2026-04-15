// SVG export.
// Real-world dimensions are emitted in millimeters (the community standard
// used by Inkscape, LightBurn, Glowforge, xTool, and vpype). The viewBox
// stays in the pixel coordinate space that the pattern classes already
// draw in — so path data doesn't need transforming on export.

const PPI = 96;
const MM_PER_IN = 25.4;
const pxToMm = (px) => (px / PPI) * MM_PER_IN;

function downloadSVG(svgString, filename) {
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

export function exportLayerSVG(layer, patternInstance, canvasW, canvasH, { metadata = false, manifest, filename } = {}) {
  const bgRect = layerBgRect(layer, canvasW, canvasH);
  const group = patternInstance.toSVGGroup(layer.id, layer.color, layer.opacity);
  const meta = buildMeta({ metadata, manifest });
  const svg = `${svgOpen(canvasW, canvasH, meta)}
  <rect width="100%" height="100%" fill="white"/>
${bgRect ? `  ${bgRect}\n` : ''}  ${group}
</svg>`;
  downloadSVG(svg, filename || `${layer.name.replace(/\s+/g, '_')}.svg`);
}

export function exportAllLayersSVG(layers, patternInstances, canvasW, canvasH, includeHidden = false, { metadata = false, manifest, filename } = {}) {
  // Reverse so bottom layers come first in SVG (matching visual order)
  const ordered = [...layers].reverse();
  const groups = ordered
    .filter((l) => includeHidden || l.visible)
    .map((l) => {
      const instance = patternInstances[l.id];
      if (!instance) return '';
      const bgRect = layerBgRect(l, canvasW, canvasH);
      const group = instance.toSVGGroup(l.id, l.color, l.opacity);
      return (bgRect ? bgRect + '\n  ' : '') + group;
    })
    .join('\n  ');
  const meta = buildMeta({ metadata, manifest });
  const svg = `${svgOpen(canvasW, canvasH, meta)}
  <rect width="100%" height="100%" fill="white"/>
  ${groups}
</svg>`;
  downloadSVG(svg, filename || 'generative-art-all-layers.svg');
}

// Build a deterministic-ish manifest string for embedding in exported SVGs.
// Goes into an SVG comment, so anything here is machine-readable by tooling
// that grep/regexes the comment (common in the plotter community).
export function buildManifest({
  appName = 'Naqsha',
  version = '1',
  outputMode = 'plotter',
  bedW, bedH, bedUnit = 'mm',
  layers = [],
  optimizations = [],
} = {}) {
  const ts = new Date().toISOString();
  const layerLines = layers.map((l) =>
    `  layer: ${l.name || l.id} | pattern: ${l.patternType} | seed: ${l.seed} | role: ${l.role ?? '-'} | pen: ${l.penSlot ?? '-'}`
  );
  return [
    `${appName} export v${version}`,
    `timestamp: ${ts}`,
    `bed: ${bedW} x ${bedH} ${bedUnit}`,
    `output: ${outputMode}`,
    `optimizations: ${optimizations.length ? optimizations.join(', ') : 'none'}`,
    ...layerLines,
  ].join('\n');
}
