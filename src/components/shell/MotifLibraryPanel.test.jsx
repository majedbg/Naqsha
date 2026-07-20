// @vitest-environment jsdom
// MotifLibraryPanel (motif-shell, D) — the left column's Motifs surface:
// real-store entries, the read-only mini drop-tree (eye only), drag-apply
// onto host rows, the use-count delete guard, and the two-way drag highlight.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MotifLibraryPanel from "./MotifLibraryPanel";
import { MOTIF_TYPE } from "../../lib/motif/motifLayer";

const g = (id, name) => ({
  id,
  name,
  paths: [{ d: "M0,0 L1,1", closed: false }],
  viewRadius: 5,
});

const hostLayer = (id, patternType = "grid") => ({
  id,
  name: id,
  patternType,
  visible: true,
  params: {},
});
const motifLayer = (id, hostId, glyphRef) => ({
  id,
  name: id,
  type: MOTIF_TYPE,
  patternType: MOTIF_TYPE,
  visible: true,
  params: { hostLayerId: hostId, glyphRef },
});

const baseProps = {
  layers: [hostLayer("h1"), hostLayer("e1", "etch"), motifLayer("m1", "h1", "cg-used")],
  selectedLayerId: "h1",
  onUpdateLayer: () => {},
  customGlyphs: { "cg-used": g("cg-used", "Used Fern"), "cg-free": g("cg-free", "Free Knot") },
  libraryMotifs: [{ id: "lib-1", name: "Saved Vine", glyph: g("lib-1", "Saved Vine") }],
  libraryError: null,
  motifDrag: null,
  onMotifDragChange: () => {},
  dragHoverHostId: null,
  onApplyToHost: () => {},
  onImportSvg: () => {},
  onDeleteCustomGlyph: () => {},
  onDeleteLibraryMotif: () => {},
};

describe("MotifLibraryPanel", () => {
  it("renders built-in, custom, and library entries in the grid", () => {
    render(<MotifLibraryPanel {...baseProps} />);
    expect(screen.getByTitle(/^Leaf —/)).toBeInTheDocument();
    expect(screen.getByTitle(/^Used Fern —/)).toBeInTheDocument();
    expect(screen.getByTitle(/^Saved Vine —/)).toBeInTheDocument();
  });

  it("mini tree: host rows are tagged, eye toggles visibility via onUpdateLayer", () => {
    const onUpdateLayer = vi.fn();
    render(<MotifLibraryPanel {...baseProps} onUpdateLayer={onUpdateLayer} />);
    const row = screen.getByTestId("mini-tree-row-h1");
    expect(row).toHaveTextContent("host");
    fireEvent.click(row.querySelector("button[aria-label='Hide layer']"));
    expect(onUpdateLayer).toHaveBeenCalledWith("h1", { visible: false });
  });

  it("dropping on an eligible mini-tree row applies the dragged payload to that layer", () => {
    const onApplyToHost = vi.fn();
    const onMotifDragChange = vi.fn();
    const payload = { kind: "builtin", glyphId: "leaf", glyph: g("leaf", "Leaf") };
    render(
      <MotifLibraryPanel
        {...baseProps}
        motifDrag={payload}
        onApplyToHost={onApplyToHost}
        onMotifDragChange={onMotifDragChange}
      />
    );
    const row = screen.getByTestId("mini-tree-row-h1");
    fireEvent.dragOver(row);
    fireEvent.drop(row);
    expect(onApplyToHost).toHaveBeenCalledWith(payload, "h1");
    expect(onMotifDragChange).toHaveBeenCalledWith(null);
  });

  it("dropping on a non-host row is inert", () => {
    const onApplyToHost = vi.fn();
    const payload = { kind: "builtin", glyphId: "leaf", glyph: g("leaf", "Leaf") };
    render(
      <MotifLibraryPanel {...baseProps} motifDrag={payload} onApplyToHost={onApplyToHost} />
    );
    fireEvent.drop(screen.getByTestId("mini-tree-row-m1"));
    expect(onApplyToHost).not.toHaveBeenCalled();
  });

  it("the canvas-badge hover id highlights the matching mini-tree row (two-way validation)", () => {
    const payload = { kind: "builtin", glyphId: "leaf", glyph: g("leaf", "Leaf") };
    render(
      <MotifLibraryPanel {...baseProps} motifDrag={payload} dragHoverHostId="h1" />
    );
    expect(screen.getByTestId("mini-tree-row-h1").className).toContain("border-accent");
  });

  it("delete guard: a referenced custom glyph shows its use count instead of a delete button", () => {
    const onDeleteCustomGlyph = vi.fn();
    render(
      <MotifLibraryPanel {...baseProps} onDeleteCustomGlyph={onDeleteCustomGlyph} />
    );
    // cg-used is referenced by m1 → no delete affordance, count badge instead.
    expect(screen.queryByLabelText("Delete Used Fern")).toBeNull();
    expect(screen.getByTitle("Referenced 1× in this document")).toBeInTheDocument();
    // cg-free is unreferenced → deletable.
    fireEvent.click(screen.getByLabelText("Delete Free Knot"));
    expect(onDeleteCustomGlyph).toHaveBeenCalledWith("cg-free");
  });

  it("library rows delete through onDeleteLibraryMotif", () => {
    const onDeleteLibraryMotif = vi.fn();
    render(
      <MotifLibraryPanel {...baseProps} onDeleteLibraryMotif={onDeleteLibraryMotif} />
    );
    fireEvent.click(screen.getByLabelText("Delete Saved Vine"));
    expect(onDeleteLibraryMotif).toHaveBeenCalledWith("lib-1");
  });

  it("search filters the grid by name", () => {
    render(<MotifLibraryPanel {...baseProps} />);
    fireEvent.change(screen.getByLabelText("Search motifs"), {
      target: { value: "vine" },
    });
    expect(screen.getByTitle(/^Saved Vine —/)).toBeInTheDocument();
    expect(screen.queryByTitle(/^Leaf —/)).toBeNull();
  });

  it("surfaces the library load error on the My-library set (audit bug 10)", () => {
    render(
      <MotifLibraryPanel {...baseProps} libraryError={new Error("RLS")} />
    );
    fireEvent.click(screen.getByRole("button", { name: "My library" }));
    expect(screen.getByText(/Library unavailable/)).toBeInTheDocument();
  });
});
