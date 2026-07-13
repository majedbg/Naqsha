// etchRasterEstimate — the raster (area×DPI) scan time model, pinned against
// KNOWN dimensions. This is the Etch's estimator branch, deliberately distinct
// from runEstimate's vector path-length model (ADR-0006: a raster engrave's run
// time is a scan of the bounding box, not the length of any path).
//
// The load-bearing test isolates the pure area×DPI term (overheadSec: 0) so the
// exact seconds are traceable by hand and cannot drift when the overhead
// constant — a judgment call — is retuned.

import { describe, it, expect } from 'vitest';
import { etchRasterEstimate, ETCH_SCAN_OVERHEAD_SEC } from './etchRasterEstimate.js';
import { MM_PER_IN } from './constants.js';

describe('etchRasterEstimate — area×DPI scan model', () => {
  it('pins the pure scan term against known dimensions (overhead 0)', () => {
    // 100mm × 100mm at 254 DPI (= 10 dots/mm) scanned at 100 mm/s.
    //   areaMm2      = 100 × 100                 = 10 000 mm²
    //   scanMm       = areaMm2 × DPI / 25.4      = 10 000 × 254 / 25.4 = 100 000 mm
    //   sec          = scanMm / speed            = 100 000 / 100      = 1000 s
    const est = etchRasterEstimate({
      widthMm: 100, heightMm: 100, dpi: 254, speed: 100, overheadSec: 0,
    });
    expect(est.areaMm2).toBeCloseTo(10000, 6);
    expect(est.scanMm).toBeCloseTo(100000, 6);
    expect(est.sec).toBeCloseTo(1000, 6);
    // Cross-check the identity scanMm === areaMm2 × dpi / MM_PER_IN.
    expect(est.scanMm).toBeCloseTo((est.areaMm2 * 254) / MM_PER_IN, 6);
  });

  it('adds the fixed overhead on top of the scan term', () => {
    const bare = etchRasterEstimate({
      widthMm: 100, heightMm: 100, dpi: 254, speed: 100, overheadSec: 0,
    });
    const withOverhead = etchRasterEstimate({
      widthMm: 100, heightMm: 100, dpi: 254, speed: 100,
    });
    expect(withOverhead.sec).toBeCloseTo(bare.sec + ETCH_SCAN_OVERHEAD_SEC, 6);
    expect(ETCH_SCAN_OVERHEAD_SEC).toBeGreaterThan(0);
  });

  it('scales linearly with DPI — doubling DPI doubles the scan time', () => {
    const at254 = etchRasterEstimate({
      widthMm: 80, heightMm: 60, dpi: 254, speed: 120, overheadSec: 0,
    });
    const at508 = etchRasterEstimate({
      widthMm: 80, heightMm: 60, dpi: 508, speed: 120, overheadSec: 0,
    });
    expect(at508.sec).toBeCloseTo(at254.sec * 2, 6);
    expect(at508.sec).toBeGreaterThan(at254.sec);
  });

  it('is orientation-independent — swapping width/height leaves the time equal', () => {
    const a = etchRasterEstimate({ widthMm: 120, heightMm: 40, dpi: 254, speed: 90 });
    const b = etchRasterEstimate({ widthMm: 40, heightMm: 120, dpi: 254, speed: 90 });
    expect(b.sec).toBeCloseTo(a.sec, 9);
  });

  it('returns zero for a degenerate (non-positive area or speed) input — never NaN/Infinity', () => {
    for (const bad of [
      { widthMm: 0, heightMm: 100, dpi: 254, speed: 100 },
      { widthMm: 100, heightMm: -5, dpi: 254, speed: 100 },
      { widthMm: 100, heightMm: 100, dpi: 254, speed: 0 },
      { widthMm: 100, heightMm: 100, dpi: 0, speed: 100 },
    ]) {
      const est = etchRasterEstimate(bad);
      expect(Number.isFinite(est.sec)).toBe(true);
      expect(est.sec).toBe(0);
    }
  });
});
