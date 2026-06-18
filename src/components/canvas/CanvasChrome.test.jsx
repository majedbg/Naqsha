// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import CanvasChrome from './CanvasChrome';
import { PX_PER_MM } from '../../lib/units';
import { defaultBedSize } from '../../lib/machineProfiles';

// Issue #7 (Lane B / B4): the canvas chrome draws mm rulers (top + left) and
// the machine bed as the artboard. It is fully prop-driven so it renders + is
// assertable under jsdom without the live p5 surface.
//
// CRITICAL: the bed dims come from the ACTIVE MACHINE PROFILE (defaultBedSize),
// NOT from canvasW/canvasH. The render tests below prove the bed tracks the
// profile, and that ruler ticks track zoom.

function bedRect(container) {
  return container.querySelector('[data-testid="bed-artboard"]');
}

describe('CanvasChrome — rulers track zoom', () => {
  it('renders major mm tick marks for a given bed at zoom 1', () => {
    const { container } = render(
      <CanvasChrome bedWidthMm={100} bedHeightMm={80} unit="mm" zoom={1} />
    );
    const ticks = container.querySelectorAll('[data-tick="major-x"]');
    expect(ticks.length).toBeGreaterThan(0);
    // A 100mm bed has majors at 0,10,..100 → 11 ticks.
    const values = [...ticks].map((t) => Number(t.getAttribute('data-tick-value')));
    expect(values).toContain(0);
    expect(values).toContain(50);
    expect(values).toContain(100);
  });

  it('scales tick screen positions with zoom (10mm tick at 2x is twice as far)', () => {
    const { container: c1 } = render(
      <CanvasChrome bedWidthMm={100} bedHeightMm={80} unit="mm" zoom={1} />
    );
    const { container: c2 } = render(
      <CanvasChrome bedWidthMm={100} bedHeightMm={80} unit="mm" zoom={2} />
    );
    const pos = (c) =>
      Number(
        c.querySelector(`[data-tick="major-x"][data-tick-value="10"]`).getAttribute('data-pos')
      );
    const p1 = pos(c1);
    const p2 = pos(c2);
    expect(p1).toBeCloseTo(10 * PX_PER_MM, 4);
    expect(p2).toBeCloseTo(10 * PX_PER_MM * 2, 4);
  });
});

describe('CanvasChrome — positions ruler 0,0 at the canvas origin', () => {
  const RULER = 18; // mirrors the band width in CanvasChrome
  const svgTransform = (container) =>
    container.querySelector('svg').style.transform;

  it('translates so the bed/ruler corner lands on the measured canvas origin (origin minus the ruler band)', () => {
    const { container } = render(
      <CanvasChrome
        bedWidthMm={100}
        bedHeightMm={80}
        unit="mm"
        zoom={1}
        origin={{ x: 320, y: 140 }}
      />
    );
    expect(svgTransform(container)).toBe(
      `translate(${320 - RULER}px, ${140 - RULER}px)`
    );
  });

  it('ignores pan when an origin is supplied (origin already encodes pan)', () => {
    const { container } = render(
      <CanvasChrome
        bedWidthMm={100}
        bedHeightMm={80}
        zoom={1}
        origin={{ x: 200, y: 100 }}
        pan={{ x: 999, y: 999 }}
      />
    );
    expect(svgTransform(container)).toBe(
      `translate(${200 - RULER}px, ${100 - RULER}px)`
    );
  });

  it('falls back to legacy pan-only translate when origin is absent (no behavior change)', () => {
    const { container } = render(
      <CanvasChrome bedWidthMm={100} bedHeightMm={80} zoom={1} pan={{ x: 5, y: 7 }} />
    );
    expect(svgTransform(container)).toBe('translate(5px, 7px)');
  });

  it('defaults to translate(0,0) with neither origin nor pan', () => {
    const { container } = render(
      <CanvasChrome bedWidthMm={100} bedHeightMm={80} zoom={1} />
    );
    expect(svgTransform(container)).toBe('translate(0px, 0px)');
  });
});

describe('CanvasChrome — bed artboard matches the active profile bed size', () => {
  it('draws the bed at the laser profile dimensions', () => {
    const laser = defaultBedSize('laser'); // 508 x 305 mm
    const { container } = render(
      <CanvasChrome
        bedWidthMm={laser.width}
        bedHeightMm={laser.height}
        unit="mm"
        zoom={1}
      />
    );
    const rect = bedRect(container);
    expect(rect).toBeTruthy();
    expect(Number(rect.getAttribute('data-bed-w-mm'))).toBe(laser.width);
    expect(Number(rect.getAttribute('data-bed-h-mm'))).toBe(laser.height);
  });

  it('changes the bed rect when the profile bed size changes', () => {
    const laser = defaultBedSize('laser'); // 508 x 305
    const plotter = defaultBedSize('plotter'); // 152 x 203
    expect(laser.width).not.toBe(plotter.width);

    const { container, rerender } = render(
      <CanvasChrome bedWidthMm={laser.width} bedHeightMm={laser.height} unit="mm" zoom={1} />
    );
    expect(Number(bedRect(container).getAttribute('data-bed-w-mm'))).toBe(laser.width);

    rerender(
      <CanvasChrome bedWidthMm={plotter.width} bedHeightMm={plotter.height} unit="mm" zoom={1} />
    );
    expect(Number(bedRect(container).getAttribute('data-bed-w-mm'))).toBe(plotter.width);
    expect(Number(bedRect(container).getAttribute('data-bed-h-mm'))).toBe(plotter.height);
  });
});
