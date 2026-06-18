// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import PlotOverlay from './PlotOverlay';

// Issue #15 (Lane C / C7): the plot preview + overlap warnings become a canvas
// overlay. PlotOverlay is fully prop-driven (modeled on BedOverlay) so it renders
// and is assertable under jsdom WITHOUT the live p5 surface — it consumes
// `layers` + `patternInstances` (the same shapes the fabrication pipeline reads),
// reuses buildPlottableLayers/buildRouteFromLayers for the route preview and the
// existing overlapCheck (via per-layer countOverlaps) for the highlights.
//
// A pattern instance just needs a toSVGGroup(id, color, opacity) that yields an
// SVG-group STRING of <path> elements — exactly the contract the real plotter
// pipeline (extractRenderedPaths) reads: it parses the group string and walks
// <path d="..."> nodes. We feed each polyline as a straight `M x y L x y …` path.
function pathD(points) {
  return points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`)
    .join(' ');
}

function makeInstance(polylines) {
  return {
    toSVGGroup() {
      const paths = polylines
        .map((pts) => `<path d="${pathD(pts)}" fill="none" stroke="#000"/>`)
        .join('');
      return `<g>${paths}</g>`;
    },
  };
}

// A single layer whose geometry contains a known cardinal cross (one crossing).
function crossingDesign() {
  const layers = [{ id: 'L1', visible: true, color: '#000', opacity: 1 }];
  const patternInstances = {
    L1: makeInstance([
      [[0, 5], [10, 5]],
      [[5, 0], [5, 10]],
    ]), // X cross at (5,5)
  };
  return { layers, patternInstances };
}

// A design with NO crossings (two parallel segments).
function cleanDesign() {
  const layers = [{ id: 'L1', visible: true, color: '#000', opacity: 1 }];
  const patternInstances = {
    L1: makeInstance([
      [[0, 0], [10, 0]],
      [[0, 5], [10, 5]],
    ]),
  };
  return { layers, patternInstances };
}

describe('PlotOverlay — plot preview as a canvas overlay', () => {
  it('renders the plot-route preview from the design (reuses the plotter pipeline)', () => {
    const { layers, patternInstances } = crossingDesign();
    const { container } = render(
      <PlotOverlay layers={layers} patternInstances={patternInstances} canvasW={10} canvasH={10} />
    );
    // The route preview surfaces draw segments — at least one line of the route.
    const draws = container.querySelectorAll('[data-overlay="route"]');
    expect(draws.length).toBeGreaterThan(0);
  });
});

describe('PlotOverlay — overlap highlighting (reuses overlapCheck)', () => {
  it('highlights a known overlapping pair on the canvas', () => {
    const { layers, patternInstances } = crossingDesign();
    const { container } = render(
      <PlotOverlay layers={layers} patternInstances={patternInstances} canvasW={10} canvasH={10} />
    );
    const marks = container.querySelectorAll('[data-overlay="overlap"]');
    expect(marks.length).toBe(1); // exactly the one cardinal cross
    // The highlight sits at the crossing point (5,5).
    const m = marks[0];
    expect(Number(m.getAttribute('data-x'))).toBeCloseTo(5, 4);
    expect(Number(m.getAttribute('data-y'))).toBeCloseTo(5, 4);
  });

  it('renders no overlap highlights for a clean design', () => {
    const { layers, patternInstances } = cleanDesign();
    const { container } = render(
      <PlotOverlay layers={layers} patternInstances={patternInstances} canvasW={10} canvasH={10} />
    );
    expect(container.querySelectorAll('[data-overlay="overlap"]').length).toBe(0);
  });
});

describe('PlotOverlay — toggle gate (off by default → clean canvas)', () => {
  // RightPanel renders the overlay behind a `showPlotOverlay && <PlotOverlay/>`
  // gate, with the shell's `showOverlays` defaulting to false. RightPanel itself
  // cannot mount under jsdom (its useCanvas hook imports p5 → a CJS-only
  // dependency that breaks the jsdom import — the documented p5 constraint, the
  // reason #7 tested CanvasChrome directly too). So we exercise the EXACT gate
  // expression here against a stand-in that mirrors RightPanel's wiring 1:1.
  function CanvasSurface({ showPlotOverlay = false, layers, patternInstances }) {
    return (
      <div data-testid="surface">
        {/* p5 canvas would mount here */}
        {showPlotOverlay && (
          <PlotOverlay
            layers={layers}
            patternInstances={patternInstances}
            canvasW={10}
            canvasH={10}
          />
        )}
      </div>
    );
  }

  it('renders NO overlay by default (showPlotOverlay omitted → clean canvas)', () => {
    const { layers, patternInstances } = crossingDesign();
    const { container } = render(
      <CanvasSurface layers={layers} patternInstances={patternInstances} />
    );
    expect(container.querySelector('[data-testid="plot-overlay"]')).toBeNull();
    expect(container.querySelectorAll('[data-overlay]').length).toBe(0);
  });

  it('renders the overlay only when toggled on', () => {
    const { layers, patternInstances } = crossingDesign();
    const { container, rerender } = render(
      <CanvasSurface showPlotOverlay={false} layers={layers} patternInstances={patternInstances} />
    );
    expect(container.querySelector('[data-testid="plot-overlay"]')).toBeNull();

    rerender(
      <CanvasSurface showPlotOverlay layers={layers} patternInstances={patternInstances} />
    );
    expect(container.querySelector('[data-testid="plot-overlay"]')).not.toBeNull();
    // …and toggling back off restores the clean canvas.
    rerender(
      <CanvasSurface showPlotOverlay={false} layers={layers} patternInstances={patternInstances} />
    );
    expect(container.querySelector('[data-testid="plot-overlay"]')).toBeNull();
  });
});

describe('PlotOverlay — reflects the design live', () => {
  it('updates the highlights when the design changes (editing → overlay updates)', () => {
    const clean = cleanDesign();
    const { container, rerender } = render(
      <PlotOverlay layers={clean.layers} patternInstances={clean.patternInstances} canvasW={10} canvasH={10} />
    );
    expect(container.querySelectorAll('[data-overlay="overlap"]').length).toBe(0);

    // Edit the design into one with a crossing — the overlay must re-compute.
    const crossing = crossingDesign();
    rerender(
      <PlotOverlay layers={crossing.layers} patternInstances={crossing.patternInstances} canvasW={10} canvasH={10} />
    );
    expect(container.querySelectorAll('[data-overlay="overlap"]').length).toBe(1);
  });
});
