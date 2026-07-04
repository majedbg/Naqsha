// collectMotifHostGeometry — order-INDEPENDENT pre-pass that harvests each motif
// host's drawn geometry BEFORE the main render loop paints anything.
//
// WHY THIS EXISTS (seam-fix): the Voronoi drawn-geometry seam (commit 767f6ce)
// originally harvested a host's cells INSIDE the single reverse-order render loop
// and threaded them to motifs via resolveMotifHostParams. But useCanvas renders
// `[...layers].reverse()` (bottom→top) and `addMotifLayer` APPENDS a motif to the
// end of `layers` → the fresh motif sits LAST in the array → FIRST in renderOrder
// → it resolved its host params BEFORE the host had generated → hostGeometry was
// still empty → zero placements. The default "+ Add Motif" flow rendered nothing.
//
// This helper restores the "placement is order-independent" contract the formula
// hosts (grid/recursive/spiral) already honour: it collects host geometry in a
// dedicated pass over the host-id set, so a motif sees its host's geometry no
// matter where either sits in the stack.
//
// Pure + injectable: `generateHostGeometry(hostLayer) → {drawnCells}|null` does
// the side-effecting work (in useCanvas: new HostClass() + generateWithContext on
// a THROWAWAY instance + read `motifHostGeometry`); tests inject a fake.

import { isMotifLayer, motifHostId } from './motifLayer.js';

/**
 * @param {object[]} layers the full layer array.
 * @param {(hostLayer: object) => ({drawnCells?: object[]}|null|undefined)} generateHostGeometry
 *   invoked once per distinct, existing host layer; returns the geometry to store
 *   (falsy → nothing stored for that host).
 * @returns {Object<string, {drawnCells?: object[]}>} host layer id → geometry.
 */
export function collectMotifHostGeometry(layers, generateHostGeometry) {
  const hostGeometry = {};
  // 1. Distinct host ids referenced by motif layers (drop falsy, dedupe).
  const hostIds = new Set();
  for (const layer of layers || []) {
    if (!isMotifLayer(layer)) continue;
    const hid = motifHostId(layer);
    if (hid) hostIds.add(hid);
  }
  // 2. Generate each host ONCE (order-independent) and harvest its geometry.
  for (const hostId of hostIds) {
    const host = (layers || []).find((l) => l.id === hostId);
    if (!host) continue; // dangling host id → tolerate (motif renders nothing)
    const geom = generateHostGeometry(host);
    if (geom) hostGeometry[host.id] = geom;
  }
  return hostGeometry;
}
