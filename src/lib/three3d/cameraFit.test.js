import { describe, it, expect } from 'vitest';
import {
  DEG2RAD,
  DEFAULT_FOV,
  DEFAULT_ELEVATION_DEG,
  DEFAULT_AZIMUTH_DEG,
  MIN_RADIUS,
  boxCenter,
  boxSize,
  boundingRadius,
  viewDirection,
  fitDistance,
  computeZoomToFit,
} from './cameraFit.js';

const unitBox = { min: [-1, -1, -1], max: [1, 1, 1] };
const offCenterBox = { min: [2, 4, -6], max: [4, 10, 0] };

function length([x, y, z]) {
  return Math.hypot(x, y, z);
}

describe('boxCenter / boxSize', () => {
  it('centres a symmetric box at the origin', () => {
    expect(boxCenter(unitBox)).toEqual([0, 0, 0]);
    expect(boxSize(unitBox)).toEqual([2, 2, 2]);
  });

  it('handles an off-centre box', () => {
    expect(boxCenter(offCenterBox)).toEqual([3, 7, -3]);
    expect(boxSize(offCenterBox)).toEqual([2, 6, 6]);
  });
});

describe('boundingRadius', () => {
  it('is half the space diagonal', () => {
    // unit box: size 2,2,2 → diagonal = 2*sqrt(3) → radius = sqrt(3)
    expect(boundingRadius(unitBox)).toBeCloseTo(Math.sqrt(3), 12);
  });

  it('clamps a degenerate (zero-size) box to MIN_RADIUS (no black view)', () => {
    const pt = { min: [5, 5, 5], max: [5, 5, 5] };
    expect(boundingRadius(pt)).toBe(MIN_RADIUS);
  });

  it('falls back to MIN_RADIUS on non-finite input', () => {
    const bad = { min: [0, 0, 0], max: [Infinity, 0, 0] };
    expect(boundingRadius(bad)).toBe(MIN_RADIUS);
  });
});

describe('viewDirection', () => {
  it('is a unit vector', () => {
    expect(length(viewDirection(35, 45))).toBeCloseTo(1, 12);
    expect(length(viewDirection(0, 0))).toBeCloseTo(1, 12);
    expect(length(viewDirection(89, 123))).toBeCloseTo(1, 12);
  });

  it('elevation 0 / azimuth 0 looks from +Z (camera on +Z, looking −Z)', () => {
    const [x, y, z] = viewDirection(0, 0);
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(1, 12);
  });

  it('encodes elevation as the Y component (sin elevation)', () => {
    const [, y] = viewDirection(35, 45);
    expect(y).toBeCloseTo(Math.sin(35 * DEG2RAD), 12);
  });

  it('defaults to the 3/4 angles', () => {
    expect(viewDirection()).toEqual(viewDirection(DEFAULT_ELEVATION_DEG, DEFAULT_AZIMUTH_DEG));
  });
});

describe('fitDistance', () => {
  it('satisfies sin(halfFov) = radius / distance for the vertical-limited case (square)', () => {
    const r = 3;
    const d = fitDistance(r, 50, 1, 1); // margin 1 to check raw geometry
    // square viewport ⇒ vertical fov is the limiter
    expect(Math.sin((50 * DEG2RAD) / 2)).toBeCloseTo(r / d, 10);
  });

  it('grows with radius (linearly)', () => {
    const d1 = fitDistance(1, 50, 1, 1);
    const d2 = fitDistance(2, 50, 1, 1);
    expect(d2).toBeCloseTo(d1 * 2, 10);
  });

  it('applies the padding margin multiplicatively', () => {
    const raw = fitDistance(2, 50, 1.6, 1);
    const padded = fitDistance(2, 50, 1.6, 1.25);
    expect(padded).toBeCloseTo(raw * 1.25, 10);
  });

  it('portrait viewports need MORE distance than landscape (horizontal-limited)', () => {
    const portrait = fitDistance(2, 50, 0.5, 1);
    const square = fitDistance(2, 50, 1, 1);
    const landscape = fitDistance(2, 50, 1.78, 1);
    expect(portrait).toBeGreaterThan(square);
    // landscape: vertical stays the limiter, so it equals the square distance
    expect(landscape).toBeCloseTo(square, 10);
  });

  it('guards a non-finite/zero aspect by treating it as square', () => {
    expect(fitDistance(2, 50, 0, 1)).toBeCloseTo(fitDistance(2, 50, 1, 1), 12);
    expect(fitDistance(2, 50, NaN, 1)).toBeCloseTo(fitDistance(2, 50, 1, 1), 12);
  });
});

describe('computeZoomToFit', () => {
  it('targets the box centre', () => {
    const { target } = computeZoomToFit({ box: offCenterBox });
    expect(target).toEqual([3, 7, -3]);
  });

  it('places the camera at the fit distance from the target', () => {
    const { position, target, distance } = computeZoomToFit({ box: unitBox, aspect: 1 });
    const offset = [position[0] - target[0], position[1] - target[1], position[2] - target[2]];
    expect(length(offset)).toBeCloseTo(distance, 10);
  });

  it('frames in a 3/4 view: camera sits above the target at the default elevation', () => {
    const { position, target, distance } = computeZoomToFit({ box: unitBox });
    // elevation = asin((cameraY - targetY) / distance)
    const elevation = Math.asin((position[1] - target[1]) / distance) / DEG2RAD;
    expect(elevation).toBeCloseTo(DEFAULT_ELEVATION_DEG, 6);
    expect(position[1]).toBeGreaterThan(target[1]); // looking down onto it
  });

  it('reset = default angles: a box at the origin yields the canonical 3/4 direction', () => {
    const { position, distance } = computeZoomToFit({ box: unitBox });
    const dir = [position[0] / distance, position[1] / distance, position[2] / distance];
    expect(dir[0]).toBeCloseTo(viewDirection()[0], 10);
    expect(dir[1]).toBeCloseTo(viewDirection()[1], 10);
    expect(dir[2]).toBeCloseTo(viewDirection()[2], 10);
  });

  it('never collapses onto the target for a degenerate box (no black view)', () => {
    const pt = { min: [0, 0, 0], max: [0, 0, 0] };
    const { position, target, distance } = computeZoomToFit({ box: pt });
    expect(distance).toBeGreaterThan(0);
    const offset = [position[0] - target[0], position[1] - target[1], position[2] - target[2]];
    expect(length(offset)).toBeGreaterThan(0);
  });

  it('produces a finite default view when given no box', () => {
    const { position, target, distance } = computeZoomToFit();
    expect(target).toEqual([0, 0, 0]);
    expect(Number.isFinite(distance)).toBe(true);
    expect(position.every(Number.isFinite)).toBe(true);
    expect(distance).toBeGreaterThan(0);
  });

  it('larger boxes push the camera farther away', () => {
    const near = computeZoomToFit({ box: unitBox }).distance;
    const far = computeZoomToFit({ box: { min: [-10, -10, -10], max: [10, 10, 10] } }).distance;
    expect(far).toBeGreaterThan(near);
  });

  it('uses the default fov constant when none is supplied', () => {
    const a = computeZoomToFit({ box: unitBox });
    const b = computeZoomToFit({ box: unitBox, fov: DEFAULT_FOV });
    expect(a.distance).toBeCloseTo(b.distance, 12);
  });
});
