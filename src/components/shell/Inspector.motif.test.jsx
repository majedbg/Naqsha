// @vitest-environment jsdom
// MotifDevice (host Inspector) — add/edit/remove motifs adorning a host layer
// (grid/recursive/spiral/voronoi). Exercises the device through the public <Inspector>,
// plus the exported deepMergeBinding helper's partial-patch invariant.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Inspector from "./Inspector";
import {
  MOTIF_TYPE,
  createMotifParams,
  deepMergeBinding,
} from "../../lib/motif/motifLayer";

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

function motifLayer(id, hostId, binding) {
  return {
    id,
    name: id,
    type: MOTIF_TYPE,
    patternType: MOTIF_TYPE,
    params: createMotifParams({ hostLayerId: hostId, glyphRef: "leaf", binding }),
    randomizeKeys: [],
    paramsCache: {},
  };
}

const defaultBinding = {
  selection: { roles: ["crossing"], rate: { n: 1 } },
  placement: {
    sizing: { mode: "proportional", size: 18, min: 3, margin: 0.85 },
    orientation: { policy: "path", useNormal: true },
    flip: false,
  },
};

describe("deepMergeBinding", () => {
  it("merges a partial patch without dropping sibling branches", () => {
    const merged = deepMergeBinding(defaultBinding, {
      selection: { rate: { n: 3 } },
    });
    expect(merged.selection.rate.n).toBe(3);
    // Siblings survive.
    expect(merged.selection.roles).toEqual(["crossing"]);
    expect(merged.placement.sizing.size).toBe(18);
    expect(merged.placement.flip).toBe(false);
  });

  it("replaces arrays wholesale (roles)", () => {
    const merged = deepMergeBinding(defaultBinding, {
      selection: { roles: ["edge", "tip"] },
    });
    expect(merged.selection.roles).toEqual(["edge", "tip"]);
    expect(merged.selection.rate.n).toBe(1);
  });
});

describe("MotifDevice", () => {
  it("hides on ineligible hosts (no semantic extractor) and on motif layers themselves", () => {
    const { rerender } = render(
      <Inspector
        layers={[hostLayer("h", "flowField")]}
        selectedLayerId="h"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.queryByTestId("motif-device")).toBeNull();

    const motif = motifLayer("m", "host1", defaultBinding);
    rerender(
      <Inspector
        layers={[motif]}
        selectedLayerId="m"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.queryByTestId("motif-device")).toBeNull();
  });

  it("shows on a voronoi host (drawn-geometry seam makes it eligible)", () => {
    render(
      <Inspector
        layers={[hostLayer("vh", "voronoi")]}
        selectedLayerId="vh"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.getByTestId("motif-device")).toBeInTheDocument();
  });

  it("shows on an eligible host and lists its motifs", () => {
    const motif = motifLayer("m1", "host1", defaultBinding);
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.getByTestId("motif-device")).toBeInTheDocument();
    // Collapsed by default → expand before asserting the body.
    fireEvent.click(screen.getByTestId("motif-toggle"));
    expect(screen.getAllByTestId("motif-row")).toHaveLength(1);
  });

  it("is collapsed by default and reveals its body when the toggle is clicked", () => {
    const motif = motifLayer("m1", "host1", defaultBinding);
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    // Device (with its toggle) is present, but the body is hidden.
    const toggle = screen.getByTestId("motif-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("motif-row")).toBeNull();
    expect(screen.queryByTestId("motif-add")).toBeNull();
    // Expanding reveals the body.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("motif-add")).toBeInTheDocument();
    expect(screen.getAllByTestId("motif-row")).toHaveLength(1);
  });

  it("Add Motif calls onAddMotif with the host id and a sensible default binding", () => {
    const onAddMotif = vi.fn();
    render(
      <Inspector
        layers={[hostLayer("host1", "grid")]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onAddMotif={onAddMotif}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    fireEvent.click(screen.getByTestId("motif-add"));
    expect(onAddMotif).toHaveBeenCalledTimes(1);
    const [hostId, opts] = onAddMotif.mock.calls[0];
    expect(hostId).toBe("host1");
    expect(opts.glyphRef).toBe("leaf");
    expect(opts.binding.selection.roles).toEqual(["crossing"]);
  });

  it("toggling a role writes an explicit roles array via a deep-merged patch", () => {
    const onUpdateLayer = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    // Add 'edge' (crossing already on).
    fireEvent.click(screen.getByTestId("motif-role-edge"));
    expect(onUpdateLayer).toHaveBeenCalledWith("m1", expect.anything());
    const [, patch] = onUpdateLayer.mock.calls[0];
    expect(patch.params.binding.selection.roles).toEqual(["crossing", "edge"]);
    // Placement branch preserved by the deep merge.
    expect(patch.params.binding.placement.sizing.size).toBe(18);
  });

  it("editing Every-Nth deep-merges into selection.rate.n (min 1)", () => {
    const onUpdateLayer = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    fireEvent.change(screen.getByTestId("motif-rate-n"), {
      target: { value: "4" },
    });
    const [, patch] = onUpdateLayer.mock.calls[0];
    expect(patch.params.binding.selection.rate.n).toBe(4);
    expect(patch.params.binding.selection.roles).toEqual(["crossing"]);
  });

  it("Remove calls onRemoveLayer with the motif id", () => {
    const onRemoveLayer = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onRemoveLayer={onRemoveLayer}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    fireEvent.click(screen.getByTestId("motif-remove"));
    expect(onRemoveLayer).toHaveBeenCalledWith("m1");
  });
});
