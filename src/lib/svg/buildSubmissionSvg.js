// buildSubmissionSvg — the studio → org "Submit to org" adapter.
//
// The studio's real exporter (buildAllLayersSVG) emits layer groups with no
// `data-role` and strokes them with each layer's *display* color. A submission,
// though, needs (1) a `data-role="cut|score|engrave"` on each layer group so
// extractOps({source:'design'}) can derive one op per layer, and (2) inner
// strokes in the cut/score/engrave (LightBurn) convention colors so the
// aggregated sheet is actually cuttable. This module bridges that gap.
//
// pen/unresolved layers are DROPPED, not tagged-and-skipped: a laser-cut
// submission can't represent a pen op, and leaving the geometry untagged would
// let composeSheet render it as a silent cut.

import { buildAllLayersSVG } from '../svgExport';
import { resolveLayerColor, resolveLayerProcess } from '../operations';

const SUBMITTABLE = new Set(['cut', 'score', 'engrave']);

// Split layers into the ones that become submission ops and the ones a user
// might expect but that won't ship. `submit` = visible AND resolves to a
// cut/score/engrave op. `dropped` = visible but NOT submittable (pen/unresolved)
// — these are warn-worthy. Hidden layers are in neither: excluded silently, as
// the normal export already omits them.
export function partitionSubmittableLayers(layers, operations) {
  const submit = [];
  const dropped = [];
  for (const l of layers || []) {
    if (!l?.visible) continue;
    const process = resolveLayerProcess(l, operations);
    if (SUBMITTABLE.has(process)) submit.push(l);
    else dropped.push(l);
  }
  return { submit, dropped };
}

// Turn the raw export into a submission SVG: (1) drop the background fills, and
// (2) tag each submittable layer group with its data-role.
//
// (1) buildAllLayersSVG prepends a full-bleed `<rect fill="white">` and a
// per-layer bg rect, all as DIRECT children of <svg>. On a cut they're not
// geometry — and worse, when composeSheet places the piece they become a
// sheet-sized fill (width/height="100%" resolves against the sheet, not the
// design), occluding the sheet. Real pattern rects live nested inside the layer
// <g>s, so removing only the svg's direct-child rects is safe.
//
// (2) the normal export ids the group `layer-<id>` (wrapSVGSymmetry); the
// variable-weight branch ids it plain `<id>` — check both.
function finalizeSubmissionSvg(svgString, layers, operations) {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (svg) {
    for (const child of [...svg.children]) {
      if (child.tagName && child.tagName.toLowerCase() === 'rect') child.remove();
    }
  }
  for (const l of layers) {
    const process = resolveLayerProcess(l, operations);
    const g = doc.getElementById(`layer-${l.id}`) || doc.getElementById(String(l.id));
    if (g) g.setAttribute('data-role', process);
  }
  return new XMLSerializer().serializeToString(doc);
}

// Build a submission-ready SVG from live studio state. canvasW/H are the design
// canvas dimensions (they become the viewBox + mm size, exactly as the studio
// export does). `operations` is the document operation library.
export function buildSubmissionSvg(layers, patternInstances, canvasW, canvasH, operations) {
  const { submit } = partitionSubmittableLayers(layers, operations);
  // Recolor each layer THROUGH its operation so inner strokes are the convention
  // color (red/blue/black), consistent with the data-role tag and the sheet.
  const recolored = submit.map((l) => ({ ...l, color: resolveLayerColor(l, operations) }));
  const raw = buildAllLayersSVG(recolored, patternInstances, canvasW, canvasH, false);
  return finalizeSubmissionSvg(raw, submit, operations);
}
