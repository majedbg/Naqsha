import { describe, it, expect } from 'vitest';
import { etchExportDims, etchCacheNeedsResolve } from './etchSource.js';
import { PPI, MM_PER_IN } from '../plotter/constants.js';

// Physical width of `px` canvas units in mm, then × DPI, matches etchPixelDims.
const expectPx = (px, dpi) => Math.round(((px / PPI) * MM_PER_IN) / MM_PER_IN * dpi);

describe('etchExportDims — DPI drives the working/exported bitmap dimensions', () => {
  it('maps canvas px → physical mm → px at the given DPI', () => {
    // 96 px = 1 inch = 25.4 mm; at 254 DPI → 254 px.
    const { width, height } = etchExportDims(96, 96, 254);
    expect(width).toBe(254);
    expect(height).toBe(254);
    expect(width).toBe(expectPx(96, 254));
  });

  it('scales with DPI', () => {
    expect(etchExportDims(96, 96, 508).width).toBe(etchExportDims(96, 96, 254).width * 2);
  });

  it('caps the longest side at the spine safety maximum, preserving aspect', () => {
    // A very large canvas at high DPI would exceed the cap.
    const dims = etchExportDims(20000, 10000, 254);
    expect(Math.max(dims.width, dims.height)).toBeLessThanOrEqual(2048);
    // aspect ~2:1 preserved.
    expect(dims.width / dims.height).toBeCloseTo(2, 1);
  });
});

describe('etchCacheNeedsResolve — liveness rule (FIX 2)', () => {
  const SIG = '254|800|600|data:...';
  const bitmap = { bits: new Uint8Array(1), width: 1, height: 1 };

  it('resolves when there is no cache entry', () => {
    expect(etchCacheNeedsResolve(undefined, SIG)).toBe(true);
  });

  it('resolves when the signature is stale', () => {
    expect(etchCacheNeedsResolve({ sig: 'old', bitmap, resolving: false }, SIG)).toBe(true);
  });

  it('does NOT resolve when a matching bitmap is already resolved', () => {
    expect(etchCacheNeedsResolve({ sig: SIG, bitmap, resolving: false }, SIG)).toBe(false);
  });

  it('does NOT resolve when a matching resolve is in flight (null bitmap, resolving)', () => {
    expect(etchCacheNeedsResolve({ sig: SIG, bitmap: null, resolving: true }, SIG)).toBe(false);
  });

  it('RE-resolves a stranded entry: signature matches but bitmap is null and none in flight', () => {
    // This is the bug FIX 2 addresses — a run cancelled mid-flight leaves the
    // entry at { sig, bitmap:null, resolving:false }; it must relaunch.
    expect(etchCacheNeedsResolve({ sig: SIG, bitmap: null, resolving: false }, SIG)).toBe(true);
  });
});
