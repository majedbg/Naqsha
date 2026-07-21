// @vitest-environment jsdom
// Motif MODE selector (Variant D, motif-shell) — the per-motif exclusive mode
// column that REPLACES the old "Quick start" add-chip row. Inside each motif
// row's card, a radiogroup of the 4 starter presets + Custom sits to the LEFT
// of the Block rack. Exactly one row is LIT, derived from the motif's chain via
// modeForMotif (not local state). Picking a preset rewrites the motif's chain
// through the SAME onUpdateLayer seam as a rack edit — ONE undo entry. Editing
// any rack block re-derives the mode and slides the selection to Custom with no
// extra wiring. On an empty host the same column appears under "Start with" and
// a pick CREATES a motif via onAddMotif (the old chip-add behavior, folded in).
//
// Data correctness of the presets themselves (engine-valid, host-aware chains,
// built-in glyphs) lives in starterChips.test.js / modeMatch.test.js; this file
// owns the UI SEAM.

import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import Inspector from "./Inspector";
import {
  MOTIF_TYPE,
  createMotifParams,
} from "../../lib/motif/motifLayer";
import { STARTER_CHIPS } from "../../lib/motif/starterChips";
import { applyModeChain, modeForMotif } from "../../lib/motif/modeMatch";

vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: "studio" }),
}));

function hostLayer(id = "host1", patternType = "grid") {
  return { id, name: id, patternType, params: {}, randomizeKeys: [], paramsCache: {} };
}

// A motif whose chain is EXACTLY the preset `chipId` on `patternType` — so
// modeForMotif lights that row. createMotifParams preserves `binding.chain`
// verbatim (C1), so the round-trip stays lit.
function motifOnMode(id, hostId, chipId, patternType = "grid") {
  const applied = applyModeChain(chipId, patternType);
  return {
    id,
    name: id,
    type: MOTIF_TYPE,
    patternType: MOTIF_TYPE,
    params: createMotifParams({
      hostLayerId: hostId,
      glyphRef: applied.glyphRef,
      anchorMode: applied.anchorMode,
      binding: applied.binding,
    }),
    randomizeKeys: [],
    paramsCache: {},
  };
}

// A motif diverged from the vine preset (an extra role) → modeForMotif = custom.
function motifDiverged(id, hostId, patternType = "grid") {
  const applied = applyModeChain("vine", patternType);
  const chain = applied.binding.chain.map((b) =>
    b.type === "route" ? { ...b, roles: [...b.roles, "tip"] } : b
  );
  return {
    id,
    name: id,
    type: MOTIF_TYPE,
    patternType: MOTIF_TYPE,
    params: createMotifParams({
      hostLayerId: hostId,
      glyphRef: applied.glyphRef,
      anchorMode: applied.anchorMode,
      binding: { ...applied.binding, chain },
    }),
    randomizeKeys: [],
    paramsCache: {},
  };
}

// A live host that actually applies onUpdateLayer / onAddMotif to its layer
// list, so EMERGENT behavior (rack edit → mode re-derives to Custom; empty
// pick → a motif appears) can be observed through a re-render.
function StatefulHost({ initialLayers, onAdd }) {
  const [layers, setLayers] = useState(initialLayers);
  const onUpdateLayer = (id, patch) =>
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const onAddMotif = (hostId, opts) => {
    onAdd?.(hostId, opts);
    const m = {
      id: `new-${layers.length}`,
      name: "new",
      type: MOTIF_TYPE,
      patternType: MOTIF_TYPE,
      params: createMotifParams({
        hostLayerId: hostId,
        glyphRef: opts.glyphRef,
        anchorMode: opts.anchorMode,
        binding: opts.binding,
      }),
      randomizeKeys: [],
      paramsCache: {},
    };
    setLayers((ls) => [...ls, m]);
  };
  return (
    <Inspector
      layers={layers}
      selectedLayerId="host1"
      onUpdateLayer={onUpdateLayer}
      onChangeLayerPattern={() => {}}
      onAddMotif={onAddMotif}
    />
  );
}

const PRESET_IDS = STARTER_CHIPS.map((c) => c.id);

describe("Motif mode selector — the old quick-start chips are gone", () => {
  it("renders NO quick-start add-chip row", () => {
    render(
      <Inspector
        layers={[hostLayer("host1", "grid")]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.queryByTestId("motif-starter-chips")).toBeNull();
    expect(screen.queryByText("Quick start")).toBeNull();
    for (const id of PRESET_IDS) {
      expect(screen.queryByTestId(`motif-chip-${id}`)).toBeNull();
    }
  });
});

describe("Motif mode selector — per-motif row", () => {
  it("each motif row shows a Motif mode radiogroup: 4 presets + Custom", () => {
    const motif = motifOnMode("m1", "host1", "vine");
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    const group = screen.getByRole("radiogroup", { name: "Motif mode" });
    expect(group).toBeInTheDocument();
    for (const id of PRESET_IDS) {
      expect(within(group).getByTestId(`motif-mode-${id}`)).toBeInTheDocument();
    }
    expect(within(group).getByTestId("motif-mode-custom")).toBeInTheDocument();
  });

  it("lights the row matching modeForMotif and no other", () => {
    const motif = motifOnMode("m1", "host1", "vine");
    // sanity: the fixture really is 'vine'
    expect(modeForMotif(motif.params.binding, "grid")).toBe("vine");
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.getByTestId("motif-mode-vine")).toHaveAttribute(
      "aria-checked",
      "true"
    );
    for (const id of ["alternate-xo", "sparse-scatter", "border-march", "custom"]) {
      expect(screen.getByTestId(`motif-mode-${id}`)).toHaveAttribute(
        "aria-checked",
        "false"
      );
    }
  });

  it("shows the RhythmStrip ONLY on the lit row (ledger pattern)", () => {
    const motif = motifOnMode("m1", "host1", "vine");
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    // The lit row carries an SVG strip; an unlit preset row does not.
    expect(
      screen.getByTestId("motif-mode-vine").querySelector("svg [data-mark]")
    ).toBeTruthy();
    expect(
      screen
        .getByTestId("motif-mode-alternate-xo")
        .querySelector("svg [data-mark]")
    ).toBeFalsy();
  });

  it("picking a preset rewrites the chain in ONE onUpdateLayer (one undo entry)", () => {
    const onUpdateLayer = vi.fn();
    const motif = motifOnMode("m1", "host1", "vine");
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("motif-mode-border-march"));
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [id, patch] = onUpdateLayer.mock.calls[0];
    expect(id).toBe("m1");
    const expected = applyModeChain("border-march", "grid");
    expect(patch.params.binding.chain).toEqual(expected.binding.chain);
    expect(patch.params.glyphRef).toBe(expected.glyphRef);
    expect(patch.params.anchorMode).toBe(expected.anchorMode);
    // The written chain really reads back as the picked mode.
    expect(modeForMotif(patch.params.binding, "grid")).toBe("border-march");
  });

  it("picking the lit preset again is inert-safe (still one clean write, same mode)", () => {
    const onUpdateLayer = vi.fn();
    const motif = motifOnMode("m1", "host1", "vine");
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("motif-mode-vine"));
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    expect(modeForMotif(onUpdateLayer.mock.calls[0][1].params.binding, "grid")).toBe(
      "vine"
    );
  });

  it("picking Custom does nothing (no write) — it is only ever lit by divergence", () => {
    const onUpdateLayer = vi.fn();
    const motif = motifDiverged("m1", "host1");
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    // Custom is the lit row for a diverged motif.
    expect(screen.getByTestId("motif-mode-custom")).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.click(screen.getByTestId("motif-mode-custom"));
    expect(onUpdateLayer).not.toHaveBeenCalled();
  });

  it("editing a rack block re-derives the mode → selection slides to Custom (emergent, no new wiring)", () => {
    const motif = motifOnMode("m1", "host1", "vine");
    render(<StatefulHost initialLayers={[hostLayer("host1", "grid"), motif]} />);
    // Starts lit on vine.
    expect(screen.getByTestId("motif-mode-vine")).toHaveAttribute(
      "aria-checked",
      "true"
    );
    // Toggle an extra anchor role via the Route row's collapsed role-toggle
    // summary (Variant D — the primary, no-unfold path) → the chain diverges.
    fireEvent.click(screen.getByTestId("motif-role-toggle-tip"));
    // With zero mode-specific code, the lit row is now Custom.
    expect(screen.getByTestId("motif-mode-custom")).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByTestId("motif-mode-vine")).toHaveAttribute(
      "aria-checked",
      "false"
    );
    // Roving tabindex follows the DERIVED lit row: after diverging via the rack
    // (focus was in the rack, not this column), the tabbable radio is Custom —
    // so tabbing back into the group lands on the checked row, not a stale one.
    expect(screen.getByTestId("motif-mode-custom")).toHaveAttribute(
      "tabindex",
      "0"
    );
    expect(screen.getByTestId("motif-mode-vine")).toHaveAttribute(
      "tabindex",
      "-1"
    );
  });
});

describe("Motif mode selector — keyboard (radiogroup)", () => {
  it("roving tabindex: the lit row is tabbable, the rest are not", () => {
    const motif = motifOnMode("m1", "host1", "vine");
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.getByTestId("motif-mode-vine")).toHaveAttribute("tabindex", "0");
    expect(screen.getByTestId("motif-mode-alternate-xo")).toHaveAttribute(
      "tabindex",
      "-1"
    );
  });

  it("ArrowDown moves focus without committing; Enter/Space commits via native click", () => {
    const onUpdateLayer = vi.fn();
    const motif = motifOnMode("m1", "host1", "alternate-xo");
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    const first = screen.getByTestId(`motif-mode-${PRESET_IDS[0]}`);
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    // Focus moved to the next row; NO write happened on the move.
    const second = screen.getByTestId(`motif-mode-${PRESET_IDS[1]}`);
    expect(second).toHaveFocus();
    expect(onUpdateLayer).not.toHaveBeenCalled();
    // Native button activation (click == Enter/Space) commits the focused row.
    fireEvent.click(second);
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    expect(modeForMotif(onUpdateLayer.mock.calls[0][1].params.binding, "grid")).toBe(
      PRESET_IDS[1]
    );
  });
});

describe("Motif mode selector — empty host (Start with)", () => {
  it("shows a Start with mode column when the host has no motifs", () => {
    render(
      <Inspector
        layers={[hostLayer("host1", "grid")]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.getByText("Start with")).toBeInTheDocument();
    const group = screen.getByRole("radiogroup", { name: "Motif mode" });
    for (const id of PRESET_IDS) {
      expect(within(group).getByTestId(`motif-mode-${id}`)).toBeInTheDocument();
    }
  });

  it("picking a mode on an empty host CREATES a motif via onAddMotif (host-aware)", () => {
    const onAdd = vi.fn();
    render(<StatefulHost initialLayers={[hostLayer("host1", "grid")]} onAdd={onAdd} />);
    expect(screen.queryByTestId("motif-row")).toBeNull();
    fireEvent.click(screen.getByTestId("motif-mode-vine"));
    // onAddMotif fired once with the vine preset's built options.
    expect(onAdd).toHaveBeenCalledTimes(1);
    const [hostId, opts] = onAdd.mock.calls[0];
    expect(hostId).toBe("host1");
    const expected = applyModeChain("vine", "grid");
    expect(opts.anchorMode).toBe(expected.anchorMode);
    expect(opts.binding.chain).toEqual(expected.binding.chain);
    // A motif row now exists.
    expect(screen.getAllByTestId("motif-row")).toHaveLength(1);
  });

  it("picking a mode on an EDGE host creates an edge-mode motif", () => {
    const onAdd = vi.fn();
    render(
      <Inspector
        layers={[hostLayer("host1", "flowfield")]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onAddMotif={onAdd}
      />
    );
    fireEvent.click(screen.getByTestId("motif-mode-alternate-xo"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const [, opts] = onAdd.mock.calls[0];
    expect(opts.anchorMode).toBe("edge");
    const route = opts.binding.chain.find((b) => b.type === "route");
    expect(route.roles).toEqual(["edge"]);
  });
});
