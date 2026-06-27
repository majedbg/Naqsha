/**
 * Surface A — stacked-substrate SHEET SPECS (S4, PRD D7/D11, §3.1). PURE,
 * three.js-free: lives on the 2D side of the dynamic-import boundary so it is the
 * primary unit gate. The R3F layer (canvas3d/Sheets.jsx) consumes these specs to
 * extrude slabs — no three import here.
 *
 * Maps the design's panels → an ordered array of sheet specs the scene extrudes
 * as thickness-extruded substrate slabs, stacked along view-depth (z) honoring
 * `panel.order` with an inter-panel spacing gap (D11), each carrying a
 * material descriptor branched on `substrate.kind` (D7).
 *
 * Substrate is read PER PANEL from `panel.substrate` — that is the authoritative
 * model (panels.js `createPanel`). The orchestrator's loose "(…, substrate, …)"
 * arg description is not literal arity; there is no single global substrate.
 * Missing/partial substrate falls back to DEFAULT_SUBSTRATE.
 *
 * @typedef {{ type:'transmissive'|'standard', kind:string, color:string,
 *             roughness:number, ior?:number }} MaterialDescriptor
 * @typedef {{ panelId:string, order:number, zOffset:number, size:[number,number],
 *             thickness:number, materialDescriptor:MaterialDescriptor,
 *             layerIds:string[] }} SheetSpec
 */
import { effectiveVisible } from '../panels.js';

/** Mirrors panels.js createPanel defaults so a partial/absent substrate still builds. */
export const DEFAULT_SUBSTRATE = { kind: 'acrylic', thickness: 3, color: '#cccccc' };

// Acrylic ≈ 1.49 ior (PMMA), low roughness for clean transmission (D7).
const ACRYLIC_IOR = 1.49;
const ACRYLIC_ROUGHNESS = 0.15;
// Opaque-kind roughness per D7: wood ~0.8, mdf ~0.9, cardstock ~1.0 matte.
const ROUGHNESS_BY_KIND = { plywood: 0.8, mdf: 0.9, cardstock: 1.0 };
// "other" → opaque NEUTRAL (D7): a fixed mid-grey, deliberately NOT the
// substrate's own color so an unknown stock reads as un-specified, not painted.
const NEUTRAL_OTHER_COLOR = '#9a9a9a';
const OTHER_ROUGHNESS = 0.7;

/**
 * Material descriptor for one substrate (D7). Acrylic → transmissive (ior≈1.49)
 * tinted by substrate.color; plywood/mdf/cardstock → opaque standard tinted, with
 * per-kind roughness; anything else → opaque neutral standard.
 * @param {{ kind?:string, color?:string, thickness?:number }} [substrate]
 * @returns {MaterialDescriptor}
 */
export function materialDescriptorForSubstrate(substrate = {}) {
  const kind = substrate.kind;
  const color = substrate.color || DEFAULT_SUBSTRATE.color;
  if (kind === 'acrylic') {
    return { type: 'transmissive', kind, color, ior: ACRYLIC_IOR, roughness: ACRYLIC_ROUGHNESS };
  }
  if (kind === 'plywood' || kind === 'mdf' || kind === 'cardstock') {
    return { type: 'standard', kind, color, roughness: ROUGHNESS_BY_KIND[kind] };
  }
  return { type: 'standard', kind: 'other', color: NEUTRAL_OTHER_COLOR, roughness: OTHER_ROUGHNESS };
}

/**
 * Build the ordered sheet specs for Surface A.
 *
 * A sheet is rendered for every VISIBLE panel (matches panelExport.js
 * `visiblePanels`); a visible-but-empty panel is still a valid blank sheet. Each
 * sheet carries the ids of its EFFECTIVELY-visible layers (panel AND layer
 * visible, panels.js `effectiveVisible`) for the mark slices (S5/S10) to drape on.
 *
 * Stacking (D11): panels sorted by `panel.order`; z runs from 0; each sheet's
 * `zOffset` is its CENTER along z. The first sheet has no gap before it; every
 * subsequent sheet is preceded by `spacing` mm. `size` is the canvas mm-bounds
 * (width,height) — world units are mm (1 unit = 1 mm).
 *
 * The input `panels` array may be DEEP-FROZEN (designSnapshot deep-freezes it),
 * so we sort a COPY — never the input.
 *
 * @param {{ panels?:object[], layers?:object[], spacing?:number,
 *           bounds?:{width:number,height:number} }} [input]
 * @returns {SheetSpec[]}
 */
export function buildSheetSpecs({ panels, layers, spacing, bounds } = {}) {
  const width = bounds?.width;
  const height = bounds?.height;
  const safeLayers = Array.isArray(layers) ? layers : [];
  const gap = Number.isFinite(spacing) && spacing > 0 ? spacing : 0;

  const visiblePanels = [...(Array.isArray(panels) ? panels : [])]
    .filter((p) => p && p.visible)
    .sort((a, b) => a.order - b.order);

  let cursor = 0;
  return visiblePanels.map((panel, i) => {
    const substrate = panel.substrate || DEFAULT_SUBSTRATE;
    const thickness = Number.isFinite(substrate.thickness)
      ? substrate.thickness
      : DEFAULT_SUBSTRATE.thickness;
    if (i > 0) cursor += gap;
    const zOffset = cursor + thickness / 2;
    cursor += thickness;

    const layerIds = safeLayers
      .filter((l) => l.panelId === panel.id && effectiveVisible(l, panel))
      .map((l) => l.id);

    return {
      panelId: panel.id,
      order: panel.order,
      zOffset,
      size: [width, height],
      thickness,
      materialDescriptor: materialDescriptorForSubstrate(substrate),
      layerIds,
    };
  });
}

/**
 * Axis-aligned bounds box for a set of sheet specs, in the cameraFit
 * `{ min:[x,y,z], max:[x,y,z] }` shape (S2). Sheets are xy-centered on the
 * origin; z spans the full stack (near face of the first sheet → far face of the
 * last). Returns null for no specs so cameraFit falls back to its default view
 * instead of a NaN/degenerate box.
 *
 * @param {SheetSpec[]} specs
 * @returns {{ min:[number,number,number], max:[number,number,number] } | null}
 */
export function boundsForSheetSpecs(specs) {
  if (!Array.isArray(specs) || specs.length === 0) return null;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxW = 0;
  let maxH = 0;
  for (const s of specs) {
    const [w, h] = Array.isArray(s.size) ? s.size : [];
    if (Number.isFinite(w)) maxW = Math.max(maxW, w);
    if (Number.isFinite(h)) maxH = Math.max(maxH, h);
    const near = s.zOffset - s.thickness / 2;
    const far = s.zOffset + s.thickness / 2;
    if (near < minZ) minZ = near;
    if (far > maxZ) maxZ = far;
  }
  return {
    min: [-maxW / 2, -maxH / 2, minZ],
    max: [maxW / 2, maxH / 2, maxZ],
  };
}
