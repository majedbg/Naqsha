import { describe, it, expect } from 'vitest';
import { classifyPointer, rotateTransform, scaleTransform } from './transformGestures.js';
import { handlesFor } from '../transform/handles.js';

const IDENTITY = { x: 0, y: 0, rotation: 0, scale: 1 };
const BBOX = { x: 0, y: 0, w: 100, h: 100 }; // center = (50,50)
const CENTER = { x: 50, y: 50 };

describe('classifyPointer', () => {
  const selected = { transform: IDENTITY, localBBox: BBOX };

  it('returns rotate when the pointer is over the rotate handle', () => {
    const rot = handlesFor(BBOX).find((h) => h.id === 'rotate');
    expect(classifyPointer({ x: rot.x, y: rot.y }, selected, 100, 100)).toEqual({
      kind: 'rotate',
    });
  });

  it('returns resize + handleId when the pointer is over a corner handle', () => {
    expect(classifyPointer({ x: 0, y: 0 }, selected, 100, 100)).toEqual({
      kind: 'resize',
      handleId: 'nw',
    });
    expect(classifyPointer({ x: 100, y: 100 }, selected, 100, 100)).toEqual({
      kind: 'resize',
      handleId: 'se',
    });
  });

  it('returns none when the pointer is over empty interior', () => {
    expect(classifyPointer({ x: 50, y: 50 }, selected, 100, 100)).toEqual({ kind: 'none' });
  });

  it('returns none when nothing is selected', () => {
    expect(classifyPointer({ x: 0, y: 0 }, null, 100, 100)).toEqual({ kind: 'none' });
  });

  it('honors the node transform — inverse-maps the pointer into local space', () => {
    // Node rotated 90° about its center: the world point that lands on the local
    // 'nw' corner is found by forward-transforming (0,0). For a 90° rotation
    // about (50,50): local (0,0) -> world (100,0). Hitting world (100,0) should
    // classify as the LOCAL nw handle.
    const rotated = { transform: { x: 0, y: 0, rotation: 90, scale: 1 }, localBBox: BBOX };
    expect(classifyPointer({ x: 100, y: 0 }, rotated, 100, 100)).toEqual({
      kind: 'resize',
      handleId: 'nw',
    });
  });
});

describe('rotateTransform', () => {
  it('rotates by a known quarter turn', () => {
    // start pointer to the right of center (angle 0°), current pointer below
    // center (angle +90° in y-down space) → +90° delta.
    const start = { x: 100, y: 50 };
    const current = { x: 50, y: 100 };
    const next = rotateTransform(IDENTITY, CENTER, start, current);
    expect(next.rotation).toBeCloseTo(90, 6);
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
    expect(next.scale).toBe(1);
  });

  it('adds the delta to the starting rotation', () => {
    const start = { x: 100, y: 50 };
    const current = { x: 50, y: 100 };
    const next = rotateTransform({ ...IDENTITY, rotation: 30 }, CENTER, start, current);
    expect(next.rotation).toBeCloseTo(120, 6);
  });

  it('snaps the absolute resulting rotation to the nearest 15deg', () => {
    // delta ~ +90°, start rotation 7° → 97°, snapped to 90°.
    const start = { x: 100, y: 50 };
    const current = { x: 50, y: 100 };
    const next = rotateTransform({ ...IDENTITY, rotation: 7 }, CENTER, start, current, true);
    expect(next.rotation).toBe(90);
  });

  it('leaves x, y and scale untouched', () => {
    const startT = { x: 12, y: -3, rotation: 0, scale: 2.5 };
    const next = rotateTransform(startT, CENTER, { x: 100, y: 50 }, { x: 50, y: 100 });
    expect(next.x).toBe(12);
    expect(next.y).toBe(-3);
    expect(next.scale).toBe(2.5);
  });
});

describe('scaleTransform', () => {
  it('doubles the scale when the pointer distance doubles', () => {
    const start = { x: 60, y: 50 }; // dist 10 from center
    const current = { x: 70, y: 50 }; // dist 20 from center
    const next = scaleTransform(IDENTITY, CENTER, start, current);
    expect(next.scale).toBeCloseTo(2, 6);
    expect(next.rotation).toBe(0);
  });

  it('multiplies the starting scale by the distance ratio', () => {
    const start = { x: 60, y: 50 }; // dist 10
    const current = { x: 70, y: 50 }; // dist 20 → ratio 2
    const next = scaleTransform({ ...IDENTITY, scale: 1.5 }, CENTER, start, current);
    expect(next.scale).toBeCloseTo(3, 6);
  });

  it('clamps to the minimum scale', () => {
    const start = { x: 150, y: 50 }; // dist 100
    const current = { x: 50.001, y: 50 }; // dist ~0.001 → tiny ratio
    const next = scaleTransform(IDENTITY, CENTER, start, current, 0.05);
    expect(next.scale).toBe(0.05);
  });

  it('guards divide-by-zero: zero start distance leaves scale unchanged', () => {
    const start = { x: 50, y: 50 }; // exactly at center → dist 0
    const current = { x: 70, y: 50 };
    const next = scaleTransform({ ...IDENTITY, scale: 1.5 }, CENTER, start, current);
    expect(next.scale).toBe(1.5);
    expect(Number.isFinite(next.scale)).toBe(true);
  });

  it('leaves x, y and rotation untouched', () => {
    const startT = { x: 8, y: 9, rotation: 45, scale: 1 };
    const next = scaleTransform(startT, CENTER, { x: 60, y: 50 }, { x: 70, y: 50 });
    expect(next.x).toBe(8);
    expect(next.y).toBe(9);
    expect(next.rotation).toBe(45);
  });
});
