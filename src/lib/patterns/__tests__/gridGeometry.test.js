import { describe, it, expect, vi } from 'vitest';
import { gridLinePositions } from '../gridGeometry.js';

// gridLinePositions is the pure, RNG-injected core of Grid's line layout in an
// ORIGIN-CENTERED frame. Contract pinned here:
//   - `distribute` makes count+1 positions spanning [-totalSpan/2, +totalSpan/2].
//   - totalW = cols*spacing, totalH = rows*spacing.
//   - jitter>0 draws ONE rng(-jitter,jitter) per x-position (ascending) THEN per
//     y-position; jitter<=0 draws ZERO and xJittered===xPositions values.

describe('gridLinePositions — layout (no jitter)', () => {
  it('produces count+1 positions per axis with the pinned symmetric footprint', () => {
    const cols = 4;
    const rows = 3;
    const spacing = 40;
    const rng = vi.fn();
    const { xPositions, yPositions, totalW, totalH } = gridLinePositions(
      { cols, rows, spacing, nonLinear: 0, nonLinearGain: 0, jitter: 0 },
      rng
    );
    expect(totalW).toBe(cols * spacing);
    expect(totalH).toBe(rows * spacing);
    expect(xPositions).toHaveLength(cols + 1);
    expect(yPositions).toHaveLength(rows + 1);
    // Symmetric span [-totalSpan/2, +totalSpan/2].
    expect(xPositions[0]).toBeCloseTo(-totalW / 2, 10);
    expect(xPositions[xPositions.length - 1]).toBeCloseTo(totalW / 2, 10);
    expect(yPositions[0]).toBeCloseTo(-totalH / 2, 10);
    expect(yPositions[yPositions.length - 1]).toBeCloseTo(totalH / 2, 10);
  });

  it('spaces default eases (nonLinear=0, gain=0) evenly', () => {
    const cols = 4;
    const spacing = 40;
    const { xPositions } = gridLinePositions(
      { cols, rows: 4, spacing, nonLinear: 0, nonLinearGain: 0, jitter: 0 },
      vi.fn()
    );
    // Evenly spaced ⇒ every consecutive gap equals `spacing`.
    for (let i = 1; i < xPositions.length; i++) {
      expect(xPositions[i] - xPositions[i - 1]).toBeCloseTo(spacing, 10);
    }
  });

  it('with jitter=0: xJittered deep-equals xPositions and rng is NEVER called', () => {
    const rng = vi.fn(() => 999); // would corrupt output if ever invoked
    const { xPositions, yPositions, xJittered, yJittered } = gridLinePositions(
      { cols: 5, rows: 6, spacing: 30, jitter: 0 },
      rng
    );
    expect(xJittered).toEqual(xPositions);
    expect(yJittered).toEqual(yPositions);
    expect(rng).toHaveBeenCalledTimes(0);
  });

  it('treats negative jitter like zero (no rng calls)', () => {
    const rng = vi.fn(() => 1);
    const { xPositions, xJittered } = gridLinePositions(
      { cols: 3, rows: 3, spacing: 20, jitter: -5 },
      rng
    );
    expect(xJittered).toEqual(xPositions);
    expect(rng).toHaveBeenCalledTimes(0);
  });
});

describe('gridLinePositions — jitter RNG contract', () => {
  it('draws exactly (cols+1)+(rows+1) times, x-axis fully before y-axis', () => {
    const cols = 4;
    const rows = 3;
    // Counting spy: returns 0,1,2,... regardless of args, so we can read the
    // exact draw order back out of the jittered positions.
    let n = 0;
    const rng = vi.fn(() => n++);
    const { xPositions, yPositions, xJittered, yJittered } = gridLinePositions(
      { cols, rows, spacing: 40, jitter: 2 },
      rng
    );
    const nX = cols + 1;
    const nY = rows + 1;
    expect(rng).toHaveBeenCalledTimes(nX + nY);

    // Every rng draw was called with the (-jitter, jitter) bounds.
    for (const call of rng.mock.calls) expect(call).toEqual([-2, 2]);

    // x-positions consumed draws 0..nX-1 (ascending), THEN y-positions nX..nX+nY-1.
    for (let i = 0; i < nX; i++) {
      expect(xJittered[i]).toBeCloseTo(xPositions[i] + i, 10);
    }
    for (let j = 0; j < nY; j++) {
      expect(yJittered[j]).toBeCloseTo(yPositions[j] + (nX + j), 10);
    }
  });

  it('applies the jitter offset additively to the base positions', () => {
    const rng = vi.fn(() => 5); // constant offset
    const { xPositions, xJittered } = gridLinePositions(
      { cols: 2, rows: 2, spacing: 10, jitter: 3 },
      rng
    );
    for (let i = 0; i < xJittered.length; i++) {
      expect(xJittered[i]).toBeCloseTo(xPositions[i] + 5, 10);
    }
  });
});
