import { describe, it, expect } from 'vitest';
import { handlesFor, hitTestHandle, clampSize, HANDLE_IDS } from './handles.js';

const bbox = { x: 0, y: 0, w: 100, h: 60 };

describe('handlesFor', () => {
  it('produces the 8 resize handles + 1 rotate handle', () => {
    const hs = handlesFor(bbox);
    expect(hs).toHaveLength(9);
    const ids = hs.map((h) => h.id);
    expect(new Set(ids)).toEqual(new Set(HANDLE_IDS));
  });

  it('places the corner/edge handles at the expected positions', () => {
    const map = Object.fromEntries(handlesFor(bbox).map((h) => [h.id, h]));
    expect(map.nw).toMatchObject({ x: 0, y: 0 });
    expect(map.n).toMatchObject({ x: 50, y: 0 });
    expect(map.ne).toMatchObject({ x: 100, y: 0 });
    expect(map.e).toMatchObject({ x: 100, y: 30 });
    expect(map.se).toMatchObject({ x: 100, y: 60 });
    expect(map.s).toMatchObject({ x: 50, y: 60 });
    expect(map.sw).toMatchObject({ x: 0, y: 60 });
    expect(map.w).toMatchObject({ x: 0, y: 30 });
  });

  it('places the rotate handle above the top edge center', () => {
    const map = Object.fromEntries(handlesFor(bbox).map((h) => [h.id, h]));
    expect(map.rotate.x).toBe(50);
    expect(map.rotate.y).toBeLessThan(0); // offset above the box
    expect(map.rotate.type).toBe('rotate');
  });

  it('tags resize handles with type "resize"', () => {
    const map = Object.fromEntries(handlesFor(bbox).map((h) => [h.id, h]));
    expect(map.nw.type).toBe('resize');
    expect(map.e.type).toBe('resize');
  });
});

describe('hitTestHandle', () => {
  it('returns the handle whose hot-spot contains the point (within tolerance)', () => {
    const hit = hitTestHandle({ x: 101, y: 1 }, bbox, 6);
    expect(hit.id).toBe('ne');
  });

  it('returns null when no handle is within tolerance', () => {
    expect(hitTestHandle({ x: 50, y: 30 }, bbox, 6)).toBeNull();
  });

  it('prefers the rotate handle when the point is over it', () => {
    const map = Object.fromEntries(handlesFor(bbox).map((h) => [h.id, h]));
    const hit = hitTestHandle({ x: map.rotate.x, y: map.rotate.y }, bbox, 6);
    expect(hit.id).toBe('rotate');
  });
});

describe('clampSize', () => {
  it('raises width/height up to the minimum', () => {
    expect(clampSize(2, 50, 10)).toEqual({ w: 10, h: 50 });
  });

  it('leaves sizes at or above the minimum untouched', () => {
    expect(clampSize(100, 60, 10)).toEqual({ w: 100, h: 60 });
  });

  it('uses a default minimum when none is given', () => {
    const out = clampSize(0, 0);
    expect(out.w).toBeGreaterThan(0);
    expect(out.h).toBeGreaterThan(0);
  });
});
