// Vectorizer (S0 contour trace, issue #49; S6 centerline geometry, issue #55).
//
// External-behavior tests against synthetic raster fixtures with known ground
// truth: a black square and a black disc on white must vectorize to at least
// one closed contour whose coordinates stay inside the fixture bounds; a blank
// (all-white) image must produce no contours; line-work must classify as
// centerline strokes while solid shapes stay contours. Implementation
// (potrace, Zhang–Suen) is deliberately NOT asserted on — only the returned
// structure, so the tracers can be swapped behind the same interface (PRD #48
// testing decisions).

import { describe, it, expect } from 'vitest';
import {
  traceContours,
  vectorize,
  thresholdImage,
  DEFAULT_CONTOUR_ROLE,
  DEFAULT_STROKE_ROLE,
} from './vectorizer';

// --- synthetic fixtures (RGBA buffers, no canvas/DOM needed) ---------------

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

const square = () =>
  makeImage(60, 60, (x, y) => x >= 20 && x < 40 && y >= 20 && y < 40);
const disc = () =>
  makeImage(80, 80, (x, y) => (x - 40) ** 2 + (y - 40) ** 2 <= 18 ** 2);
const blank = () => makeImage(40, 40, () => false);

// Walk a path `d` string and return every ABSOLUTE on-path point it visits
// (relative deltas are legitimately negative, so raw-number checks would lie).
function absolutePointsIn(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+/g) || [];
  const pts = [];
  let x = 0;
  let y = 0;
  let cmd = null;
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case 'M': case 'L': x = num(); y = num(); break;
      case 'm': case 'l': x += num(); y += num(); break;
      case 'H': x = num(); break;
      case 'h': x += num(); break;
      case 'V': y = num(); break;
      case 'v': y += num(); break;
      case 'C': i += 4; x = num(); y = num(); break;
      case 'c': i += 4; x += num(); y += num(); break;
      case 'Z': case 'z': break;
      default: throw new Error(`unexpected command ${cmd} in ${d}`);
    }
    if (cmd !== 'Z' && cmd !== 'z') pts.push([x, y]);
  }
  return pts;
}

describe('traceContours (contour trace on synthetic fixtures)', () => {
  it('traces a black square to at least one closed contour path', async () => {
    const { fills, strokes } = await traceContours(square());
    expect(strokes).toEqual([]); // S0 ships contour-trace only
    expect(fills.length).toBeGreaterThanOrEqual(1);
    for (const f of fills) {
      expect(f.d).toMatch(/^M/);
      expect(f.d.toLowerCase()).toContain('z'); // closed contour
    }
  });

  it('keeps traced coordinates within the fixture bounds', async () => {
    const { fills } = await traceContours(square());
    const pts = fills.flatMap((f) => absolutePointsIn(f.d));
    expect(pts.length).toBeGreaterThan(0);
    // Traced geometry stays inside the 60×60 fixture (small tolerance for
    // rounding), and roughly hugs the known 20..40 square.
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(18);
      expect(x).toBeLessThanOrEqual(42);
      expect(y).toBeGreaterThanOrEqual(18);
      expect(y).toBeLessThanOrEqual(42);
    }
  });

  it('traces a disc and tags every contour with the default engrave role', async () => {
    const { fills } = await traceContours(disc());
    expect(fills.length).toBeGreaterThanOrEqual(1);
    for (const f of fills) expect(f.role).toBe(DEFAULT_CONTOUR_ROLE);
    expect(DEFAULT_CONTOUR_ROLE).toBe('engrave');
  });

  it('accepts an explicit fabrication role for the traced contours', async () => {
    const { fills } = await traceContours(square(), { role: 'cut' });
    for (const f of fills) expect(f.role).toBe('cut');
  });

  it('returns no contours for a blank image', async () => {
    const { fills } = await traceContours(blank());
    expect(fills).toEqual([]);
  });

  // Regression (browser-verify find): the potrace-wasm builds hard-failed on
  // anything larger than ~127×127 (emscripten stack marshaling). Real photo
  // crops are far bigger — the tracer must handle them.
  it('traces a real-photo-sized image (600×600)', async () => {
    const big = makeImage(
      600,
      600,
      (x, y) => (x - 300) ** 2 + (y - 300) ** 2 <= 150 ** 2
    );
    const { fills } = await traceContours(big);
    expect(fills.length).toBeGreaterThanOrEqual(1);
    expect(fills[0].d).toMatch(/^M/);
  });

  it('keeps holes attached to their component (donut → one evenodd fill)', async () => {
    const donut = makeImage(100, 100, (x, y) => {
      const r2 = (x - 50) ** 2 + (y - 50) ** 2;
      return r2 <= 35 ** 2 && r2 >= 15 ** 2;
    });
    const { fills } = await traceContours(donut);
    expect(fills).toHaveLength(1);
    // Two subpaths (outer + hole) in one d.
    expect(fills[0].d.match(/M/g).length).toBe(2);
  });
});

// S6 regression — the bbox-containment caveat flagged in S0 review: a motif
// whose bounds sit inside another's BBOX but whose geometry is OUTSIDE it
// must stay a separate, independently role-taggable component.
describe('traceContours — component grouping is geometric, not bbox', () => {
  it('keeps a dot in a C-shape\'s concavity separate (bbox overlaps, ink does not)', async () => {
    // C-shape occupying bbox 10..50 × 10..50 with an open right side; the dot
    // at (38, 30) is inside that bbox but NOT inside the C's ink.
    const img = makeImage(60, 60, (x, y) => {
      const inC =
        x >= 10 && x < 50 && y >= 10 && y < 50 &&
        !(x >= 20 && y >= 20 && y < 40); // carve the concavity open to the right
      const inDot = (x - 38) ** 2 + (y - 30) ** 2 <= 4 ** 2;
      return inC || inDot;
    });
    const { fills } = await traceContours(img);
    expect(fills).toHaveLength(2);
  });

  it('keeps an island inside a donut hole separate from the donut', async () => {
    const img = makeImage(100, 100, (x, y) => {
      const r2 = (x - 50) ** 2 + (y - 50) ** 2;
      const donut = r2 <= 35 ** 2 && r2 >= 20 ** 2;
      const island = r2 <= 8 ** 2;
      return donut || island;
    });
    const { fills } = await traceContours(img);
    // Donut (outer + hole subpaths) and the island as its own component.
    expect(fills).toHaveLength(2);
    const subpathCounts = fills.map((f) => f.d.match(/M/g).length).sort();
    expect(subpathCounts).toEqual([1, 2]);
  });
});

// --- S6: vectorize — centerline strokes + contours, classified per motif ----

const hLine = () =>
  makeImage(80, 60, (x, y) => x >= 10 && x < 70 && y >= 29 && y <= 31);

describe('vectorize (S6 — both representations, centerline-default)', () => {
  it('extracts line-work as a single centerline stroke tagged score', async () => {
    const { fills, strokes, components } = await vectorize(hLine());
    expect(fills).toEqual([]);
    expect(strokes).toHaveLength(1);
    expect(strokes[0].role).toBe(DEFAULT_STROKE_ROLE);
    expect(DEFAULT_STROKE_ROLE).toBe('score');
    // SINGLE centerline path — one M, open (no doubled outline).
    expect(strokes[0].d.match(/M/g)).toHaveLength(1);
    expect(strokes[0].d).not.toMatch(/[Zz]/);
    // Both representations are carried for the Review flip.
    expect(components).toHaveLength(1);
    expect(components[0].kind).toBe('stroke');
    expect(components[0].centerline.d).toBe(strokes[0].d);
    expect(components[0].contour.d).toMatch(/^M/);
    expect(components[0].contour.d).toMatch(/Z$/);
  });

  it('keeps solid shapes as closed contours tagged engrave', async () => {
    const { fills, strokes, components } = await vectorize(square());
    expect(strokes).toEqual([]);
    expect(fills).toHaveLength(1);
    expect(fills[0].role).toBe(DEFAULT_CONTOUR_ROLE);
    expect(components[0].kind).toBe('fill');
    expect(fills[0].d).toBe(components[0].contour.d);
  });

  it('classifies a mixed image per motif (one stroke + one fill)', async () => {
    // A 3px line beside a solid square, not touching.
    const img = makeImage(120, 60, (x, y) => {
      const line = x >= 10 && x < 70 && y >= 29 && y <= 31;
      const solid = x >= 85 && x < 110 && y >= 15 && y < 40;
      return line || solid;
    });
    const { fills, strokes, components } = await vectorize(img);
    expect(strokes).toHaveLength(1);
    expect(fills).toHaveLength(1);
    expect(components.map((c) => c.kind).sort()).toEqual(['fill', 'stroke']);
  });

  it('extracts a circle outline (ring stroke) as one closed centerline loop', async () => {
    const ring = makeImage(80, 80, (x, y) => {
      const r = Math.hypot(x - 40, y - 40);
      return r >= 18.5 && r <= 21.5;
    });
    const { strokes } = await vectorize(ring);
    expect(strokes).toHaveLength(1);
    expect(strokes[0].d.match(/M/g)).toHaveLength(1);
    expect(strokes[0].d).toMatch(/Z$/); // loop closes
  });

  it('falls back to the contour when the skeleton is degenerate (floor)', async () => {
    const dot = makeImage(20, 20, (x, y) => Math.hypot(x - 10, y - 10) <= 2);
    const { fills, strokes, components } = await vectorize(dot, {
      turdsize: 1,
      minCenterlineLength: 4,
    });
    expect(strokes).toEqual([]);
    expect(fills).toHaveLength(1); // never a dead end
    expect(components[0].kind).toBe('fill');
    expect(components[0].centerline).toBeNull();
  });

  it('returns nothing for a blank image', async () => {
    const { fills, strokes, components } = await vectorize(blank());
    expect(fills).toEqual([]);
    expect(strokes).toEqual([]);
    expect(components).toEqual([]);
  });

  it('honors explicit role overrides for both kinds', async () => {
    const img = makeImage(120, 60, (x, y) => {
      const line = x >= 10 && x < 70 && y >= 29 && y <= 31;
      const solid = x >= 85 && x < 110 && y >= 15 && y < 40;
      return line || solid;
    });
    const { fills, strokes } = await vectorize(img, { fillRole: 'cut', strokeRole: 'cut' });
    expect(fills[0].role).toBe('cut');
    expect(strokes[0].role).toBe('cut');
  });
});

describe('thresholdImage', () => {
  it('binarizes to pure black/white with opaque alpha', () => {
    const img = makeImage(4, 1, (x) => x < 2);
    // Introduce grays: one just under, one just over the default threshold.
    img.data.set([100, 100, 100, 255], 4); // dark gray → ink
    img.data.set([200, 200, 200, 255], 8); // light gray → paper
    const bw = thresholdImage(img);
    expect(bw.width).toBe(4);
    expect(bw.height).toBe(1);
    expect([bw.data[0], bw.data[1], bw.data[2], bw.data[3]]).toEqual([0, 0, 0, 255]);
    expect([bw.data[4], bw.data[5], bw.data[6], bw.data[7]]).toEqual([0, 0, 0, 255]);
    expect([bw.data[8], bw.data[9], bw.data[10], bw.data[11]]).toEqual([255, 255, 255, 255]);
    expect([bw.data[12], bw.data[13], bw.data[14], bw.data[15]]).toEqual([255, 255, 255, 255]);
  });

  it('treats transparent pixels as paper, not ink', () => {
    const img = makeImage(2, 1, () => true);
    img.data[7] = 0; // second pixel fully transparent (but black RGB)
    const bw = thresholdImage(img);
    expect(bw.data[0]).toBe(0); // opaque black stays ink
    expect(bw.data[4]).toBe(255); // transparent black becomes paper
  });
});
