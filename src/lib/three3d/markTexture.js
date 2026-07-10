/**
 * Surface A — TEXTURE-MODE marks (S5, PRD D3/D6, §3.1; reaction model per
 * ADR 0003). PURE, three.js-free: it lives on the 2D side of the dynamic-import
 * boundary so it is the primary unit gate. The R3F layer (canvas3d/Marks.jsx)
 * consumes the mark SVG strings this builds — it rasterizes each to a
 * CanvasTexture and lays it as a matte diffuse mark plane (the physical Reaction)
 * in front of the matching sheet. No three import here.
 *
 * Three pure responsibilities (all unit-tested):
 *
 *  1. shouldUseTextureMode — the D6 routing CONTRACT (ribbon path-count cap PATH_CAP;
 *     mobile / DPR<1.5 force texture). S5 ALWAYS textures regardless; this exists
 *     so S10 can opt SMALL desktop panels into true ribbon geometry instead. The
 *     scene must NOT gate marks on it now (a `false` here means "ribbon", which
 *     does not exist yet — gating would hide marks on common desktop designs).
 *
 *  2. reactionForProcess — process → the PHYSICAL mark surface {tint,opacity}
 *     (the Reaction, ADR 0003): the visible trace the process leaves on that
 *     panel's stock, via the shared materialReaction core. Acrylic engrave/score
 *     frost to a hue-preserving near-white of the sheet (score fainter), acrylic
 *     cut is a kerf-thin dark seam, wood (and unknown stock) chars dark, warm and
 *     matte at the process depth. There is NO emissive axis and NO laser-color
 *     convention left in the 3D mark path — process identity (cut≈red etc.,
 *     PROCESS_ANNOTATION_HEX) appears in 3D only as the on-hover annotation
 *     (Marks.jsx). Depth ORDER (cut > engrave > score) is carried by the char/
 *     frost mix strength and by OPACITY (presence), not by glow.
 *
 *  3. buildPanelMarkSVGs — per panel, one mark SVG PER PROCESS present: the
 *     panel's effectively-visible layers of that process, stroked in the process
 *     REACTION tint on a TRANSPARENT background (the white fill `buildAllLayersSVG`
 *     prepends is stripped, per-layer backgrounds neutralized) so the mark plane
 *     shows ONLY marks, never a solid block (D12). The per-process split is what
 *     lets each plane carry its own opacity — and gives hover a per-process mesh.
 */
import { resolveLayerProcess } from '../operations.js';
import { buildAllLayersSVG } from '../svgExport.js';
import { effectiveVisibleLayers, layersForPanel } from '../panels.js';
import {
  materialCategory,
  materialSheetHex,
  reactionSurface,
  REACTION_OPACITY,
} from '../materialReaction.js';

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

// HOVER-ONLY process annotation palette (ADR 0003 #4): the laser color convention
// (cut≈red, score≈blue, engrave≈neutral, pen≈ink-grey) survives in 3D solely as an
// inspection affordance — Marks.jsx tints a mark toward this hex while the pointer
// hovers it. These hexes must NEVER be baked into a mark texture/surface.
export const PROCESS_ANNOTATION_HEX = Object.freeze({
  cut: '#ff3b2f',
  score: '#3b7bff',
  engrave: '#f0f0f0',
  pen: '#cfcfcf',
});
// Pen is ink laid ON the sheet, not a substrate reaction (L7) — a neutral
// ink-grey, substrate-independent. (The op's real ink color is a 2D concern.)
const PEN_INK_TINT = '#cfcfcf';

const DEFAULT_PROCESS = 'cut';
// Deterministic per-panel ordering of the per-process mark layers (deepest →
// faintest reaction); pen (ink, on-surface) last.
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
 * Map a fabrication process → its physical REACTION surface (ADR 0003), always
 * SUBSTRATE-AWARE via the shared materialReaction core (L3):
 *   • lighten (acrylic/plastic): engrave/score → a hue-preserving brightened FROST
 *     of the sheet (score fainter); cut → a kerf-thin dark seam.
 *   • burn (wood/ply/mdf)      → a dark warm CHAR at the process depth, matte.
 *   • other / unrecognized / ABSENT substrate → the same char model on the neutral
 *     sheet — a generic laser darkens; NO annotation color ever leaks in here.
 * `pen` is ink ON the surface, not a reaction, so it keeps a substrate-independent
 * neutral ink (L7). Unknown/absent process still falls back to cut.
 *
 * The returned `opacity` is the mark surface's presence (REACTION_OPACITY): the
 * depth order cut > engrave > score is carried by opacity + mix strength, not by
 * any emissive axis — with ONE exception. On FLUORESCENT stock (the appearance's
 * markGlow > 0), a groove/kerf breaks TIR and the trapped dye re-emission escapes
 * there, so marks genuinely glow like thin edges (the edge-lit-sign mechanism;
 * same ADR 0003 fidelity exception as edgeGain). `emissiveIntensity` carries that:
 * markGlow × GROOVE_ESCAPE[process] — 0 for every non-fluorescent appearance, for
 * pen (ink sits ON the surface, no groove), and when no appearance is passed.
 *
 * @param {string|null|undefined} process
 * @param {{ kind?:string, color?:string }|null} [substrate]
 * @param {{ markGlow?:number }|null} [appearance] resolved AppearanceParams of the
 *   active material lens (materialArchetypes) — optional; only markGlow is read.
 * @returns {{ process:string, tint:string, opacity:number, emissiveIntensity:number }}
 */
export function reactionForProcess(process, substrate, appearance = null) {
  const p = PROCESS_ORDER.includes(process) ? process : DEFAULT_PROCESS;
  if (p === 'pen') {
    return { process: p, tint: PEN_INK_TINT, opacity: REACTION_OPACITY.pen, emissiveIntensity: 0 };
  }
  const sub = substrate || {};
  const { tint, opacity } = reactionSurface(materialSheetHex(sub), materialCategory(sub), p);
  const markGlow = appearance?.markGlow ?? 0;
  if (markGlow > 0) {
    // Fluorescent groove: what escapes is the DYE's emission — the saturated
    // sheet hue (same color the edges emit), not the whitened frost a plain
    // acrylic groove shows. Falls back to the frost tint if the appearance
    // carries no tint (defensive; resolved appearances always do).
    return {
      process: p,
      tint: appearance.tintHex || tint,
      opacity,
      emissiveIntensity: markGlow * GROOVE_ESCAPE[p],
    };
  }
  return { process: p, tint, opacity, emissiveIntensity: 0 };
}

// How much of the TIR-trapped re-emission escapes per process, as a fraction of
// the archetype's markGlow: a cut's kerf walls are full edge surfaces (1); an
// engraved area is wide and rough (0.85); a score is a thin shallow groove (0.5).
const GROOVE_ESCAPE = Object.freeze({ cut: 1, engrave: 0.85, score: 0.5 });

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
 * Build the per-panel, PER-PROCESS mark layers for Surface A texture mode.
 *
 * For every VISIBLE panel (mirrors panelExport.js / sheetSpecs.js visibility), the
 * panel's effectively-visible layers are grouped by process; each group becomes a
 * mark layer: an SVG of just that process's layers, stroked in that process's
 * REACTION tint on a transparent background, plus the `opacity` the scene applies
 * as that mark surface's presence. Tint+opacity are SUBSTRATE-AWARE (via
 * reactionForProcess(process, panel.substrate)): an acrylic panel's engravings
 * frost to a brightened hue of the sheet (cut = kerf-dark seam), a wood — or
 * unknown — panel's marks char dark, warm and matte. Groups are ordered cut →
 * engrave → score → pen (PROCESS_ORDER). Keyed by panelId so the scene can pair
 * each sheet spec with its mark planes.
 *
 * @typedef {{ process:string, tint:string, opacity:number, svg:string }} MarkLayerSpec
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
  appearance = null,
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
    // process collapses to the cut fallback, matching reactionForProcess). The
    // process KEY is substrate-independent, so group with the 1-arg call; the
    // substrate-aware tint+opacity are computed per group below.
    const byProcess = new Map();
    for (const l of panelLayers) {
      const { process } = reactionForProcess(resolveLayerProcess(l, operations));
      if (!byProcess.has(process)) byProcess.set(process, { layers: [] });
      byProcess.get(process).layers.push(l);
    }

    out[p.id] = PROCESS_ORDER.filter((proc) => byProcess.has(proc)).map((process) => {
      const { layers: groupLayers } = byProcess.get(process);
      // One substrate-aware call: tint (frost/kerf/char), opacity (presence) and
      // emissiveIntensity (fluorescent groove glow, 0 elsewhere) stay consistent
      // for this panel's stock (L3, ADR 0003).
      const { tint, opacity, emissiveIntensity } = reactionForProcess(process, p.substrate, appearance);
      // Stroke every layer in this group with the substrate-aware reaction tint;
      // neutralize any layer background so it can't bake a solid block (D12).
      const tinted = groupLayers.map((l) => ({ ...l, color: tint, bgOpacity: 0 }));
      const svg = toTransparentBg(
        buildAllLayersSVG(tinted, instances, canvasW, canvasH, false, svgOpts),
      );
      return { process, tint, opacity, emissiveIntensity, svg };
    });
  }
  return out;
}
