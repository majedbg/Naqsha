// ModulationRail — the git-graph relationship rail (WI-8, PRD D6).
//
// An ~18px-wide, absolutely-positioned, pointer-events-none gutter that overlays
// the LEFT edge of LayerTree's rows container. For each modulation edge derived
// by buildModulationGraph(layers), it draws an SVG cubic-bezier from the guide
// row's vertical center down (or up) to the target row's vertical center, hugging
// the gutter like a git commit graph. Edge stroke = field polarity (garnet
// attract / sapphire repel / muted-ink neutral). Edges are dim by default; those
// incident to `selectedLayerId` brighten + thicken (selection-scoped emphasis).
//
// One continuous gutter spans BOTH the flat and grouped tiers, so a guide in one
// panel modulating a target in another simply routes its edge further down the
// same rail — cross-panel relationships render naturally (D6).
//
// GEOMETRY MEASUREMENT (testability contract): the parent (LayerTree) registers
// each rendered LayerRow's DOM node into a `rowRefs` Map<layerId, HTMLElement>.
// At layout time we read each row's offset relative to the rail container to get
// its y-center. In jsdom every measurement is 0 (no layout) — that's fine: the
// `d` strings collapse but the EDGE ELEMENTS still render with their data-attrs,
// which is all the tests assert. In a real browser the refs measure true pixels.

import { useLayoutEffect, useRef, useState } from "react";
import { buildModulationGraph } from "../../lib/fields/modulationGraph";
import { ANCHOR_POS, ANCHOR_NEG } from "../../lib/fields/colormap";

const RAIL_WIDTH = 18;
// Neutral polarity (range straddling zero): a muted ink so it reads as a link
// without claiming a pole. Not literal red/blue (per the colormap contract).
const NEUTRAL_COLOR = "rgb(120, 113, 99)"; // muted ink / taupe

function edgeColor(polaritySign) {
  if (polaritySign > 0) return ANCHOR_POS; // garnet — attract
  if (polaritySign < 0) return ANCHOR_NEG; // sapphire — repel
  return NEUTRAL_COLOR;
}

// y-center of a row relative to the rail container's top, in CSS px. Returns null
// when the row is unknown or unmeasurable (collapsed panel, not yet mounted).
function rowCenterY(node, containerRect) {
  if (!node || !containerRect) return null;
  const r = node.getBoundingClientRect();
  return r.top - containerRect.top + r.height / 2;
}

export default function ModulationRail({ layers, selectedLayerId, rowRefs }) {
  const graph = buildModulationGraph(layers);
  const containerRef = useRef(null);
  // A measurement tick: bumped after layout so the geometry recomputes against
  // live refs. The actual numbers are read inside render via getBoundingClientRect.
  const [, setTick] = useState(0);

  useLayoutEffect(() => {
    // One pass after mount/update is enough for a static list; re-measuring on
    // every render would loop. The tick forces exactly one post-layout redraw so
    // the path `d` reflects real geometry in the browser.
    setTick((t) => t + 1);
    // Intentionally depends on the edge signature + selection so the rail
    // re-measures when the relationship set or layout-affecting inputs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, selectedLayerId]);

  if (graph.edges.length === 0) return null;

  const container = containerRef.current;
  const containerRect = container ? container.getBoundingClientRect() : null;
  const height = containerRect ? containerRect.height : 0;
  // Edges hug the gutter: a vertical spine offset from the left, with the bezier
  // bowing inward between the two endpoints.
  const x = RAIL_WIDTH * 0.5;
  const ctrlX = RAIL_WIDTH * 0.92;

  return (
    <div
      ref={containerRef}
      data-testid="modulation-rail"
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
          const guideNode = rowRefs?.get(edge.guideId);
          const targetNode = rowRefs?.get(edge.targetId);
          const y1 = rowCenterY(guideNode, containerRect) ?? 0;
          const y2 = rowCenterY(targetNode, containerRect) ?? 0;
          const my = (y1 + y2) / 2;
          // Cubic bezier bowing toward the gutter's inner edge at the midpoint.
          const d = `M ${x} ${y1} C ${ctrlX} ${(y1 + my) / 2}, ${ctrlX} ${
            (my + y2) / 2
          }, ${x} ${y2}`;
          const emphasis =
            selectedLayerId != null &&
            (edge.guideId === selectedLayerId ||
              edge.targetId === selectedLayerId);
          return (
            <path
              key={`${edge.guideId}->${edge.targetId}:${i}`}
              data-testid="modulation-edge"
              data-guide={edge.guideId}
              data-target={edge.targetId}
              data-active={edge.active}
              data-polarity={edge.polaritySign}
              data-emphasis={emphasis}
              d={d}
              stroke={edgeColor(edge.polaritySign)}
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
