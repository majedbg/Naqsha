// WI-3 Naqsha Panels: per-panel + combined SVG export, bundled into a timestamped
// ZIP. Follows the codebase convention of splitting a PURE string/data builder
// (node-testable, no DOM, no JSZip) from a thin side-effecting wrapper that
// zips + downloads. Reuses `buildAllLayersSVG` (svgExport.js) UNCHANGED, and
// uses `effectiveVisibleLayers` (panels.js) as the single source of truth for
// visibility (hidden panel -> its layers excluded; §4 / WI-4).

import JSZip from 'jszip';
import { buildAllLayersSVG } from './svgExport.js';
import { effectiveVisibleLayers, layersForPanel } from './panels.js';

// Mirror exportLayerSVG's filename sanitization (\s+ -> _).
function sanitize(name) {
  return String(name).trim().replace(/\s+/g, '_');
}

const pad2 = (n) => String(n).padStart(2, '0');

// YYYY-MM-DD_HHmm in LOCAL time (the injected clock is a local Date; using UTC
// getters would shift the stamp in non-UTC environments). Exported so it's
// unit-testable in isolation.
export function formatTimestamp(d) {
  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${y}-${mo}-${day}_${hh}${mm}`;
}

// Pure builder: returns the files (name + svg string) and the zip name. No DOM,
// no JSZip — node-testable. Per-panel SVGs cover only VISIBLE panels (in `order`
// ascending), each restricted to its own effectively-visible layers; one
// combined SVG holds all effectively-visible layers.
export function buildPanelExportFiles(panels, layers, patternInstances, canvasW, canvasH, opts = {}) {
  const svgOpts = opts.svg || {};
  const design = sanitize(opts.designName ?? 'untitled');

  const visibleLayers = effectiveVisibleLayers(layers, panels);
  const visiblePanels = (Array.isArray(panels) ? panels : [])
    .filter((p) => p.visible)
    .slice()
    .sort((a, b) => a.order - b.order);

  const files = visiblePanels.map((p) => ({
    name: `naqsha-${design}-panel-${p.order + 1}-${p.substrate.kind}.svg`,
    svg: buildAllLayersSVG(
      layersForPanel(visibleLayers, p.id), patternInstances, canvasW, canvasH, false, svgOpts
    ),
  }));

  files.push({
    name: `naqsha-${design}-combined.svg`,
    svg: buildAllLayersSVG(visibleLayers, patternInstances, canvasW, canvasH, false, svgOpts),
  });

  const clock = opts.now ?? new Date();
  const zipName = `naqsha-${design}_${formatTimestamp(clock)}.zip`;
  return { files, zipName };
}

// Blob download side-effect (analogous to downloadSVG). Guards for non-DOM.
function downloadBlob(blob, filename) {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Side-effecting wrapper: build the files, bundle into a ZIP, download it.
export async function exportPanelsZip(panels, layers, patternInstances, canvasW, canvasH, opts = {}) {
  const { files, zipName } = buildPanelExportFiles(
    panels, layers, patternInstances, canvasW, canvasH, opts
  );
  const zip = new JSZip();
  files.forEach((f) => zip.file(f.name, f.svg));
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, zipName);
  return { zipName, fileCount: files.length };
}
