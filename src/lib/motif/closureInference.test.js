// Capture-side closure inference (#147, PRD #143 slice 2).
//
// The question this file answers is the maker-facing one: "does a shape that has
// no ends get treated as a shape that has no ends?" Lissajous at damping 0 is a
// mathematically closed figure and a Chladni nodal ring is a topologically closed
// contour, but BOTH terminate their p5 shape bare — `endShape()` with no CLOSE —
// so capture used to report them OPEN. Route's loop/strand scopes then lied about
// what they were filtering and the Zone partitioner invented a seam to flower at.
//
// The fix is on the CAPTURE side: closure is INFERRED from endpoint coincidence
// under an explicit tolerance (see capturePolylines.js). The patterns are not
// touched — what they paint and what they export is unchanged, which is why the
// pattern snapshots in patterns/extras/__tests__/__snapshots__ must stay green
// alongside this file.
//
// So these cases run the REAL patterns through the REAL record-mode probe →
// capturePolylines. On a capture host, capture IS the behaviour under test;
// hand-built geometry would prove nothing about closure of the shipped figures.
// The tolerance itself is unit-pinned on either side in capturePolylines.test.js,
// where synthetic geometry is the right instrument.

import { describe, it, expect } from 'vitest';
import '../registerBuiltinExtras.js'; // registers patterns/extras/* (lissajous, chladni)
import { P5Adapter } from '../patterns/drawingContext.js';
import { capturePolylines } from './capturePolylines.js';
import { sampleEdgeAnchors } from './anchors.js';
import { runSelectionChain } from './chain.js';
import { partitionZones } from './zones.js';
import { getPatternClass } from '../patterns/index.js';
import { getDynamicDefaults } from '../patternRegistry.js';
import { DEFAULT_PARAMS } from '../../constants.js';

const CANVAS_W = 400;
const CANVAS_H = 300;

function fakeP5() {
  const noop = () => () => {};
  return {
    TWO_PI: Math.PI * 2, PI: Math.PI, HALF_PI: Math.PI / 2,
    CLOSE: 'P5_CLOSE', CENTER: 'P5_CENTER', ROUND: 'P5_ROUND',
    randomSeed() {}, noiseSeed() {}, random: () => 0.5, noise: () => 0.5,
    color: () => ({ setAlpha() {} }),
    red: () => 0, green: () => 0, blue: () => 0, map: (v) => v,
    push: noop(), pop: noop(), translate: noop(), rotate: noop(), scale: noop(),
    stroke: noop(), noStroke: noop(), fill: noop(), noFill: noop(),
    strokeWeight: noop(), strokeCap: noop(), rectMode: noop(),
    line: noop(), ellipse: noop(), rect: noop(), triangle: noop(),
    beginShape: noop(), vertex: noop(), endShape: noop(),
  };
}

/** The host's REAL creation-time params (static built-ins, then extras). */
function defaultParamsFor(type) {
  return DEFAULT_PARAMS[type] || getDynamicDefaults(type) || {};
}

/** Run a real host through the real record-mode probe → captured hostPaths. */
function captureHost(type, overrides = {}) {
  const params = { ...defaultParamsFor(type), ...overrides };
  const ctx = new P5Adapter(fakeP5(), { draw: false, record: true });
  new (getPatternClass(type))().generate(ctx, 7, params, CANVAS_W, CANVAS_H, '#000000', 100);
  return capturePolylines(ctx.calls);
}

const countClosed = (paths) => paths.filter((p) => p.closed).length;

// Chladni mode pair whose nodal set contains genuine closed rings. The DEFAULT
// pair (m=4,n=3) is the opposite case — every nodal line runs off the plate edge
// and is genuinely open — so the two live side by side below as the closed and
// open halves of the same criterion.
const CHLADNI_RINGS = { m: 2, n: 6, resolution: 120 };

describe('#147 closure inference — the shipped figures', () => {
  it('lissajous: a mathematically closed figure (damping 0) is reported CLOSED', () => {
    const paths = captureHost('lissajous', { damping: 0 });
    expect(paths).toHaveLength(1);
    expect(paths[0].closed).toBe(true);
  });

  it('lissajous: closure survives the painted frame (start angle + offsets)', () => {
    // The fold applies rotate/translate to both endpoints identically, so a
    // frame transform must never turn a closed figure open. This is the guard
    // against a tolerance stated in the pattern's LOCAL units.
    const paths = captureHost('lissajous', {
      damping: 0, startAngle: 41, offsetX: 23, offsetY: -17,
    });
    expect(paths).toHaveLength(1);
    expect(paths[0].closed).toBe(true);
  });

  it('lissajous: a damped (spiralling) figure is still reported OPEN', () => {
    // damping > 0 is a harmonograph ribbon that decays inward: it genuinely has
    // two ends, 63 px apart at damping 0.01. Reporting it closed would be the
    // false-positive failure mode.
    const paths = captureHost('lissajous', { damping: 0.01 });
    expect(paths).toHaveLength(1);
    expect(paths[0].closed).toBe(false);
  });

  it('chladni: closed nodal rings are reported CLOSED', () => {
    const paths = captureHost('chladni', CHLADNI_RINGS);
    expect(paths.length).toBeGreaterThan(0);
    expect(countClosed(paths)).toBeGreaterThan(0);
  });

  it('chladni: nodal lines that run off the plate edge are still reported OPEN', () => {
    // Default modes (4,3): every contour terminates on the plate boundary.
    const paths = captureHost('chladni', { resolution: 120 });
    expect(paths.length).toBeGreaterThan(0);
    expect(countClosed(paths)).toBe(0);
  });

  it('chladni: the ring plate mixes closed rings and open boundary lines', () => {
    // Non-vacuous both ways on ONE capture: inference must be per path, not a
    // whole-host verdict.
    const paths = captureHost('chladni', CHLADNI_RINGS);
    const closed = countClosed(paths);
    expect(closed).toBeGreaterThan(0);
    expect(paths.length - closed).toBeGreaterThan(0);
  });

  it('chladni: closed rings stay closed under WARP modulation', () => {
    // Chladni warps its FINAL contour vertices. A ring's duplicated endpoint is
    // displaced by the same field sample at both ends, so warp must not open it.
    const field = {
      sampleGradient: (u, v) => ({ dx: Math.sin(u * 6 + v * 4), dy: Math.cos(u * 5 - v * 3) }),
    };
    const modulation = { channel: 'warp', field, amount: 4 };
    const plain = captureHost('chladni', CHLADNI_RINGS);
    const warped = captureHost('chladni', { ...CHLADNI_RINGS, modulation });
    expect(countClosed(plain)).toBeGreaterThan(0);
    expect(countClosed(warped)).toBe(countClosed(plain));
    // Non-vacuous: the guide must actually have moved the geometry, else the
    // equality above is theatre.
    expect(warped.length).toBe(plain.length);
    let maxDisp = 0;
    for (let i = 0; i < plain.length; i++) {
      for (let v = 0; v < plain[i].points.length; v++) {
        maxDisp = Math.max(maxDisp, Math.hypot(
          warped[i].points[v].x - plain[i].points[v].x,
          warped[i].points[v].y - plain[i].points[v].y
        ));
      }
    }
    expect(maxDisp).toBeGreaterThan(1);
  });

  // Out-of-ticket but INTENDED, and pinned here rather than discovered: Chladni's
  // marching-squares stitcher was copied from TopographicContours, so topographic
  // carries the identical defect and the identical (host-agnostic) fix. Its closed
  // iso-contours have an endpoint gap of EXACTLY zero.
  it('topographic: its closed iso-contours flip to CLOSED too (same defect, same fix)', () => {
    const paths = captureHost('topographic');
    expect(paths.length).toBeGreaterThan(0);
    const closed = countClosed(paths);
    expect(closed).toBeGreaterThan(0);
    expect(paths.length - closed).toBeGreaterThan(0); // open contours still open
  });

  it('the other shipped edge hosts are unaffected — no figure flips to closed', () => {
    // flowfield trails, radialetch rays, hilbert's single run and spirograph's
    // curve all have genuinely separated ends. Guards against a tolerance so wide
    // it starts closing ordinary strands.
    for (const type of ['flowfield', 'radialetch', 'hilbert', 'spirograph', 'wave']) {
      const paths = captureHost(type);
      expect(paths.length, `${type} captured nothing`).toBeGreaterThan(0);
      expect(countClosed(paths), `${type} unexpectedly reports closed paths`).toBe(0);
    }
  });
});

describe('#147 closure inference — Route path scope', () => {
  const anchorsFor = (type, overrides) =>
    sampleEdgeAnchors(captureHost(type, overrides), { count: 8 });

  const scoped = (anchors, pathScope) =>
    runSelectionChain(anchors, [{ type: 'route', roles: ['edge'], pathScope }], {
      canvasW: CANVAS_W, canvasH: CANVAS_H,
    }).survivors;

  it('lissajous: the closed figure is IN the loop scope and OUT of the strand scope', () => {
    const anchors = anchorsFor('lissajous', { damping: 0 });
    expect(anchors.length).toBeGreaterThan(0);
    expect(scoped(anchors, 'closed')).toHaveLength(anchors.length);
    expect(scoped(anchors, 'open')).toHaveLength(0);
  });

  it('lissajous: the damped figure is OUT of the loop scope and IN the strand scope', () => {
    const anchors = anchorsFor('lissajous', { damping: 0.01 });
    expect(anchors.length).toBeGreaterThan(0);
    expect(scoped(anchors, 'closed')).toHaveLength(0);
    expect(scoped(anchors, 'open')).toHaveLength(anchors.length);
  });

  it('chladni: the two scopes partition the ring plate, and neither is empty', () => {
    const anchors = anchorsFor('chladni', CHLADNI_RINGS);
    const loops = scoped(anchors, 'closed');
    const strands = scoped(anchors, 'open');
    expect(loops.length).toBeGreaterThan(0);
    expect(strands.length).toBeGreaterThan(0);
    expect(loops.length + strands.length).toBe(anchors.length);
    // Every loop-scope survivor really does come from a closed captured path.
    for (const a of loops) expect(a.meta.closed).toBe(true);
    for (const a of strands) expect(a.meta.closed).toBe(false);
  });
});

describe('#147 closure inference — Zones (a closed path has no Apex)', () => {
  it('lissajous: the closed figure yields NO Apex; the damped one yields exactly two', () => {
    // Asserted as a PAIR so "apex is empty" cannot pass on a partitioner that
    // always returns empty.
    const closedAnchors = sampleEdgeAnchors(captureHost('lissajous', { damping: 0 }), { count: 10 });
    const closedZones = partitionZones(closedAnchors);
    expect(closedZones.apex).toHaveLength(0);
    expect(closedZones.stem).toHaveLength(closedAnchors.length);

    const openAnchors = sampleEdgeAnchors(captureHost('lissajous', { damping: 0.01 }), { count: 10 });
    const openZones = partitionZones(openAnchors);
    expect(openZones.apex).toHaveLength(2); // min-s and max-s traversal ends
    expect(openZones.stem).toHaveLength(openAnchors.length - 2);
  });

  it('chladni: Apex comes only from the OPEN contours of the ring plate', () => {
    const anchors = sampleEdgeAnchors(captureHost('chladni', CHLADNI_RINGS), { count: 6 });
    const { apex, stem } = partitionZones(anchors);
    expect(apex.length).toBeGreaterThan(0); // the open boundary lines still flower
    expect(stem.length).toBeGreaterThan(0);
    // No Apex member sits on a closed ring — that is the invented seam this
    // ticket removes.
    for (const a of apex) expect(a.meta.closed).toBe(false);
    // …and every closed ring contributed at least one Stem member.
    const closedPathIndices = new Set(
      anchors.filter((a) => a.meta.closed).map((a) => a.meta.pathIndex)
    );
    expect(closedPathIndices.size).toBeGreaterThan(0);
    const stemPathIndices = new Set(stem.map((a) => a.meta.pathIndex));
    for (const pi of closedPathIndices) expect(stemPathIndices.has(pi)).toBe(true);
  });
});
