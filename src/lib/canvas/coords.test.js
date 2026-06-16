import { describe, it, expect } from 'vitest';
import { screenToCanvas } from './coords.js';

describe('screenToCanvas (pure)', () => {
  it('finalScale=1 is identity offset by rect origin', () => {
    expect(screenToCanvas(100, 50, { left: 0, top: 0 }, 1)).toEqual({ x: 100, y: 50 });
  });

  it('subtracts a non-zero rect.left/top before scaling', () => {
    expect(screenToCanvas(120, 80, { left: 20, top: 30 }, 1)).toEqual({ x: 100, y: 50 });
  });

  it('finalScale=0.5 doubles the distance from the rect origin', () => {
    expect(screenToCanvas(100, 50, { left: 0, top: 0 }, 0.5)).toEqual({ x: 200, y: 100 });
  });

  it('combines non-zero rect origin with a half scale', () => {
    expect(screenToCanvas(120, 80, { left: 20, top: 30 }, 0.5)).toEqual({ x: 200, y: 100 });
  });

  it('handles a fractional zoom scale', () => {
    // finalScale = fitScale * zoom, e.g. 0.8 * 1.25 = 1.0... use a real fraction.
    const r = screenToCanvas(40, 20, { left: 10, top: 5 }, 0.25);
    expect(r).toEqual({ x: 120, y: 60 });
  });
});
