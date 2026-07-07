// @vitest-environment jsdom
//
// WI-A2 — responsive dice-hide (§3.2) and RowMenu upward-flip (§4) DECISION
// helpers, unit-tested as pure functions, plus light integration tests that
// exercise the ResizeObserver / getBoundingClientRect wiring in the component.
//
// jsdom has no real layout (widths / rects are 0) and no ResizeObserver, so the
// behavioral assertions live on the PURE helpers; the integration tests inject a
// mock ResizeObserver / stub getBoundingClientRect to drive the wired path.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import LayerTree, { shouldCompact, shouldFlipMenu } from "./LayerTree";

describe("shouldCompact (§3.2 — hide the dice in the narrow band)", () => {
  it("is true inside the 200–240px band (dice too narrow to fit)", () => {
    // §3.2: "Below 240px panel width, hide the 🎲 dice." 240 is EXCLUSIVE — at
    // exactly 240 the dice still shows. 200 is the panel min (§2 clamp [200,480]).
    expect(shouldCompact(200)).toBe(true);
    expect(shouldCompact(220)).toBe(true);
    expect(shouldCompact(239)).toBe(true);
  });

  it("is false at 240 and wider (dice fits — the threshold is exclusive)", () => {
    expect(shouldCompact(240)).toBe(false);
    expect(shouldCompact(280)).toBe(false);
    expect(shouldCompact(480)).toBe(false);
  });
});

describe("shouldFlipMenu (§4 — flip the RowMenu upward near the panel bottom)", () => {
  it("flips when the menu opening below the row would overflow the panel bottom", () => {
    // Row bottom 290, panel (scroll container) bottom 300, menu ~160 tall:
    // 290 + 160 = 450 > 300 → the menu would be clipped below → flip upward.
    expect(shouldFlipMenu(290, 300, 160)).toBe(true);
  });

  it("does NOT flip when the menu fits below the row inside the panel", () => {
    // Row bottom 50, panel bottom 300: 50 + 160 = 210 ≤ 300 → fits → open below.
    expect(shouldFlipMenu(50, 300, 160)).toBe(false);
  });

  it("never flips without real layout (0 rects → guard returns false)", () => {
    // jsdom: every getBoundingClientRect is 0. Without the guard, 0 + 160 > 0
    // would spuriously flip EVERY menu. A non-positive panel bottom → no flip.
    expect(shouldFlipMenu(0, 0, 160)).toBe(false);
  });
});

// ── Integration wiring ──────────────────────────────────────────────────────
// jsdom has no ResizeObserver and no layout, so these inject a mock observer /
// stub rects to exercise the WIRED path (helper → prop → child). The real
// behavioral coverage stays on the pure helpers above.

function baseProps(overrides = {}) {
  return {
    layers: [{ id: "l1", name: "One", patternType: "flow", visible: true }],
    operations: [],
    profileId: "plotter",
    selectedLayerId: null,
    onSelectLayer: () => {},
    onUpdateLayer: () => {},
    onReorderLayers: () => {},
    onProfileChange: () => {},
    onRandomizeLayerParams: () => {}, // dice only renders when this is supplied
    ...overrides,
  };
}

describe("compact wiring (ResizeObserver → hide dice in the narrow band)", () => {
  const realRO = global.ResizeObserver;
  let roWidth = 0;
  afterEach(() => {
    global.ResizeObserver = realRO;
  });
  // Mock observer that fires its callback synchronously on observe() with the
  // current `roWidth` — mirrors the InspectorShelf measurement seam.
  function installMockRO(width) {
    roWidth = width;
    global.ResizeObserver = class {
      constructor(cb) {
        this.cb = cb;
      }
      observe() {
        this.cb([{ contentRect: { width: roWidth } }]);
      }
      unobserve() {}
      disconnect() {}
    };
  }

  it("hides the 🎲 dice when the measured container width is in the compact band", () => {
    installMockRO(220);
    render(<LayerTree {...baseProps()} />);
    const row = screen.getByTestId("layer-row");
    expect(
      within(row).queryByRole("button", { name: "Randomize layer params" })
    ).not.toBeInTheDocument();
  });

  it("keeps the 🎲 dice when the measured container width is at/above 240", () => {
    installMockRO(320);
    render(<LayerTree {...baseProps()} />);
    const row = screen.getByTestId("layer-row");
    expect(
      within(row).getByRole("button", { name: "Randomize layer params" })
    ).toBeInTheDocument();
  });
});

describe("menu-flip wiring (getBoundingClientRect → RowMenu anchorNearBottom)", () => {
  // Stub the row + scroll-container rects (jsdom returns 0 for both), open the
  // ⋯ menu, and assert the flip class RowMenu resolves from anchorNearBottom.
  function openMenuWith({ rowBottom, panelBottom }) {
    render(<LayerTree {...baseProps({ onDeleteLayer: () => {} })} />);
    const scroll = screen.getByTestId("layer-tree-scroll");
    const row = screen.getByTestId("layer-row");
    scroll.getBoundingClientRect = () => ({ bottom: panelBottom });
    row.getBoundingClientRect = () => ({ bottom: rowBottom });
    fireEvent.click(within(row).getByRole("button", { name: "Row actions" }));
    return screen.getByTestId("row-menu");
  }

  it("flips the menu UPWARD (bottom-full) when the row is near the panel bottom", () => {
    // row 290 + est 160 = 450 > panel 300 → would clip below → flip up.
    const menu = openMenuWith({ rowBottom: 290, panelBottom: 300 });
    expect(menu).toHaveClass("bottom-full");
    expect(menu).not.toHaveClass("top-full");
  });

  it("keeps the menu DOWNWARD (top-full) when the row has room below", () => {
    // row 50 + est 160 = 210 ≤ panel 300 → fits below → open down.
    const menu = openMenuWith({ rowBottom: 50, panelBottom: 300 });
    expect(menu).toHaveClass("top-full");
    expect(menu).not.toHaveClass("bottom-full");
  });
});
