import { describe, it, expect } from 'vitest';
import { placementMatrix, applyMatrix, matrixToSVG } from './instancing.js';

const V = 5; // arbitrary viewRadius shared across cases

describe('placementMatrix + applyMatrix', () => {
  it('identity: no rotation/translation, radius === viewRadius', () => {
    const placement = { x: 0, y: 0, rotation: 0, radius: V, flip: false };
    const m = placementMatrix(placement, V);
    expect(applyMatrix({ x: 1, y: 0 }, m).x).toBeCloseTo(1, 9);
    expect(applyMatrix({ x: 1, y: 0 }, m).y).toBeCloseTo(0, 9);
    expect(applyMatrix({ x: 0, y: 1 }, m).x).toBeCloseTo(0, 9);
    expect(applyMatrix({ x: 0, y: 1 }, m).y).toBeCloseTo(1, 9);
  });

  it('translate: origin moves to placement.x/y, other points shift by the same delta', () => {
    const placement = { x: 10, y: 20, rotation: 0, radius: V, flip: false };
    const m = placementMatrix(placement, V);
    const origin = applyMatrix({ x: 0, y: 0 }, m);
    expect(origin.x).toBeCloseTo(10, 9);
    expect(origin.y).toBeCloseTo(20, 9);
    const p = applyMatrix({ x: 1, y: 0 }, m);
    expect(p.x).toBeCloseTo(11, 9);
    expect(p.y).toBeCloseTo(20, 9);
  });

  it('scale: radius = 2*viewRadius doubles distances from the placement origin', () => {
    const placement = { x: 0, y: 0, rotation: 0, radius: 2 * V, flip: false };
    const m = placementMatrix(placement, V);
    const p = applyMatrix({ x: 1, y: 0 }, m);
    expect(p.x).toBeCloseTo(2, 9);
    expect(p.y).toBeCloseTo(0, 9);
  });

  it('rotate 90 degrees (CCW-positive, math convention) at the origin', () => {
    const placement = { x: 0, y: 0, rotation: 90, radius: V, flip: false };
    const m = placementMatrix(placement, V);
    const p1 = applyMatrix({ x: 1, y: 0 }, m);
    expect(p1.x).toBeCloseTo(0, 9);
    expect(p1.y).toBeCloseTo(1, 9);
    const p2 = applyMatrix({ x: 0, y: 1 }, m);
    expect(p2.x).toBeCloseTo(-1, 9);
    expect(p2.y).toBeCloseTo(0, 9);
  });

  it('flip only: x is negated, y is unchanged', () => {
    const placement = { x: 0, y: 0, rotation: 0, radius: V, flip: true };
    const m = placementMatrix(placement, V);
    const p1 = applyMatrix({ x: 1, y: 0 }, m);
    expect(p1.x).toBeCloseTo(-1, 9);
    expect(p1.y).toBeCloseTo(0, 9);
    const p2 = applyMatrix({ x: 0, y: 1 }, m);
    expect(p2.x).toBeCloseTo(0, 9);
    expect(p2.y).toBeCloseTo(1, 9);
  });

  it('flip + rotate combined: flip folds into scale BEFORE rotation is applied', () => {
    // Concrete case: flip (x -> -x) then rotate 90 deg (CCW). Point (1,0):
    //   after flip-as-scale: (-1, 0)
    //   after rotating 90 CCW: (0, -1)
    const placement = { x: 0, y: 0, rotation: 90, radius: V, flip: true };
    const m = placementMatrix(placement, V);
    const p = applyMatrix({ x: 1, y: 0 }, m);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(-1, 9);

    // Contrast: if rotation were applied BEFORE flip (rotate then negate x),
    // (1,0) --rotate90--> (0,1) --flip x--> (0,1) — a DIFFERENT result. This
    // confirms the compose order (flip-in-scale happens first) is observed.
    expect(p.y).not.toBeCloseTo(1, 9);
  });
});

describe('matrixToSVG', () => {
  it('formats the identity-ish translate matrix exactly', () => {
    expect(matrixToSVG([1, 0, 0, 1, 10, 20])).toBe('matrix(1 0 0 1 10 20)');
  });

  it('formats a rotated matrix without exponential notation and trims float noise', () => {
    const placement = { x: 0, y: 0, rotation: 90, radius: V, flip: false };
    const m = placementMatrix(placement, V);
    const svg = matrixToSVG(m);
    expect(svg.startsWith('matrix(')).toBe(true);
    expect(svg).not.toMatch(/e[-+]?\d/i);
    // cos(90deg) ~ 6.12e-17 should round away to a clean 0, sin(90deg) -> 1.
    expect(svg).toBe('matrix(0 1 -1 0 0 0)');
  });
});

describe('placementMatrix root: non-zero root maps LOCAL root point + growth axis', () => {
  it('the local root point (root.x,root.y) lands exactly on (placement.x,placement.y)', () => {
    // radius === viewRadius ⇒ s=1, no rotation, no flip. root=(2,3). The matrix
    // must pre-translate the root to the origin so it re-lands on the anchor.
    const placement = { x: 100, y: 50, rotation: 0, radius: V, flip: false };
    const root = { x: 2, y: 3, angle: 0 };
    const m = placementMatrix(placement, V, root);
    const landed = applyMatrix({ x: root.x, y: root.y }, m);
    expect(landed.x).toBeCloseTo(100, 9);
    expect(landed.y).toBeCloseTo(50, 9);
  });

  it('the growth axis (local angle root.angle) aligns to placement.rotation', () => {
    // placement rotation = 90°, root.angle = 30°, root at local origin, s=1.
    // The local growth vector (cos30,sin30) must map to world direction 90°,
    // i.e. straight up (0, +1) — NOT (0,-1) (wrong-sign R(+angle) ⇒ 150° ⇒ x<0).
    const placement = { x: 0, y: 0, rotation: 90, radius: V, flip: false };
    const root = { x: 0, y: 0, angle: 30 };
    const m = placementMatrix(placement, V, root);
    const a = 30 * (Math.PI / 180);
    const base = applyMatrix({ x: 0, y: 0 }, m);
    const tip = applyMatrix({ x: Math.cos(a), y: Math.sin(a) }, m);
    const dir = { x: tip.x - base.x, y: tip.y - base.y };
    expect(dir.x).toBeCloseTo(0, 9); // discriminates wrong-sign rotation
    expect(dir.y).toBeCloseTo(1, 9); // both x≈0 AND y>0 required
  });

  it('flip does NOT corrupt the root pre-translate: rooted point still lands on the anchor', () => {
    // flip folds into the core scale (sx) and must stay OUT of the root turn.
    // With flip=true the root point (2,3) must STILL map onto (100,50).
    const placement = { x: 100, y: 50, rotation: 0, radius: V, flip: true };
    const root = { x: 2, y: 3, angle: 0 };
    const m = placementMatrix(placement, V, root);
    const landed = applyMatrix({ x: root.x, y: root.y }, m);
    expect(landed.x).toBeCloseTo(100, 9);
    expect(landed.y).toBeCloseTo(50, 9);
    // And the transform is a genuine mirror (flip survived): det < 0.
    const det = m[0] * m[3] - m[1] * m[2];
    expect(det).toBeLessThan(0);
  });
});

// FROZEN copy of the pre-root formula (as of the WI-2 characterization). This is
// the reference the identity/default-root case must match BYTE-FOR-BYTE — it is
// intentionally NOT `placementMatrix` itself (that would be circular).
function oldMatrix(placement, viewRadius) {
  const s = placement.radius / viewRadius;
  const sx = s * (placement.flip ? -1 : 1);
  const sy = s;
  const theta = (placement.rotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return [cos * sx, sin * sx, -sin * sy, cos * sy, placement.x, placement.y];
}

describe('placementMatrix root: default/absent is byte-identical to the pre-root formula', () => {
  const cases = [
    { name: 'identity', p: { x: 0, y: 0, rotation: 0, radius: V, flip: false } },
    { name: 'translate', p: { x: 10, y: 20, rotation: 0, radius: V, flip: false } },
    { name: 'non-zero rotation', p: { x: 3, y: -7, rotation: 37, radius: 8, flip: false } },
    { name: 'flip=true', p: { x: 0, y: 0, rotation: 0, radius: V, flip: true } },
    { name: 'flip + rotation', p: { x: -4, y: 9, rotation: 123, radius: 2 * V, flip: true } },
    { name: 'small radius', p: { x: 1, y: 1, rotation: 15, radius: 0.5, flip: false } },
    { name: 'large radius', p: { x: 500, y: 300, rotation: -66, radius: 250, flip: true } },
  ];
  it.each(cases)('$name: absent root ⇒ exact same [a,b,c,d,e,f]', ({ p }) => {
    expect(placementMatrix(p, V)).toEqual(oldMatrix(p, V));
  });
  it.each(cases)('$name: explicit {0,0,0} root ⇒ exact same [a,b,c,d,e,f]', ({ p }) => {
    expect(placementMatrix(p, V, { x: 0, y: 0, angle: 0 })).toEqual(oldMatrix(p, V));
  });
});

describe('determinism', () => {
  it('placementMatrix + applyMatrix are pure: identical inputs produce toEqual outputs', () => {
    const placement = { x: 3, y: -7, rotation: 37, radius: 8, flip: true };
    const m1 = placementMatrix(placement, V);
    const m2 = placementMatrix(placement, V);
    expect(m1).toEqual(m2);

    const p1 = applyMatrix({ x: 2, y: -1 }, m1);
    const p2 = applyMatrix({ x: 2, y: -1 }, m2);
    expect(p1).toEqual(p2);
  });
});
