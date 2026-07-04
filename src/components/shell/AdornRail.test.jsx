// @vitest-environment jsdom
//
// AdornRail — the "adorns" relationship rail (motif↔host adornment), a mirror of
// ModulationRail. A continuous ~18px left gutter draws an SVG bezier edge from
// each MOTIF row to the HOST row it adorns, in a distinct gold, dimmed by
// default, brightened when incident to the selected layer (as motif OR host).
//
// jsdom TESTABILITY CONTRACT (identical to LayerTree.rail.test): jsdom reports 0
// for getBoundingClientRect, so the bezier `d` string is meaningless here. These
// tests assert STRUCTURE — element presence, data attributes, emphasis flag —
// and NEVER the `d` value or any measured geometry.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AdornRail from "./AdornRail";
import { createMotifParams } from "../../lib/motif/motifLayer";

// A stub row node: AdornRail only ever calls node.getBoundingClientRect() on it
// (via rowCenterY). In jsdom the numbers are 0 — presence is what matters.
function stubNode() {
  return { getBoundingClientRect: () => ({ top: 0, height: 0 }) };
}

function makeHost(id, { name } = {}) {
  return {
    id,
    name: name || id,
    patternType: "grainfield",
    params: {},
    visible: true,
    locked: false,
    operationId: "op-cut",
  };
}

function makeMotif(id, hostLayerId, { name } = {}) {
  return {
    id,
    name: name || id,
    type: "motif",
    params: createMotifParams({ glyphRef: "leaf", hostLayerId }),
    visible: true,
    locked: false,
    operationId: "op-engrave",
  };
}

// rowRefs Map seeded with a stub node for each supplied layer id.
function rowRefsFor(...ids) {
  const m = new Map();
  for (const id of ids) m.set(id, stubNode());
  return m;
}

describe("AdornRail — motif↔host adornment rail", () => {
  it("renders one adorn-edge per motif→host pair with matching data-motif/data-host", () => {
    const host = makeHost("h1");
    const motif = makeMotif("m1", "h1");
    render(
      <AdornRail
        layers={[host, motif]}
        selectedLayerId={null}
        rowRefs={rowRefsFor("h1", "m1")}
      />
    );
    const edges = screen.getAllByTestId("adorn-edge");
    expect(edges).toHaveLength(1);
    expect(edges[0]).toHaveAttribute("data-motif", "m1");
    expect(edges[0]).toHaveAttribute("data-host", "h1");
    expect(edges[0]).toHaveAttribute("data-active", "true");
  });

  it("renders NO edge (and no gutter) for a motif whose host is dangling", () => {
    const motif = makeMotif("m1", "ghost-host"); // host id not present in layers
    render(
      <AdornRail
        layers={[motif]}
        selectedLayerId={null}
        rowRefs={rowRefsFor("m1")}
      />
    );
    // Dangling host → orphan in buildAdornGraph → no edge → rail returns null.
    expect(screen.queryByTestId("adorn-edge")).toBeNull();
    expect(screen.queryByTestId("adorn-rail")).toBeNull();
  });

  it("emphasizes edges incident to the selected layer, dims the rest", () => {
    const host = makeHost("h1");
    const motifA = makeMotif("mA", "h1");
    const motifB = makeMotif("mB", "h1");
    const layers = [host, motifA, motifB];
    const refs = rowRefsFor("h1", "mA", "mB");

    // Nothing selected → no edge carries the emphasis marker.
    const { rerender } = render(
      <AdornRail layers={layers} selectedLayerId={null} rowRefs={refs} />
    );
    expect(
      screen
        .getAllByTestId("adorn-edge")
        .filter((e) => e.getAttribute("data-emphasis") === "true")
    ).toHaveLength(0);

    // Selecting a motif brightens its incident edge, dims the sibling motif's.
    rerender(
      <AdornRail layers={layers} selectedLayerId="mA" rowRefs={refs} />
    );
    let edges = screen.getAllByTestId("adorn-edge");
    const aEdge = edges.find((e) => e.getAttribute("data-motif") === "mA");
    const bEdge = edges.find((e) => e.getAttribute("data-motif") === "mB");
    expect(aEdge).toHaveAttribute("data-emphasis", "true");
    expect(bEdge).toHaveAttribute("data-emphasis", "false");

    // Selecting the shared HOST emphasizes BOTH incident edges (host-side match).
    rerender(
      <AdornRail layers={layers} selectedLayerId="h1" rowRefs={refs} />
    );
    edges = screen.getAllByTestId("adorn-edge");
    expect(
      edges.filter((e) => e.getAttribute("data-emphasis") === "true")
    ).toHaveLength(2);
  });

  it("skips an edge whose host row node is missing from rowRefs (collapsed row)", () => {
    const host = makeHost("h1");
    const motif = makeMotif("m1", "h1");
    // Motif row is registered, host row is NOT (e.g. host inside a collapsed panel).
    render(
      <AdornRail
        layers={[host, motif]}
        selectedLayerId={null}
        rowRefs={rowRefsFor("m1")}
      />
    );
    expect(screen.queryByTestId("adorn-edge")).toBeNull();
  });
});
