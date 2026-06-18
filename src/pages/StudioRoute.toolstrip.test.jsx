// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
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
  it("flag ON desktop: the tool strip renders inside the Tool strip region", () => {
    renderPro();
    const strip = screen.getByRole("region", { name: "Tool strip" });
    expect(within(strip).getByRole("button", { name: /select/i })).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: /text/i })).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: /hand|pan/i })).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: /zoom/i })).toBeInTheDocument();
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
    const strip = screen.getByRole("region", { name: "Tool strip" });
    fireEvent.click(within(strip).getByRole("button", { name: /text/i }));

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
    const strip = screen.getByRole("region", { name: "Tool strip" });
    fireEvent.click(within(strip).getByRole("button", { name: /zoom/i }));

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

  it("flag OFF: no tool strip and no shell regions (true no-op)", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={false} />
      </MemoryRouter>
    );
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    // No tool-strip Select button leaks into the legacy layout.
    expect(screen.queryByRole("button", { name: /^select$/i })).not.toBeInTheDocument();
  });
});
