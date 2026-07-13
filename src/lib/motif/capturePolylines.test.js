import { describe, it, expect } from 'vitest';
import { capturePolylines } from './capturePolylines.js';

// Helper: assert a point is close to (x,y) (folded float math).
function near(pt, x, y) {
  expect(pt.x).toBeCloseTo(x, 9);
  expect(pt.y).toBeCloseTo(y, 9);
}

describe('capturePolylines', () => {
  it('turns a bare line into a 2-point open polyline in absolute coords', () => {
    const paths = capturePolylines([{ op: 'line', args: [1, 2, 3, 4] }]);
    expect(paths).toHaveLength(1);
    expect(paths[0].closed).toBe(false);
    expect(paths[0].points).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });

  it('turns beginShape/vertex/endShape into one polyline; endShape arg ⇒ closed', () => {
    const open = capturePolylines([
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [0, 0] },
      { op: 'vertex', args: [10, 0] },
      { op: 'vertex', args: [10, 10] },
      { op: 'endShape', args: [] },
    ]);
    expect(open).toHaveLength(1);
    expect(open[0].closed).toBe(false);
    expect(open[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);

    const closed = capturePolylines([
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [0, 0] },
      { op: 'vertex', args: [10, 0] },
      { op: 'vertex', args: [10, 10] },
      { op: 'endShape', args: ['close'] }, // any non-null first arg (p5 CLOSE) ⇒ closed
    ]);
    expect(closed[0].closed).toBe(true);
  });

  it('folds translate → absolute coords', () => {
    const paths = capturePolylines([
      { op: 'translate', args: [100, 50] },
      { op: 'line', args: [0, 0, 5, 0] },
    ]);
    expect(paths[0].points).toEqual([
      { x: 100, y: 50 },
      { x: 105, y: 50 },
    ]);
  });

  it('folds translate THEN rotate in the correct order (the transpose/order trap)', () => {
    // translate(10,0); rotate(90°); vertex(5,0) must land at (10,5),
    // NOT (15,0) (order swapped) and NOT (10,-5) (rotation transposed).
    const paths = capturePolylines([
      { op: 'translate', args: [10, 0] },
      { op: 'rotate', args: [Math.PI / 2] },
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [5, 0] },
      { op: 'vertex', args: [0, 0] },
      { op: 'endShape', args: [] },
    ]);
    near(paths[0].points[0], 10, 5);
    near(paths[0].points[1], 10, 0);
  });

  it('folds scale (uniform and non-uniform)', () => {
    const uni = capturePolylines([
      { op: 'scale', args: [2] },
      { op: 'line', args: [1, 1, 3, 4] },
    ]);
    expect(uni[0].points).toEqual([
      { x: 2, y: 2 },
      { x: 6, y: 8 },
    ]);
    const non = capturePolylines([
      { op: 'scale', args: [2, 3] },
      { op: 'line', args: [1, 1, 0, 0] },
    ]);
    expect(non[0].points).toEqual([
      { x: 2, y: 3 },
      { x: 0, y: 0 },
    ]);
  });

  it('push/pop isolates transforms (nested); a full T·R·S fixture', () => {
    const paths = capturePolylines([
      { op: 'translate', args: [100, 100] },
      { op: 'push', args: [] },
      { op: 'rotate', args: [Math.PI / 2] }, // 90°
      { op: 'scale', args: [2] },
      { op: 'line', args: [1, 0, 0, 1] }, // inside push
      { op: 'pop', args: [] },
      // after pop, only translate(100,100) remains
      { op: 'line', args: [0, 0, 5, 0] },
    ]);
    // inside push: point (1,0) → scale2 → (2,0) → rot90 → (0,2) → +T(100,100) = (100,102)
    //             point (0,1) → scale2 → (0,2) → rot90 → (-2,0) → +T = (98,100)
    near(paths[0].points[0], 100, 102);
    near(paths[0].points[1], 98, 100);
    // after pop: translate-only
    expect(paths[1].points).toEqual([
      { x: 100, y: 100 },
      { x: 105, y: 100 },
    ]);
  });

  it('never pops below the identity base matrix (unbalanced pop is tolerated)', () => {
    const paths = capturePolylines([
      { op: 'pop', args: [] }, // stray pop — must not throw or corrupt the base
      { op: 'translate', args: [7, 0] },
      { op: 'line', args: [0, 0, 1, 0] },
    ]);
    expect(paths[0].points).toEqual([
      { x: 7, y: 0 },
      { x: 8, y: 0 },
    ]);
  });

  it('ignores unknown ops and shapes with fewer than 2 vertices', () => {
    const paths = capturePolylines([
      { op: 'stroke', args: ['red'] },
      { op: 'ellipse', args: [0, 0, 5, 5] },
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [1, 1] }, // lone vertex → dropped
      { op: 'endShape', args: [] },
      { op: 'strokeWeight', args: [2] },
    ]);
    expect(paths).toEqual([]);
  });

  it('handles multiple symmetry copies (each push/translate/rotate emits its own path)', () => {
    // Mimics applySymmetryDraw with n=2: two translated+rotated copies.
    const calls = [];
    for (const rot of [0, Math.PI]) {
      calls.push({ op: 'push', args: [] });
      calls.push({ op: 'translate', args: [50, 50] });
      calls.push({ op: 'rotate', args: [rot] });
      calls.push({ op: 'line', args: [10, 0, 20, 0] });
      calls.push({ op: 'pop', args: [] });
    }
    const paths = capturePolylines(calls);
    expect(paths).toHaveLength(2);
    // copy 0: no rotation
    near(paths[0].points[0], 60, 50);
    near(paths[0].points[1], 70, 50);
    // copy 1: rotated 180° → (10,0)→(-10,0)→+T=(40,50); (20,0)→(-20,0)→(30,50)
    near(paths[1].points[0], 40, 50);
    near(paths[1].points[1], 30, 50);
  });
});
