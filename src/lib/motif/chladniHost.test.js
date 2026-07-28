// Chladni as a motif EDGE host (#145, PRD #143 slice 3).
//
// The acceptance question is "does selecting Chladni as a motif host put glyphs
// ON the nodal lines?", so this test runs the REAL pattern through the REAL
// pipeline the app uses — record-mode capture → capturePolylines → edge anchors
// → placeMotifs — and then checks each placed glyph against the captured
// contours. It does NOT construct fake geometry: on an edge host, capture IS the
// behaviour under test.
//
// Boundary discipline (ticket): the placement cases below run at NON-default
// mode numbers as well as defaults, and the blank case is asserted end-to-end so
// "the gate explains a genuinely empty host" is measured, not assumed.

import { describe, it, expect } from 'vitest';
import { EDGE_MOTIF_HOSTS, isEdgeHost, isMotifHost, defaultRolesForHost } from './hostKinds.js';
import { hostAvailability } from './hostCapability.js';
import { resolveMotifHostParams } from './resolveMotifHost.js';
import { capturePolylines } from './capturePolylines.js';
import { sampleEdgeAnchors } from './anchors.js';
import { placeMotifs } from './placementEngine.js';
import { MOTIF_TYPE } from './motifLayer.js';
import { P5Adapter } from '../patterns/drawingContext.js';
import { getPatternClass } from '../patterns/index.js';
import { getDynamicDefaults } from '../patternRegistry.js';
import '../registerBuiltinExtras.js'; // registers patterns/extras/* (chladni)

const CANVAS_W = 400;
const CANVAS_H = 300;

function fakeP5() {
  const noop = () => () => {};
  return {
    TWO_PI: Math.PI * 2, PI: Math.PI, HALF_PI: Math.PI / 2,
    CLOSE: 'P5_CLOSE', CENTER: 'P5_CENTER', ROUND: 'P5_ROUND',
    randomSeed() {}, noiseSeed() {}, random: () => 0.5, noise: () => 0.5,
    color: () => ({ setAlpha() {} }),
    push: noop(), pop: noop(), translate: noop(), rotate: noop(), scale: noop(),
    stroke: noop(), noStroke: noop(), fill: noop(), noFill: noop(),
    strokeWeight: noop(), strokeCap: noop(), rectMode: noop(),
    line: noop(), ellipse: noop(), rect: noop(), triangle: noop(),
    beginShape: noop(), vertex: noop(), endShape: noop(),
  };
}

/** The host's own registered defaults, exactly as useLayers assigns on creation. */
const CHLADNI_DEFAULTS = () => getDynamicDefaults('chladni') || {};

/** Run the real Chladni through the real record-mode probe → hostPaths. */
function captureChladni(paramOverrides = {}) {
  const HostClass = getPatternClass('chladni');
  const params = { ...CHLADNI_DEFAULTS(), resolution: 80, ...paramOverrides };
  const ctx = new P5Adapter(fakeP5(), { draw: false, record: true });
  new HostClass().generate(ctx, 7, params, CANVAS_W, CANVAS_H, '#000000', 100);
  return { params, hostPaths: capturePolylines(ctx.calls) };
}

/** Shortest distance from p to any vertex of any captured polyline. */
function distanceToNearestPathVertex(p, paths) {
  let best = Infinity;
  for (const path of paths) {
    for (const v of path.points) {
      const d = Math.hypot(p.x - v.x, p.y - v.y);
      if (d < best) best = d;
    }
  }
  return best;
}

const BINDING = {
  selection: { roles: ['edge'] },
  placement: {
    sizing: { mode: 'fixed', size: 6 },
    orientation: { policy: 'path', useNormal: true },
  },
};

describe('Chladni is registered as a motif edge host', () => {
  it('is a motif host, an edge host, and defaults to the edge role', () => {
    expect(EDGE_MOTIF_HOSTS.has('chladni')).toBe(true);
    expect(isMotifHost('chladni')).toBe(true);
    expect(isEdgeHost('chladni')).toBe(true);
    expect(isEdgeHost('chladni', { m: 4, n: 4 })).toBe(true); // by-type, params-independent
    expect(defaultRolesForHost('chladni')).toEqual(['edge']);
  });

  it('a motif on a chladni host resolves to edge anchoring and receives the captured hostPaths', () => {
    const { params, hostPaths } = captureChladni();
    const host = { id: 'h1', patternType: 'chladni', params, seed: 7 };
    const motif = {
      id: 'm1',
      type: MOTIF_TYPE,
      patternType: MOTIF_TYPE,
      params: { glyphRef: 'leaf', hostLayerId: 'h1', anchorMode: 'semantic' },
    };
    const out = resolveMotifHostParams(motif, [host, motif], { h1: { hostPaths } });
    expect(out.hostPatternType).toBe('chladni');
    expect(out.anchorMode).toBe('edge'); // forced, overriding the stored 'semantic'
    expect(out.hostPaths).toBe(hostPaths);
    expect(out.hostPaths.length).toBeGreaterThan(0);
  });
});

describe('selecting Chladni as a motif host places glyphs along the nodal lines', () => {
  // Defaults PLUS two off-default mode pairs — a defaults-only case would never
  // exercise a differently shaped field.
  const CASES = [
    ['default modes (m 4, n 3)', {}],
    ['low modes (m 1, n 2)', { m: 1, n: 2 }],
    ['high modes (m 11, n 12)', { m: 11, n: 12 }],
    ['blended pairs (blend 0.5)', { m: 4, n: 3, blend: 0.5, m2: 5, n2: 2 }],
    ['equal first pair rescued by full blend', { m: 4, n: 4, blend: 1, m2: 5, n2: 2 }],
  ];

  for (const [label, overrides] of CASES) {
    it(`${label}: every placed glyph sits on a captured nodal contour`, () => {
      const { params, hostPaths } = captureChladni(overrides);
      expect(hostAvailability('chladni', params).available).toBe(true);
      expect(hostPaths.length).toBeGreaterThan(0);

      const anchors = sampleEdgeAnchors(hostPaths, { spacing: 20 });
      expect(anchors.length).toBeGreaterThan(0);
      expect(anchors.every((a) => a.role === 'edge')).toBe(true);

      // Count ACCEPTED placements, never placementStats.placed (which is the
      // pre-rejection candidate count).
      const { placements } = placeMotifs(anchors, BINDING, {
        canvasW: CANVAS_W,
        canvasH: CANVAS_H,
      });
      expect(placements.length).toBeGreaterThan(0);

      // "Along the nodal lines" — each glyph is an arc-length sample of a
      // captured contour, so it lies within one sampling step of a contour
      // vertex. Chladni's marching-squares vertices are ~cell-sized apart
      // (400/80 = 5px), and an arc-length sample falls between two of them.
      for (const p of placements) {
        expect(distanceToNearestPathVertex(p, hostPaths)).toBeLessThan(10);
      }

      // …and they are genuinely spread over the plate, not piled at one point.
      const xs = placements.map((p) => p.x);
      const ys = placements.map((p) => p.y);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(CANVAS_W / 4);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(CANVAS_H / 4);
    });
  }
});

describe('a blank Chladni plate is genuinely empty, and the gate says so', () => {
  const BLANK_CASES = [
    ['first mode pair equal', { m: 4, n: 4, blend: 0 }],
    ['second mode pair equal at full blend', { m: 4, n: 3, blend: 1, m2: 5, n2: 5 }],
    ['both mode pairs equal at partial blend', { m: 4, n: 4, blend: 0.5, m2: 5, n2: 5 }],
  ];

  for (const [label, overrides] of BLANK_CASES) {
    it(`${label}: capture is empty, no glyph is placed, and hostAvailability reports why`, () => {
      const { params, hostPaths } = captureChladni(overrides);
      expect(hostPaths).toEqual([]);

      const anchors = sampleEdgeAnchors(hostPaths, { spacing: 20 });
      expect(anchors).toEqual([]);
      const { placements } = placeMotifs(anchors, BINDING, {
        canvasW: CANVAS_W,
        canvasH: CANVAS_H,
      });
      expect(placements).toEqual([]);

      const a = hostAvailability('chladni', params);
      expect(a.available).toBe(false);
      expect(a.reason).toBeTruthy();
    });
  }
});
