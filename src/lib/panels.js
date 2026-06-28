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

import { PATTERN_SYMBOLS } from '../constants';
import { autoLayerName } from './autoLayerName';

export const MAX_PANELS = 3;
export const SUBSTRATE_KINDS = ['acrylic', 'plywood', 'mdf', 'cardstock', 'other'];
export const PANELS_STORAGE_KEY = 'sonoform-panels';

// The 5 confirmed material presets offered by the "New panel" creation row, in
// order. Each is a partial substrate `{ kind, thickness }` merged over the
// default substrate when a panel is created; every choice stays editable later.
export const SUBSTRATE_PRESETS = [
  { kind: 'acrylic', thickness: 3 },
  { kind: 'acrylic', thickness: 5 },
  { kind: 'plywood', thickness: 4 },
  { kind: 'mdf', thickness: 3 },
  { kind: 'cardstock', thickness: 1 },
];

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

// Human label for a substrate preset, e.g. "acrylic · 3mm". Mirrors the `·`
// separator and `${kind} · ${thickness}mm` shape of PanelHeader's local
// substrateSummary so dropdown labels read the same as the panel chip.
export function presetLabel(preset) {
  if (!preset) return '—';
  return `${preset.kind} · ${preset.thickness}mm`;
}

// Signal the UI uses to enable/disable "add panel" at the hard cap.
export function canAddPanel(panels) {
  return Array.isArray(panels) && panels.length < MAX_PANELS;
}

// Append a panel whose order = next index. At cap, return the INPUT reference
// unchanged (a no-op the caller can detect with `===`). Optional `substrate`
// (a partial preset like `{kind,thickness}`) shallow-merges over the default
// substrate; without it the new panel keeps the plain default (backward
// compatible with existing `addPanel(panels)` callers).
export function addPanel(panels, substrate) {
  if (!canAddPanel(panels)) return panels;
  const base = createPanel(panels.length);
  if (!substrate) return [...panels, base];
  return [...panels, { ...base, substrate: { ...base.substrate, ...substrate } }];
}

// Deep-copy a layer onto a target panel, minting a fresh unique id. Faithfully
// replicates useLayers' `cloneLayer` field rules (WI-1 §8): custom source →
// "<name> copy" (stays custom); auto source → recompute the auto-name (no
// "copy"), guarding symbol-less types so deliberate names survive. Deep-copies
// params / randomizeKeys / paramsCache so the clone shares no mutable refs.
function cloneLayerOnto(src, panelId, freshId) {
  const naming = src.nameIsCustom
    ? { name: `${src.name} copy`, nameIsCustom: true }
    : {
        name: PATTERN_SYMBOLS[src.patternType] ? autoLayerName(src.patternType) : src.name,
        nameIsCustom: false,
      };
  return {
    ...src,
    id: freshId,
    ...naming,
    params: { ...src.params },
    randomizeKeys: [...(src.randomizeKeys || [])],
    paramsCache: JSON.parse(JSON.stringify(src.paramsCache || {})),
    panelId,
  };
}

// Duplicate panel `id`: append a copy (deep substrate, order = next, name
// "<name> copy", fresh id) plus deep-copies of every layer that belonged to it
// (fresh unique layer ids, reassigned to the new panel). Unknown id → no-op
// (inputs returned unchanged). At the panel cap → no-op. Pure.
export function duplicatePanel(panels, layers, id) {
  if (!Array.isArray(panels)) return { panels, layers };
  const src = panels.find((p) => p.id === id);
  if (!src || !canAddPanel(panels)) return { panels, layers };

  const order = panels.length;
  const newPanel = {
    ...src,
    id: `panel-${order + 1}-${rand()}`,
    name: `${src.name} copy`,
    order,
    substrate: JSON.parse(JSON.stringify(src.substrate)),
  };

  const srcLayers = layersForPanel(layers || [], id);
  // index suffix on the id guarantees uniqueness within this batch.
  const clones = srcLayers.map((l, i) => cloneLayerOnto(l, newPanel.id, `layer-${rand()}-${i}`));

  return {
    panels: [...panels, newPanel],
    layers: [...(layers || []), ...clones],
  };
}

// Gate for the "Duplicate panel" action. False when we're at the panel cap
// (`!canAddPanel`) OR when copying this panel's layers would push the document
// past the tier layer `cap` (all-or-nothing — no half copies). Else true.
export function canDuplicatePanel(panels, layers, id, cap) {
  if (!canAddPanel(panels)) return false;
  const srcCount = layersForPanel(layers || [], id).length;
  if ((layers || []).length + srcCount > cap) return false;
  return true;
}

// Drop every layer belonging to `panelId`. Pure — new array, never mutates.
export function clearPanelLayers(layers, panelId) {
  return (layers || []).filter((l) => l.panelId !== panelId);
}

// Gate for the "Clear all layers" action. False when the panel has no layers
// (nothing to clear) OR when clearing would empty the document (≥1-layer
// invariant). Else true.
export function canClearPanelLayers(layers, panelId) {
  const all = layers || [];
  const count = layersForPanel(all, panelId).length;
  if (count === 0) return false;
  if (all.length - count <= 0) return false;
  return true;
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

// WI-4 shared filter: the subset of `layers` that are EFFECTIVELY visible —
// both the layer and its panel must be visible. This is the single source of
// truth for visibility filtering used by BOTH the canvas (useCanvas) and the
// laser export callers (per-panel + combined SVG), so the logic lives in one
// place. `panels` may be empty/undefined → degrades to `layer.visible` (a layer
// with a dangling/unknown panelId is treated as having no panel → its own
// visibility governs). Pure: returns a new array, never mutates.
export function effectiveVisibleLayers(layers, panels) {
  const panelById = new Map((Array.isArray(panels) ? panels : []).map((p) => [p.id, p]));
  return (layers || []).filter((l) => effectiveVisible(l, panelById.get(l.panelId)));
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
