/**
 * recursiveSides — the shared recursive reconstruction core.
 *
 * The recursive equivalent of grid's shared core (gridGeometry.js): the side-
 * subdivision + Catmull-Rom curve build for RecursiveGeometry's bendable-edges
 * warp mode, extracted so the recursive RENDERER and (later) the recursive
 * EXTRACTOR reconstruct byte-identical curves from ONE source of truth —
 * "exact-to-paint" by construction, not by two implementations agreeing by luck.
 *
 * WARP displacement comes ONLY from `stackWarpDisplacement` (D2 invariant, PRD
 * §Architecture) — the single warp primitive both renderer and extractor call.
 * `catmullRomToBezier` is reused as-is (shared with grid).
 *
 * Two warp modes, mirroring grid, gated ONLY on the node count K:
 *   - K < 3  → vertices-only: the polygon CORNERS warp, the sides stay straight
 *     (a straight side has only its two endpoints, so nothing bends). This is
 *     byte-identical to RecursiveGeometry's pre-bendable warp behaviour.
 *   - K ≥ 3  → bendable edges: subdivide each side into K nodes, displace EVERY
 *     node (interior AND endpoints — unlike grid, recursive vertices ALWAYS warp
 *     and are NEVER pinned mid-side), then draw the side as a Catmull-Rom curve.
 *
 * `K < 3` is the ONLY runtime gate — no per-frame coincidence guard (the trusted-
 * bounded classes are validated offline, PRD §Testing).
 */

import { catmullRomToBezier } from './catmullRomBezier';
import { stackWarpDisplacement } from '../fields/warp';

/**
 * Build the warp geometry for ONE recursive polygon.
 *
 * @param {{x:number,y:number}[]} verts - the polygon's ORIGIN-CENTERED corners,
 *   in order. The polygon is CLOSED: the last→first side is implied.
 * @param {object} opts
 * @param {object[]} opts.warpSources - resolved modulation sources, forwarded
 *   verbatim to `stackWarpDisplacement` (only channel==='warp' with a field
 *   count). An empty/flat stack yields zero displacement.
 * @param {number} opts.canvasW - canvas width, for the unit-domain (u,v) mapping.
 * @param {number} opts.canvasH - canvas height.
 * @param {number} opts.warpNodes - node count K per side (the bend slider).
 * @returns {{mode:'vertices', verts:{x:number,y:number}[]}
 *          |{mode:'bendable', sides:{start:{x:number,y:number}, segments:object[]}[]}}
 *   `vertices` (K<3): warped corners, straight sides.
 *   `bendable` (K≥3): one Catmull-Rom {start, segments} per side, in corner order.
 */
export function buildWarpedPolygon(verts, { warpSources, canvasW, canvasH, warpNodes }) {
  // Node-count normalization (input range only, NOT the mode gate): mirrors grid
  // (2..24). K < 3 below is the sole runtime gate deciding vertices vs bendable.
  const K = Math.max(2, Math.min(24, Math.round(warpNodes)));

  // Displace a point at origin-centered (x,y) via the D2 warp primitive. The
  // unit-domain mapping lives HERE (one source of truth) so the renderer and the
  // extractor sample the field at identical (u,v) and can never diverge.
  const warpPoint = (x, y) => {
    const u = (x + canvasW / 2) / canvasW;
    const v = (y + canvasH / 2) / canvasH;
    const { dx, dy } = stackWarpDisplacement(warpSources, u, v);
    return { x: x + dx, y: y + dy };
  };

  if (K < 3) {
    // Vertices-only: corners warp, sides stay straight.
    return { mode: 'vertices', verts: verts.map((p) => warpPoint(p.x, p.y)) };
  }

  // Bendable edges: per side, subdivide into K nodes and warp ALL of them, then
  // build a Catmull-Rom curve. Endpoints (the polygon corners) warp too, so
  // adjacent sides meet at the SAME warped corner (continuous, no seam).
  const n = verts.length;
  const sides = [];
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const nodes = [];
    for (let k = 0; k < K; k++) {
      const t = k / (K - 1);
      nodes.push(warpPoint(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
    }
    sides.push(catmullRomToBezier(nodes));
  }
  return { mode: 'bendable', sides };
}
