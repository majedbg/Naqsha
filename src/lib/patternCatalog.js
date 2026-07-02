// Single source of truth for "what patterns exist" in the picker.
//
// Consumed by the Map view, the Grid view, AND the family-pill counts so they
// all enumerate the SAME set of patterns — preventing drift (the classic bug
// being the Grid forgetting `pickerHidden` and showing `moire`).
//
// BLOCKER #1: custom/AI patterns get their OWN synthetic family key `'custom'`
// with a deliberate neutral color — they must NOT reuse family `C`
// (Reaction-Diffusion), which has its own real color/label.

import {
  PATTERN_TAXONOMY,
  PATTERN_FAMILIES,
  SPATIAL_FORM_ROWS,
  GEOM_ORGANIC_BANDS,
} from '../constants';
import { getPatternClass } from './patterns';

// Synthetic family for custom/AI patterns. Neutral gray, deliberately distinct
// from PATTERN_FAMILIES.C ('#6b7a99', Reaction-Diffusion).
export const CUSTOM_FAMILY = {
  key: 'custom',
  label: 'Custom',
  color: '#8a8f99',
  tint: 'rgba(138,143,153,0.10)',
};

// Synthetic meta for a custom/AI pattern that has no taxonomy entry.
const CUSTOM_META = {
  family: 'custom',
  det: 'seeded',
  mark: 'line',
  sym: false,
  blurb: 'Custom pattern',
};

/**
 * Resolve a family key to its {label, color, tint, ...} descriptor.
 * Single place that maps a familyKey → family object, used by both the pills
 * and the grid clustering. Returns the synthetic CUSTOM_FAMILY for 'custom'.
 */
export function familyMetaFor(familyKey) {
  if (familyKey === 'custom') return CUSTOM_FAMILY;
  return PATTERN_FAMILIES[familyKey] || null;
}

/**
 * Enumerate every pattern the picker should show, in a stable order:
 *   1. taxonomy patterns (PATTERN_TAXONOMY declaration order), and then
 *   2. ready custom/AI patterns not present in the taxonomy.
 *
 * Taxonomy entries flagged `pickerHidden` are skipped, as are entries whose
 * `form`/`geom` don't match a known SPATIAL_FORM_ROWS key / GEOM_ORGANIC_BANDS
 * level (same typo guard + console.warn the modal used).
 *
 * @param {{id: string, label?: string}[]} dynamicTypes - registered dynamic types.
 * @returns {{ id: string, meta: object, familyKey: string }[]}
 */
export function getVisiblePatterns(dynamicTypes = []) {
  const validForms = new Set(SPATIAL_FORM_ROWS.map((r) => r.key));
  const validGeom = new Set(GEOM_ORGANIC_BANDS.map((b) => b.level));

  const out = [];

  // 1. Taxonomy patterns, in declaration order.
  for (const [id, meta] of Object.entries(PATTERN_TAXONOMY)) {
    if (meta.pickerHidden) continue;
    if (!validForms.has(meta.form) || !validGeom.has(meta.geom)) {
      console.warn(
        `[patternCatalog] "${id}" has unknown form/geom (${meta.form}/${meta.geom}) — skipped.`
      );
      continue;
    }
    out.push({ id, meta, familyKey: meta.family });
  }

  // 2. Ready custom/AI patterns with no taxonomy entry → synthetic 'custom'.
  const taxIds = new Set(Object.keys(PATTERN_TAXONOMY));
  for (const t of dynamicTypes) {
    if (taxIds.has(t.id)) continue;
    if (!getPatternClass(t.id)) continue; // not ready
    // Provenance rides along (S1, issue #50): 'extracted' drives the 📷 badge
    // now and the source facet filter in S10.
    out.push({
      id: t.id,
      meta: { ...CUSTOM_META, ...(t.origin ? { origin: t.origin } : {}) },
      familyKey: 'custom',
    });
  }

  return out;
}
