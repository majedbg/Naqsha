// Vectorizer (S0 — contour trace only, issue #49).
//
// External-behavior tests against synthetic raster fixtures with known ground
// truth: a black square and a black disc on white must vectorize to at least
// one closed contour whose coordinates stay inside the fixture bounds; a blank
// (all-white) image must produce no contours. Implementation (potrace-wasm) is
// deliberately NOT asserted on — only the returned structure, so the tracer
// can be swapped behind the same interface (PRD #48 testing decisions).

import { describe, it, expect } from 'vitest';
import {
  traceContours,
  thresholdImage,
  DEFAULT_CONTOUR_ROLE,
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
