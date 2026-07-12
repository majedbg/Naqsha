// @vitest-environment jsdom
// MotifDevice (host Inspector) — add/edit/remove motifs adorning a host layer
// (grid/recursive/spiral/voronoi). Exercises the device through the public <Inspector>,
// plus the exported deepMergeBinding helper's partial-patch invariant.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import Inspector from "./Inspector";
import { InspectorDockProvider } from "./inspectorDockContext";
import {
  MOTIF_TYPE,
  createMotifParams,
  deepMergeBinding,
  ensureChainForm,
} from "../../lib/motif/motifLayer";
import { reorderChain } from "../../lib/motif/chainEditor";

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

  it("toggling a role in the Route card writes chain-form (roles on the route block)", () => {
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
    // Add 'edge' (crossing already on, from the compiled Route block).
    fireEvent.click(screen.getByTestId("motif-block-role-edge"));
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdateLayer.mock.calls[0];
    // First-edit rewrite: chain-form, legacy `selection` DROPPED.
    expect(patch.params.binding.chain).toBeInstanceOf(Array);
    expect(patch.params.binding.selection).toBeUndefined();
    const route = patch.params.binding.chain.find((b) => b.type === "route");
    expect(route.roles).toEqual(["crossing", "edge"]);
    // Placement preserved through the merge.
    expect(patch.params.binding.placement.sizing.size).toBe(18);
  });

  it("editing Every N in its Block card writes chain-form (everyN.n, min 1)", () => {
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
    fireEvent.change(screen.getByTestId("motif-block-n"), {
      target: { value: "4" },
    });
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdateLayer.mock.calls[0];
    const everyN = patch.params.binding.chain.find((b) => b.type === "everyN");
    expect(everyN.n).toBe(4);
    expect(patch.params.binding.selection).toBeUndefined();
  });

  // ── Custom glyphs (WI-5): the picker lists imported motifs alongside
  //    built-ins, and getGlyph resolves a custom id for the row swatch/label.
  const customGlyph = (id, name) => ({
    id,
    name,
    tradition: "imported",
    paths: [{ d: "M0,0 L4,4", closed: false }],
    viewRadius: 5,
    root: { x: 0, y: 0, angle: 0 },
  });

  it("lists custom glyphs alongside built-ins; selecting one updates glyphRef", () => {
    const onUpdateLayer = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    const customGlyphs = { "cg-1": customGlyph("cg-1", "My Vine") };
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
        customGlyphs={customGlyphs}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    // Built-in AND custom both selectable.
    expect(screen.getByRole("option", { name: "Leaf" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "My Vine" })).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("motif-glyph"), {
      target: { value: "cg-1" },
    });
    const [id, patch] = onUpdateLayer.mock.calls.at(-1);
    expect(id).toBe("m1");
    expect(patch.params.glyphRef).toBe("cg-1");
  });

  it("resolves a CUSTOM glyphRef for the row (select value + swatch path)", () => {
    const customGlyphs = { "cg-9": customGlyph("cg-9", "Custom Fern") };
    const motif = motifLayer("m1", "host1", defaultBinding);
    motif.params.glyphRef = "cg-9"; // this motif points at the custom glyph
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        customGlyphs={customGlyphs}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    // The select holds the custom id (option exists) and shows its name.
    expect(screen.getByTestId("motif-glyph")).toHaveValue("cg-9");
    expect(screen.getByRole("option", { name: "Custom Fern" })).toBeInTheDocument();
    // getGlyph(glyphRef, customGlyphs) resolved → swatch draws the custom `d`.
    const row = screen.getByTestId("motif-row");
    expect(row.querySelector('path[d="M0,0 L4,4"]')).not.toBeNull();
  });

  // ── Import SVG as motif (Wave 3, #77 relocation): the read → parse →
  //    error → commit flow that used to live here moved entirely into
  //    useMotifEditorSession's `importFromFile` (grilled decision 4,
  //    docs/motif-session-ORCHESTRATOR.md) — see its "importFromFile()" suite
  //    in useMotifEditorSession.test.js for the OK/error/commit coverage.
  //    Inspector keeps only the file-input mechanics: arm a row, hand the raw
  //    File + that row's layer id to `onImportFile`, reset the input value.
  it("import: hands the raw file + this row's layer id to onImportFile", () => {
    const onImportFile = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onImportFile={onImportFile}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    fireEvent.click(screen.getByTestId("motif-import"));
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 0 L5 10 Z"/></svg>';
    const file = new File([svg], "vine.svg", { type: "image/svg+xml" });
    const input = screen.getByTestId("motif-import-input");
    fireEvent.change(input, { target: { files: [file] } });

    expect(onImportFile).toHaveBeenCalledTimes(1);
    const [passedFile, layerId] = onImportFile.mock.calls[0];
    expect(passedFile).toBe(file);
    expect(layerId).toBe("m1");
    // Input value resets so the same file can be re-imported.
    expect(input.value).toBe("");
  });

  it("import: does nothing if a file is chosen without a row having armed the input", () => {
    const onImportFile = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onImportFile={onImportFile}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    // No click on "motif-import" first — importTargetIdRef stays null.
    const file = new File(["<svg/>"], "stray.svg", { type: "image/svg+xml" });
    fireEvent.change(screen.getByTestId("motif-import-input"), {
      target: { files: [file] },
    });
    expect(onImportFile).not.toHaveBeenCalled();
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

  // ── P4: global "My library" optgroup + COPY-on-use ──────────────────────────
  const libMotif = (id, name) => ({
    id,
    name,
    glyph: {
      id,
      name,
      tradition: "custom",
      paths: [{ d: "M1,1 L9,9", closed: false }],
      viewRadius: 6,
      root: { x: 0, y: 0, angle: 0 },
    },
  });

  it('lists a "My library" optgroup and copies the glyph into the doc on select', () => {
    const onUpdateLayer = vi.fn();
    const onCopyLibraryGlyph = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
        customGlyphs={{}}
        libraryMotifs={[libMotif("lib-uuid-1", "Saved Vine")]}
        onCopyLibraryGlyph={onCopyLibraryGlyph}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    // The library motif is offered as an option.
    expect(
      screen.getByRole("option", { name: "Saved Vine" })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("motif-glyph"), {
      target: { value: "lib-uuid-1" },
    });
    // COPY-on-use: the library glyph is copied into the document keyed by uuid…
    expect(onCopyLibraryGlyph).toHaveBeenCalledTimes(1);
    expect(onCopyLibraryGlyph.mock.calls[0][0].id).toBe("lib-uuid-1");
    // …and the row is rebound to that uuid.
    const [id, patch] = onUpdateLayer.mock.calls.at(-1);
    expect(id).toBe("m1");
    expect(patch.params.glyphRef).toBe("lib-uuid-1");
  });

  it('hides the "My library" optgroup when the library is empty', () => {
    const motif = motifLayer("m1", "host1", defaultBinding);
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        libraryMotifs={[]}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    expect(screen.queryByText("My library")).toBeNull();
  });

  it("P5-2: when onUseLibraryGlyph is wired, a library select routes through the ONE batched callback (single undo), not the two-call path", () => {
    const onUpdateLayer = vi.fn();
    const onCopyLibraryGlyph = vi.fn();
    const onUseLibraryGlyph = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
        customGlyphs={{}}
        libraryMotifs={[libMotif("lib-uuid-1", "Saved Vine")]}
        onCopyLibraryGlyph={onCopyLibraryGlyph}
        onUseLibraryGlyph={onUseLibraryGlyph}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    fireEvent.change(screen.getByTestId("motif-glyph"), {
      target: { value: "lib-uuid-1" },
    });
    // Single batched seam: exactly one call, carrying glyph + layer + params.
    expect(onUseLibraryGlyph).toHaveBeenCalledTimes(1);
    const [glyph, layerId, params] = onUseLibraryGlyph.mock.calls[0];
    expect(glyph.id).toBe("lib-uuid-1");
    expect(layerId).toBe("m1");
    expect(params.glyphRef).toBe("lib-uuid-1");
    // The legacy two-call path is NOT also fired (would be a second undo entry).
    expect(onCopyLibraryGlyph).not.toHaveBeenCalled();
    expect(onUpdateLayer).not.toHaveBeenCalled();
  });

  it("does NOT re-copy a library motif already present in the doc (idempotent)", () => {
    const onCopyLibraryGlyph = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    const lib = libMotif("lib-uuid-2", "Saved Fern");
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        customGlyphs={{ "lib-uuid-2": lib.glyph }}
        libraryMotifs={[lib]}
        onCopyLibraryGlyph={onCopyLibraryGlyph}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    fireEvent.change(screen.getByTestId("motif-glyph"), {
      target: { value: "lib-uuid-2" },
    });
    // Already in the doc → no redundant copy (just a rebind).
    expect(onCopyLibraryGlyph).not.toHaveBeenCalled();
  });
});

// ── C2: the Block rack (MotifBlockRack rendered inside the device row) ─────────
describe("MotifBlockRack (C2)", () => {
  // A motif whose binding is already chain-form (createMotifParams preserves it
  // via normalizeBinding).
  function chainMotif(id, hostId, chain) {
    return {
      id,
      name: id,
      type: MOTIF_TYPE,
      patternType: MOTIF_TYPE,
      params: createMotifParams({
        hostLayerId: hostId,
        glyphRef: "leaf",
        binding: { chain, placement: defaultBinding.placement },
      }),
      randomizeKeys: [],
      paramsCache: {},
    };
  }

  const seqBlock = () => ({ type: "sequence", mode: "cycle", slots: [] });

  function expand(ui) {
    const r = render(ui);
    fireEvent.click(screen.getByTestId("motif-toggle"));
    return r;
  }

  it("renders one Block card per compiled block for a LEGACY motif (Route/Every N/Density)", () => {
    const motif = motifLayer("m1", "host1", defaultBinding);
    expand(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    const cards = screen.getAllByTestId("motif-block");
    expect(cards.map((c) => c.getAttribute("data-block-type"))).toEqual([
      "route",
      "everyN",
      "density",
    ]);
  });

  it("bypass toggle flips block.bypass and writes chain-form (one undo entry)", () => {
    const onUpdateLayer = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    expand(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.click(screen.getAllByTestId("motif-block-bypass")[0]); // Route
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdateLayer.mock.calls[0];
    expect(patch.params.binding.chain[0].bypass).toBe(true);
    expect(patch.params.binding.selection).toBeUndefined();
  });

  it("adding a selection block via the menu appends it (chain-form)", () => {
    const onUpdateLayer = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    expand(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.change(screen.getByTestId("motif-block-add"), {
      target: { value: "skip" },
    });
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdateLayer.mock.calls[0];
    const types = patch.params.binding.chain.map((b) => b.type);
    expect(types).toContain("skip");
    // With no sequence, a selection block appends to the end.
    expect(types[types.length - 1]).toBe("skip");
  });

  it("adding a Sequencer appends it terminally (last element)", () => {
    const onUpdateLayer = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    expand(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.change(screen.getByTestId("motif-block-add"), {
      target: { value: "sequence" },
    });
    const [, patch] = onUpdateLayer.mock.calls[0];
    const chain = patch.params.binding.chain;
    expect(chain[chain.length - 1].type).toBe("sequence");
  });

  it("the add-menu HIDES the Sequencer option once a sequence exists (at-most-one)", () => {
    const motif = chainMotif("m1", "host1", [
      { type: "route", roles: ["crossing"], pathScope: "all" },
      seqBlock(),
    ]);
    expand(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    const addMenu = screen.getByTestId("motif-block-add");
    // No "Sequencer" option in the add menu (a second sequence is forbidden).
    expect(
      within(addMenu).queryByRole("option", { name: "Sequencer" })
    ).toBeNull();
    // Selection blocks are still offered.
    expect(
      within(addMenu).getByRole("option", { name: "Every N" })
    ).toBeInTheDocument();
  });

  it("a selection block added while a sequence exists is inserted BEFORE the sequence", () => {
    const onUpdateLayer = vi.fn();
    const motif = chainMotif("m1", "host1", [
      { type: "route", roles: ["crossing"], pathScope: "all" },
      seqBlock(),
    ]);
    expand(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.change(screen.getByTestId("motif-block-add"), {
      target: { value: "everyN" },
    });
    const [, patch] = onUpdateLayer.mock.calls[0];
    const types = patch.params.binding.chain.map((b) => b.type);
    expect(types).toEqual(["route", "everyN", "sequence"]);
  });

  it("removing a block writes the shortened chain (chain-form)", () => {
    const onUpdateLayer = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    expand(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    // Remove the first card (Route).
    fireEvent.click(screen.getAllByTestId("motif-block-remove")[0]);
    const [, patch] = onUpdateLayer.mock.calls[0];
    expect(patch.params.binding.chain.map((b) => b.type)).toEqual([
      "everyN",
      "density",
    ]);
  });

  it("orientation follows the dock: vertical by default, horizontal in the bottom shelf", () => {
    const motif = motifLayer("m1", "host1", defaultBinding);
    // No dock provider → vertical.
    const { unmount } = expand(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.getByTestId("motif-rack")).toHaveAttribute(
      "data-orientation",
      "vertical"
    );
    unmount();

    // Bottom shelf → horizontal.
    render(
      <InspectorDockProvider value={{ dockPosition: "bottom" }}>
        <Inspector
          layers={[hostLayer("host1", "grid"), motif]}
          selectedLayerId="host1"
          onUpdateLayer={() => {}}
          onChangeLayerPattern={() => {}}
        />
      </InspectorDockProvider>
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    expect(screen.getByTestId("motif-rack")).toHaveAttribute(
      "data-orientation",
      "horizontal"
    );
  });

  it("Placement Size/Flip still work and stay LEGACY-preserving (no forced chain rewrite)", () => {
    const onUpdateLayer = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    expand(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.change(screen.getByTestId("motif-size"), { target: { value: "30" } });
    const [, patch] = onUpdateLayer.mock.calls[0];
    // Placement edits are orthogonal to the chain — a legacy binding stays legacy.
    expect(patch.params.binding.placement.sizing.size).toBe(30);
    expect(patch.params.binding.selection).toBeDefined();
    expect(patch.params.binding.chain).toBeUndefined();
  });

  it("editChain no-churn: a rejected chain op returns the SAME ref, so the write is skipped", () => {
    // Reconstructs the exact editChain composition MotifDevice uses for a rejected
    // reorder (selection block dragged below the terminal sequence). The guard is
    // `nextChain === base.chain` → skip onUpdateLayer, so a legacy binding is
    // NEITHER migrated NOR churned into a phantom undo entry.
    const base = ensureChainForm({
      chain: [
        { type: "route", roles: ["crossing"], pathScope: "all" },
        { type: "everyN", n: 2 },
        seqBlock(),
      ],
      placement: {},
    });
    // Move 'route' (0) below the sequence (2) — illegal.
    const nextChain = reorderChain(base.chain, 0, 2);
    expect(nextChain).toBe(base.chain); // same ref → editChain returns early
  });
});

// ── C3: the Sequencer card (slot strip, deal mode, weights, angle disclosure,
//    tap-to-edit) rendered inside the terminal sequence Block ────────────────
describe("Sequencer card (C3)", () => {
  // A chain-form motif with a terminal sequence at index 1 (seqIndex=1).
  function seqMotif(id, hostId, { mode = "cycle", slots = [] } = {}) {
    return {
      id,
      name: id,
      type: MOTIF_TYPE,
      patternType: MOTIF_TYPE,
      params: createMotifParams({
        hostLayerId: hostId,
        glyphRef: "leaf",
        binding: {
          chain: [
            { type: "route", roles: ["crossing"], pathScope: "all" },
            { type: "sequence", mode, slots },
          ],
          placement: defaultBinding.placement,
        },
      }),
      randomizeKeys: [],
      paramsCache: {},
    };
  }

  function expandSeq(ui) {
    const r = render(ui);
    fireEvent.click(screen.getByTestId("motif-toggle"));
    return r;
  }

  const seqOf = (patch) => {
    const chain = patch.params.binding.chain;
    return chain.find((b) => b.type === "sequence");
  };

  it("renders a glyph thumbnail per glyph slot + a Rest chip for a rest slot", () => {
    const motif = seqMotif("m1", "host1", {
      slots: [{ glyphRef: "leaf" }, { rest: true }, { glyphRef: "flower" }],
    });
    expandSeq(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    const chips = screen.getAllByTestId("motif-slot");
    expect(chips).toHaveLength(3);
    // Two glyph slots (tap-to-edit buttons) + one rest chip.
    expect(screen.getAllByTestId("motif-slot-edit")).toHaveLength(2);
    expect(screen.getByTestId("motif-slot-rest")).toBeInTheDocument();
  });

  it("Cycle | Random toggle writes block.mode as chain-form (one undo entry)", () => {
    const onUpdateLayer = vi.fn();
    const motif = seqMotif("m1", "host1", { mode: "cycle", slots: [{ glyphRef: "leaf" }] });
    expandSeq(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("motif-seq-mode-random"));
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdateLayer.mock.calls[0];
    expect(seqOf(patch).mode).toBe("random");
    expect(patch.params.binding.selection).toBeUndefined();
  });

  it("per-slot weight sliders appear ONLY in Random mode (positional in Cycle)", () => {
    const slots = [{ glyphRef: "leaf" }, { rest: true }];
    // Cycle → no weight sliders.
    const { unmount } = expandSeq(
      <Inspector
        layers={[hostLayer("host1", "grid"), seqMotif("m1", "host1", { mode: "cycle", slots })]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.queryByTestId("motif-slot-weight")).toBeNull();
    unmount();
    // Random → a weight slider per slot, INCLUDING the rest.
    expandSeq(
      <Inspector
        layers={[hostLayer("host1", "grid"), seqMotif("m2", "host1", { mode: "random", slots })]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.getAllByTestId("motif-slot-weight")).toHaveLength(2);
  });

  it("setting a weight (Random mode) writes slot.weight", () => {
    const onUpdateLayer = vi.fn();
    const motif = seqMotif("m1", "host1", {
      mode: "random",
      slots: [{ glyphRef: "leaf" }, { glyphRef: "flower" }],
    });
    expandSeq(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.change(screen.getAllByTestId("motif-slot-weight")[1], {
      target: { value: "3" },
    });
    const [, patch] = onUpdateLayer.mock.calls[0];
    expect(seqOf(patch).slots[1].weight).toBe(3);
    expect(seqOf(patch).slots[0].weight).toBeUndefined();
  });

  it("angle-randomization checkbox reveals range + spread and writes slot.rotationRandom", () => {
    const onUpdateLayer = vi.fn();
    const motif = seqMotif("m1", "host1", { slots: [{ glyphRef: "leaf" }] });
    expandSeq(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    // Disclosure closed initially — no range/spread controls.
    expect(screen.queryByTestId("motif-slot-range")).toBeNull();
    expect(screen.queryByTestId("motif-slot-spread")).toBeNull();
    // Enabling writes a rotationRandom spec.
    fireEvent.click(screen.getByTestId("motif-slot-anglerand"));
    const [, patch] = onUpdateLayer.mock.calls[0];
    expect(seqOf(patch).slots[0].rotationRandom).toEqual({ range: 30, spread: "flat" });
  });

  it("an enabled slot shows range + spread; unchecking removes rotationRandom", () => {
    const onUpdateLayer = vi.fn();
    const motif = seqMotif("m1", "host1", {
      slots: [{ glyphRef: "leaf", rotationRandom: { range: 45, spread: "bell" } }],
    });
    expandSeq(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    // Revealed because the slot already carries rotationRandom.
    expect(screen.getByTestId("motif-slot-range")).toBeInTheDocument();
    expect(screen.getByTestId("motif-slot-spread")).toHaveValue("bell");
    // Unchecking removes the spec.
    fireEvent.click(screen.getByTestId("motif-slot-anglerand"));
    const [, patch] = onUpdateLayer.mock.calls[0];
    expect("rotationRandom" in seqOf(patch).slots[0]).toBe(true);
    expect(seqOf(patch).slots[0].rotationRandom).toBeUndefined();
  });

  it("Add Glyph / Add Rest append a slot (chain-form, terminal sequence stays last)", () => {
    const onUpdateLayer = vi.fn();
    const motif = seqMotif("m1", "host1", { slots: [{ glyphRef: "leaf" }] });
    const { rerender } = expandSeq(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("motif-slot-add"));
    let [, patch] = onUpdateLayer.mock.calls[0];
    expect(seqOf(patch).slots).toHaveLength(2);
    // New glyph slot defaults to the base glyphRef.
    expect(seqOf(patch).slots[1]).toEqual({ glyphRef: "leaf" });
    // Sequence remains the terminal block.
    const types = patch.params.binding.chain.map((b) => b.type);
    expect(types[types.length - 1]).toBe("sequence");

    onUpdateLayer.mockClear();
    fireEvent.click(screen.getByTestId("motif-slot-add-rest"));
    [, patch] = onUpdateLayer.mock.calls[0];
    expect(seqOf(patch).slots[1]).toEqual({ rest: true });
  });

  it("removing a slot writes the shortened slots array", () => {
    const onUpdateLayer = vi.fn();
    const motif = seqMotif("m1", "host1", {
      slots: [{ glyphRef: "leaf" }, { glyphRef: "flower" }, { rest: true }],
    });
    expandSeq(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.click(screen.getAllByTestId("motif-slot-remove")[1]); // drop 'flower'
    const [, patch] = onUpdateLayer.mock.calls[0];
    expect(seqOf(patch).slots).toEqual([{ glyphRef: "leaf" }, { rest: true }]);
  });

  it("tapping a slot glyph opens the editor with SLOT CONTEXT (layer id, slot glyphRef, slotIndex)", () => {
    const onEditGlyph = vi.fn();
    const motif = seqMotif("m1", "host1", {
      slots: [{ glyphRef: "leaf" }, { glyphRef: "flower" }],
    });
    expandSeq(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onEditGlyph={onEditGlyph}
      />
    );
    fireEvent.click(screen.getAllByTestId("motif-slot-edit")[1]); // tap slot 1 (flower)
    expect(onEditGlyph).toHaveBeenCalledTimes(1);
    const [layerId, glyphRef, opts] = onEditGlyph.mock.calls[0];
    expect(layerId).toBe("m1");
    expect(glyphRef).toBe("flower");
    expect(opts).toEqual({ slotIndex: 1 });
  });

  it("tapping a modifier-only slot (no glyphRef) opens the editor on the BASE glyph", () => {
    const onEditGlyph = vi.fn();
    // slot 0 has no glyphRef → renders + forks from the base ('leaf').
    const motif = seqMotif("m1", "host1", { slots: [{ sizeScale: 2 }] });
    expandSeq(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onEditGlyph={onEditGlyph}
      />
    );
    fireEvent.click(screen.getByTestId("motif-slot-edit"));
    const [layerId, glyphRef, opts] = onEditGlyph.mock.calls[0];
    expect(layerId).toBe("m1");
    expect(glyphRef).toBe("leaf"); // base fallback
    expect(opts).toEqual({ slotIndex: 0 });
  });
});
