// #154 step 2 — params-aware create-time role defaults.
//
// THE PAIR. These two tests are deliberately written together, because fixing
// only the first is the trap that made #154 defer this slice:
//
//   1. A create-time writer must not store a role the host does not offer.
//      A single-axis Grid emits `edge` alone (it has no crossings), yet
//      `defaultRolesForHost` is params-blind and answers `crossing`.
//
//   2. `modeMatch` rebuilds starter chips params-blind (`chip.build(type)`),
//      so making (1) params-aware ON ITS OWN makes every chip on a single-axis
//      Grid read as `Custom` the instant it is created — the stored chain and
//      the rebuilt chain disagree about roles. `chip.build`, `modeForMotif` and
//      `applyModeChain` therefore have to go params-aware in the SAME change.
//
// Criterion 2 is the one that fails if you fix roles alone, so it is not
// optional coverage — it is the acceptance criterion for the slice.

import { describe, it, expect } from 'vitest';
import { defaultRolesForHost } from './hostKinds.js';
import { rolesForHost, defaultRolesFor } from './hostRoles.js';
import { defaultMotifAddOpts } from './defaultBinding.js';
import { STARTER_CHIPS } from './starterChips.js';
import { modeForMotif, applyModeChain } from './modeMatch.js';

// Grid.js gates each axis at >= 0.5, so 0 draws nothing on that axis.
const COLUMNS_ONLY = { drawHorizontal: 0, drawVertical: 1 };
const ROWS_ONLY = { drawHorizontal: 1, drawVertical: 0 };
const BOTH_AXES = { drawHorizontal: 1, drawVertical: 1 };

const rolesOf = (binding) => {
  const route = (binding.chain || []).find((b) => b && b.type === 'route');
  return route ? route.roles : binding.selection?.roles;
};

describe('#154 step 2 — criterion 1: create-time never stores an unofferable role', () => {
  it('single-axis Grid emits `edge` alone — the premise', () => {
    expect(rolesForHost('grid', COLUMNS_ONLY)).toEqual(['edge']);
    expect(rolesForHost('grid', ROWS_ONLY)).toEqual(['edge']);
    expect(rolesForHost('grid', BOTH_AXES)).toEqual(
      expect.arrayContaining(['crossing', 'edge', 'tip', 'cell'])
    );
  });

  it('defaultRolesFor is params-aware: columns-only Grid defaults to edge, not crossing', () => {
    expect(defaultRolesFor('grid', COLUMNS_ONLY)).toEqual(['edge']);
    expect(defaultRolesFor('grid', ROWS_ONLY)).toEqual(['edge']);
    // Two-axis Grid keeps its shipped answer, byte-identical.
    expect(defaultRolesFor('grid', BOTH_AXES)).toEqual(['crossing']);
    expect(defaultRolesFor('grid')).toEqual(['crossing']);
  });

  it('the canvas-drop writer stores a role the host offers', () => {
    const opts = defaultMotifAddOpts('grid', 'leaf', COLUMNS_ONLY);
    expect(opts.binding.selection.roles).toEqual(['edge']);
    // and the two-axis case is unchanged
    expect(defaultMotifAddOpts('grid', 'leaf', BOTH_AXES).binding.selection.roles).toEqual([
      'crossing',
    ]);
    expect(defaultMotifAddOpts('grid', 'leaf').binding.selection.roles).toEqual(['crossing']);
  });

  it('an UNAVAILABLE host (rolesForHost -> []) still stores a real role, never [] or null', () => {
    // Chladni at equal mode numbers draws a blank plate: no roles at all. A
    // create-time writer must not store `[]` (applyRoute filters everything)
    // nor `null` (all-pass) — it keeps the by-type answer, which is exactly
    // what coerceRoles does at render for an unavailable host.
    const blank = { m: 4, n: 4, blend: 0 };
    expect(rolesForHost('chladni', blank)).toEqual([]);
    const roles = defaultRolesFor('chladni', blank);
    expect(roles).not.toBeNull();
    expect(roles.length).toBeGreaterThan(0);
    expect(roles).toEqual(defaultRolesForHost('chladni'));
  });
});

describe('#154 step 2 — criterion 2: THE TRAP — chips must not read as Custom', () => {
  it('every starter chip built for a single-axis Grid round-trips to its own id', () => {
    for (const chip of STARTER_CHIPS) {
      const built = chip.build('grid', COLUMNS_ONLY);
      expect(modeForMotif(built.binding, 'grid', COLUMNS_ONLY)).toBe(chip.id);
    }
  });

  it('every starter chip still round-trips on a two-axis Grid (no regression)', () => {
    for (const chip of STARTER_CHIPS) {
      const built = chip.build('grid', BOTH_AXES);
      expect(modeForMotif(built.binding, 'grid', BOTH_AXES)).toBe(chip.id);
    }
    // and params-blind callers keep working
    for (const chip of STARTER_CHIPS) {
      expect(modeForMotif(chip.build('grid').binding, 'grid')).toBe(chip.id);
    }
  });

  it('applyModeChain writes the same params-aware chain modeForMotif will match', () => {
    for (const chip of STARTER_CHIPS) {
      const applied = applyModeChain(chip.id, 'grid', COLUMNS_ONLY);
      expect(applied).not.toBeNull();
      expect(modeForMotif(applied.binding, 'grid', COLUMNS_ONLY)).toBe(chip.id);
      // The chain it writes asks only for roles a columns-only Grid emits.
      const r = rolesOf(applied.binding);
      if (r != null) expect(r.every((x) => rolesForHost('grid', COLUMNS_ONLY).includes(x))).toBe(true);
    }
  });

  // RECORDED CONSEQUENCE, locked deliberately rather than discovered later.
  //
  // Making modeForMotif params-aware means a stored chain can read as a
  // DIFFERENT mode when the host's params change under it. Concretely, with the
  // Grid axis toggle (#166/#168): build an Alternate x‑o on a two-axis Grid
  // (roles `['crossing']`), then switch the Grid to columns-only — the mode
  // column flips from "Alternate x‑o" to "Custom", with no motif edit.
  //
  // The glyphs do NOT disappear: `coerceRoles` narrows the stored `['crossing']`
  // to `['edge']` at render, so they relocate from the crossings to along the
  // lines. The chain genuinely no longer matches what a chip built HERE would
  // produce, which is what 'custom' means.
  //
  // This is the same trade #154 already accepted and recorded for Voronoi and
  // Spiral ("narrowing flips saved Vines on those hosts from `vine` to `custom`
  // on load ... render-neutral but user-visible in the mode column"). The new
  // part is that an axis TOGGLE can trigger it live, not only a load.
  //
  // The alternative — match against the COERCED stored roles, so the mode column
  // always describes what the canvas drew — is coherent and arguably better, but
  // it needs `anchorMode` threaded into modeForMotif (coerceRoles' first branch
  // treats a missing anchorMode as 'edge' and would take the edge path on every
  // semantic host). Left as a follow-up rather than smuggled in here.
  it('a chip built for a two-axis Grid does NOT match under single-axis params', () => {
    const built = STARTER_CHIPS.find((c) => c.id === 'alternate-xo').build('grid', BOTH_AXES);
    expect(modeForMotif(built.binding, 'grid', COLUMNS_ONLY)).toBe('custom');
    // ...and the glyphs still render, via the render-time coercion — the reason
    // this is a label change and not a disappearance.
    expect(rolesForHost('grid', COLUMNS_ONLY)).toEqual(['edge']);
  });
});
