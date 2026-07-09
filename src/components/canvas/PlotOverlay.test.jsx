// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import PlotOverlay, {
  computeRunPlanTiming,
  runDotPositionAt,
  RUN_PLAN_TOTAL_MS,
} from './PlotOverlay';

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

// ---------------------------------------------------------------------------
// Run Plan machine view (issue #73 / Wave-3 Lane G).
//
// When a `route` prop is supplied, PlotOverlay switches from the legacy
// compute-from-layers preview to the plan's MACHINE VIEW: draw segments tinted
// by their Operation color, travel segments dashed + faint, crops ghosted at the
// Sheet edge, the Sheet + Bed drawn, a two-way highlight (canvas click → onLocate
// so the plan panel highlights the row), and a Play button that runs a dot along
// the route in EXECUTION order over ~15s. All prop-fed for AGREEMENT with the
// plan panel — the model (route/crops) is NOT recomputed here.
// ---------------------------------------------------------------------------

// A prop-fed Run Plan route in EXECUTION order: one travel hop, then two draw
// segments each carrying its Operation color.
function machineRoute() {
  return [
    { type: 'travel', from: [0, 0], to: [0, 0], color: '#111111' },
    { type: 'draw', from: [0, 0], to: [10, 0], color: '#cc0000' }, // Operation "cut" tint
    { type: 'draw', from: [10, 0], to: [10, 10], color: '#00aa55' }, // Operation "score" tint
  ];
}

// opRows give the tint→Operation lookup for the two-way highlight.
const OP_ROWS = [
  { opId: 'op-cut', color: '#cc0000' },
  { opId: 'op-score', color: '#00aa55' },
];

// A crop that fell outside the Sheet; carries its own layer color + layerId.
const CROPS = [
  { points: [[100, 100], [120, 100], [120, 120]], closed: true, color: '#3366cc', layerId: 'L9' },
];

describe('PlotOverlay — Run Plan machine view (prop-fed route)', () => {
  it('tints each draw segment with its Operation color and dashes/faints travel segments', () => {
    const { container } = render(
      <PlotOverlay route={machineRoute()} canvasW={200} canvasH={200} />
    );
    const draws = container.querySelectorAll('[data-overlay="route"]');
    expect(draws.length).toBe(2);
    // Draw strokes carry the Operation color (the MODEL, not a pixel).
    expect(draws[0].getAttribute('stroke')).toBe('#cc0000');
    expect(draws[1].getAttribute('stroke')).toBe('#00aa55');

    const travels = container.querySelectorAll('[data-overlay="travel"]');
    expect(travels.length).toBe(1);
    // Travel segments are dashed + carry the faint class.
    expect(travels[0].getAttribute('stroke-dasharray')).toBeTruthy();
    expect(travels[0].classList.contains('machine-travel')).toBe(true);
  });

  it('renders crops as ghosted + visually distinct, honoring the crop color', () => {
    const { container } = render(
      <PlotOverlay route={machineRoute()} crops={CROPS} canvasW={200} canvasH={200} />
    );
    const cropEls = container.querySelectorAll('[data-overlay="crop"]');
    expect(cropEls.length).toBe(1);
    const c = cropEls[0];
    expect(c.getAttribute('data-ghost')).toBe('true'); // ghosted
    expect(c.classList.contains('machine-crop')).toBe(true); // visually distinct
    expect(c.getAttribute('stroke')).toBe('#3366cc'); // honors the crop's own color
  });

  it('fires onLocate with the Operation id when a draw segment is clicked (two-way highlight)', () => {
    const onLocate = vi.fn();
    const { container } = render(
      <PlotOverlay route={machineRoute()} opRows={OP_ROWS} canvasW={200} canvasH={200} onLocate={onLocate} />
    );
    const red = [...container.querySelectorAll('[data-overlay="route"]')].find(
      (l) => l.getAttribute('stroke') === '#cc0000'
    );
    fireEvent.click(red);
    expect(onLocate).toHaveBeenCalledWith({ opId: 'op-cut' });
  });

  it('fires onLocate with the layerId when a ghosted crop is clicked', () => {
    const onLocate = vi.fn();
    const { container } = render(
      <PlotOverlay route={machineRoute()} crops={CROPS} canvasW={200} canvasH={200} onLocate={onLocate} />
    );
    fireEvent.click(container.querySelector('[data-overlay="crop"]'));
    expect(onLocate).toHaveBeenCalledWith({ layerId: 'L9' });
  });

  it('does not fire onLocate when the segment color resolves to no Operation', () => {
    const onLocate = vi.fn();
    const { container } = render(
      <PlotOverlay route={machineRoute()} canvasW={200} canvasH={200} onLocate={onLocate} />
    );
    fireEvent.click(container.querySelector('[data-overlay="route"]'));
    expect(onLocate).not.toHaveBeenCalled();
  });

  it('draws the Sheet rect from sheetRect and the Bed rect from bedSize', () => {
    const { container } = render(
      <PlotOverlay
        route={machineRoute()}
        canvasW={200}
        canvasH={200}
        sheetRect={{ x: 5, y: 5, width: 100, height: 80 }}
        bedSize={{ width: 210, height: 297, unit: 'mm' }}
      />
    );
    const sheet = container.querySelector('[data-overlay="sheet"]');
    expect(sheet).not.toBeNull();
    expect(sheet.getAttribute('width')).toBe('100');
    expect(container.querySelector('[data-overlay="bed"]')).not.toBeNull();
  });
});

describe('PlotOverlay — run animation (~15s, execution order)', () => {
  it('computeRunPlanTiming scales the whole route to ~15s by total length', () => {
    const route = [
      { type: 'draw', from: [0, 0], to: [10, 0], color: '#a' },
      { type: 'draw', from: [10, 0], to: [20, 0], color: '#b' },
    ];
    const t = computeRunPlanTiming(route);
    expect(t.totalMs).toBe(RUN_PLAN_TOTAL_MS);
    expect(t.totalLength).toBeCloseTo(20, 6);
    // Two equal-length draws → each takes half the ~15s budget, in order.
    expect(t.segments[0].startMs).toBeCloseTo(0, 6);
    expect(t.segments[0].endMs).toBeCloseTo(7500, 6);
    expect(t.segments[1].startMs).toBeCloseTo(7500, 6);
    expect(t.segments[1].endMs).toBeCloseTo(15000, 6);
  });

  it('runDotPositionAt walks the route in execution order', () => {
    const t = computeRunPlanTiming([{ type: 'draw', from: [0, 0], to: [10, 0], color: '#a' }]);
    expect(runDotPositionAt(t, 0)).toEqual([0, 0]);
    const mid = runDotPositionAt(t, RUN_PLAN_TOTAL_MS / 2);
    expect(mid[0]).toBeCloseTo(5, 6);
    expect(mid[1]).toBeCloseTo(0, 6);
  });

  it('shows an animated run-dot when playing and motion is allowed', () => {
    const { container } = render(
      <PlotOverlay route={machineRoute()} canvasW={200} canvasH={200} playing prefersReducedMotion={false} />
    );
    expect(container.querySelector('[data-testid="run-dot"]')).not.toBeNull();
  });

  it('prefers-reduced-motion renders the static full trace with NO animated dot', () => {
    const { container } = render(
      <PlotOverlay route={machineRoute()} canvasW={200} canvasH={200} playing prefersReducedMotion />
    );
    // Full static trace is present…
    expect(container.querySelectorAll('[data-overlay="route"]').length).toBe(2);
    // …but there is no animated dot.
    expect(container.querySelector('[data-testid="run-dot"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Locate highlight ring (two-way, PRD story 25). The `locate` prop is the
// shared highlight target ({ opId } | { layerId }); the overlay paints a calm
// violet casing UNDER the located operation's draw segments (or the located
// layer's crop) — a painted-cell affordance, not a glow, and static, so it is
// reduced-motion safe by construction. Clicking a segment paints it locally
// too (standalone before Lane-I wiring) and reports the target out; ephemeral:
// clicking the located segment again or pressing Esc clears it and reports
// null so shared state agrees in both directions.
// ---------------------------------------------------------------------------
describe('PlotOverlay — locate highlight ring (two-way)', () => {
  it('rings the located Operation draw segments in violet when locate is supplied', () => {
    const { container } = render(
      <PlotOverlay
        route={machineRoute()}
        opRows={OP_ROWS}
        locate={{ opId: 'op-cut' }}
        canvasW={200}
        canvasH={200}
      />
    );
    const rings = container.querySelectorAll('[data-overlay="locate-ring"]');
    expect(rings.length).toBe(1); // op-cut owns exactly one draw segment
    expect(rings[0].getAttribute('stroke')).toContain('--violet');
    // The ring hugs the segment it locates (same endpoints as the #cc0000 draw).
    expect(rings[0].getAttribute('x1')).toBe('0');
    expect(rings[0].getAttribute('y1')).toBe('0');
    expect(rings[0].getAttribute('x2')).toBe('10');
    expect(rings[0].getAttribute('y2')).toBe('0');
  });

  it('clicking a draw segment paints the ring locally and reports the target out', () => {
    const onLocate = vi.fn();
    const { container } = render(
      <PlotOverlay route={machineRoute()} opRows={OP_ROWS} canvasW={200} canvasH={200} onLocate={onLocate} />
    );
    expect(container.querySelectorAll('[data-overlay="locate-ring"]').length).toBe(0);
    const green = [...container.querySelectorAll('[data-overlay="route"]')].find(
      (l) => l.getAttribute('stroke') === '#00aa55'
    );
    fireEvent.click(green);
    expect(onLocate).toHaveBeenCalledWith({ opId: 'op-score' });
    expect(container.querySelectorAll('[data-overlay="locate-ring"]').length).toBe(1);
  });

  it('is ephemeral — clicking the located segment again clears the ring and reports null', () => {
    const onLocate = vi.fn();
    const { container } = render(
      <PlotOverlay route={machineRoute()} opRows={OP_ROWS} canvasW={200} canvasH={200} onLocate={onLocate} />
    );
    const red = [...container.querySelectorAll('[data-overlay="route"]')].find(
      (l) => l.getAttribute('stroke') === '#cc0000'
    );
    fireEvent.click(red);
    fireEvent.click(red);
    expect(container.querySelectorAll('[data-overlay="locate-ring"]').length).toBe(0);
    expect(onLocate).toHaveBeenLastCalledWith(null);
  });

  it('Esc clears the ring and reports null', () => {
    const onLocate = vi.fn();
    const { container } = render(
      <PlotOverlay
        route={machineRoute()}
        opRows={OP_ROWS}
        locate={{ opId: 'op-cut' }}
        canvasW={200}
        canvasH={200}
        onLocate={onLocate}
      />
    );
    expect(container.querySelectorAll('[data-overlay="locate-ring"]').length).toBe(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelectorAll('[data-overlay="locate-ring"]').length).toBe(0);
    expect(onLocate).toHaveBeenLastCalledWith(null);
  });

  it('locate { layerId } rings the matching ghosted crop', () => {
    const { container } = render(
      <PlotOverlay
        route={machineRoute()}
        crops={CROPS}
        locate={{ layerId: 'L9' }}
        canvasW={200}
        canvasH={200}
      />
    );
    const rings = container.querySelectorAll('[data-overlay="locate-ring"]');
    expect(rings.length).toBe(1);
    expect(rings[0].getAttribute('stroke')).toContain('--violet');
    // Polygon ring traces the crop's own points.
    expect(rings[0].tagName.toLowerCase()).toBe('polygon');
    expect(rings[0].getAttribute('points')).toBe('100,100 120,100 120,120');
  });

  it('the ring is static and stays visible under prefers-reduced-motion', () => {
    const { container } = render(
      <PlotOverlay
        route={machineRoute()}
        opRows={OP_ROWS}
        locate={{ opId: 'op-cut' }}
        canvasW={200}
        canvasH={200}
        prefersReducedMotion
      />
    );
    expect(container.querySelectorAll('[data-overlay="locate-ring"]').length).toBe(1);
  });
});

describe('PlotOverlay — Play control', () => {
  it('the Play button toggles the run-through on and reports it out', () => {
    const onPlayingChange = vi.fn();
    const { container, getByTestId } = render(
      <PlotOverlay
        route={machineRoute()}
        canvasW={200}
        canvasH={200}
        playing={false}
        prefersReducedMotion={false}
        onPlayingChange={onPlayingChange}
      />
    );
    expect(container.querySelector('[data-testid="run-dot"]')).toBeNull();
    fireEvent.click(getByTestId('run-play'));
    expect(onPlayingChange).toHaveBeenCalledWith(true);
    expect(container.querySelector('[data-testid="run-dot"]')).not.toBeNull();
  });
});
