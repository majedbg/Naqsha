// @vitest-environment jsdom
// MotifLibraryPanel (motif-shell, D) — the left column's Motifs surface:
// real-store entries, the read-only mini drop-tree (eye only), drag-apply
// onto host rows, the use-count delete guard, and the two-way drag highlight.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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

  // ── A11y A (WCAG 2.1.1): keyboard apply path — tiles are focusable controls,
  //    Enter/Space applies to the selected host through the same onApplyToHost
  //    seam a drop would use.
  it("keyboard apply: Enter on a tile applies its payload to the selected host", () => {
    const onApplyToHost = vi.fn();
    render(<MotifLibraryPanel {...baseProps} onApplyToHost={onApplyToHost} />);
    // The tile's accessible name is the motif name (not polluted by the delete btn).
    const tile = screen.getByRole("button", { name: "Saved Vine" });
    tile.focus();
    fireEvent.keyDown(tile, { key: "Enter" });
    // Same payload/host a drop onto h1 would produce.
    expect(onApplyToHost).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "library", glyphId: "lib-1" }),
      "h1"
    );
  });

  it("keyboard apply: Space on a tile applies to the selected host", () => {
    const onApplyToHost = vi.fn();
    render(<MotifLibraryPanel {...baseProps} onApplyToHost={onApplyToHost} />);
    const tile = screen.getByRole("button", { name: "Saved Vine" });
    fireEvent.keyDown(tile, { key: " " });
    expect(onApplyToHost).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "library", glyphId: "lib-1" }),
      "h1"
    );
  });

  it("keyboard apply is inert when the selected layer is not a valid host", () => {
    const onApplyToHost = vi.fn();
    // m1 is a motif layer → not an eligible host.
    render(
      <MotifLibraryPanel
        {...baseProps}
        selectedLayerId="m1"
        onApplyToHost={onApplyToHost}
      />
    );
    const tile = screen.getByRole("button", { name: "Saved Vine" });
    fireEvent.keyDown(tile, { key: "Enter" });
    expect(onApplyToHost).not.toHaveBeenCalled();
  });

  it("delete button is reachable on focus, not hover only (group-focus-within)", () => {
    render(<MotifLibraryPanel {...baseProps} />);
    // cg-free is unreferenced → deletable; its delete button reveals on
    // focus-within as well as hover, and is a real button in tab order.
    const del = screen.getByLabelText("Delete Free Knot");
    expect(del.className).toContain("group-focus-within:block");
  });

  // ── 44px touch-target contract (pro-shell-only surface, but consistent with
  //    the picker; bare 14–16px icon controls fail the 44px minimum). Density is
  //    preserved with padding + negative margin / min-h-11.
  describe("44px touch-target contract", () => {
    it("the eye visibility toggle gets a padded hit area (was a bare 14px icon)", () => {
      render(<MotifLibraryPanel {...baseProps} />);
      const eye = screen
        .getByTestId("mini-tree-row-h1")
        .querySelector("button[aria-label='Hide layer']");
      expect(eye.className).toContain("p-2");
    });

    it("the delete button gets a padded hit area and keeps group-focus-within", () => {
      render(<MotifLibraryPanel {...baseProps} />);
      const del = screen.getByLabelText("Delete Free Knot");
      expect(del.className).toContain("p-2");
      // The a11y pass's keyboard reveal must survive the hit-area change.
      expect(del.className).toContain("group-focus-within:block");
    });

    it("set-filter pills reach a 44px hit area", () => {
      render(<MotifLibraryPanel {...baseProps} />);
      const pill = screen.getByRole("button", { name: "Built-in" });
      expect(pill.className).toContain("min-h-11");
    });
  });

  it("the footer hint truncates so it cannot crowd the Import button at 200px min-width", () => {
    render(<MotifLibraryPanel {...baseProps} />);
    const hint = screen.getByText("Drag a motif onto a host layer");
    expect(hint.className).toContain("truncate");
    expect(hint.className).toContain("min-w-0");
  });

  // ── Color-token contract: the "Library unavailable" banner uses tone-mild
  //    tokens so dark mode inverts (raw amber-* stays light on the indigo
  //    dark paper and glows). See tokens.css / tailwind.config.js.
  it("library-error banner uses tone-mild tokens so dark mode inverts", () => {
    render(<MotifLibraryPanel {...baseProps} libraryError={new Error("RLS")} />);
    fireEvent.click(screen.getByRole("button", { name: "My library" }));
    const banner = screen.getByText(/Library unavailable/);
    expect(banner.className).toContain("border-tone-mild/40");
    expect(banner.className).toContain("bg-tone-mild/10");
    expect(banner.className).toContain("text-tone-mild");
    expect(banner.className).not.toContain("amber");
  });

  describe("type scale (typography pass)", () => {
    it("mini-tree heading and host tag use the sanctioned 2xs step", () => {
      render(<MotifLibraryPanel {...baseProps} />);
      expect(screen.getByText("Layers").className).toContain("text-2xs");
      const hostTag = screen.getByText("host");
      expect(hostTag.className).toContain("text-2xs");
      expect(hostTag.className).toContain("uppercase");
    });

    it("grid captions and footer controls use the 2xs step", () => {
      render(<MotifLibraryPanel {...baseProps} />);
      // Grid caption (glyph name under a thumbnail).
      expect(screen.getByText("Free Knot").className).toContain("text-2xs");
      // Footer: Import button + drag hint.
      expect(screen.getByText("Import SVG…").className).toContain("text-2xs");
      expect(
        screen.getByText("Drag a motif onto a host layer").className
      ).toContain("text-2xs");
    });

    it("reference-count badge is bumped off text-[7px] to the 2xs floor", () => {
      render(<MotifLibraryPanel {...baseProps} />);
      const badge = screen.getByTitle(/Referenced 1× in this document/);
      expect(badge.className).toContain("text-2xs");
      expect(badge.className).not.toMatch(/text-\[\d+px\]/);
    });

    it("the library-error banner uses the 2xs step, not an arbitrary px size", () => {
      render(<MotifLibraryPanel {...baseProps} libraryError={new Error("RLS")} />);
      fireEvent.click(screen.getByRole("button", { name: "My library" }));
      const banner = screen.getByText(/Library unavailable/);
      expect(banner.className).toContain("text-2xs");
      expect(banner.className).not.toMatch(/text-\[\d+px\]/);
    });

    it("renders no arbitrary text-[Npx] font-size class", () => {
      const { container } = render(<MotifLibraryPanel {...baseProps} />);
      expect(container.innerHTML).not.toMatch(/text-\[\d+px\]/);
    });
  });

  // ── Semantic structure (a11y polish): the panel is a labelled region and
  //    both the mini layer-tree and the library grid are real lists, so screen
  //    readers announce a landmark + item counts instead of flat divs.
  describe("semantic list structure", () => {
    it("the panel root is a labelled region landmark", () => {
      render(<MotifLibraryPanel {...baseProps} />);
      expect(
        screen.getByRole("region", { name: "Motif library" })
      ).toBeInTheDocument();
    });

    it("the mini layer-tree is a list with one item per layer", () => {
      render(<MotifLibraryPanel {...baseProps} />);
      const tree = screen.getByTestId("motif-mini-tree");
      // baseProps has three layers (h1, e1, m1).
      expect(within(tree).getAllByRole("listitem")).toHaveLength(3);
    });

    it("the library grid is a list whose items are the visible motifs", () => {
      render(<MotifLibraryPanel {...baseProps} />);
      const grid = screen.getByTestId("motif-library-grid");
      const items = within(grid).getAllByRole("listitem");
      // Built-ins + the two custom glyphs + the one library motif all render.
      expect(items.length).toBeGreaterThan(0);
      // A representative custom + library entry each live in their own <li>.
      expect(within(grid).getByTitle(/^Free Knot —/).closest("li")).not.toBeNull();
      expect(within(grid).getByTitle(/^Saved Vine —/).closest("li")).not.toBeNull();
    });

    it("the empty grid renders its hint as a list item (valid ul structure)", () => {
      render(<MotifLibraryPanel {...baseProps} />);
      fireEvent.change(screen.getByLabelText("Search motifs"), {
        target: { value: "zzz-no-match" },
      });
      const grid = screen.getByTestId("motif-library-grid");
      const items = within(grid).getAllByRole("listitem");
      expect(items).toHaveLength(1);
      expect(items[0]).toHaveTextContent("No matches.");
    });
  });

  // ── House-icon language (final polish): the close/delete affordance is a
  //    crafted inline SVG (currentColor, hairline stroke), not a raw ✕ glyph —
  //    the accessible name still comes from aria-label, so queries are unchanged.
  it("the delete control renders an inline SVG icon, not a text glyph", () => {
    render(<MotifLibraryPanel {...baseProps} />);
    const del = screen.getByLabelText("Delete Free Knot");
    expect(del.querySelector("svg")).not.toBeNull();
    expect(del.textContent).not.toContain("✕");
  });

  // ── Color-token contract: the destructive delete-hover uses tone-strong
  //    (madder red, house destructive tone) not the raw red-500 palette,
  //    so it flips correctly in dark mode.
  it("delete button hover uses tone-strong (destructive) not raw red-500", () => {
    render(<MotifLibraryPanel {...baseProps} />);
    const del = screen.getByLabelText("Delete Free Knot");
    expect(del.className).toContain("hover:text-tone-strong");
    expect(del.className).not.toContain("red-500");
  });
});
