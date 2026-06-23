// WI-1 Naqsha Panels: the panel model + pure helpers + persistence + load-time
// normalizer. A "panel" is a physical substrate (acrylic, plywood, …) that a
// subset of layers belongs to via `layer.panelId`. Membership lives on the
// layer; this module owns the panel array, its invariants, and its round-trip.
//
// All helpers are PURE (no input mutation, new arrays out). Later WIs (cloud,
// export, visibility, UI, Studio) consume these exact named exports — keep the
// contract stable.
//
// Style mirrors useLayers.js: forgiving loaders (Array.isArray guards, try/catch
// → null, no version field) and a `Math.random().toString(36).slice(2,6)` rand
// suffix on ids (same shape as genId).

export const MAX_PANELS = 3;
export const SUBSTRATE_KINDS = ['acrylic', 'plywood', 'mdf', 'cardstock', 'other'];
export const PANELS_STORAGE_KEY = 'sonoform-panels';

// Neutral default substrate color — a mid-grey, deliberately non-jewel so a real
// substrate choice reads as intentional later.
const DEFAULT_SUBSTRATE_COLOR = '#cccccc';

function rand() {
  return Math.random().toString(36).slice(2, 8);
}

// The smallest-`order` panel — the canonical "first" panel for reassignment and
// seeding. NOT array[0]: `order` is the source of truth (array position only
// tracks it coincidentally today). Returns undefined for an empty array.
function firstPanel(panels) {
  if (!Array.isArray(panels) || panels.length === 0) return undefined;
  return panels.reduce((min, p) => (p.order < min.order ? p : min));
}

// Build a default panel at `order`. name/id number off order+1 ("Panel 1" for
// order 0). `overrides` shallow-merge last.
export function createPanel(order = 0, overrides = {}) {
  return {
    id: `panel-${order + 1}-${rand()}`,
    name: `Panel ${order + 1}`,
    substrate: { kind: 'acrylic', thickness: 3, color: DEFAULT_SUBSTRATE_COLOR },
    visible: true,
    order,
    ...overrides,
  };
}

// Signal the UI uses to enable/disable "add panel" at the hard cap.
export function canAddPanel(panels) {
  return Array.isArray(panels) && panels.length < MAX_PANELS;
}

// Append a panel whose order = next index. At cap, return the INPUT reference
// unchanged (a no-op the caller can detect with `===`).
export function addPanel(panels) {
  if (!canAddPanel(panels)) return panels;
  return [...panels, createPanel(panels.length)];
}

// Remove panel `id`. Deleting the only panel is a no-op (invariant: always >= 1).
// deleteLayers:false → reassign the panel's layers to the smallest-order
// remaining panel. deleteLayers:true → drop those layers too. Pure.
export function deletePanel(panels, layers, id, { deleteLayers = false } = {}) {
  if (!Array.isArray(panels) || panels.length <= 1) {
    return { panels, layers };
  }
  const remaining = panels.filter((p) => p.id !== id);
  if (remaining.length === panels.length) {
    // No such panel — nothing to do.
    return { panels, layers };
  }

  const target = firstPanel(remaining);
  let nextLayers;
  if (deleteLayers) {
    nextLayers = (layers || []).filter((l) => l.panelId !== id);
  } else {
    nextLayers = (layers || []).map((l) =>
      l.panelId === id ? { ...l, panelId: target.id } : l
    );
  }
  return { panels: remaining, layers: nextLayers };
}

// Set ONLY the target layer's panelId. New array out.
export function assignLayerToPanel(layers, layerId, panelId) {
  return layers.map((l) => (l.id === layerId ? { ...l, panelId } : l));
}

export function layersForPanel(layers, panelId) {
  return layers.filter((l) => l.panelId === panelId);
}

// A layer is visible iff both its panel and itself are visible. An undefined
// panel (e.g. before panels apply) falls back to the layer's own visibility.
export function effectiveVisible(layer, panel) {
  return panel ? panel.visible && layer.visible : layer.visible;
}

// Load-time normalizer (pure). Three cases, in order:
//   1. panels absent / empty / non-array → seed [Panel 1] and assign EVERY layer
//      to it.
//   2. valid panels, but some layers have a null/undefined/dangling panelId →
//      reassign those to the smallest-order panel; valid layers untouched.
//   3. fully valid → pass panels through; return a layers array equal to input.
// Never mutates inputs.
export function normalizePanels(panels, layers) {
  const safeLayers = Array.isArray(layers) ? layers : [];

  if (!Array.isArray(panels) || panels.length === 0) {
    const seed = createPanel(0);
    return {
      panels: [seed],
      layers: safeLayers.map((l) => ({ ...l, panelId: seed.id })),
    };
  }

  const validIds = new Set(panels.map((p) => p.id));
  const target = firstPanel(panels);
  const nextLayers = safeLayers.map((l) =>
    validIds.has(l.panelId) ? l : { ...l, panelId: target.id }
  );
  return { panels, layers: nextLayers };
}

// Forgiving load: bare array under PANELS_STORAGE_KEY, or null on
// missing/corrupt/empty/non-array. Mirrors loadLayers.
export function loadPanels() {
  try {
    const raw = localStorage.getItem(PANELS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePanels(panels) {
  try {
    localStorage.setItem(PANELS_STORAGE_KEY, JSON.stringify(panels));
  } catch {
    /* storage full or unavailable */
  }
}
