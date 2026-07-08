/**
 * Surface A — TEXTURE-MODE marks (S5, PRD D3/D6, §3.1). PURE, three.js-free: it
 * lives on the 2D side of the dynamic-import boundary so it is the primary unit
 * gate. The R3F layer (canvas3d/MarkLayer.jsx) consumes the emissive SVG strings
 * this builds — it rasterizes each to a CanvasTexture and lights it as an
 * emissive mark plane in front of the matching sheet. No three import here.
 *
 * Three pure responsibilities (all unit-tested):
 *
 *  1. shouldUseTextureMode — the D6 routing CONTRACT (ribbon path-count cap PATH_CAP;
 *     mobile / DPR<1.5 force texture). S5 ALWAYS textures regardless; this exists
 *     so S10 can opt SMALL desktop panels into true ribbon geometry instead. The
 *     scene must NOT gate marks on it now (a `false` here means "ribbon", which
 *     does not exist yet — gating would hide marks on common desktop designs).
 *
 *  2. treatmentForProcess — process → emissive {tint,intensity} from the
 *     materialPreview depth scores (score .45 / engrave .72 / cut .92). With NO
 *     substrate it uses the laser color convention (cut≈red, score≈blue,
 *     engrave≈neutral) — back-compat for the 2D/legacy path. With a 3D panel
 *     substrate it is SUBSTRATE-AWARE: the groove reflects how that stock reacts
 *     via the shared materialReaction core — acrylic frosts to a brightened hue of
 *     the sheet (full intensity), wood chars dark and MATTE (intensity damped by
 *     BURN_GLOW_SCALE, L4), other/unknown stock falls back to the convention.
 *     HUE and INTENSITY are kept on SEPARATE axes: the tint (hue) goes into the
 *     texture for process identity; the intensity drives the mark plane's
 *     emissiveIntensity so the depth ORDER (cut brightest > engrave > score) holds
 *     VISUALLY even though the hues differ in luminance, and so wood reads matte
 *     under bloom by LOWER intensity rather than color alone. (Baking intensity
 *     into the color would break the order: under selection-gated bloom a neutral
 *     engrave outshines a red cut — see EmissiveBloom.jsx, luminanceThreshold 0.)
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
import { materialCategory, materialSheetHex, reactionEmissive } from '../materialReaction.js';

// D6 ribbon cap: above this many stroke paths in a panel, force texture mode.
export const PATH_CAP = 1500;
// D6 DPR floor: below this device-pixel-ratio (mobile / low-DPI), force texture.
export const TEXTURE_DPR_FLOOR = 1.5;
// Vertex-DENSITY cap: above this many path vertices in a panel, force texture mode.
// The path-COUNT cap (PATH_CAP) misses the dominant moiré case — a single dense
// stroke (e.g. one spirograph <path>/<polyline> with thousands of vertices) counts
// as ONE path yet packs a fine hatch. Ribbon geometry has no mip chain, so that hatch
// undersamples into crawling moiré when the panel is minified; the mipmapped +
// anisotropic texture path band-limits it. So a geometrically dense panel routes to
// texture regardless of how few path ELEMENTS it uses.
export const POINT_CAP = 2000;

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
 * over EITHER the ribbon path-count cap (PATH_CAP) OR the vertex-density cap
 * (POINT_CAP) forces texture. The density cap catches the single-dense-path case
 * the count cap misses (spirograph moiré). (S5 always textures; S10 routes sparse,
 * low-density desktop panels to ribbons.)
 *
 * @param {{ pathCount?:number, pointCount?:number, isMobile?:boolean, dpr?:number }} [input]
 * @returns {boolean}
 */
export function shouldUseTextureMode({ pathCount = 0, pointCount = 0, isMobile = false, dpr = 2 } = {}) {
  if (isMobile) return true;
  if (Number.isFinite(dpr) && dpr < TEXTURE_DPR_FLOOR) return true;
  if (Number.isFinite(pathCount) && pathCount > PATH_CAP) return true;
  return Number.isFinite(pointCount) && pointCount > POINT_CAP;
}

/**
 * Map a fabrication process → emissive treatment (D3), optionally SUBSTRATE-AWARE.
 *
 * Without a substrate the result is the laser color CONVENTION (cut≈red, score≈blue,
 * engrave≈neutral) at the process depth intensity — back-compat for the 2D/legacy path.
 *
 * With a 3D panel substrate ({ kind, color }) the groove reflects how that stock
 * REACTS (the shared materialReaction core, L3/L4):
 *   • lighten (acrylic/plastic) → a hue-preserving brightened FROST of the sheet,
 *     full intensity (intensityScale 1).
 *   • burn (wood/ply/mdf)       → a dark warm CHAR, matte: intensity × BURN_GLOW_SCALE
 *     (a real burn line is matte char, not a glowing halo — L4).
 *   • other / unrecognized / absent substrate → convention tint + full intensity.
 * `pen` is ink ON the surface, not a groove, so it ALWAYS keeps the convention ink
 * regardless of substrate (L7). Unknown/absent process still falls back to cut.
 *
 * @param {string|null|undefined} process
 * @param {{ kind?:string, color?:string }|null} [substrate]
 * @returns {{ process:string, tint:string, intensity:number }}
 */
export function treatmentForProcess(process, substrate) {
  const p = PROCESS_INTENSITY[process] != null ? process : DEFAULT_PROCESS;
  if (substrate && p !== 'pen') {
    const category = materialCategory(substrate);
    if (category === 'lighten' || category === 'burn') {
      const { tint, intensityScale } = reactionEmissive(materialSheetHex(substrate), category, p);
      return { process: p, tint, intensity: PROCESS_INTENSITY[p] * intensityScale };
    }
  }
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
 * Coarse VERTEX-DENSITY estimate for the D6 density routing (POINT_CAP). Counts
 * numeric tokens across the SVG and halves them (~2 numbers per x,y coordinate) —
 * a monotonic proxy for how many stroke vertices a panel packs, dominated by path
 * `d` data and polyline/line points (viewBox / stroke-width numbers are a constant
 * handful, negligible against a dense hatch's thousands). Pure; a single dense
 * spirograph <path> (one path, thousands of coords) scores high here where
 * countSvgPaths scores 1 — the misclassification this fixes.
 * @param {string} svg
 * @returns {number}
 */
export function countSvgPoints(svg) {
  if (typeof svg !== 'string') return 0;
  const m = svg.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi);
  return m ? Math.floor(m.length / 2) : 0;
}

/**
 * D6 per-panel render-mode routing for Surface A marks (S10). Given the per-panel
 * mark layers (buildPanelMarkSVGs output) and the device profile, decide for EACH
 * panel whether its marks render as true ribbon GEOMETRY (S10, crisp vector) or as
 * the emissive TEXTURE baseline (S5). A panel routes to texture exactly when
 * shouldUseTextureMode is true for its total stroke-path count (summed across its
 * per-process layers) — i.e. mobile, low-DPI, or strictly above the ribbon path
 * cap. Everything else is ribbon-eligible.
 *
 * Path count reuses countSvgPaths (the S5 routing contract): a coarse `<path>`-open
 * count. Marks emitted only as `<line>`/`<polyline>` (e.g. Grid) count as 0 and so
 * stay ribbon-eligible — intended: the PATH_CAP is an UPPER perf guard, not a floor,
 * and SVGLoader strokes those element types into ribbons regardless.
 *
 * Pure + three-free: stays on the 2D side of the import boundary (the ribbon
 * geometry builder it gates, canvas3d/ribbonGeometry.js, holds the three import).
 *
 * @param {Record<string, Array<{svg?:string}>>} marksByPanel
 * @param {{ isMobile?:boolean, dpr?:number }} [device]
 * @returns {Record<string, 'ribbon'|'texture'>}
 */
export function routePanelRenderModes(marksByPanel, { isMobile = false, dpr = 2 } = {}) {
  const out = {};
  const entries = marksByPanel && typeof marksByPanel === 'object' ? marksByPanel : {};
  for (const panelId of Object.keys(entries)) {
    const layers = Array.isArray(entries[panelId]) ? entries[panelId] : [];
    const pathCount = layers.reduce((n, m) => n + countSvgPaths(m && m.svg), 0);
    const pointCount = layers.reduce((n, m) => n + countSvgPoints(m && m.svg), 0);
    out[panelId] = shouldUseTextureMode({ pathCount, pointCount, isMobile, dpr })
      ? 'texture'
      : 'ribbon';
  }
  return out;
}

/**
 * Build the per-panel, PER-PROCESS emissive mark layers for Surface A texture mode.
 *
 * For every VISIBLE panel (mirrors panelExport.js / sheetSpecs.js visibility), the
 * panel's effectively-visible layers are grouped by process; each group becomes a
 * mark layer: an SVG of just that process's layers, stroked in that process's tint
 * on a transparent background, plus the `intensity` the scene applies as that
 * plane's emissiveIntensity. The tint+intensity are SUBSTRATE-AWARE (via
 * treatmentForProcess(process, panel.substrate)): an acrylic panel's grooves frost
 * to a brightened hue of the sheet at full intensity, a wood panel's char dark and
 * matte (intensity × BURN_GLOW_SCALE, L4), and an other/absent-substrate panel keeps
 * the laser convention (vivid, full strength). Groups are ordered cut → engrave →
 * score → pen (PROCESS_ORDER). Keyed by panelId so the scene can pair each sheet
 * spec with its mark planes.
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
    // process collapses to the cut fallback, matching treatmentForProcess). The
    // process KEY is substrate-independent, so group with the 1-arg call; the
    // substrate-aware tint+intensity are computed per group below.
    const byProcess = new Map();
    for (const l of panelLayers) {
      const { process } = treatmentForProcess(resolveLayerProcess(l, operations));
      if (!byProcess.has(process)) byProcess.set(process, { layers: [] });
      byProcess.get(process).layers.push(l);
    }

    out[p.id] = PROCESS_ORDER.filter((proc) => byProcess.has(proc)).map((process) => {
      const { layers: groupLayers } = byProcess.get(process);
      // One substrate-aware call: tint (frost/char/convention) and intensity
      // (matte-damped for wood) stay consistent for this panel's stock (L3/L4).
      const { tint, intensity } = treatmentForProcess(process, p.substrate);
      // Stroke every layer in this group with the substrate-aware process tint
      // (frost / char / convention); neutralize any layer background so it can't
      // bake a glowing block (D12).
      const tinted = groupLayers.map((l) => ({ ...l, color: tint, bgOpacity: 0 }));
      const svg = toTransparentBg(
        buildAllLayersSVG(tinted, instances, canvasW, canvasH, false, svgOpts),
      );
      return { process, tint, intensity, svg };
    });
  }
  return out;
}
