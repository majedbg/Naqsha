// @vitest-environment jsdom
// Starter chips (C5, issue #79) — the Motif device's quick-start row. Each
// chip is a tappable button that calls onAddMotif with a curated, host-aware
// chain-form binding (src/lib/motif/starterChips.js). Data correctness
// (engine-valid, sequence-terminal, built-in-only glyphs, host branching) is
// covered by starterChips.test.js; this file covers the UI SEAM — the row
// renders, is host-aware, and one tap fires onAddMotif exactly once with a
// chain-form binding that survives createMotifParams (C1).

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Inspector from "./Inspector";
import { STARTER_CHIPS } from "../../lib/motif/starterChips";

vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: "studio" }),
}));

function hostLayer(id = "host1", patternType = "grid") {
  return {
    id,
    name: id,
    patternType,
    params: {},
    randomizeKeys: [],
    paramsCache: {},
  };
}

// The device is OPEN by default (motif-shell D — the audit's discoverability
// fix), so rendering is enough; clicking the toggle would now CLOSE it.
function openMotifDevice(props) {
  render(<Inspector {...props} />);
}

describe("Motif device — starter chips", () => {
  it("renders one chip button per STARTER_CHIPS entry", () => {
    openMotifDevice({
      layers: [hostLayer("host1", "grid")],
      selectedLayerId: "host1",
      onUpdateLayer: () => {},
      onChangeLayerPattern: () => {},
    });
    for (const chip of STARTER_CHIPS) {
      expect(screen.getByTestId(`motif-chip-${chip.id}`)).toBeInTheDocument();
    }
  });

  it("tapping a chip on a SEMANTIC host calls onAddMotif once with a chain-form, semantic binding", () => {
    const onAddMotif = vi.fn();
    openMotifDevice({
      layers: [hostLayer("host1", "grid")],
      selectedLayerId: "host1",
      onUpdateLayer: () => {},
      onChangeLayerPattern: () => {},
      onAddMotif,
    });
    fireEvent.click(screen.getByTestId("motif-chip-vine"));
    expect(onAddMotif).toHaveBeenCalledTimes(1);
    const [hostId, opts] = onAddMotif.mock.calls[0];
    expect(hostId).toBe("host1");
    expect(opts.anchorMode).toBe("semantic");
    expect(Array.isArray(opts.binding.chain)).toBe(true);
    const route = opts.binding.chain.find((b) => b.type === "route");
    expect(route.roles).toEqual(["crossing"]);
    expect(["all", "open"]).toContain(route.pathScope);
    const seq = opts.binding.chain.find((b) => b.type === "sequence");
    expect(seq.slots.map((s) => s.glyphRef)).toEqual(["rosette", "leaf", "leaf"]);
  });

  it("tapping a chip on an EDGE host calls onAddMotif once with a chain-form, edge binding", () => {
    const onAddMotif = vi.fn();
    openMotifDevice({
      layers: [hostLayer("host1", "flowfield")],
      selectedLayerId: "host1",
      onUpdateLayer: () => {},
      onChangeLayerPattern: () => {},
      onAddMotif,
    });
    fireEvent.click(screen.getByTestId("motif-chip-alternate-xo"));
    expect(onAddMotif).toHaveBeenCalledTimes(1);
    const [hostId, opts] = onAddMotif.mock.calls[0];
    expect(hostId).toBe("host1");
    expect(opts.anchorMode).toBe("edge");
    const route = opts.binding.chain.find((b) => b.type === "route");
    expect(route.roles).toEqual(["edge"]);
  });

  it("a chip tap creates a NEW motif — distinct from editing an existing one", () => {
    const onAddMotif = vi.fn();
    const onUpdateLayer = vi.fn();
    openMotifDevice({
      layers: [hostLayer("host1", "grid")],
      selectedLayerId: "host1",
      onUpdateLayer,
      onChangeLayerPattern: () => {},
      onAddMotif,
    });
    fireEvent.click(screen.getByTestId("motif-chip-sparse-scatter"));
    expect(onAddMotif).toHaveBeenCalledTimes(1);
    expect(onUpdateLayer).not.toHaveBeenCalled();
  });
});
