// @vitest-environment jsdom
// RoleGlyphToggles — Route's collapsed summary control: one small RoleBadge-
// fragment toggle per role the host kind offers (crossing/cell/edge/tip). Each is
// a pressed/unpressed button (aria-pressed reflecting whether the role is on) with
// the role NAME as its accessible name. Toggling a role reports the key up via
// onToggle(key) — the caller writes it through the same editChain seam the detail
// checkboxes use.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RoleGlyphToggles from "./RoleGlyphToggles";

const semanticOptions = [
  { key: "crossing", label: "Crossings" },
  { key: "edge", label: "Edges" },
  { key: "tip", label: "Tips" },
  { key: "cell", label: "Cells" },
];

describe("RoleGlyphToggles — one toggle per available role", () => {
  it("renders a pressed button for each ON role and an unpressed one for each OFF role", () => {
    render(
      <RoleGlyphToggles
        hostKind="lattice"
        options={semanticOptions}
        roles={["crossing"]}
        onToggle={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Crossings" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Edges" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "Tips" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cells" })).toBeInTheDocument();
  });

  it("carries a role-badge fragment mark inside each toggle (drawn, aria-hidden)", () => {
    const { container } = render(
      <RoleGlyphToggles
        hostKind="lattice"
        options={semanticOptions}
        roles={["crossing"]}
        onToggle={() => {}}
      />
    );
    // The lit toggle draws the crossing role marks (RoleBadge data-role-mark).
    expect(container.querySelector('[data-role-mark="crossing"]')).toBeTruthy();
  });

  it("an edge host offers only the Edges toggle", () => {
    render(
      <RoleGlyphToggles
        hostKind="stroke"
        options={[{ key: "edge", label: "Edges" }]}
        roles={["edge"]}
        onToggle={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Edges" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crossings" })).toBeNull();
  });
});

describe("RoleGlyphToggles — toggling reports the role key up", () => {
  it("clicking an OFF role reports its key (caller adds it)", () => {
    const onToggle = vi.fn();
    render(
      <RoleGlyphToggles
        hostKind="lattice"
        options={semanticOptions}
        roles={["crossing"]}
        onToggle={onToggle}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Tips" }));
    expect(onToggle).toHaveBeenCalledWith("tip");
  });

  it("clicking an ON role reports its key (caller removes it)", () => {
    const onToggle = vi.fn();
    render(
      <RoleGlyphToggles
        hostKind="lattice"
        options={semanticOptions}
        roles={["crossing"]}
        onToggle={onToggle}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Crossings" }));
    expect(onToggle).toHaveBeenCalledWith("crossing");
  });

  it("exposes a per-role testid (motif-role-toggle-<key>) for rack wiring", () => {
    render(
      <RoleGlyphToggles
        hostKind="lattice"
        options={semanticOptions}
        roles={[]}
        onToggle={() => {}}
      />
    );
    expect(screen.getByTestId("motif-role-toggle-tip")).toBeInTheDocument();
    expect(screen.getByTestId("motif-role-toggle-tip").className).toContain(
      "focus-visible:ring-violet"
    );
  });
});
