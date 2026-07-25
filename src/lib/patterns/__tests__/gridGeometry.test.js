import { describe, it, expect, vi } from 'vitest';
import { gridLinePositions, gridWarpCurves } from '../gridGeometry.js';
import { ScalarField } from '../../fields/ScalarField.js';
import { catmullRomToBezier } from '../catmullRomBezier.js';
import * as warpModule from '../../fields/warp.js';

// gridLinePositions is the pure, RNG-injected core of Grid's line layout in an
// ORIGIN-CENTERED frame. Contract pinned here:
//   - `distribute` makes count+1 positions spanning [-totalSpan/2, +totalSpan/2].
//   - totalW = cols*spacing, totalH = rows*spacing.
//   - jitter>0 draws ONE rng(-jitter,jitter) per x-position (ascending) THEN per
//     y-position; jitter<=0 draws ZERO and xJittered===xPositions values.

describe('gridLinePositions — layout (no jitter)', () => {
  it('produces count+1 positions per axis with the pinned symmetric footprint', () => {
    const cols = 4;
    const rows = 3;
    const spacing = 40;
    const rng = vi.fn();
    const { xPositions, yPositions, totalW, totalH } = gridLinePositions(
      { cols, rows, spacing, nonLinear: 0, nonLinearGain: 0, jitter: 0 },
      rng
    );
    expect(totalW).toBe(cols * spacing);
    expect(totalH).toBe(rows * spacing);
    expect(xPositions).toHaveLength(cols + 1);
    expect(yPositions).toHaveLength(rows + 1);
    // Symmetric span [-totalSpan/2, +totalSpan/2].
    expect(xPositions[0]).toBeCloseTo(-totalW / 2, 10);
    expect(xPositions[xPositions.length - 1]).toBeCloseTo(totalW / 2, 10);
    expect(yPositions[0]).toBeCloseTo(-totalH / 2, 10);
    expect(yPositions[yPositions.length - 1]).toBeCloseTo(totalH / 2, 10);
  });

  it('spaces default eases (nonLinear=0, gain=0) evenly', () => {
    const cols = 4;
    const spacing = 40;
    const { xPositions } = gridLinePositions(
      { cols, rows: 4, spacing, nonLinear: 0, nonLinearGain: 0, jitter: 0 },
      vi.fn()
    );
    // Evenly spaced ⇒ every consecutive gap equals `spacing`.
    for (let i = 1; i < xPositions.length; i++) {
      expect(xPositions[i] - xPositions[i - 1]).toBeCloseTo(spacing, 10);
    }
  });

  it('with jitter=0: xJittered deep-equals xPositions and rng is NEVER called', () => {
    const rng = vi.fn(() => 999); // would corrupt output if ever invoked
    const { xPositions, yPositions, xJittered, yJittered } = gridLinePositions(
      { cols: 5, rows: 6, spacing: 30, jitter: 0 },
      rng
    );
    expect(xJittered).toEqual(xPositions);
    expect(yJittered).toEqual(yPositions);
    expect(rng).toHaveBeenCalledTimes(0);
  });

  it('treats negative jitter like zero (no rng calls)', () => {
    const rng = vi.fn(() => 1);
    const { xPositions, xJittered } = gridLinePositions(
      { cols: 3, rows: 3, spacing: 20, jitter: -5 },
      rng
    );
    expect(xJittered).toEqual(xPositions);
    expect(rng).toHaveBeenCalledTimes(0);
  });
});

describe('gridLinePositions — jitter RNG contract', () => {
  it('draws exactly (cols+1)+(rows+1) times, x-axis fully before y-axis', () => {
    const cols = 4;
    const rows = 3;
    // Counting spy: returns 0,1,2,... regardless of args, so we can read the
    // exact draw order back out of the jittered positions.
    let n = 0;
    const rng = vi.fn(() => n++);
    const { xPositions, yPositions, xJittered, yJittered } = gridLinePositions(
      { cols, rows, spacing: 40, jitter: 2 },
      rng
    );
    const nX = cols + 1;
    const nY = rows + 1;
    expect(rng).toHaveBeenCalledTimes(nX + nY);

    // Every rng draw was called with the (-jitter, jitter) bounds.
    for (const call of rng.mock.calls) expect(call).toEqual([-2, 2]);

    // x-positions consumed draws 0..nX-1 (ascending), THEN y-positions nX..nX+nY-1.
    for (let i = 0; i < nX; i++) {
      expect(xJittered[i]).toBeCloseTo(xPositions[i] + i, 10);
    }
    for (let j = 0; j < nY; j++) {
      expect(yJittered[j]).toBeCloseTo(yPositions[j] + (nX + j), 10);
    }
  });

  it('applies the jitter offset additively to the base positions', () => {
    const rng = vi.fn(() => 5); // constant offset
    const { xPositions, xJittered } = gridLinePositions(
      { cols: 2, rows: 2, spacing: 10, jitter: 3 },
      rng
    );
    for (let i = 0; i < xJittered.length; i++) {
      expect(xJittered[i]).toBeCloseTo(xPositions[i] + 5, 10);
    }
  });
});

// gridWarpCurves is the shared warp-node build + Catmull-Rom curve core. Given a
// set of straight lines, a warp channel, canvas dims and warpNodes, it returns
// one { nodes, start, segments } curve per line. It is the SINGLE source of the
// warped grid geometry: the renderer paints from it and the extractor
// reconstructs from it. Contract pinned here:
//   - K = clamp(round(warpNodes), 2..24) nodes per line.
//   - Endpoints (k=0, k=K-1) are PINNED to the straight line; interior nodes are
//     displaced by stackWarpDisplacement at unit coords (node.x+cw/2)/cw etc.
//   - The Catmull-Rom curve is catmullRomToBezier(nodes) — full precision, no
//     rounding in the core (formatting is the renderer's job).

const risingField = () =>
  ScalarField.fromFunction((u) => 2 * (u - 0.5), { nx: 65, ny: 65 });

describe('gridWarpCurves — warp-node build + Catmull-Rom core', () => {
  const CW = 800;
  const CH = 600;
  // A vertical line and a horizontal line in the origin-centred frame.
  const lines = [
    { x1: 40, y1: -100, x2: 40, y2: 100 }, // vertical
    { x1: -120, y1: 20, x2: 120, y2: 20 }, // horizontal
  ];

  it('returns one curve per line with K = clamp(round(warpNodes),2..24) nodes', () => {
    const warpMod = { field: risingField(), channel: 'warp', amount: 3 };
    const curves = gridWarpCurves(lines, warpMod, { canvasW: CW, canvasH: CH, warpNodes: 6 });
    expect(curves).toHaveLength(lines.length);
    for (const c of curves) {
      expect(c.nodes).toHaveLength(6);
      expect(c.segments).toHaveLength(6 - 1); // K-1 cubic segments
      expect(c.start).toEqual({ x: c.nodes[0].x, y: c.nodes[0].y });
    }
  });

  it('clamps warpNodes into [2,24] and rounds', () => {
    const warpMod = { field: risingField(), channel: 'warp', amount: 1 };
    expect(gridWarpCurves(lines, warpMod, { canvasW: CW, canvasH: CH, warpNodes: 0 })[0].nodes)
      .toHaveLength(2);
    expect(gridWarpCurves(lines, warpMod, { canvasW: CW, canvasH: CH, warpNodes: 100 })[0].nodes)
      .toHaveLength(24);
    expect(gridWarpCurves(lines, warpMod, { canvasW: CW, canvasH: CH, warpNodes: 5.6 })[0].nodes)
      .toHaveLength(6);
  });

  it('pins endpoints to the straight line (k=0 and k=K-1 undisplaced)', () => {
    const warpMod = { field: risingField(), channel: 'warp', amount: 3 };
    const curves = gridWarpCurves(lines, warpMod, { canvasW: CW, canvasH: CH, warpNodes: 8 });
    curves.forEach((c, i) => {
      const l = lines[i];
      const first = c.nodes[0];
      const last = c.nodes[c.nodes.length - 1];
      expect(first).toEqual({ x: l.x1, y: l.y1 });
      expect(last).toEqual({ x: l.x2, y: l.y2 });
    });
  });

  it('displaces at least one interior node off the straight line', () => {
    const warpMod = { field: risingField(), channel: 'warp', amount: 3 };
    const curves = gridWarpCurves(lines, warpMod, { canvasW: CW, canvasH: CH, warpNodes: 8 });
    let moved = false;
    curves.forEach((c, li) => {
      const l = lines[li];
      c.nodes.forEach((node, k) => {
        if (k === 0 || k === c.nodes.length - 1) return;
        const t = k / (c.nodes.length - 1);
        const ux = l.x1 + (l.x2 - l.x1) * t;
        const uy = l.y1 + (l.y2 - l.y1) * t;
        if (Math.abs(node.x - ux) > 1e-9 || Math.abs(node.y - uy) > 1e-9) moved = true;
      });
    });
    expect(moved).toBe(true);
  });

  it('derives interior displacement SOLELY from stackWarpDisplacement (D2)', () => {
    // Behavioral D2 proof: every interior node's displacement off the straight
    // line equals stackWarpDisplacement(sources, u, v) EXACTLY — no parallel or
    // extra warp math. Recompute the primitive independently and compare.
    const warpMod = { field: risingField(), channel: 'warp', amount: 2 };
    const K = 6;
    const curves = gridWarpCurves(lines, warpMod, { canvasW: CW, canvasH: CH, warpNodes: K });
    curves.forEach((c, li) => {
      const l = lines[li];
      c.nodes.forEach((node, k) => {
        const t = k / (K - 1);
        const sx = l.x1 + (l.x2 - l.x1) * t; // straight node x
        const sy = l.y1 + (l.y2 - l.y1) * t; // straight node y
        if (k === 0 || k === K - 1) {
          expect(node.x).toBe(sx); // pinned — zero displacement
          expect(node.y).toBe(sy);
          return;
        }
        const u = (sx + CW / 2) / CW;
        const v = (sy + CH / 2) / CH;
        const { dx, dy } = warpModule.stackWarpDisplacement([warpMod], u, v);
        expect(node.x).toBe(sx + dx);
        expect(node.y).toBe(sy + dy);
      });
    });
  });

  it('resolves warpMod.sources ?? [warpMod] as the stack source list', () => {
    const single = { field: risingField(), channel: 'warp', amount: 1 };
    // sources absent → the lone warpMod is the source: displacement must equal
    // stackWarpDisplacement([warpMod], …).
    const noSources = gridWarpCurves(lines, single, { canvasW: CW, canvasH: CH, warpNodes: 4 });
    // sources present with the SAME single entry → identical result (proves the
    // core reads `.sources` when present, not the outer object).
    const withSources = gridWarpCurves(
      lines,
      { channel: 'warp', sources: [single] },
      { canvasW: CW, canvasH: CH, warpNodes: 4 },
    );
    expect(withSources.map((c) => c.nodes)).toEqual(noSources.map((c) => c.nodes));
  });

  it('curve equals catmullRomToBezier(nodes) — no rounding in the core', () => {
    const warpMod = { field: risingField(), channel: 'warp', amount: 3 };
    const curves = gridWarpCurves(lines, warpMod, { canvasW: CW, canvasH: CH, warpNodes: 7 });
    for (const c of curves) {
      const expected = catmullRomToBezier(c.nodes);
      expect(c.start).toEqual(expected.start);
      expect(c.segments).toEqual(expected.segments);
    }
  });
});
