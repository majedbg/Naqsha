// Pure helpers for persisting the interactive scene state (text nodes + the
// shared transforms map) across save/load surfaces — the stateless `?s=` share
// link, the cloud `config`, and the local backup. The `transforms` map is keyed
// by BOTH layer ids and text-node ids (one shared map; see Studio), so we filter
// it to the ids that still exist before saving so deleted-node transforms don't
// accumulate in every payload.

/** Union of current layer ids and text-node ids. */
export function collectLiveIds(layers, textNodes) {
  const ids = [];
  if (Array.isArray(layers)) for (const l of layers) if (l && l.id != null) ids.push(l.id);
  if (Array.isArray(textNodes)) for (const n of textNodes) if (n && n.id != null) ids.push(n.id);
  return ids;
}

/** Keep only transform entries whose id is in `liveIds` (drops stale ones). */
export function filterTransforms(transforms, liveIds) {
  if (!transforms || !liveIds) return {};
  const live = new Set(liveIds);
  const out = {};
  for (const [id, t] of Object.entries(transforms)) {
    if (live.has(id)) out[id] = t;
  }
  return out;
}

/**
 * Normalize a persisted `textNodes` value to a plain array. Old saves predate
 * the field (undefined) — default to []. The font is NOT serialized (nodes carry
 * `fontId` only); the renderer resolves it with a DEFAULT_FONT_ID fallback.
 */
export function parseTextNodes(value) {
  return Array.isArray(value) ? value : [];
}
