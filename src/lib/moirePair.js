// moirePair.js — single-source-of-truth helpers for Moiré layer pairs.
//
// A Moiré pair is TWO layers sharing a `moireGroupId`, distinguished by
// `moireRole: 'A' | 'B'` (both are LAYER fields, NOT params). Layer A holds all
// the field params; layer B holds none meaningful — at render/export/panel time
// B reads its partner A's params. This module is the ONE place that resolution
// lives, so there is no param-sync / no re-entrancy.
//
// Used at 3 read sites: render (useCanvas), export (via the cached instance), and
// the param panel (LayersSection → LayerCard).

/** Is this layer a member of a Moiré pair? */
export function isMoireMember(layer) {
  return !!(layer && layer.patternType === 'moire' && layer.moireRole && layer.moireGroupId);
}

/** Find the role-'A' partner of a Moiré member within `allLayers` (or null). */
export function findMoirePartnerA(layer, allLayers) {
  if (!layer || !layer.moireGroupId) return null;
  return (
    allLayers.find(
      (l) => l.moireGroupId === layer.moireGroupId && l.moireRole === 'A'
    ) || null
  );
}

/** Find the role-'B' partner of a Moiré member within `allLayers` (or null). */
export function findMoirePartnerB(layer, allLayers) {
  if (!layer || !layer.moireGroupId) return null;
  return (
    allLayers.find(
      (l) => l.moireGroupId === layer.moireGroupId && l.moireRole === 'B'
    ) || null
  );
}

/**
 * Resolve the SOURCE params + role for rendering/exporting a Moiré layer.
 *   role 'A' → the layer's own params (it IS the source of truth).
 *   role 'B' → its partner A's params (B reads A).
 *   orphan B (no partner A found) → null. Callers MUST treat null as
 *     "render/export nothing" (partner-missing guard).
 *
 * Returns `{ params, moireRole }` or `null`.
 */
export function resolveMoireSource(layer, allLayers) {
  if (!layer) return null;
  if (layer.moireRole === 'A') {
    return { params: layer.params, moireRole: 'A' };
  }
  if (layer.moireRole === 'B') {
    const partnerA = findMoirePartnerA(layer, allLayers);
    if (!partnerA) return null; // orphan B — caller renders nothing
    return { params: partnerA.params, moireRole: 'B' };
  }
  // Not a moiré layer (no role) — caller should not have asked, but be safe.
  return { params: layer.params, moireRole: undefined };
}
