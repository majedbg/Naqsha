/**
 * 3D snapshot PNG export (S6, PRD D8). PURE filename builder + a thin DOM
 * side-effect, following the codebase convention (svgExport/panelExport) of
 * splitting a node-testable string builder from the side-effecting download.
 *
 * WebGL-free and three-free: lives on the 2D side of the dynamic-import boundary
 * so the pure logic is the primary unit gate and importing it never pulls three.
 * The actual pixel capture (renderer.domElement.toDataURL) is performed by the
 * R3F layer, which hands the already-captured data URL (or canvas) to the thin
 * wrapper here — this module knows nothing about three.
 *
 * This is a PREVIEW snapshot only (D8/D19): it is NEVER part of the fabrication
 * path. The 2D SVG/ZIP laser export (svgExport.js / panelExport.js) is untouched.
 */

// Mirror exportLayerSVG / panelExport sanitization (trim, \s+ -> _) so the 3D
// PNG name lines up with the existing export filename convention.
function sanitize(name) {
  return String(name == null ? '' : name).trim().replace(/\s+/g, '_') || 'untitled';
}

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * YYYY-MM-DD_HHmm in LOCAL time. Re-implemented locally (rather than imported
 * from panelExport.js) so this module stays free of JSZip and the rest of the
 * 2D export graph. The clock is injected (a local Date) and read with local
 * getters so the stamp matches the user's wall clock in any timezone.
 * @param {Date} d
 * @returns {string}
 */
export function formatTimestamp(d) {
  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${y}-${mo}-${day}_${hh}${mm}`;
}

/**
 * PURE: build the 3D snapshot PNG filename — `naqsha-3d_<design>_<YYYY-MM-DD_HHmm>.png`
 * (PRD D8). The timestamp clock is INJECTED (not `Date.now()` inside) so the
 * builder is deterministic and unit-testable. An empty/blank design name falls
 * back to `untitled`, matching the 2D ZIP export default.
 * @param {{ designName?: string, now?: Date }} [opts]
 * @returns {string}
 */
export function buildSnapshotFilename({ designName, now } = {}) {
  const design = sanitize(designName ?? 'untitled');
  const clock = now ?? new Date();
  return `naqsha-3d_${design}_${formatTimestamp(clock)}.png`;
}

/**
 * Side-effecting download of a PNG data URL (analogous to panelExport's
 * downloadBlob). Guards for non-DOM (node/tests) so it is a no-op there. NOT
 * unit-tested — it is a pure DOM anchor click, like downloadBlob/downloadSVG.
 * @param {string} dataUrl
 * @param {string} filename
 */
export function downloadDataUrl(dataUrl, filename) {
  if (typeof document === 'undefined' || !dataUrl) return;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/**
 * Capture a canvas to PNG and download it under the D8 filename. The canvas is
 * the live WebGL renderer.domElement (requires `preserveDrawingBuffer: true` so
 * the last composited frame — bloom + transmission — is still readable). Guards
 * for a missing canvas / non-DOM environment.
 * @param {HTMLCanvasElement|null|undefined} canvas
 * @param {{ designName?: string, now?: Date }} [opts]
 * @returns {string|null} the filename used, or null if nothing was captured
 */
export function saveCanvasPng(canvas, opts = {}) {
  if (!canvas || typeof canvas.toDataURL !== 'function') return null;
  const filename = buildSnapshotFilename(opts);
  const dataUrl = canvas.toDataURL('image/png');
  downloadDataUrl(dataUrl, filename);
  return filename;
}
