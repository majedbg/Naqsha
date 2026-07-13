// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FrameStatsOverlay from "./FrameStatsOverlay";

describe("FrameStatsOverlay", () => {
  it("renders nothing when ?fps=1 is absent", () => {
    render(<FrameStatsOverlay search="" />);
    expect(screen.queryByTestId("frame-stats-overlay")).toBeNull();
  });

  it("renders the readout when ?fps=1 is present", () => {
    render(<FrameStatsOverlay search="?fps=1" />);
    expect(screen.getByTestId("frame-stats-overlay")).toBeInTheDocument();
    // Before any measured frame, the labels show the pending placeholder.
    expect(screen.getByTestId("frame-stats-overlay").textContent).toContain("fps");
  });
});
