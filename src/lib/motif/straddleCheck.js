// Warn-only fabrication check (research §0: "warn-only straddle-check — badge
// + highlight + export summary line"): flag placed motifs whose footprint
// crosses a material boundary / cut line, so the UI can warn without
// blocking. Pure + lazy — no p5, no DOM, no React.

import { pointToSegmentDistance } from './emptyCircle.js';

/**
 * @typedef {{anchorId:string, index:number, x:number, y:number, radius:number, [k:string]:any}} MotifPlacement
 * @typedef {{a:{x:number,y:number}, b:{x:number,y:number}}} BoundarySegment
 * @typedef {{index:number, anchorId:string, distance:number, straddles:true}} StraddleFlag
 */

/**
 * Flag placements whose footprint circle crosses any boundary segment.
 * A placement straddles a boundary iff the minimum distance from its center
 * to the nearest boundary segment is STRICTLY LESS THAN its footprint
 * radius (the circle crosses the line). A footprint exactly tangent
 * (distance === radius) does NOT straddle.
 *
 * @param {MotifPlacement[]} placements
 * @param {BoundarySegment[]} boundarySegments
 * @returns {StraddleFlag[]} One entry per straddling placement, in
 *   placement order, carrying its nearest-boundary distance. Non-straddling
 *   placements are omitted. Empty inputs yield [].
 */
export function straddleCheck(placements, boundarySegments) {
  if (!placements || !placements.length || !boundarySegments || !boundarySegments.length) {
    return [];
  }

  const flags = [];

  for (const placement of placements) {
    const center = { x: placement.x, y: placement.y };
    let minDistance = Infinity;

    for (const segment of boundarySegments) {
      const dist = pointToSegmentDistance(center, segment.a, segment.b);
      if (dist < minDistance) minDistance = dist;
    }

    if (minDistance < placement.radius) {
      flags.push({
        index: placement.index,
        anchorId: placement.anchorId,
        distance: minDistance,
        straddles: true,
      });
    }
  }

  return flags;
}
