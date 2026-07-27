// edgeRoles — EDGE-MODE ROLE COERCION, shared by the render seam and the canvas
// overlay.
//
// In edge mode the only anchor role that exists is 'edge' (sampleEdgeAnchors
// tags every anchor role:'edge', anchors.js), so a ROUTE/selection role filter
// naming any OTHER role filters EVERYTHING out. This bites a grid that became a
// single-axis EDGE host at render (resolveMotifHost) while its binding still
// carries the baked semantic default roles:['crossing'] (hostKinds
// defaultRolesForHost) — the vine would place nothing. Normalize such stale
// roles to ['edge']. A role already `null` (all-pass) or exactly ['edge'] is
// left untouched — so this is a byte-identical no-op for native edge hosts and
// only un-bakes a grid's 'crossing'. Clones; never mutates the stored binding.
//
// LIVES HERE, not in MotifPattern, because AnchorGhostOverlay must run the
// IDENTICAL coercion when it previews an edge host's placements (#141): a
// second implementation that drifted would make the ghost dots disagree with
// the glyphs actually drawn — silently, and only on stale bindings.

const roleIsEdgeSafe = (roles) =>
  roles == null || (Array.isArray(roles) && roles.length === 1 && roles[0] === 'edge');

/**
 * Un-bake non-edge route roles from a binding for EDGE-mode resolution.
 * @param {object} binding  chain-form or legacy binding (either shape)
 * @returns {object} the SAME reference when nothing needed coercing, else a clone
 */
export function coerceEdgeRoles(binding) {
  if (!binding || typeof binding !== 'object') return binding;
  let changed = false;
  const out = { ...binding };
  if (Array.isArray(binding.chain)) {
    out.chain = binding.chain.map((block) => {
      if (block && block.type === 'route' && !roleIsEdgeSafe(block.roles)) {
        changed = true;
        return { ...block, roles: ['edge'] };
      }
      return block;
    });
  }
  if (binding.selection && !roleIsEdgeSafe(binding.selection.roles)) {
    out.selection = { ...binding.selection, roles: ['edge'] };
    changed = true;
  }
  return changed ? out : binding;
}
