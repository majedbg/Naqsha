// facets — the pure filtering + facet-derivation layer for the Library view
// (S10, issue #59; PRD story 36). This is the ONLY place the Library's find
// logic lives, and it sits ON TOP of the libraryStore's output (component-local
// state in LibraryView) — the store itself is never touched, so filtering can
// never leak into the picker (locked invariant: one entity, two surfaces).
//
// Semantics (standard faceting): multi-select WITHIN a facet is OR; ACROSS
// facets is AND; an empty (or absent) facet selection means "no constraint".
// So an empty facetState passes every entry.
//
// Purity + server seam: `entryMatches(entity, facetState)` and
// `filterEntries(entries, facetState)` are pure functions over validated entity
// fields, so a future server-side path can replicate the exact predicate. Every
// facet but colour maps 1:1 to a stored column (migrations 011/012); colour is
// a DERIVED transform (colorBins) with no column — the server path needs a
// generated column or SQL-side binning. See the SERVER-SEAM note at the foot.

import { entryColorBins, colorBin } from './colorBins';
import { MATERIAL_LABELS, labelFor } from '../extraction/provenanceMeta';

// Facet keys, in rail order. `location` is handled specially (bucketed).
export const FACET_KEYS = ['symmetry', 'color', 'tradition', 'material', 'tags', 'location'];

export const FACET_LABELS = {
  symmetry: 'Symmetry',
  color: 'Color',
  tradition: 'Tradition',
  material: 'Material',
  tags: 'Tags',
  location: 'Location',
};

// Location bucketing sentinels (never a real place name — reserved slugs).
export const LOCATION_LOCATED = '__located__'; // has coords/address but no place name
export const LOCATION_NONE = '__none__'; //        no location recorded at all

/** A fresh, all-empty facet selection (clear-all target). */
export function emptyFacetState() {
  return { symmetry: [], color: [], tradition: [], material: [], tags: [], location: [] };
}

/** True when no facet carries any selection (⇒ filterEntries is the identity). */
export function isFacetStateEmpty(facetState) {
  return FACET_KEYS.every((k) => !(facetState?.[k]?.length));
}

/**
 * The set of values an entity contributes to one facet (the OR-set matched
 * against that facet's selection). Always an array; [] means the entity offers
 * no value for this facet (so it can only match if the facet is unselected).
 */
export function entityFacetValues(entity, key) {
  switch (key) {
    case 'symmetry':
      return entity?.symmetry?.group ? [entity.symmetry.group] : [];
    case 'color':
      return entryColorBins(entity);
    case 'tradition':
      return entity?.tradition ? [entity.tradition] : [];
    case 'material':
      return entity?.material ? [entity.material] : [];
    case 'tags':
      return Array.isArray(entity?.tags) ? entity.tags : [];
    case 'location': {
      const loc = entity?.location;
      if (!loc) return [LOCATION_NONE];
      if (loc.placeName) return [loc.placeName];
      // Located but unnamed (coords-only / address-only) — must not vanish from
      // BOTH the place-name values AND the "no location" bucket (advisor #5).
      return [LOCATION_LOCATED];
    }
    default:
      return [];
  }
}

/**
 * Does one entity satisfy the whole facet selection? OR within each facet, AND
 * across facets; an empty/absent selection for a facet is skipped (no
 * constraint). Pure — reads only validated entity fields.
 */
export function entryMatches(entity, facetState) {
  if (!facetState) return true;
  for (const key of FACET_KEYS) {
    const selected = facetState[key];
    if (!selected || selected.length === 0) continue; // unconstrained
    const values = entityFacetValues(entity, key);
    if (!selected.some((s) => values.includes(s))) return false;
  }
  return true;
}

/**
 * Filter store entries ({ entity, … }) by a facet selection. Pure; preserves
 * order and the entry wrapper (photoURL/createdAt survive). An empty facetState
 * returns the input set unchanged (the identity).
 */
export function filterEntries(entries, facetState) {
  if (!Array.isArray(entries)) return [];
  if (isFacetStateEmpty(facetState)) return entries;
  return entries.filter((e) => entryMatches(e.entity, facetState));
}

// ── Facet-value labelling ────────────────────────────────────────────────────
function valueLabel(key, value) {
  if (key === 'color') return colorBin(value)?.label ?? value;
  if (key === 'material') return labelFor(MATERIAL_LABELS, value) ?? value;
  if (key === 'location') {
    if (value === LOCATION_LOCATED) return 'Located';
    if (value === LOCATION_NONE) return 'No location';
    return value;
  }
  return value; // symmetry group, tradition, tag — display as-is
}

/**
 * Derive the facet rail from the current store. The value LIST for each facet
 * comes from the FULL store, so a facet's options never vanish mid-interaction
 * and a facet's OWN selection never shrinks its OWN list (selecting blue must
 * not hide red — you must be able to OR red back in). COUNTS are DRILL-DOWN:
 * each value's count is the number of entries matching all OTHER active facets,
 * so counts reflect the rest of the query and a value can legitimately show 0
 * (which is how the zero-result combination is reachable at all).
 *
 * Returns [{ key, label, values: [{ value, label, count, selected, swatch?,
 * soft? }] }], empty facets omitted. Values sort by count desc, then label;
 * the location "No location" bucket always sorts last.
 *
 * @param {Array}  entries    store entries ({ entity, … })
 * @param {Object} facetState current selection (defaults to empty)
 */
export function deriveFacets(entries, facetState = emptyFacetState()) {
  const list = Array.isArray(entries) ? entries : [];
  const out = [];

  for (const key of FACET_KEYS) {
    // Value LIST: every value present anywhere in the full store (options are
    // stable regardless of the active selection). Soft is intrinsic to a group,
    // so it too is read over the full store.
    const values = new Set();
    const softGroups = new Set();
    for (const entry of list) {
      for (const v of entityFacetValues(entry.entity, key)) {
        values.add(v);
        if (key === 'symmetry' && entry.entity.symmetry?.hiddenRotation) softGroups.add(v);
      }
    }

    // Location: only meaningful once at least one entry actually HAS a location.
    // A store with zero locations shows only "No location" → hide the facet.
    if (key === 'location') {
      const anyLocated = [...values].some((v) => v !== LOCATION_NONE);
      if (!anyLocated) continue;
    }
    if (values.size === 0) continue; // empty facet — hidden

    // COUNTS: drill-down against every facet EXCEPT this one.
    const subset = filterEntries(list, { ...facetState, [key]: [] });
    const counts = new Map();
    for (const entry of subset) {
      for (const v of entityFacetValues(entry.entity, key)) {
        if (values.has(v)) counts.set(v, (counts.get(v) || 0) + 1);
      }
    }

    const selectedSet = new Set(facetState?.[key] ?? []);
    const valueList = [...values]
      .map((value) => ({
        value,
        label: valueLabel(key, value),
        count: counts.get(value) || 0,
        selected: selectedSet.has(value),
        ...(key === 'color' ? { swatch: colorBin(value)?.swatch } : {}),
        ...(key === 'symmetry' && softGroups.has(value) ? { soft: true } : {}),
      }))
      .sort((a, b) => {
        // "No location" always last, whatever its count.
        if (a.value === LOCATION_NONE) return 1;
        if (b.value === LOCATION_NONE) return -1;
        if (b.count !== a.count) return b.count - a.count;
        return String(a.label).localeCompare(String(b.label));
      });

    out.push({ key, label: FACET_LABELS[key], values: valueList });
  }
  return out;
}

// ── SERVER-SEAM (issue #59 return item 7; migrations 011 + 012) ───────────────
// `entryMatches` is the client mirror of a per-user WHERE over user_patterns
// (source='extracted'), and each facet maps to a stored column + its index:
//   • symmetry → symmetry->>'group'   idx_user_patterns_symmetry (012)
//   • tags     → tags && $selected    idx_user_patterns_tags GIN (011)
//   • material → material IN (...)     idx_user_patterns_facets (011)
//   • tradition→ tradition IN (...)    (no dedicated index; free text, low card.)
//   • location → location->>'placeName' present / IS NULL (no index; small set)
//   • color    → NO stored column. Binning is a DERIVED transform over the
//     palette jsonb, so a server path needs either a generated column
//     (palette→bin[] computed on write) or an equivalent SQL binning function;
//     it cannot be expressed against 011's columns directly. This is the one
//     honest exception — flagged so the server path replicates binColor()
//     exactly rather than pretending colour maps to a column.
// OR-within-facet = IN / && ; AND-across-facets = ANDed predicates (the planner
// bitmap-ANDs the per-facet indexes). Drill-down counts = the same predicate
// with the counted facet dropped, GROUP BY that facet's value.
