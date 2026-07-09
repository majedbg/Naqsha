// @vitest-environment jsdom
//
// Wave-3 Lane I (Run Plan, PRD #73) — the two-path export + Export Receipt +
// Preferences wiring (ADR 0001). Export always succeeds and is NEVER silent: the
// quick export (⌘E) writes the file AND surfaces an Export Receipt built from the
// SAME runPlanModel the plan reads, honoring the crop-to-Sheet preference. The
// receipt links into the plan; Preferences flips + persists cropToSheet.
//
// svgExport is stubbed so the DOM blob/download is a no-op under jsdom (and so the
// file write is assertable); buildExportReceipt runs for real over the model.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudioRoute from "./StudioRoute";

const exportAllLayersSVG = vi.fn();
vi.mock("../lib/svgExport", () => ({
  exportAllLayersSVG: (...a) => exportAllLayersSVG(...a),
  exportLayerSVG: vi.fn(),
  buildManifest: () => "",
}));

// A path that runs far past any Sheet edge, so clip-to-Sheet crops it → the model
// carries a cropped-paths warning WHEN cropToSheet is on, and none when off.
const CROSSING_GROUP =
  '<g id="L"><g transform="translate(0,0)"><path d="M0,0 L99999,99999" stroke="#000"/></g></g>';

vi.mock("../components/RightPanel", () => ({
  default: ({ layers, patternInstancesRef }) => {
    if (patternInstancesRef && Array.isArray(layers)) {
      const map = {};
      for (const l of layers) map[l.id] = { toSVGGroup: () => CROSSING_GROUP };
      patternInstancesRef.current = map;
    }
    return <div data-testid="canvas-surface">canvas</div>;
  },
}));
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({ loading: false, user: null, tier: "guest", signIn: vi.fn() }),
  AuthProvider: ({ children }) => children,
}));

function renderStudio() {
  return render(
    <MemoryRouter>
      <StudioRoute />
    </MemoryRouter>
  );
}

const pressExport = () =>
  fireEvent.keyDown(window, { key: "e", metaKey: true });

const openPreferences = () => {
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /preferences/i }));
};

beforeEach(() => {
  localStorage.clear();
  exportAllLayersSVG.mockClear();
});

describe("StudioRoute — quick export + Export Receipt (Lane I)", () => {
  it("⌘E writes the file AND surfaces an Export Receipt with the model's minutes", () => {
    renderStudio();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    pressExport();

    // File written…
    expect(exportAllLayersSVG).toHaveBeenCalledTimes(1);
    // …and the receipt is never silent — it leads with the estimated minutes.
    const receipt = screen.getByRole("status");
    expect(receipt).toHaveTextContent(/Exported — Estimated · \d+ min/);
  });

  it("the receipt's crop clause honors cropToSheet: present when on, gone when off", () => {
    renderStudio();

    // Default ON → geometry runs past the Sheet, so the receipt reports cropping.
    pressExport();
    expect(screen.getByRole("status")).toHaveTextContent(/cropped at sheet edge/i);

    // Flip cropToSheet OFF via Preferences.
    openPreferences();
    const toggle = screen.getByRole("switch", { name: /crop paths overflowing the sheet/i });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    // Guest preference round-trips to localStorage.
    expect(JSON.parse(localStorage.getItem("naqsha-export-settings"))).toMatchObject({
      cropToSheet: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // Export again → no clip stage → no crop clause.
    pressExport();
    expect(screen.getByRole("status")).not.toHaveTextContent(/cropped/i);
  });

  it("the receipt's '→ Run plan' link opens the Run Plan", () => {
    renderStudio();
    pressExport();
    expect(screen.queryByTestId("run-plan-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /run plan/i }));
    expect(screen.getByTestId("run-plan-panel")).toBeInTheDocument();
  });
});
