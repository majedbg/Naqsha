/**
 * LIVE visibility for the 3D preview (D14 refinement). The preview is
 * snapshot-based — geometry is pinned at entry/Rebuild — but hiding/unhiding a
 * panel or layer is a DISPLAY toggle, not a design edit, so it rides the same
 * live-prop path as the Material lens and per-panel materials (panelAppearance
 * panelMaterialIds): RightPanel derives id→visible maps from the LIVE arrays
 * and the pure builders (sheetSpecs.buildSheetSpecs, markTexture.
 * buildPanelMarkSVGs) apply them as overrides over the snapshot's own flags.
 *
 * Entities created after the snapshot stay absent (their ids exist only in the
 * live map, which the builders consult per snapshot entity) and deleted
 * entities keep their snapshot flag — structural edits remain "↻ Rebuild"'s
 * job. PURE + three-free: 2D side of the dynamic-import boundary.
 */

/**
 * id → current `visible` flag for a live panels/layers array.
 * @param {Array<{id?:string, visible?:boolean}>} [items]
 * @returns {Record<string, boolean>}
 */
export function visibilityById(items) {
  const out = {};
  for (const it of Array.isArray(items) ? items : []) {
    if (it && it.id) out[it.id] = !!it.visible;
  }
  return out;
}

/**
 * Shallow equality for two visibilityById maps. Lets callers keep a STABLE map
 * identity across unrelated edits (the live layers/panels arrays are recreated
 * on every edit): a fresh-but-equal map must not invalidate the downstream
 * memos that rebuild mark SVGs/textures.
 * @param {Record<string, boolean>|null|undefined} a
 * @param {Record<string, boolean>|null|undefined} b
 * @returns {boolean}
 */
export function sameVisibilityMap(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => k in b && a[k] === b[k]);
}

/**
 * Apply a live id→visible override map over snapshot entities. Entities without
 * an entry (deleted live, or no map at all) keep their own flag; matching
 * entities with an unchanged flag are returned by identity (no copy churn).
 * @template {{id?:string, visible?:boolean}} T
 * @param {T[]} items
 * @param {Record<string, boolean>|null|undefined} overrides
 * @returns {T[]}
 */
export function withVisibilityOverride(items, overrides) {
  const list = Array.isArray(items) ? items : [];
  if (!overrides) return list;
  return list.map((it) => {
    if (!it || !it.id || !(it.id in overrides)) return it;
    const visible = !!overrides[it.id];
    return visible === !!it.visible ? it : { ...it, visible };
  });
}
