/**
 * Surface A — TEXTURE-MODE marks (S5, PRD D3/D6, §3.1). PURE, three.js-free: it
 * lives on the 2D side of the dynamic-import boundary so it is the primary unit
 * gate. The R3F layer (canvas3d/MarkLayer.jsx) consumes the emissive SVG strings
 * this builds — it rasterizes each to a CanvasTexture and lights it as an
 * emissive mark plane in front of the matching sheet. No three import here.
 *
 * Three pure responsibilities (all unit-tested):
 *
 *  1. shouldUseTextureMode — the D6 routing CONTRACT (ribbon path-count cap 1500;
 *     mobile / DPR<1.5 force texture). S5 ALWAYS textures regardless; this exists
 *     so S10 can opt SMALL desktop panels into true ribbon geometry instead. The
 *     scene must NOT gate marks on it now (a `false` here means "ribbon", which
 *     does not exist yet — gating would hide marks on common desktop designs).
 *
 *  2. treatmentForProcess — process → emissive {tint,intensity} from the
 *     materialPreview depth scores (score .45 / engrave .72 / cut .92), with the
 *     laser color convention (cut≈red, score≈blue, engrave≈neutral). HUE and
 *     INTENSITY are kept on SEPARATE axes: the tint (hue) goes into the texture
 *     for process identity; the intensity drives the mark plane's emissiveIntensity
 *     so the depth ORDER (cut brightest > engrave > score) holds VISUALLY even
 *     though the hues differ in luminance. (Baking intensity into the color would
 *     break the order: under selection-gated bloom a neutral engrave outshines a
 *     red cut — see EmissiveBloom.jsx, luminanceThreshold 0.)
 *
 *  3. buildPanelMarkSVGs — per panel, one EMISSIVE SVG PER PROCESS present: the
 *     panel's effectively-visible layers of that process, stroked in the process
 *     tint (vivid, full strength) on a TRANSPARENT background (the white fill
 *     `buildAllLayersSVG` prepends is stripped, per-layer backgrounds neutralized)
 *     so the mark plane shows/blooms ONLY marks, never a glowing block (D12). The
 *     per-process split is what lets each plane carry its own emissiveIntensity.
 */
import { resolveLayerProcess } from '../operations.js';
import { buildAllLayersSVG } from '../svgExport.js';
import { effectiveVisibleLayers, layersForPanel } from '../panels.js';

// D6 ribbon cap: above this many stroke paths in a panel, force texture mode.
export const PATH_CAP = 1500;
// D6 DPR floor: below this device-pixel-ratio (mobile / low-DPI), force texture.
export const TEXTURE_DPR_FLOOR = 1.5;

// materialPreview.js depth scores (MIX_SCORE / MIX_ENGRAVE / MIX_CUT) — how much
// material each process removes, reused here as relative emissive brightness. pen
// sits ON the sheet (ink, not a groove) → a dim neutral mark.
const PROCESS_INTENSITY = { score: 0.45, engrave: 0.72, cut: 0.92, pen: 0.4 };
// Convention emissive tints (D3): cut≈red, score≈blue, engrave≈neutral. NOTE: the
// PRD §9 veto-default reads "engrave≈black"; pure black can't glow as an emissive,
// so engrave is rendered NEUTRAL near-white here — a deliberate deviation (logged
// in the run summary) so the most common mark stays visible. pen → neutral ink-grey.
const PROCESS_TINT = { cut: '#ff3b2f', score: '#3b7bff', engrave: '#f0f0f0', pen: '#cfcfcf' };

const DEFAULT_PROCESS = 'cut';
// Deterministic per-panel ordering of the per-process mark layers (brightest →
// dimmest groove); pen (ink, on-surface) last.
const PROCESS_ORDER = ['cut', 'engrave', 'score', 'pen'];

// The literal background rect buildAllLayersSVG always prepends (svgExport.js).
const WHITE_BG_RECT = '<rect width="100%" height="100%" fill="white"/>';

/**
 * D6 routing contract: should this panel render via emissive TEXTURE rather than
 * ribbon geometry? Mobile and low-DPI devices force texture; otherwise a panel
 * over the ribbon path-count cap forces texture. (S5 always textures; S10 routes
 * sub-cap desktop panels to ribbons.)
 *
 * @param {{ pathCount?:number, isMobile?:boolean, dpr?:number }} [input]
 * @returns {boolean}
 */
export function shouldUseTextureMode({ pathCount = 0, isMobile = false, dpr = 2 } = {}) {
  if (isMobile) return true;
  if (Number.isFinite(dpr) && dpr < TEXTURE_DPR_FLOOR) return true;
  return Number.isFinite(pathCount) && pathCount > PATH_CAP;
}

/**
 * Map a fabrication process → emissive treatment (D3). Unknown/absent process
 * falls back to cut.
 * @param {string|null|undefined} process
 * @returns {{ process:string, tint:string, intensity:number }}
 */
export function treatmentForProcess(process) {
  const p = PROCESS_INTENSITY[process] != null ? process : DEFAULT_PROCESS;
  return { process: p, tint: PROCESS_TINT[p], intensity: PROCESS_INTENSITY[p] };
}

// Strip buildAllLayersSVG's hardcoded white background so the rasterized texture
// has a TRANSPARENT field — the mark plane then shows/blooms only marks (D12).
function toTransparentBg(svg) {
  return typeof svg === 'string' ? svg.replace(WHITE_BG_RECT, '') : svg;
}

/**
 * Count stroke paths in an SVG string — the natural source for the D6 path-count
 * routing input (shouldUseTextureMode). Pure; counts `<path` element opens.
 * @param {string} svg
 * @returns {number}
 */
export function countSvgPaths(svg) {
  if (typeof svg !== 'string') return 0;
  const m = svg.match(/<path\b/g);
  return m ? m.length : 0;
}

/**
 * Build the per-panel, PER-PROCESS emissive mark layers for Surface A texture mode.
 *
 * For every VISIBLE panel (mirrors panelExport.js / sheetSpecs.js visibility), the
 * panel's effectively-visible layers are grouped by process; each group becomes a
 * mark layer: an SVG of just that process's layers, stroked in the process tint
 * (vivid, full strength) on a transparent background, plus the depth-score
 * `intensity` the scene applies as that plane's emissiveIntensity. Groups are
 * ordered cut → engrave → score → pen (PROCESS_ORDER). Keyed by panelId so the
 * scene can pair each sheet spec with its mark planes.
 *
 * @typedef {{ process:string, tint:string, intensity:number, svg:string }} MarkLayerSpec
 *
 * @param {{ panels?:object[], layers?:object[], operations?:object[],
 *           patternInstances?:object, canvasW?:number, canvasH?:number,
 *           svgOpts?:object }} [input]
 * @returns {Record<string, MarkLayerSpec[]>} panelId → ordered mark-layer specs
 */
export function buildPanelMarkSVGs({
  panels,
  layers,
  operations,
  patternInstances,
  canvasW,
  canvasH,
  svgOpts = {},
} = {}) {
  const instances = patternInstances || {};
  const visibleLayers = effectiveVisibleLayers(layers, panels);
  const visiblePanels = (Array.isArray(panels) ? panels : [])
    .filter((p) => p && p.visible)
    .slice()
    .sort((a, b) => a.order - b.order);

  const out = {};
  for (const p of visiblePanels) {
    const panelLayers = layersForPanel(visibleLayers, p.id);

    // Group this panel's layers by their resolved process (each unknown/absent
    // process collapses to the cut fallback, matching treatmentForProcess).
    const byProcess = new Map();
    for (const l of panelLayers) {
      const { process, tint } = treatmentForProcess(resolveLayerProcess(l, operations));
      if (!byProcess.has(process)) byProcess.set(process, { tint, layers: [] });
      byProcess.get(process).layers.push(l);
    }

    out[p.id] = PROCESS_ORDER.filter((proc) => byProcess.has(proc)).map((process) => {
      const { tint, layers: groupLayers } = byProcess.get(process);
      const { intensity } = treatmentForProcess(process);
      // Stroke every layer in this group with the vivid process tint; neutralize
      // any layer background so it can't bake a glowing block (D12).
      const tinted = groupLayers.map((l) => ({ ...l, color: tint, bgOpacity: 0 }));
      const svg = toTransparentBg(
        buildAllLayersSVG(tinted, instances, canvasW, canvasH, false, svgOpts),
      );
      return { process, tint, intensity, svg };
    });
  }
  return out;
}
