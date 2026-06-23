import { describe, it, expect } from "vitest";
import { ScalarField } from "./ScalarField";
import { chladniField, chladniFieldFn } from "./chladniField";

describe("ScalarField.fromFunction", () => {
  it("samples corners exactly on the unit domain", () => {
    // f(u,v) = u + 2v → corners 0, 1, 2, 3
    const f = ScalarField.fromFunction((u, v) => u + 2 * v, { nx: 5, ny: 5 });
    expect(f.nx).toBe(5);
    expect(f.ny).toBe(5);
    expect(f.rawAt(0, 0)).toBeCloseTo(0);
    expect(f.rawAt(4, 0)).toBeCloseTo(1); // u=1, v=0
    expect(f.rawAt(0, 4)).toBeCloseTo(2); // u=0, v=1
    expect(f.rawAt(4, 4)).toBeCloseTo(3); // u=1, v=1
    expect(f.min).toBeCloseTo(0);
    expect(f.max).toBeCloseTo(3);
  });

  it("bilinear sample is exact for a linear field and matches grid corners", () => {
    const f = ScalarField.fromFunction((u, v) => 3 * u - v, { nx: 9, ny: 9 });
    // exact on a plane
    expect(f.sample(0.5, 0.5)).toBeCloseTo(3 * 0.5 - 0.5, 5);
    expect(f.sample(0.25, 0.75)).toBeCloseTo(3 * 0.25 - 0.75, 5);
    // continuous sample agrees with direct grid access at a grid point
    expect(f.sample(0, 0)).toBeCloseTo(f.rawAt(0, 0), 6);
    expect(f.sample(1, 1)).toBeCloseTo(f.rawAt(8, 8), 6);
  });

  it("clamps out-of-domain samples to the edge", () => {
    const f = ScalarField.fromFunction((u) => u, { nx: 5, ny: 5 });
    expect(f.sample(-1, 0.5)).toBeCloseTo(0);
    expect(f.sample(2, 0.5)).toBeCloseTo(1);
  });

  it("signed/norm accessors normalize as documented", () => {
    const f = ScalarField.fromFunction((u, v) => u + 2 * v, { nx: 5, ny: 5 });
    // maxAbs = 3 → signed in [0,1] here (all non-negative)
    expect(f.signedAt(4, 4)).toBeCloseTo(1);
    expect(f.normAt(0, 0)).toBeCloseTo(0);
    expect(f.normAt(4, 4)).toBeCloseTo(1);
  });

  it("gradient of a plane equals its slope", () => {
    const f = ScalarField.fromFunction((u, v) => 3 * u - v, { nx: 65, ny: 65 });
    const g = f.sampleGradient(0.5, 0.5);
    expect(g.dx).toBeCloseTo(3, 1);
    expect(g.dy).toBeCloseTo(-1, 1);
  });
});

describe("chladniField", () => {
  it("matches the closed form on the unit domain at sampled grid points", () => {
    const params = { m: 4, n: 3, blend: 0 };
    const fn = chladniFieldFn(params);
    const f = chladniField(params, { resolution: 64 });
    // grid point (i,j) sits at u=i/64, v=j/64
    for (const [i, j] of [[0, 0], [16, 48], [32, 32], [64, 0]]) {
      expect(f.rawAt(i, j)).toBeCloseTo(fn(i / 64, j / 64), 5);
    }
  });

  it("nodal set: the diagonal u=v is exactly zero (mode antisymmetry)", () => {
    // f(u,u) = cos(nπu)cos(mπu) − cos(mπu)cos(nπu) = 0 for all u
    const fn = chladniFieldFn({ m: 4, n: 3 });
    for (const u of [0.1, 0.37, 0.5, 0.83]) {
      expect(fn(u, u)).toBeCloseTo(0, 10);
    }
  });

  it("blend mixes the two mode pairs", () => {
    const a = chladniFieldFn({ m: 4, n: 3, blend: 0 });
    const both = chladniFieldFn({ m: 4, n: 3, blend: 1, m2: 5, n2: 2 });
    const mix = chladniFieldFn({ m: 4, n: 3, blend: 0.5, m2: 5, n2: 2 });
    const u = 0.31, v = 0.62;
    expect(mix(u, v)).toBeCloseTo(0.5 * a(u, v) + 0.5 * both(u, v), 10);
  });

  it("returns a cached instance for identical params", () => {
    const p = { m: 6, n: 5, blend: 0 };
    expect(chladniField(p, { resolution: 32 })).toBe(
      chladniField(p, { resolution: 32 })
    );
  });
});
