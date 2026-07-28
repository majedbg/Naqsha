// CONFORMANCE — the host→roles TABLE against the EXTRACTORS (#154, amendment A6).
//
// WHY THIS FILE EXISTS. Before #154, `NARROW_ROLES` (hostRoles.js) was advisory:
// a wrong row cost a checkbox in the Route card and nothing else. #154 promotes it
// to RENDER AUTHORITY — `coerceRoles` intersects a stored Route's roles with
// `rolesForHost` at render — so from now on a wrong row DELETES REAL ANCHORS from
// a document that renders correctly today, silently. Nothing else in the suite ties
// the table to the extractors, so the next host added or the next extractor tweak
// could do exactly that.
//
// THE NON-EMPTINESS PRECONDITION IS THE POINT. A bare "emitted ⊆ claimed" check
// passes VACUOUSLY on any host whose fixture produced no geometry — which is how a
// conformance test proves its fixture rather than its table. So every host is
// driven with REAL generated geometry (the real pattern class, run through
// RecordingContext, read back off `instance.motifHostGeometry` for the stash
// hosts) and asserted NON-EMPTY before the subset check runs.
//
// The expected tally, measured by the #154 adversarial review at 800×600:
//   grid          crossing:169 edge:312 tip:52 cell:144
//   recursive     crossing:440 edge:440 tip:65 cell:110
//   spiral        edge:72  tip:6                      ← never a cell
//   voronoi       cell:78  crossing:147 edge:199      ← never a tip
//   circlepacking cell:389
//   modulegrid    cell:100
//   girih         crossing:146 edge:624 tip:24
//   truchet       cell:36  edge:216                   (per tile set)

import { describe, it, expect } from 'vitest';
import { RecordingContext } from '../patterns/drawingContext.js';
import { resolveHostAnchors } from './hostAnchors.js';
import { rolesForHost } from './hostRoles.js';
import { SEMANTIC_MOTIF_HOSTS, defaultRolesForHost, isStashHost } from './hostKinds.js';
import { getPatternClass } from '../patterns/index.js';
import { getDynamicDefaults } from '../patternRegistry.js';
import { DEFAULT_PARAMS } from '../../constants.js';
// Registers the built-in extras (Truchet, Hilbert, Lissajous, Chladni) into the
// dynamic registry, exactly as the app does at boot. Without it `truchet` would
// resolve to no class and the host would silently be skipped.
import '../registerBuiltinExtras.js';

const W = 800;
const H = 600;
const SEED = 11;

/** Every semantic host's DEFAULT params, from the same source the app uses. */
const defaultsFor = (type) => DEFAULT_PARAMS[type] || getDynamicDefaults(type) || {};

/**
 * The geometry a motif on this host would actually see. For a STASH host that
 * means running the REAL pattern and reading its generate()-time stash; for a
 * formula host (grid/recursive/spiral) there is none — the extractor re-derives
 * from params.
 */
function geometryFor(type, params) {
  if (!isStashHost(type)) return undefined;
  const Klass = getPatternClass(type);
  expect(Klass, `no pattern class registered for ${type}`).toBeTruthy();
  const inst = new Klass();
  inst.generate(new RecordingContext({ seed: 1 }), SEED, params, W, H, '#000000', 100);
  return inst.motifHostGeometry;
}

/** The roles this host's extractor really emits, at default params. */
function emittedRoles(type) {
  const params = defaultsFor(type);
  const anchors = resolveHostAnchors({
    patternType: type,
    params,
    canvasW: W,
    canvasH: H,
    geometry: geometryFor(type, params),
    hostSeed: SEED,
    mode: 'semantic',
  });
  return { anchors: anchors || [], roles: new Set((anchors || []).map((a) => a.role)) };
}

describe('NARROW_ROLES conformance — every role the extractors emit is a role the table claims', () => {
  for (const type of SEMANTIC_MOTIF_HOSTS) {
    it(`${type}: real geometry is non-empty, and its roles ⊆ rolesForHost`, () => {
      const { anchors, roles } = emittedRoles(type);
      // PRECONDITION, first — otherwise the subset check below is vacuous on any
      // host whose fixture failed to produce geometry.
      expect(anchors.length, `${type} produced NO anchors — the fixture is wrong`).toBeGreaterThan(
        0
      );
      expect(roles.size, `${type} produced anchors with no role`).toBeGreaterThan(0);

      const claimed = rolesForHost(type, defaultsFor(type));
      expect(claimed.length, `${type} claims no roles at default params`).toBeGreaterThan(0);
      for (const role of roles) {
        expect(claimed, `${type} emits '${role}' but rolesForHost does not offer it`).toContain(
          role
        );
      }
    });
  }

  // The other direction is deliberately NOT asserted as equality: a role may be
  // claimed and emit nothing at ONE params set (spiral's `crossing` needs
  // innerRadius 0 and armCount > 1) without the table being wrong. What must
  // never happen is the reverse — the render deleting anchors the host really
  // makes.
  it('the two roles #154 narrows are genuinely dead at default params', () => {
    expect([...emittedRoles('voronoi').roles]).not.toContain('tip');
    expect([...emittedRoles('spiral').roles]).not.toContain('cell');
  });
});

describe('the coercion FALLBACK can only ever name an available role', () => {
  // `coerceRoles` falls back to `defaultRolesForHost(type)` when the stored roles
  // intersect the host's emitted set to nothing. If that default were itself
  // unavailable, the mechanism built to stop blank renders would CAUSE one — and
  // the next NARROW_ROLES edit is exactly where that would slip in.
  for (const type of SEMANTIC_MOTIF_HOSTS) {
    it(`${type}: defaultRolesForHost ⊆ rolesForHost`, () => {
      const claimed = rolesForHost(type, defaultsFor(type));
      for (const role of defaultRolesForHost(type)) {
        expect(claimed, `${type}'s default role '${role}' is not one it offers`).toContain(role);
      }
    });
  }
});
