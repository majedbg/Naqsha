// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import CanvasChrome from './CanvasChrome';
import { PX_PER_MM } from '../../lib/units';
import { defaultBedSize } from '../../lib/machineProfiles';

// Issue #7 (Lane B / B4): the canvas chrome draws rulers (top + left), a solid
// outline of the DESIGN CANVAS (the artboard the rulers measure), and the active
// machine BED as a dashed "fits-on-machine" guide. Fully prop-driven so it
// renders + is assertable under jsdom without the live p5 surface.
//
// CRITICAL: the rulers measure the CANVAS (canvasWidthPx/canvasHeightPx), while
// the dashed guide reflects the ACTIVE MACHINE BED (defaultBedSize, in mm). The
// two are independent — a design can be larger than the machine's bed.

const canvasArtboard = (c) => c.querySelector('[data-testid="canvas-artboard"]');
const bedGuide = (c) => c.querySelector('[data-testid="bed-guide"]');
const bedFill = (c) => c.querySelector('[data-testid="bed-fill"]');

// A 100mm-wide canvas (in px) gives clean mm majors at 0,10,..100.
const MM100_PX = 100 * PX_PER_MM;

describe('CanvasChrome — rulers measure the design canvas + track zoom', () => {
  it('renders major mm tick marks for the canvas size at zoom 1', () => {
    const { container } = render(
      <CanvasChrome
        canvasWidthPx={MM100_PX}
        canvasHeightPx={80 * PX_PER_MM}
        bedWidthMm={152}
        bedHeightMm={203}
        unit="mm"
        zoom={1}
      />
    );
    const ticks = container.querySelectorAll('[data-tick="major-x"]');
    expect(ticks.length).toBeGreaterThan(0);
    const values = [...ticks].map((t) => Number(t.getAttribute('data-tick-value')));
    expect(values).toContain(0);
    expect(values).toContain(50);
    expect(values).toContain(100);
  });

  it('scales tick screen positions with zoom (10mm tick at 2x is twice as far)', () => {
    const props = { canvasWidthPx: MM100_PX, canvasHeightPx: 80 * PX_PER_MM, bedWidthMm: 152, bedHeightMm: 203, unit: 'mm' };
    const { container: c1 } = render(<CanvasChrome {...props} zoom={1} />);
    const { container: c2 } = render(<CanvasChrome {...props} zoom={2} />);
    const pos = (c) =>
      Number(c.querySelector(`[data-tick="major-x"][data-tick-value="10"]`).getAttribute('data-pos'));
    expect(pos(c1)).toBeCloseTo(10 * PX_PER_MM, 4);
    expect(pos(c2)).toBeCloseTo(10 * PX_PER_MM * 2, 4);
  });
});

describe('CanvasChrome — design-canvas artboard', () => {
  it('draws the solid artboard at the canvas px size', () => {
    const { container } = render(
      <CanvasChrome canvasWidthPx={1152} canvasHeightPx={1152} bedWidthMm={152} bedHeightMm={203} unit="in" zoom={1} />
    );
    const rect = canvasArtboard(container);
    expect(rect).toBeTruthy();
    expect(Number(rect.getAttribute('data-canvas-w-px'))).toBe(1152);
    expect(Number(rect.getAttribute('data-canvas-h-px'))).toBe(1152);
    // Solid (no dash) — distinguishes it from the bed guide.
    expect(rect.getAttribute('stroke-dasharray')).toBeNull();
  });
});

describe('CanvasChrome — machine-bed guide (dashed) tracks the active profile', () => {
  it('draws the bed as a DASHED guide at the profile bed size', () => {
    const laser = defaultBedSize('laser'); // 508 x 305 mm
    const { container } = render(
      <CanvasChrome canvasWidthPx={1152} canvasHeightPx={1152} bedWidthMm={laser.width} bedHeightMm={laser.height} unit="mm" zoom={1} />
    );
    const guide = bedGuide(container);
    expect(guide).toBeTruthy();
    expect(Number(guide.getAttribute('data-bed-w-mm'))).toBe(laser.width);
    expect(Number(guide.getAttribute('data-bed-h-mm'))).toBe(laser.height);
    // The "fits-on-machine" guide is dashed (vs the solid canvas artboard).
    expect(guide.getAttribute('stroke-dasharray')).toBeTruthy();
  });

  it('changes the bed guide when the profile bed size changes', () => {
    const laser = defaultBedSize('laser'); // 508 x 305
    const plotter = defaultBedSize('plotter'); // 152 x 203
    expect(laser.width).not.toBe(plotter.width);

    const { container, rerender } = render(
      <CanvasChrome canvasWidthPx={1152} canvasHeightPx={1152} bedWidthMm={laser.width} bedHeightMm={laser.height} unit="mm" zoom={1} />
    );
    expect(Number(bedGuide(container).getAttribute('data-bed-w-mm'))).toBe(laser.width);

    rerender(
      <CanvasChrome canvasWidthPx={1152} canvasHeightPx={1152} bedWidthMm={plotter.width} bedHeightMm={plotter.height} unit="mm" zoom={1} />
    );
    expect(Number(bedGuide(container).getAttribute('data-bed-w-mm'))).toBe(plotter.width);
    expect(Number(bedGuide(container).getAttribute('data-bed-h-mm'))).toBe(plotter.height);
  });

  it('renders a bed guide SMALLER than the canvas when the design exceeds the bed', () => {
    // 12in canvas (1152px) vs the 152x203mm plotter bed — the real reported case.
    const plotter = defaultBedSize('plotter');
    const { container } = render(
      <CanvasChrome canvasWidthPx={1152} canvasHeightPx={1152} bedWidthMm={plotter.width} bedHeightMm={plotter.height} unit="in" zoom={1} />
    );
    const cw = Number(canvasArtboard(container).getAttribute('width'));
    const gw = Number(bedGuide(container).getAttribute('width'));
    expect(gw).toBeLessThan(cw); // bed reaches only part of the design
    expect(gw).toBeGreaterThan(0);
  });
});

describe('CanvasChrome — positions ruler 0,0 at the canvas origin', () => {
  const RULER = 18; // mirrors the band width in CanvasChrome
  const svgTransform = (container) => container.querySelector('svg').style.transform;
  const base = { canvasWidthPx: MM100_PX, canvasHeightPx: 80 * PX_PER_MM, bedWidthMm: 152, bedHeightMm: 203, zoom: 1 };

  it('translates so the artboard/ruler corner lands on the measured canvas origin (origin minus the ruler band)', () => {
    const { container } = render(<CanvasChrome {...base} origin={{ x: 320, y: 140 }} />);
    expect(svgTransform(container)).toBe(`translate(${320 - RULER}px, ${140 - RULER}px)`);
  });

  it('ignores pan when an origin is supplied (origin already encodes pan)', () => {
    const { container } = render(<CanvasChrome {...base} origin={{ x: 200, y: 100 }} pan={{ x: 999, y: 999 }} />);
    expect(svgTransform(container)).toBe(`translate(${200 - RULER}px, ${100 - RULER}px)`);
  });

  it('falls back to legacy pan-only translate when origin is absent (no behavior change)', () => {
    const { container } = render(<CanvasChrome {...base} pan={{ x: 5, y: 7 }} />);
    expect(svgTransform(container)).toBe('translate(5px, 7px)');
  });

  it('defaults to translate(0,0) with neither origin nor pan', () => {
    const { container } = render(<CanvasChrome {...base} />);
    expect(svgTransform(container)).toBe('translate(0px, 0px)');
  });
});

describe('CanvasChrome — showBed toggles the machine-bed reference overlay', () => {
  const base = { canvasWidthPx: MM100_PX, canvasHeightPx: 80 * PX_PER_MM, bedWidthMm: 152, bedHeightMm: 203, unit: 'mm', zoom: 1 };

  it('defaults to showing the bed (bed-fill + bed-guide both render)', () => {
    const { container } = render(<CanvasChrome {...base} />);
    expect(bedFill(container)).toBeTruthy();
    expect(bedGuide(container)).toBeTruthy();
  });

  it('showBed={false} renders neither bed-fill nor bed-guide, but the work piece (artboard) still renders', () => {
    const { container } = render(<CanvasChrome {...base} showBed={false} />);
    expect(bedFill(container)).toBeNull();
    expect(bedGuide(container)).toBeNull();
    expect(canvasArtboard(container)).toBeTruthy();
  });
});
