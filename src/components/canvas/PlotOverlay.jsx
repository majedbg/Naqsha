// PlotOverlay — plot preview + overlap warnings as a canvas overlay (Lane C / C7,
// issue #15). Surfaces the SAME information the legacy Prepare-tab
// PlotPreviewSection + OverlapWarnings show, but in place over the canvas in the
// pro shell instead of in a side panel/tab.
//
// Prop-driven (modeled on BedOverlay, NOT CanvasChrome): the route + overlap
// geometry live in canvas-px space (viewBox `0 0 canvasW canvasH`), so this SVG
// renders as a sibling of the p5 surface INSIDE the scaled wrapper. It therefore
// auto-aligns with the live design and scales with the canvas transform for free
// — no zoom prop needed. Pointer-events-none so it never steals canvas input.
//
// Reuse, not reinvention:
//   - Plot preview  → buildPlottableLayers + buildRouteFromLayers (the exact
//     pipeline PlotPreviewSection animates), drawn here as a STATIC route trace.
//   - Overlap highlights → per-layer countOverlaps from overlapCheck.js, matching
//     OverlapWarnings' semantics (summed within-layer, samples capped at 24).
//
// Optimization basis (deliberate, mirrors the legacy split): the route preview
// uses the APPLIED optimizations (post-optimize, like PlotPreviewSection); the
// overlap check runs PRE-optimize (passes `{}`, like OverlapWarnings) so its
// crossing highlights match the legacy tab exactly.

import { useMemo } from 'react';
import {
  buildPlottableLayers,
  buildRouteFromLayers,
} from '../../lib/plotter/fabricationPipeline';
import { countOverlaps } from '../../lib/plotter/overlapCheck';

const MAX_SAMPLES = 24;

export default function PlotOverlay({
  layers,
  patternInstances,
  canvasW,
  canvasH,
  appliedOptimizations = null,
}) {
  // Route preview — post-optimize, the basis PlotPreviewSection uses.
  const route = useMemo(() => {
    if (!layers || !patternInstances) return [];
    const plottable = buildPlottableLayers(layers, patternInstances, {
      optimizations: appliedOptimizations,
    });
    return buildRouteFromLayers(plottable);
  }, [layers, patternInstances, appliedOptimizations]);

  // Overlap highlights — pre-optimize, summed per layer, exactly as
  // OverlapWarnings computes them. Collect the intersection sample points.
  const overlaps = useMemo(() => {
    if (!layers || !patternInstances) return [];
    const plottable = buildPlottableLayers(layers, patternInstances, {});
    const samples = [];
    for (const layer of plottable) {
      const res = countOverlaps(layer.paths);
      for (const s of res.samples) {
        if (samples.length < MAX_SAMPLES) samples.push(s);
      }
    }
    return samples;
  }, [layers, patternInstances]);

  if (!layers?.length) return null;

  const span = Math.max(canvasW || 0, canvasH || 0, 1);
  const drawW = span * 0.0016;
  const travelW = span * 0.001;
  const markR = span * 0.012;

  return (
    <svg
      data-testid="plot-overlay"
      className="pointer-events-none absolute inset-0"
      width={canvasW}
      height={canvasH}
      viewBox={`0 0 ${canvasW} ${canvasH}`}
      aria-label="Plot preview and overlap overlay"
    >
      {/* Plot route trace (static) — draw strokes solid, travel hops dashed. */}
      {route.map((seg, i) =>
        seg.type === 'draw' ? (
          <line
            key={`d-${i}`}
            data-overlay="route"
            x1={seg.from[0]} y1={seg.from[1]}
            x2={seg.to[0]}   y2={seg.to[1]}
            stroke={seg.color || '#00c9b1'}
            strokeOpacity={0.85}
            strokeWidth={drawW}
            strokeLinecap="round"
          />
        ) : (
          <line
            key={`t-${i}`}
            data-overlay="travel"
            x1={seg.from[0]} y1={seg.from[1]}
            x2={seg.to[0]}   y2={seg.to[1]}
            stroke="#9aa0a6"
            strokeOpacity={0.5}
            strokeWidth={travelW}
            strokeDasharray={span * 0.006}
          />
        )
      )}

      {/* Overlap highlights — ring each detected crossing point. */}
      {overlaps.map((pt, i) => (
        <circle
          key={`o-${i}`}
          data-overlay="overlap"
          data-x={pt[0]}
          data-y={pt[1]}
          cx={pt[0]}
          cy={pt[1]}
          r={markR}
          fill="#ff4d4d"
          fillOpacity={0.25}
          stroke="#ff4d4d"
          strokeOpacity={0.9}
          strokeWidth={span * 0.0016}
        />
      ))}
    </svg>
  );
}
