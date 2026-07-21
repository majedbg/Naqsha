// @vitest-environment jsdom
// LeftRailNav — the far-left surface switcher. A11y H: the toggle buttons are
// grouped in a labelled <nav> so assistive tech announces them as the panel
// navigation landmark.
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import LeftRailNav from "./LeftRailNav";

describe("LeftRailNav — a11y", () => {
  it("groups the surface toggles in a labelled navigation landmark", () => {
    render(<LeftRailNav surface="layers" onSurfaceChange={() => {}} />);
    const nav = screen.getByRole("navigation", { name: "Panels" });
    expect(nav).toBeInTheDocument();
    // The surface toggles live inside the landmark.
    expect(within(nav).getByRole("button", { name: "Layers" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Motifs" })).toBeInTheDocument();
  });
});

describe("LeftRailNav — type scale (typography pass)", () => {
  it("tab labels use the sanctioned 2xs step, not an arbitrary px size", () => {
    render(<LeftRailNav surface="layers" onSurfaceChange={() => {}} />);
    const label = screen.getByText("Layers");
    expect(label.className).toContain("text-2xs");
    // Uppercase + tracking treatment is preserved.
    expect(label.className).toContain("uppercase");
    expect(label.className).toContain("tracking-wide");
  });

  it("renders no arbitrary text-[Npx] font-size class", () => {
    const { container } = render(
      <LeftRailNav surface="layers" onSurfaceChange={() => {}} />
    );
    expect(container.innerHTML).not.toMatch(/text-\[\d+px\]/);
  });
});
