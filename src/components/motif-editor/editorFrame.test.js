// editorFrame — the pen editor's stable viewBox frame.
//
// The bug these pin: the old frame was re-derived from the working copy on every
// render with proportional padding, so dragging toward the edge grew the box
// FASTER than the drag moved (pad = 0.14·max(w,h) compounds), which changed the
// SVG CTM mid-gesture and made the view flee the cursor.

import { describe, it, expect } from 'vitest';
import {
  FRAME_PAD,
  frameFromBounds,
  frameContains,
  growFrame,
  frameToBox,
} from './editorFrame';

const b = (minX, minY, maxX, maxY) => ({ minX, minY, maxX, maxY });

describe('frameFromBounds', () => {
  it('is SQUARE and centred on the bounds', () => {
    // 20 wide, 10 tall, centred at (10, 10).
    const f = frameFromBounds(b(0, 5, 20, 15));
    expect(f.side).toBeCloseTo(20 * (1 + FRAME_PAD * 2)); // driven by the LARGER dim
    expect(f.x + f.side / 2).toBeCloseTo(10);
    expect(f.y + f.side / 2).toBeCloseTo(10);
  });

  it('opens ZOOMED OUT — the motif fills well under half the frame', () => {
    const f = frameFromBounds(b(0, 0, 10, 10));
    // With FRAME_PAD = 0.5 the content occupies 1/(1+2·0.5) = 50% of the side,
    // i.e. an equal glyph-width of empty space on each side to drag into.
    expect(10 / f.side).toBeLessThanOrEqual(0.5);
  });

  it('never collapses on a degenerate (zero-size) glyph', () => {
    const f = frameFromBounds(b(3, 3, 3, 3));
    expect(f.side).toBeGreaterThan(0);
    expect(f.x + f.side / 2).toBeCloseTo(3);
  });
});

describe('growFrame', () => {
  const frame = frameFromBounds(b(0, 0, 10, 10)); // side 20, x/y = -5

  it('returns the SAME frame (identity) while geometry stays inside', () => {
    // This is the whole fix: ordinary editing must not move the view at all.
    expect(growFrame(frame, b(0, 0, 10, 10))).toBe(frame);
    expect(growFrame(frame, b(-4, -4, 14, 14))).toBe(frame);
  });

  it('grows only when a point actually escapes, and only ever OUTWARD', () => {
    const grown = growFrame(frame, b(0, 0, 40, 10));
    expect(grown).not.toBe(frame);
    expect(grown.side).toBeGreaterThan(frame.side);
    expect(grown.x + grown.side).toBeGreaterThanOrEqual(40);
    // Never crops what was already visible.
    expect(grown.x).toBeLessThanOrEqual(frame.x);
    expect(grown.y).toBeLessThanOrEqual(frame.y);
    expect(grown.x + grown.side).toBeGreaterThanOrEqual(frame.x + frame.side);
    expect(grown.y + grown.side).toBeGreaterThanOrEqual(frame.y + frame.side);
  });

  it('does NOT amplify: growth is bounded by the overshoot, not multiplied by it', () => {
    // The old `pad = 0.14 · max(w,h)` re-derivation grew the box by MORE than the
    // point moved. Overshoot of 5 units must not cost more than the fixed margin.
    const grown = growFrame(frame, b(0, 0, 25, 10));
    const overshoot = 25 - (frame.x + frame.side); // 10
    expect(grown.side - frame.side).toBeLessThan(overshoot + frame.side * 0.5);
  });

  it('is IDEMPOTENT — regrowing on the same bounds is a no-op', () => {
    const once = growFrame(frame, b(0, 0, 40, 10));
    expect(growFrame(once, b(0, 0, 40, 10))).toBe(once);
  });

  it('stays square', () => {
    const grown = growFrame(frame, b(-30, 0, 10, 10));
    expect(frameContains(grown, b(-30, 0, 10, 10))).toBe(true);
    expect(frameToBox(grown).split(' ')).toHaveLength(4);
  });
});
