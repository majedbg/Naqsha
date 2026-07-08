// @vitest-environment jsdom
// MotifDevice (host Inspector) — add/edit/remove motifs adorning a host layer
// (grid/recursive/spiral/voronoi). Exercises the device through the public <Inspector>,
// plus the exported deepMergeBinding helper's partial-patch invariant.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  // ── Import SVG as motif (WI-5): the row's "Import" affordance runs real
  //    importMotif, stamps the glyph via addCustomGlyph, and rebinds THIS row.
  it("import: an OK SVG stamps a custom glyph and points this row at the new id", async () => {
    const onUpdateLayer = vi.fn();
    const addCustomGlyph = vi.fn(() => "cg-test");
    const onImportError = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
        addCustomGlyph={addCustomGlyph}
        onImportError={onImportError}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    fireEvent.click(screen.getByTestId("motif-import"));
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 0 L5 10 Z"/></svg>';
    const file = new File([svg], "vine.svg", { type: "image/svg+xml" });
    fireEvent.change(screen.getByTestId("motif-import-input"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(addCustomGlyph).toHaveBeenCalledTimes(1));
    const glyph = addCustomGlyph.mock.calls[0][0];
    expect(glyph.tradition).toBe("imported");
    expect(Array.isArray(glyph.paths)).toBe(true);
    // This row's glyphRef is rebound to the returned id.
    await waitFor(() =>
      expect(
        onUpdateLayer.mock.calls.some(
          ([id, patch]) => id === "m1" && patch.params?.glyphRef === "cg-test"
        )
      ).toBe(true)
    );
    expect(onImportError).not.toHaveBeenCalled();
  });

  it("import: a no-path SVG surfaces an error and does NOT stamp or rebind", async () => {
    const onUpdateLayer = vi.fn();
    const addCustomGlyph = vi.fn(() => "cg-test");
    const onImportError = vi.fn();
    const motif = motifLayer("m1", "host1", defaultBinding);
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
        addCustomGlyph={addCustomGlyph}
        onImportError={onImportError}
      />
    );
    fireEvent.click(screen.getByTestId("motif-toggle"));
    fireEvent.click(screen.getByTestId("motif-import"));
    // A <text> element carries no drawable outline geometry (importMotif now
    // converts rect/circle/etc. to paths, so a <rect> would import — use text
    // to exercise the genuine "no importable geometry" error path).
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>';
    const file = new File([svg], "notext.svg", { type: "image/svg+xml" });
    fireEvent.change(screen.getByTestId("motif-import-input"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(onImportError).toHaveBeenCalledTimes(1));
    expect(onImportError.mock.calls[0][0]).toEqual(expect.any(String));
    expect(addCustomGlyph).not.toHaveBeenCalled();
    // No glyphRef rebind occurred.
    expect(
      onUpdateLayer.mock.calls.some(([, patch]) => patch?.params?.glyphRef)
    ).toBe(false);
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
