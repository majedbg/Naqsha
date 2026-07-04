// AdornRail — the "adorns" relationship rail (motif↔host adornment).
//
// A MIRROR of ModulationRail: an ~18px-wide, absolutely-positioned,
// pointer-events-none gutter that overlays the LEFT edge of LayerTree's rows
// container. For each adorn edge derived by buildAdornGraph(layers), it draws an
// SVG cubic-bezier from the MOTIF row's vertical center to the HOST row's
// vertical center it adorns, hugging the gutter like a git commit graph.
//
// It LAYERS OVER ModulationRail in the same gutter — both are transparent +
// pointer-events-none, and adorn vs modulation edges route between mostly-
// different row pairs so overlap is rare. To keep the two distinguishable where
// they DO overlap, adorn edges use a single distinct ADORN_COLOR (an ornament-y
// gold — NOT the diverging garnet/sapphire/taupe of the modulation rail) and bow
// their control points toward the OPPOSITE gutter edge from ModulationRail.
//
// There is no polarity concept here: a motif adorns exactly one host, so every
// edge shares ADORN_COLOR. Edges are dim by default; those incident to
// `selectedLayerId` (as motif OR host) brighten + thicken (selection-scoped
// emphasis) — mirroring ModulationRail's emphasis numbers exactly.
//
// GEOMETRY MEASUREMENT (testability contract): identical to ModulationRail — the
// parent (LayerTree) registers each rendered LayerRow's DOM node into a shared
// `rowRefs` Map<layerId, HTMLElement>. At layout time we read each row's offset
// relative to the rail container to get its y-center. In jsdom every measurement
// is 0 (no layout) — that's fine: the `d` strings collapse but the EDGE ELEMENTS
// still render with their data-attrs, which is all the tests assert.

import { useLayoutEffect, useRef, useState } from "react";
import { buildAdornGraph } from "../../lib/motif/adornGraph";

const RAIL_WIDTH = 18;
// Ornament-y warm gold — deliberately DISTINCT from the modulation rail's
// diverging palette (garnet rgb(178,42,92) / sapphire rgb(17,109,138) / taupe
// rgb(120,113,99)). Gold is the only yellow-hued tone of the four, so an adorn
// edge never reads as a modulation edge even where the two gutters overlap.
const ADORN_COLOR = "rgb(184, 134, 11)"; // gold / amber — "adorns"

// y-center of a row relative to the rail container's top, in CSS px. Returns null
// when the row is unknown or unmeasurable (collapsed panel, not yet mounted).
// Copied verbatim from ModulationRail (shared gutter geometry contract).
function rowCenterY(node, containerRect) {
  if (!node || !containerRect) return null;
  const r = node.getBoundingClientRect();
  return r.top - containerRect.top + r.height / 2;
}

export default function AdornRail({ layers, selectedLayerId, rowRefs }) {
  const graph = buildAdornGraph(layers);
  const containerRef = useRef(null);
  // A measurement tick: bumped after layout so the geometry recomputes against
  // live refs. The actual numbers are read inside render via getBoundingClientRect.
  const [, setTick] = useState(0);

  useLayoutEffect(() => {
    // One pass after mount/update is enough for a static list; re-measuring on
    // every render would loop. The tick forces exactly one post-layout redraw so
    // the path `d` reflects real geometry in the browser.
    setTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, selectedLayerId]);

  // Re-measure when the rows container changes height (panel collapse/expand
  // reflows rows WITHOUT changing `layers` identity). ResizeObserver is absent in
  // jsdom, so this is a browser-only refinement (guarded → no-op under test).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (graph.edges.length === 0) return null;

  const container = containerRef.current;
  const containerRect = container ? container.getBoundingClientRect() : null;
  const height = containerRect ? containerRect.height : 0;
  // Edges hug the gutter: a vertical spine offset from the left, with the bezier
  // bowing toward the OUTER (left) edge — the opposite side from ModulationRail's
  // ctrlX (0.92, inner edge) — so overlapping adorn+modulation edges separate.
  const x = RAIL_WIDTH * 0.5;
  const ctrlX = RAIL_WIDTH * 0.08;

  return (
    <div
      ref={containerRef}
      data-testid="adorn-rail"
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 z-0"
      style={{ width: RAIL_WIDTH }}
    >
      <svg
        width={RAIL_WIDTH}
        height={height}
        viewBox={`0 0 ${RAIL_WIDTH} ${height}`}
        className="overflow-visible"
        fill="none"
      >
        {graph.edges.map((edge, i) => {
          const motifNode = rowRefs?.get(edge.motifId);
          const hostNode = rowRefs?.get(edge.hostId);
          // Skip dangling/collapsed endpoints — same guard ModulationRail uses.
          if (!motifNode || !hostNode) return null;
          const y1 = rowCenterY(motifNode, containerRect) ?? 0;
          const y2 = rowCenterY(hostNode, containerRect) ?? 0;
          const my = (y1 + y2) / 2;
          // Cubic bezier bowing toward the gutter's OUTER edge at the midpoint.
          const d = `M ${x} ${y1} C ${ctrlX} ${(y1 + my) / 2}, ${ctrlX} ${
            (my + y2) / 2
          }, ${x} ${y2}`;
          const emphasis =
            selectedLayerId != null &&
            (edge.motifId === selectedLayerId ||
              edge.hostId === selectedLayerId);
          return (
            <path
              key={`${edge.motifId}->${edge.hostId}:${i}`}
              data-testid="adorn-edge"
              data-motif={edge.motifId}
              data-host={edge.hostId}
              data-active={edge.active}
              data-emphasis={emphasis}
              d={d}
              stroke={ADORN_COLOR}
              strokeWidth={emphasis ? 2 : 1.25}
              strokeLinecap="round"
              opacity={emphasis ? 0.95 : 0.4}
            />
          );
        })}
      </svg>
    </div>
  );
}
