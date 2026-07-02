// Centerline extraction (S6, issue #55) — skeleton correctness on synthetic
// stroke fixtures with known ground-truth topology. External behavior only:
// polyline counts, endpoint counts, open/closed, and geometric position — not
// the thinning algorithm's internals (PRD #48 testing decisions).

import { describe, it, expect } from 'vitest';
import {
  skeletonize,
  traceSkeleton,
  simplifyPolyline,
  pathFromPolyline,
  extractCenterlines,
} from './centerline';

// --- synthetic fixtures (RGBA buffers; 0 = ink, 255 = paper) ----------------

function makeImage(width, height, isInk) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = isInk(x, y) ? 0 : 255;
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

// Horizontal 3px-thick stroke, y centered on 30.
const hLine = () => makeImage(80, 60, (x, y) => x >= 10 && x < 70 && y >= 29 && y <= 31);

// Plus/cross: two 3px strokes crossing at (40, 30).
const cross = () =>
  makeImage(80, 60, (x, y) =>
    (x >= 10 && x < 70 && y >= 29 && y <= 31) ||
    (y >= 10 && y < 50 && x >= 39 && x <= 41)
  );

// Circle ring: 3px-wide annulus, radius 20, centered (40, 40).
const ring = () =>
  makeImage(80, 80, (x, y) => {
    const r = Math.hypot(x - 40, y - 40);
    return r >= 18.5 && r <= 21.5;
  });

// Archimedean spiral stroke, ~2.5 turns, 3px wide.
const spiral = () =>
  makeImage(120, 120, (x, y) => {
    const dx = x - 60;
    const dy = y - 60;
    const r = Math.hypot(dx, dy);
    if (r < 2 || r > 52) return false;
    let theta = Math.atan2(dy, dx);
    // r = 3 + 3.2 * (theta + 2πk): ink where some k puts the spiral within 1.5px.
    for (let k = 0; k < 4; k++) {
      const rs = 3 + 3.2 * (theta + 2 * Math.PI * k);
      if (Math.abs(r - rs) <= 1.5) return true;
    }
    return false;
  });

// Solid filled blob (disc r=18).
const blob = () => makeImage(60, 60, (x, y) => Math.hypot(x - 30, y - 30) <= 18);

const skeletonPixels = (mask) => {
  let n = 0;
  for (const v of mask) n += v;
  return n;
};

describe('skeletonize (Zhang–Suen thinning)', () => {
  it('thins a 3px line to a ~1px skeleton along the line center', () => {
    const bw = hLine();
    const mask = skeletonize(bw);
    const n = skeletonPixels(mask);
    // ~60px-long stroke → skeleton close to its length, nowhere near its area (180).
    expect(n).toBeGreaterThan(40);
    expect(n).toBeLessThan(75);
    // Every skeleton pixel sits on the stroke's center row (±1).
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const y = Math.floor(i / bw.width);
      expect(Math.abs(y - 30)).toBeLessThanOrEqual(1);
    }
  });

  it('reduces a solid blob to a degenerate skeleton (far smaller than its area)', () => {
    const bw = blob();
    const area = Math.PI * 18 * 18;
    const n = skeletonPixels(skeletonize(bw));
    expect(n).toBeLessThan(area / 8);
  });
});

describe('traceSkeleton (skeleton graph → polylines)', () => {
  it('traces a line skeleton to one open polyline with two endpoints', () => {
    const bw = hLine();
    const polys = traceSkeleton(skeletonize(bw), bw.width, bw.height);
    expect(polys).toHaveLength(1);
    expect(polys[0].closed).toBe(false);
    const pts = polys[0].points;
    const xs = pts.map(([x]) => x);
    // Spans (most of) the stroke, ordered end to end.
    expect(Math.min(...xs)).toBeLessThan(16);
    expect(Math.max(...xs)).toBeGreaterThan(64);
    for (const [, y] of pts) expect(Math.abs(y - 30.5)).toBeLessThanOrEqual(1.5);
  });

  it('traces a cross to branches meeting at the junction (4 arm endpoints)', () => {
    const bw = cross();
    const polys = traceSkeleton(skeletonize(bw), bw.width, bw.height);
    // Thinning may wobble at the junction, but the topology must hold:
    // every branch is open, and the 4 arm tips survive as polyline ends.
    expect(polys.length).toBeGreaterThanOrEqual(2);
    expect(polys.length).toBeLessThanOrEqual(6);
    for (const p of polys) expect(p.closed).toBe(false);
    const ends = polys.flatMap((p) => [p.points[0], p.points[p.points.length - 1]]);
    const nearTip = (tx, ty) =>
      ends.some(([x, y]) => Math.hypot(x - tx, y - ty) <= 4);
    expect(nearTip(10.5, 30.5)).toBe(true); // west
    expect(nearTip(69.5, 30.5)).toBe(true); // east
    expect(nearTip(40.5, 10.5)).toBe(true); // north
    expect(nearTip(40.5, 49.5)).toBe(true); // south
  });

  it('traces a ring skeleton to one closed loop at the annulus center radius', () => {
    const bw = ring();
    const polys = traceSkeleton(skeletonize(bw), bw.width, bw.height);
    expect(polys).toHaveLength(1);
    expect(polys[0].closed).toBe(true);
    for (const [x, y] of polys[0].points) {
      expect(Math.hypot(x - 40.5, y - 40.5)).toBeGreaterThan(17);
      expect(Math.hypot(x - 40.5, y - 40.5)).toBeLessThan(23);
    }
  });

  it('traces a spiral stroke to one long open polyline (2 endpoints)', () => {
    const bw = spiral();
    const { polylines } = extractCenterlines(bw, { minLength: 10 });
    expect(polylines).toHaveLength(1);
    expect(polylines[0].closed).toBe(false);
    // A 2.5-turn spiral of max radius ~52 is far longer than any chord.
    let len = 0;
    const pts = polylines[0].points;
    for (let i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    expect(len).toBeGreaterThan(200);
  });
});

describe('simplifyPolyline (Ramer–Douglas–Peucker)', () => {
  it('collapses collinear points to the two endpoints', () => {
    const pts = Array.from({ length: 50 }, (_, i) => [i, 10]);
    expect(simplifyPolyline(pts, 1)).toEqual([[0, 10], [49, 10]]);
  });

  it('keeps corners that exceed the tolerance', () => {
    const pts = [
      ...Array.from({ length: 20 }, (_, i) => [i, 0]),
      ...Array.from({ length: 20 }, (_, i) => [19, i]),
    ];
    const out = simplifyPolyline(pts, 1);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual([0, 0]);
    expect(out[1]).toEqual([19, 0]); // the corner survives
    expect(out[2]).toEqual([19, 19]);
  });

  it('drops noise within the tolerance', () => {
    const pts = Array.from({ length: 30 }, (_, i) => [i, i % 2 === 0 ? 0 : 0.4]);
    expect(simplifyPolyline(pts, 0.5)).toHaveLength(2);
  });

  it('never collapses a closed loop below a polygon', () => {
    const pts = Array.from({ length: 64 }, (_, i) => {
      const t = (i / 64) * 2 * Math.PI;
      return [40 + 20 * Math.cos(t), 40 + 20 * Math.sin(t)];
    });
    const out = simplifyPolyline(pts, 1, true);
    expect(out.length).toBeGreaterThanOrEqual(6);
  });
});

describe('pathFromPolyline', () => {
  it('emits absolute M/L data, Z only when closed', () => {
    expect(pathFromPolyline({ points: [[1, 2], [3.456, 4]], closed: false })).toBe(
      'M1 2 L3.46 4'
    );
    expect(pathFromPolyline({ points: [[0, 0], [10, 0], [10, 10]], closed: true })).toBe(
      'M0 0 L10 0 L10 10 Z'
    );
  });
});

describe('extractCenterlines (composed)', () => {
  it('line → one simplified open centerline whose d is a single path', () => {
    const { polylines, length } = extractCenterlines(hLine());
    expect(polylines).toHaveLength(1);
    // RDP flattens a straight skeleton to very few points.
    expect(polylines[0].points.length).toBeLessThanOrEqual(6);
    expect(length).toBeGreaterThan(40);
    const d = pathFromPolyline(polylines[0]);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d).not.toMatch(/Z/);
  });

  it('discards sub-minLength fragments (degenerate skeleton → empty)', () => {
    const dot = makeImage(20, 20, (x, y) => Math.hypot(x - 10, y - 10) <= 1.2);
    const { polylines } = extractCenterlines(dot, { minLength: 4 });
    expect(polylines).toEqual([]);
  });
});
