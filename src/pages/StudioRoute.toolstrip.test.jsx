// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudioRoute from "./StudioRoute";

// Issue #9 (Lane B / B6): the tool strip is portaled into the shell's Tool strip
// region and the contextual control bar into the Contextual control bar region,
// on the flag-ON desktop path. Both swap by the active tool. Flag-OFF stays a
// true no-op (no shell regions, no tool strip).
//
// As in the #6/#8 tests, stub the p5 canvas surface + auth so the real Studio
// (and the real shell) render under jsdom.
vi.mock("../components/RightPanel", () => ({
  default: () => <div data-testid="canvas-surface">canvas</div>,
}));
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({
    loading: false,
    user: null,
    tier: "guest",
    profile: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

function renderPro() {
  return render(
    <MemoryRouter>
      <StudioRoute proShell={true} />
    </MemoryRouter>
  );
}

describe("StudioRoute — tool strip + control bar in the shell (B6)", () => {
  beforeEach(() => {
    // The rail's surface choice persists (motif-shell D); keep each test on
    // the default Layers surface.
    localStorage.removeItem("sonoform-left-surface");
  });

  it("the rail's Motifs tab swaps the left column to the motif library and back (motif-shell D)", () => {
    renderPro();
    expect(screen.queryByTestId("motif-library-panel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Motifs" }));
    expect(screen.getByTestId("motif-library-panel")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    expect(screen.queryByTestId("motif-library-panel")).toBeNull();
  });

  it("flag ON desktop: the rail hosts the surface switcher; the tools render as the canvas tab (motif-shell D)", () => {
    renderPro();
    // The w-12 region now carries the Layers/Motifs surface switcher…
    const strip = screen.getByRole("region", { name: "Tool strip" });
    expect(within(strip).getByRole("button", { name: "Layers" })).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: "Motifs" })).toBeInTheDocument();
    // …and the four tools re-homed to the tab over the canvas (still the
    // same ToolStrip component + activeTool state).
    expect(screen.getByRole("button", { name: "Select (V)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Text (T)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hand (Space)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom" })).toBeInTheDocument();
  });

  it("flag ON desktop: the contextual control bar renders inside its region", () => {
    renderPro();
    const bar = screen.getByRole("region", { name: "Contextual control bar" });
    // Default tool is Select; Studio defaults the selection to the top layer
    // (object-tree selection is #5), so the Select context shows align/arrange.
    expect(within(bar).getByRole("group", { name: /align/i })).toBeInTheDocument();
    expect(within(bar).getByRole("group", { name: /arrange/i })).toBeInTheDocument();
  });

  it("activating the Text tool swaps the control bar to text options incl. the outline toggle", () => {
    renderPro();
    // Tools live in the canvas tab now (motif-shell D), not the rail region.
    fireEvent.click(screen.getByRole("button", { name: "Text (T)" }));

    const bar = screen.getByRole("region", { name: "Contextual control bar" });
    expect(within(bar).getByLabelText(/font/i)).toBeInTheDocument();
    expect(within(bar).getByLabelText(/size/i)).toBeInTheDocument();
    expect(
      within(bar).getByRole("button", { name: /outline|single.?line/i })
    ).toBeInTheDocument();
  });

  it("the T hotkey activates the Text tool and swaps the control bar", () => {
    renderPro();
    fireEvent.keyDown(window, { key: "t" });
    const bar = screen.getByRole("region", { name: "Contextual control bar" });
    expect(within(bar).getByLabelText(/font/i)).toBeInTheDocument();
  });

  it("activating Zoom and clicking zoom-in zooms the canvas (state-level)", () => {
    // The p5 canvas is mocked under jsdom, so the Hand/Zoom acceptance is
    // asserted through the live useCanvasView state that drives both the
    // control bar's percentage readout and RightPanel's transform. Activating
    // Zoom shows the zoom cluster; clicking + raises the percentage.
    renderPro();
    // Tools live in the canvas tab now (motif-shell D), not the rail region.
    fireEvent.click(screen.getByRole("button", { name: "Zoom" }));

    const bar = screen.getByRole("region", { name: "Contextual control bar" });
    const zoomGroup = within(bar).getByRole("group", { name: /zoom/i });
    expect(within(zoomGroup).getByLabelText(/reset zoom/i)).toHaveTextContent("100%");

    fireEvent.click(within(zoomGroup).getByRole("button", { name: /zoom in/i }));
    // 100% * 1.25 = 125%.
    expect(
      within(
        within(
          screen.getByRole("region", { name: "Contextual control bar" })
        ).getByRole("group", { name: /zoom/i })
      ).getByLabelText(/reset zoom/i)
    ).toHaveTextContent("125%");
  });

  it("the canvas tool tab is height-guarded so it can't clip unreachably on short viewports", () => {
    // The re-homed ToolStrip tab is pinned top-12 inside an overflow-hidden
    // canvas; without a max-height + internal scroll it clips off-screen when the
    // viewport is short or more tools are added.
    renderPro();
    const tab = screen.getByTestId("canvas-toolstrip-tab");
    expect(tab.className).toContain("max-h-[calc(100%-3.5rem)]");
    expect(tab.className).toContain("overflow-y-auto");
  });

  it("below the breakpoint (mobile) renders no tool strip / shell regions (desktop-only)", () => {
    // #16: legacy removed; below the breakpoint StudioRoute renders MobileStudio,
    // which has no AppShell Tool strip region. (Was: "flag OFF → legacy no-op".)
    const prevWidth = window.innerWidth;
    window.innerWidth = 500;
    try {
      render(
        <MemoryRouter>
          <StudioRoute />
        </MemoryRouter>
      );
      expect(screen.queryAllByRole("region")).toHaveLength(0);
      // No tool-strip Select button in the mobile view.
      expect(screen.queryByRole("button", { name: /^select$/i })).not.toBeInTheDocument();
    } finally {
      window.innerWidth = prevWidth;
    }
  });
});
