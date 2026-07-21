// @vitest-environment jsdom
// MotifDevice (host Inspector) — add/edit/remove motifs adorning a host layer
// (grid/recursive/spiral/voronoi). Exercises the device through the public <Inspector>,
// plus the exported deepMergeBinding helper's partial-patch invariant.

import { describe, it, expect, vi, beforeEach } from "vitest";
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

// The device now defaults OPEN and persists its disclosure per device via
// localStorage (motif-shell D — the audit's re-collapse-on-remount fix).
// These UI-seam tests predate that and drive the device through an explicit
// open click, so start each one collapsed; the default itself is covered by
// its own test below.
beforeEach(() => {
  localStorage.setItem("sonoform-motif-device-open", "0");
});

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

  it("defaults OPEN with no stored preference; a collapse persists across remounts (motif-shell D)", () => {
    // No stored preference — the fresh-device default.
    localStorage.removeItem("sonoform-motif-device-open");
    const motif = motifLayer("m1", "host1", defaultBinding);
    const props = {
      layers: [hostLayer("host1", "grid"), motif],
      selectedLayerId: "host1",
      onUpdateLayer: () => {},
      onChangeLayerPattern: () => {},
    };
    const { unmount } = render(<Inspector {...props} />);
    const toggle = screen.getByTestId("motif-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByTestId("motif-row")).toHaveLength(1);
    // Collapse, then remount (SelectedLayerInspector remounts on every
    // selection change — the old useState(false) re-collapsed each time;
    // now the user's choice survives the remount instead).
    fireEvent.click(toggle);
    expect(screen.queryByTestId("motif-row")).toBeNull();
    unmount();
    render(<Inspector {...props} />);
    expect(screen.getByTestId("motif-toggle")).toHaveAttribute(
      "aria-expanded",
      "false"
    );
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

  it("Add Motif on a SPIRAL host defaults to a role the spiral actually emits (edge, not the dead crossing)", () => {
    // A default spiral emits no `crossing` hub (innerRadius=5 ⇒ startR≠0), so the
    // blanket `crossing` default placed nothing. The host-aware default must be a
    // live role — `edge` — so glyphs appear on a fresh spiral.
    const onAddMotif = vi.fn();
    render(
      <Inspector
        layers={[hostLayer("sp", "spiral")]}
        selectedLayerId="sp"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onAddMotif={onAddMotif}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    fireEvent.click(screen.getByTestId("motif-add"));
    const [hostId, opts] = onAddMotif.mock.calls[0];
    expect(hostId).toBe("sp");
    expect(opts.anchorMode).toBe("semantic"); // spiral is still a semantic host
    expect(opts.binding.selection.roles).toEqual(["edge"]);
    expect(opts.binding.selection.roles).not.toContain("crossing");
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
    // Route collapses to a one-line row (Variant D) — unfold it to reach the
    // detail role checkboxes. Add 'edge' (crossing already on, from the compiled
    // Route block).
    const routeCard = screen
      .getAllByTestId("motif-block")
      .find((c) => c.getAttribute("data-block-type") === "route");
    fireEvent.click(within(routeCard).getByTestId("motif-block-disclosure"));
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
    // Every N collapses to a one-line row (Variant D) — unfold it to reach the
    // detail number input.
    const everyNCard = screen
      .getAllByTestId("motif-block")
      .find((c) => c.getAttribute("data-block-type") === "everyN");
    fireEvent.click(within(everyNCard).getByTestId("motif-block-disclosure"));
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
    // The chip opens the flyout picker; built-in AND custom both offered.
    fireEvent.click(screen.getByTestId("motif-glyph"));
    expect(screen.getByTestId("glyph-option-leaf")).toBeInTheDocument();
    expect(screen.getByTestId("glyph-option-cg-1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("glyph-option-cg-1"));
    const [id, patch] = onUpdateLayer.mock.calls.at(-1);
    expect(id).toBe("m1");
    expect(patch.params.glyphRef).toBe("cg-1");
  });

  it("resolves a CUSTOM glyphRef for the row (chip value + thumbnail path)", () => {
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
    // The chip carries the custom id and shows its resolved name.
    expect(screen.getByTestId("motif-glyph")).toHaveAttribute(
      "data-glyph",
      "cg-9"
    );
    expect(screen.getByTestId("motif-glyph")).toHaveTextContent("Custom Fern");
    // getGlyph(glyphRef, customGlyphs) resolved → the thumbnail draws the
    // custom `d`.
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
    // The library motif is offered in the flyout picker.
    fireEvent.click(screen.getByTestId("motif-glyph"));
    expect(screen.getByTestId("glyph-option-lib-uuid-1")).toHaveTextContent(
      "Saved Vine"
    );
    fireEvent.click(screen.getByTestId("glyph-option-lib-uuid-1"));
    // COPY-on-use: the library glyph is copied into the document keyed by uuid…
    expect(onCopyLibraryGlyph).toHaveBeenCalledTimes(1);
    expect(onCopyLibraryGlyph.mock.calls[0][0].id).toBe("lib-uuid-1");
    // …and the row is rebound to that uuid.
    const [id, patch] = onUpdateLayer.mock.calls.at(-1);
    expect(id).toBe("m1");
    expect(patch.params.glyphRef).toBe("lib-uuid-1");
  });

  it("an empty library contributes no options to the picker", () => {
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
    fireEvent.click(screen.getByTestId("motif-glyph"));
    // Filtering to the (empty) My-library set shows the empty state, not
    // phantom rows.
    fireEvent.click(screen.getByRole("button", { name: "My library" }));
    expect(screen.getByText("No matches")).toBeInTheDocument();
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
    fireEvent.click(screen.getByTestId("motif-glyph"));
    fireEvent.click(screen.getByTestId("glyph-option-lib-uuid-1"));
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
    fireEvent.click(screen.getByTestId("motif-glyph"));
    fireEvent.click(screen.getByTestId("glyph-option-lib-uuid-2"));
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

    // Re-seed collapsed: the first expand persisted the disclosure OPEN
    // (motif-shell D), so without this the click below would close it.
    localStorage.setItem("sonoform-motif-device-open", "0");
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
    // Re-seed collapsed: the first expand persisted the disclosure OPEN
    // (motif-shell D), so the helper's open-click would otherwise close it.
    localStorage.setItem("sonoform-motif-device-open", "0");
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

// ── C4: Route card path scope + canvas-pick (issue #79) ───────────────────────
describe("Route card path scope + canvas-pick (C4)", () => {
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

  function expand(ui) {
    const r = render(ui);
    fireEvent.click(screen.getByTestId("motif-toggle"));
    // Route collapses to a one-line row (Variant D); its path-scope + canvas-pick
    // detail these C4 tests drive live in the unfolded body — open it.
    const routeCard = screen
      .getAllByTestId("motif-block")
      .find((c) => c.getAttribute("data-block-type") === "route");
    if (routeCard) {
      fireEvent.click(within(routeCard).getByTestId("motif-block-disclosure"));
    }
    return r;
  }

  it("GATING: an EDGE host offers all four scopes (all/closed/open/picked)", () => {
    const motif = chainMotif("m1", "fh", [
      { type: "route", roles: ["edge"], pathScope: "all" },
    ]);
    expand(
      <Inspector
        layers={[hostLayer("fh", "flowfield"), motif]}
        selectedLayerId="fh"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.getByTestId("motif-route-scope-all")).toBeInTheDocument();
    expect(screen.getByTestId("motif-route-scope-closed")).toBeInTheDocument();
    expect(screen.getByTestId("motif-route-scope-open")).toBeInTheDocument();
    expect(screen.getByTestId("motif-route-scope-picked")).toBeInTheDocument();
  });

  it("GATING: a SEMANTIC host HIDES closed/picked (offers only all/open)", () => {
    const motif = chainMotif("m1", "host1", [
      { type: "route", roles: ["crossing"], pathScope: "all" },
    ]);
    expand(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.getByTestId("motif-route-scope-all")).toBeInTheDocument();
    expect(screen.getByTestId("motif-route-scope-open")).toBeInTheDocument();
    expect(screen.queryByTestId("motif-route-scope-closed")).toBeNull();
    expect(screen.queryByTestId("motif-route-scope-picked")).toBeNull();
  });

  it("selecting a scope writes chain-form pathScope (one undo, no selection resurrection)", () => {
    const onUpdateLayer = vi.fn();
    // Legacy binding → the write must migrate to chain-form and drop selection.
    const motif = motifLayer("m1", "fh", {
      selection: { roles: ["edge"], rate: { n: 1 } },
      placement: defaultBinding.placement,
    });
    expand(
      <Inspector
        layers={[hostLayer("fh", "flowfield"), motif]}
        selectedLayerId="fh"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("motif-route-scope-closed"));
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdateLayer.mock.calls[0];
    expect(patch.params.binding.selection).toBeUndefined();
    const route = patch.params.binding.chain.find((b) => b.type === "route");
    expect(route.pathScope).toBe("closed");
  });

  it("picked scope reveals a 'Pick on canvas' arm; clicking arms THIS route block", () => {
    const onMotifPick = vi.fn();
    const motif = chainMotif("m1", "fh", [
      { type: "route", roles: ["edge"], pathScope: "picked", pickedPaths: [] },
    ]);
    expand(
      <Inspector
        layers={[hostLayer("fh", "flowfield"), motif]}
        selectedLayerId="fh"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        motifPick={null}
        onMotifPick={onMotifPick}
      />
    );
    const arm = screen.getByTestId("motif-route-pick-arm");
    expect(arm).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(arm);
    // Route block is the only block → index 0.
    expect(onMotifPick).toHaveBeenCalledWith({ layerId: "m1", blockIndex: 0 });
  });

  it("the arm reads pressed + disarms (onMotifPick null) when THIS block is the pick target", () => {
    const onMotifPick = vi.fn();
    const motif = chainMotif("m1", "fh", [
      { type: "route", roles: ["edge"], pathScope: "picked", pickedPaths: [2] },
    ]);
    expand(
      <Inspector
        layers={[hostLayer("fh", "flowfield"), motif]}
        selectedLayerId="fh"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        motifPick={{ layerId: "m1", blockIndex: 0 }}
        onMotifPick={onMotifPick}
      />
    );
    const arm = screen.getByTestId("motif-route-pick-arm");
    expect(arm).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(arm); // toggle off
    expect(onMotifPick).toHaveBeenCalledWith(null);
  });

  it("the 'N picked · Clear' summary reflects pickedPaths; Clear empties it", () => {
    const onUpdateLayer = vi.fn();
    const motif = chainMotif("m1", "fh", [
      { type: "route", roles: ["edge"], pathScope: "picked", pickedPaths: [1, 3] },
    ]);
    expand(
      <Inspector
        layers={[hostLayer("fh", "flowfield"), motif]}
        selectedLayerId="fh"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.getByTestId("motif-route-picked-summary")).toHaveTextContent("2 picked");
    fireEvent.click(screen.getByTestId("motif-route-picked-clear"));
    const [, patch] = onUpdateLayer.mock.calls[0];
    const route = patch.params.binding.chain.find((b) => b.type === "route");
    expect(route.pickedPaths).toEqual([]);
  });

  it("collapsing the Motif device while armed disarms (onMotifPick null)", () => {
    const onMotifPick = vi.fn();
    const motif = chainMotif("m1", "fh", [
      { type: "route", roles: ["edge"], pathScope: "picked", pickedPaths: [0] },
    ]);
    render(
      <Inspector
        layers={[hostLayer("fh", "flowfield"), motif]}
        selectedLayerId="fh"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        motifPick={{ layerId: "m1", blockIndex: 0 }}
        onMotifPick={onMotifPick}
      />
    );
    // Device starts collapsed; open it, then collapse it while armed.
    fireEvent.click(screen.getByTestId("motif-toggle")); // open
    fireEvent.click(screen.getByTestId("motif-toggle")); // collapse
    expect(onMotifPick).toHaveBeenLastCalledWith(null);
  });

  it("switching scope AWAY from picked while armed disarms (onMotifPick null)", () => {
    const onMotifPick = vi.fn();
    const motif = chainMotif("m1", "fh", [
      { type: "route", roles: ["edge"], pathScope: "picked", pickedPaths: [0] },
    ]);
    expand(
      <Inspector
        layers={[hostLayer("fh", "flowfield"), motif]}
        selectedLayerId="fh"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        motifPick={{ layerId: "m1", blockIndex: 0 }}
        onMotifPick={onMotifPick}
      />
    );
    fireEvent.click(screen.getByTestId("motif-route-scope-all"));
    expect(onMotifPick).toHaveBeenCalledWith(null);
  });
});

// Placement-budget "no silent cap" warning (2026-07-19 post-crash hardening,
// docs §6). MAX_PLACEMENTS truncation is surfaced up (useCanvas → RightPanel →
// Studio → Inspector) as `motifPlacementStats[layerId] = {total, placed}`; the
// affected motif card shows an amber warning. Absent/equal stats → no warning.
describe("MotifDevice — placement-budget warning", () => {
  const openDevice = (ui) => {
    const r = render(ui);
    fireEvent.click(screen.getByTestId("motif-toggle"));
    return r;
  };

  it("renders the amber warning on a truncated motif card", () => {
    const motif = motifLayer("m1", "host1", defaultBinding);
    openDevice(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        motifPlacementStats={{ m1: { total: 12345, placed: 2000 } }}
      />
    );
    const warning = screen.getByTestId("motif-placement-warning");
    expect(warning).toBeInTheDocument();
    // Localized counts + guidance copy.
    expect(warning).toHaveTextContent("Showing 2,000 of 12,345 placements");
    expect(warning).toHaveTextContent("reduce density or host complexity");
    // Color-token contract: tone-mild tokens so dark mode inverts (raw
    // amber-* would stay light and glow on the indigo dark paper).
    expect(warning.className).toContain("border-tone-mild/40");
    expect(warning.className).toContain("bg-tone-mild/10");
    expect(warning.className).toContain("text-tone-mild");
    expect(warning.className).not.toContain("amber");
  });

  it("hides the warning when no stats are supplied for the motif", () => {
    const motif = motifLayer("m1", "host1", defaultBinding);
    openDevice(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        // No entry for m1 → not truncated → no warning.
        motifPlacementStats={{}}
      />
    );
    expect(screen.getByTestId("motif-row")).toBeInTheDocument();
    expect(screen.queryByTestId("motif-placement-warning")).toBeNull();
  });
});

// Typography pass — the motif device region must ride the sanctioned type scale
// (text-2xs / text-xs), not ad-hoc text-[Npx] literals, and its small secondary
// text must be full-opacity ink-soft (not /70) for contrast. Scoped to the motif
// subtree so ModulatorDevice / other Inspector regions (deliberately left alone)
// don't leak into the sweep.
describe("MotifDevice — type scale (typography pass)", () => {
  const openHost = (extraProps = {}) => {
    const motif = motifLayer("m1", "host1", defaultBinding);
    const r = render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        {...extraProps}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    return r;
  };

  it("empty-host Start-with label rides text-2xs at full-opacity ink-soft (not /70)", () => {
    // The "Quick start" chip row was replaced by the Variant-D mode column; on an
    // empty host that column is introduced by a "Start with" label.
    render(
      <Inspector
        layers={[hostLayer("host1", "grid")]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    const label = screen.getByText("Start with");
    expect(label.className).toContain("text-2xs");
    expect(label.className).toContain("text-ink-soft");
    expect(label.className).not.toContain("text-ink-soft/");
  });

  it("+ Add Motif and Size/Flip controls ride text-xs (11px sanctioned step)", () => {
    openHost();
    expect(screen.getByTestId("motif-add").className).toContain("text-xs");
    // Size row label + numeric input.
    const sizeLabel = screen.getByText("Size").closest("label");
    expect(sizeLabel.className).toContain("text-xs");
    expect(screen.getByTestId("motif-size").className).toContain("text-xs");
    expect(screen.getByText("Flip").closest("label").className).toContain("text-xs");
  });

  it("the row action buttons (import / new / edit) ride text-xs", () => {
    openHost();
    for (const id of ["motif-import", "motif-new", "motif-edit"]) {
      const btn = screen.getByTestId(id);
      expect(btn.className).toContain("text-xs");
      expect(btn.className).not.toMatch(/text-\[\d+px\]/);
    }
  });

  it("placement-budget warning rides text-xs, not an arbitrary px size", () => {
    openHost({ motifPlacementStats: { m1: { total: 12345, placed: 2000 } } });
    const warning = screen.getByTestId("motif-placement-warning");
    expect(warning.className).toContain("text-xs");
    expect(warning.className).not.toMatch(/text-\[\d+px\]/);
  });

  it("the empty-host hint is full-opacity ink-soft at text-xs (contrast)", () => {
    // A host with no motifs → the "No motifs on this host." line renders.
    render(
      <Inspector
        layers={[hostLayer("host1", "grid")]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    const hint = screen.getByText("No motifs on this host.");
    expect(hint.className).toContain("text-xs");
    expect(hint.className).toContain("text-ink-soft");
    expect(hint.className).not.toContain("text-ink-soft/");
  });

  it("the collapsed count badge is full-opacity ink-soft (not /70)", () => {
    // Collapsed (beforeEach stores "0") + a motif → the "· 1" count shows.
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motifLayer("m1", "host1", defaultBinding)]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    // Not expanded → no rows, but the toggle's count badge is present.
    expect(screen.queryByTestId("motif-row")).toBeNull();
    const device = screen.getByTestId("motif-device");
    expect(device.innerHTML).not.toContain("text-ink-soft/");
  });

  it("renders no arbitrary text-[Npx] font-size class in the Inspector-owned motif chrome", () => {
    // Empty-host, device open → renders the toggle/chevron, the empty hint, the
    // "Start with" mode column and + Add Motif, but NO motif-row (hence no nested
    // MotifBlockRack, which is a separate, out-of-scope file). This keeps the
    // sweep scoped to the text Inspector.jsx owns in the motif device.
    render(
      <Inspector
        layers={[hostLayer("host1", "grid")]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    const device = screen.getByTestId("motif-device");
    expect(device.innerHTML).not.toMatch(/text-\[\d+px\]/);
  });

  it("the motif-layer-info panel (motif layer selected) rides text-xs", () => {
    // When a MOTIF layer itself is selected, MotifDevice self-hides and the
    // motif-layer-info block renders instead — still part of the motif region.
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motifLayer("m1", "host1", defaultBinding)]}
        selectedLayerId="m1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    const info = screen.getByTestId("motif-layer-info");
    expect(info.innerHTML).not.toMatch(/text-\[\d+px\]/);
    // The descriptive paragraph carries the sanctioned xs step.
    const para = info.querySelector("p");
    expect(para.className).toContain("text-xs");
  });
});
