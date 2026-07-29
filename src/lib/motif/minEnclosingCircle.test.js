import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { minEnclosingCircle } from './minEnclosingCircle.js';
import { MOTIF_GLYPHS } from './glyphs.js';
import { flattenPathD } from '../plotter/pathOps.js';

// Lifts a function out of a module's source text and evaluates it in its own
// scope. Two things here cannot be reached by importing: the measurement
// script executes and logs at module scope and exports nothing, and `circ3` is
// private by design. Throws rather than using `expect`, because these lifts run
// at describe scope where a failed assertion aborts collection and reports as
// "no tests" instead of as a failing test.
function lift(url, startMark, endMark, name) {
  const src = readFileSync(new URL(url, import.meta.url), 'utf8');
  const start = src.indexOf(startMark);
  const end = endMark === '\n}\n' ? src.indexOf(endMark, start) + 3 : src.indexOf(endMark);
  if (start < 0 || end <= start) {
    throw new Error(`could not lift ${name} from ${url}: markers moved`);
  }
  const block = src.slice(start, end);
  return { fn: new Function(`${block}; return ${name};`)(), block };
}

// The port's source of truth, lifted so the comparison stays honest in both
// directions: edit either copy and this test notices.
function loadScriptWelzl() {
  return lift(
    '../../../scripts/measureGlyphFootprints.mjs',
    '// --- Welzl',
    '// --- convex hull',
    'welzl',
  );
}

// The script's own point-cloud construction, reproduced exactly — same
// tolerance, same push order — so any disagreement is the port's fault and not
// the fixture's.
function glyphPoints(glyph) {
  const out = [];
  for (const p of glyph.paths || []) {
    const { points } = flattenPathD(p.d, 0.05);
    for (const q of points) out.push({ x: q[0], y: q[1] });
  }
  return out;
}

// Deterministic PRNG so the "randomised" clouds are the same clouds on every
// run — a flaky geometry test is worse than no geometry test.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Brute force over every 1-, 2- and 3-point subset. Exponential, so only ever
// run on tiny sets; it is the independent oracle for minimality.
function bruteForceMec(points) {
  const contains = (c) =>
    points.every((p) => Math.hypot(p.x - c.x, p.y - c.y) <= c.r + 1e-9);
  let best = null;
  const consider = (c) => {
    if (!c) return;
    if (!contains(c)) return;
    if (!best || c.r < best.r) best = c;
  };
  const n = points.length;
  for (let i = 0; i < n; i++) {
    consider({ x: points[i].x, y: points[i].y, r: 0 });
    for (let j = i + 1; j < n; j++) {
      const a = points[i];
      const b = points[j];
      consider({
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        r: Math.hypot(a.x - b.x, a.y - b.y) / 2,
      });
      for (let k = j + 1; k < n; k++) {
        const [a2, b2, c2] = [points[i], points[j], points[k]];
        const d =
          2 *
          (a2.x * (b2.y - c2.y) + b2.x * (c2.y - a2.y) + c2.x * (a2.y - b2.y));
        if (Math.abs(d) < 1e-12) continue;
        const s1 = a2.x * a2.x + a2.y * a2.y;
        const s2 = b2.x * b2.x + b2.y * b2.y;
        const s3 = c2.x * c2.x + c2.y * c2.y;
        const ux =
          (s1 * (b2.y - c2.y) + s2 * (c2.y - a2.y) + s3 * (a2.y - b2.y)) / d;
        const uy =
          (s1 * (c2.x - b2.x) + s2 * (a2.x - c2.x) + s3 * (b2.x - a2.x)) / d;
        consider({ x: ux, y: uy, r: Math.hypot(a2.x - ux, a2.y - uy) });
      }
    }
  }
  return best;
}

describe('minEnclosingCircle', () => {
  it('encloses a right triangle with the circle on its hypotenuse', () => {
    const c = minEnclosingCircle([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ]);
    expect(c.x).toBeCloseTo(5, 9);
    expect(c.y).toBeCloseTo(5, 9);
    // The MEC of a right triangle is its circumcircle: the diameter circle on
    // the hypotenuse, half of √200 — not √50/2, which could not span two
    // points 14.14 apart.
    expect(c.r).toBeCloseTo(Math.sqrt(50), 9);
  });

  it('returns null for fewer than one point', () => {
    expect(minEnclosingCircle([])).toBeNull();
  });

  it('collapses to a zero-radius circle at a single point', () => {
    expect(minEnclosingCircle([{ x: 3, y: 4 }])).toEqual({ x: 3, y: 4, r: 0 });
  });

  it('returns the diameter circle for two points', () => {
    const c = minEnclosingCircle([
      { x: 0, y: 0 },
      { x: 6, y: 8 },
    ]);
    expect(c.x).toBeCloseTo(3, 12);
    expect(c.y).toBeCloseTo(4, 12);
    expect(c.r).toBeCloseTo(5, 12);
  });
});

describe('minEnclosingCircle determinism', () => {
  const triangle = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
  ];

  it('returns bit-identical numbers on repeated calls', () => {
    const a = minEnclosingCircle(triangle);
    const b = minEnclosingCircle(triangle);
    expect(Object.is(a.x, b.x)).toBe(true);
    expect(Object.is(a.y, b.y)).toBe(true);
    expect(Object.is(a.r, b.r)).toBe(true);
  });

  it('returns bit-identical numbers for a permuted copy of the same points', () => {
    const a = minEnclosingCircle(triangle);
    for (const perm of [
      [triangle[2], triangle[0], triangle[1]],
      [triangle[1], triangle[2], triangle[0]],
      [triangle[1], triangle[0], triangle[2]],
    ]) {
      const b = minEnclosingCircle(perm);
      expect(Object.is(a.x, b.x)).toBe(true);
      expect(Object.is(a.y, b.y)).toBe(true);
      expect(Object.is(a.r, b.r)).toBe(true);
    }
  });

  it('uses the multiplicative-hash shuffle and never Math.random', () => {
    const src = readFileSync(
      new URL('./minEnclosingCircle.js', import.meta.url),
      'utf8',
    );
    // The expression, not just the constant: the module's comment names the
    // constant too, so a mutated multiplier in the code would slip past a bare
    // substring check.
    expect(src).toContain('(i * 2654435761) % (i + 1)');
    // The call, not the word — the same comment names `Math.random` in order to
    // say it is deliberately not used.
    expect(src).not.toContain('Math.random(');
  });

  it('is stable across many repeated calls on a large cloud', () => {
    const rand = mulberry32(0x5eed);
    const cloud = Array.from({ length: 400 }, () => ({
      x: rand() * 1000 - 500,
      y: rand() * 1000 - 500,
    }));
    const first = minEnclosingCircle(cloud);
    for (let i = 0; i < 20; i++) {
      const again = minEnclosingCircle(cloud);
      expect(Object.is(again.x, first.x)).toBe(true);
      expect(Object.is(again.y, first.y)).toBe(true);
      expect(Object.is(again.r, first.r)).toBe(true);
    }
  });
});

describe('minEnclosingCircle degenerate input', () => {
  it('survives a fully collinear set, where every triple is degenerate', () => {
    // Every three of these are collinear, so the answer must come entirely from
    // the two-point circles: the diameter circle on the two extremes. This
    // pins the public contract (finite, correct) but NOT the guard itself —
    // `inCirc` short-circuits before `circ3` is reached on a set like this, so
    // deleting the guard leaves this assertion passing. See the direct circ3
    // test below for the one that actually exercises the degenerate branch.
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ];
    const c = minEnclosingCircle(line);
    expect(Number.isFinite(c.x)).toBe(true);
    expect(Number.isFinite(c.y)).toBe(true);
    expect(Number.isFinite(c.r)).toBe(true);
    expect(c.x).toBeCloseTo(2, 12);
    expect(c.y).toBeCloseTo(0, 12);
    expect(c.r).toBeCloseTo(2, 12);
  });

  it('handles an axis-aligned rectangle outline, which half the vector library is', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 5 },
      { x: 20, y: 5 },
    ];
    const c = minEnclosingCircle(rect);
    expect(Number.isFinite(c.r)).toBe(true);
    expect(c.x).toBeCloseTo(10, 9);
    expect(c.y).toBeCloseTo(5, 9);
    expect(c.r).toBeCloseTo(Math.hypot(10, 5), 9);
    for (const p of rect) {
      expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeLessThanOrEqual(c.r + 1e-9);
    }
  });

  it('handles duplicate and coincident points', () => {
    const dup = [
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 1 },
    ];
    expect(minEnclosingCircle(dup)).toEqual({ x: 1, y: 1, r: 0 });
  });
});

describe('minEnclosingCircle circ3 degeneracy guard', () => {
  // `circ3` is deliberately private — §5a exports one function and emptyCircle.js
  // sets the precedent of private helpers. But the guard is unobservable through
  // the public API: a NaN circumcircle fails every subsequent `inCirc` test and
  // is overwritten before it can be returned, so removing the guard changes no
  // output across half a million random rectilinear-lattice inputs. Lifting the
  // function textually is what lets the criterion be asserted directly without
  // widening the module's surface for the sake of a test.
  const { fn: circ3, block } = lift(
    './minEnclosingCircle.js',
    'function circ3(',
    '\n}\n',
    'circ3',
  );

  it('keeps the |d| < 1e-12 determinant test', () => {
    expect(block).toContain('Math.abs(d) < 1e-12');
  });

  it('has the caller keep the previous circle rather than adopt the null', () => {
    // The criterion's second clause, and it is invisible at the public API for
    // the same reason the guard is: dropping the `if (t)` assigns c = null on a
    // degenerate triple, and the very next iteration overwrites it before it can
    // be returned. Every behavioural test in this file passes on that mutant.
    const src = readFileSync(
      new URL('./minEnclosingCircle.js', import.meta.url),
      'utf8',
    );
    expect(src).toContain('if (t) c = t;');
  });

  it('returns null rather than dividing by a vanishing determinant', () => {
    const collinear = [
      // horizontal, vertical, slanted, and a coincident pair — every family the
      // rectilinear half of the vector library actually produces
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
      [{ x: 3, y: 0 }, { x: 3, y: 7 }, { x: 3, y: -2 }],
      [{ x: 0, y: 1 }, { x: 2, y: 5 }, { x: -1, y: -1 }],
      [{ x: 4, y: 4 }, { x: 4, y: 4 }, { x: 9, y: 1 }],
    ];
    for (const [a, b, c] of collinear) {
      expect(circ3(a, b, c)).toBeNull();
    }
  });

  it('returns the circumcircle for a non-degenerate triple', () => {
    const c = circ3({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 });
    expect(c.x).toBeCloseTo(5, 12);
    expect(c.y).toBeCloseTo(5, 12);
    expect(c.r).toBeCloseTo(Math.sqrt(50), 12);
  });
});

describe('minEnclosingCircle containment', () => {
  it('contains every point of 50 randomised clouds', () => {
    const rand = mulberry32(0xc0ffee);
    for (let trial = 0; trial < 50; trial++) {
      const n = 2 + Math.floor(rand() * 60);
      const cloud = Array.from({ length: n }, () => ({
        x: rand() * 200 - 100,
        y: rand() * 200 - 100,
      }));
      const c = minEnclosingCircle(cloud);
      for (const p of cloud) {
        expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeLessThanOrEqual(c.r + 1e-9);
      }
    }
  });

  it('contains every point of clouds clustered on a line (near-degenerate)', () => {
    const rand = mulberry32(0xd15ea5e);
    for (let trial = 0; trial < 25; trial++) {
      const n = 3 + Math.floor(rand() * 20);
      const cloud = Array.from({ length: n }, () => {
        const t = rand() * 100;
        return { x: t, y: t * 0.5 + (rand() - 0.5) * 1e-7 };
      });
      const c = minEnclosingCircle(cloud);
      expect(Number.isFinite(c.r)).toBe(true);
      for (const p of cloud) {
        expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeLessThanOrEqual(c.r + 1e-9);
      }
    }
  });
});

describe('minEnclosingCircle minimality', () => {
  it('matches a brute force over all 1-, 2- and 3-point subsets', () => {
    const rand = mulberry32(0xbadc0de);
    for (let trial = 0; trial < 120; trial++) {
      const n = 1 + Math.floor(rand() * 8);
      const cloud = Array.from({ length: n }, () => ({
        x: Math.round(rand() * 40) - 20,
        y: Math.round(rand() * 40) - 20,
      }));
      const got = minEnclosingCircle(cloud);
      const want = bruteForceMec(cloud);
      expect(got.r).toBeCloseTo(want.r, 9);
      expect(got.x).toBeCloseTo(want.x, 8);
      expect(got.y).toBeCloseTo(want.y, 8);
    }
  });
});

describe('minEnclosingCircle against the script it was ported from', () => {
  const { fn: scriptWelzl } = loadScriptWelzl();
  const glyphs = Object.values(MOTIF_GLYPHS);

  it('has the full built-in glyph library to compare against', () => {
    expect(glyphs.length).toBe(62);
  });

  it('agrees bit-for-bit with the script on every real glyph point cloud', () => {
    let compared = 0;
    for (const g of glyphs) {
      const P = glyphPoints(g);
      // Called directly rather than through the script's `< 3 points` and
      // `< 3 hull vertices` skips, so the glyphs its report filtered out are
      // covered here too.
      const mine = minEnclosingCircle(P);
      const theirs = scriptWelzl(P);
      if (theirs === null) {
        expect(mine).toBeNull();
        continue;
      }
      expect(Object.is(mine.x, theirs.x)).toBe(true);
      expect(Object.is(mine.y, theirs.y)).toBe(true);
      expect(Object.is(mine.r, theirs.r)).toBe(true);
      compared++;
    }
    // Exact, not a floor: every one of the 62 must clear the bit-identity bar,
    // so a glyph that flattens to an empty cloud cannot slip out of this test.
    expect(compared).toBe(62);
  });

  it('produces a finite, containing circle for every real glyph', () => {
    for (const g of glyphs) {
      const P = glyphPoints(g);
      const c = minEnclosingCircle(P);
      if (c === null) continue;
      expect(Number.isFinite(c.x)).toBe(true);
      expect(Number.isFinite(c.y)).toBe(true);
      expect(Number.isFinite(c.r)).toBe(true);
      for (const p of P) {
        expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeLessThanOrEqual(c.r + 1e-9);
      }
    }
  });
});

describe('minEnclosingCircle is not on the packing path', () => {
  it('is not imported by placementEngine.js — the packer reads a stored number', () => {
    // §5a: everything downstream of this module is derived data. A production
    // import in the packer would mean it re-measures per placement, which is
    // both wasteful and a second definition of "tight".
    const src = readFileSync(
      new URL('./placementEngine.js', import.meta.url),
      'utf8',
    );
    expect(src).not.toContain('minEnclosingCircle');
  });
});
