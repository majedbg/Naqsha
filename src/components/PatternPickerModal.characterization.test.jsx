// @vitest-environment jsdom
//
// CHARACTERIZATION TEST (Slice 0) — pins the CURRENT "Map" / periodic-table
// rendering of PatternPickerModal BEFORE the gallery refactor. The modal has no
// prior tests; this encodes today's observed behavior so the upcoming extraction
// (PatternTableView / PatternGalleryView / tabs) is provably non-breaking.
//
// Assertions are deliberately about what the code does NOW, verified against the
// constants (SPATIAL_FORM_ROWS, PATTERN_TAXONOMY, PATTERN_FAMILIES, PATTERN_SYMBOLS).
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PatternPickerModal from "./PatternPickerModal";
import { vi } from "vitest";

// The modal reads the tier gate via useGate -> useAuth. Mock to a tier where
// every pattern is unlocked so cards render in their normal (enabled) state —
// mirrors PatternSelect.test.jsx / Inspector.test.jsx.
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({ tier: "studio" }),
}));

describe("PatternPickerModal — current Map (periodic-table) rendering [characterization]", () => {
  const noop = () => {};

  it("renders the modal shell with its heading when open", () => {
    render(<PatternPickerModal open onClose={noop} onPick={noop} />);
    // Heading present (the modal's identity).
    expect(
      screen.getByRole("heading", { name: "Choose a pattern" })
    ).toBeInTheDocument();
  });

  it("renders a known taxonomy row label (SPATIAL_FORM_ROWS)", () => {
    render(<PatternPickerModal open onClose={noop} onPick={noop} />);
    // 'radial' row → label "Radial / Spiral"; populated by spiral/spirograph etc.,
    // so the row is not hidden as empty.
    expect(screen.getByText("Radial / Spiral")).toBeInTheDocument();
    // 'grid' row → label "Grid / Woven" (grid/girih/modulegrid).
    expect(screen.getByText("Grid / Woven")).toBeInTheDocument();
  });

  it("renders a known pattern card (spiral) with its symbol and title", () => {
    render(<PatternPickerModal open onClose={noop} onPick={noop} />);
    // Cards carry title "<label> — <blurb>"; spiral is a static (ready) built-in.
    expect(screen.getByTitle(/^Spiral —/)).toBeInTheDocument();
    // Element symbol caption for spiral (PATTERN_SYMBOLS.spiral === 'Sl').
    expect(screen.getByText("Sl")).toBeInTheDocument();
    // A second known card (grid) for good measure.
    expect(screen.getByTitle(/^Grid —/)).toBeInTheDocument();
  });

  it("renders the bottom legend with family entries (PATTERN_FAMILIES)", () => {
    render(<PatternPickerModal open onClose={noop} onPick={noop} />);
    // Legend lists every family label.
    expect(screen.getByText("Harmonic Curves")).toBeInTheDocument();
    expect(screen.getByText("Waves & Interference")).toBeInTheDocument();
    expect(screen.getByText("Reaction-Diffusion")).toBeInTheDocument();
    // Legend determinism key is also present.
    expect(screen.getByText("● deterministic")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <PatternPickerModal open={false} onClose={noop} onPick={noop} />
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("Choose a pattern")).not.toBeInTheDocument();
  });
});
