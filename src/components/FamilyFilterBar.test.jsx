// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import FamilyFilterBar from "./FamilyFilterBar";

// Fake families in display order (custom last, as the caller builds it).
const FAMILIES = [
  { key: "A", label: "Waves", color: "#8a5cf6", count: 4 },
  { key: "B", label: "Lattices", color: "#22a06b", count: 7 },
  { key: "custom", label: "Custom", color: "#8a8f99", count: 2 },
];

function renderBar(props = {}) {
  return render(
    <FamilyFilterBar
      families={FAMILIES}
      isOn={() => true}
      onToggle={() => {}}
      onSelectAll={() => {}}
      onClearAll={() => {}}
      {...props}
    />
  );
}

describe("FamilyFilterBar", () => {
  it("renders one pill per family with its label AND count visible", () => {
    renderBar();
    for (const f of FAMILIES) {
      const pill = screen.getByTestId(`family-pill-${f.key}`);
      expect(pill).toHaveTextContent(f.label);
      expect(pill).toHaveTextContent(String(f.count));
    }
  });

  it("reflects isOn via aria-pressed", () => {
    // ON for A + custom, OFF for B.
    const isOn = (key) => key !== "B";
    renderBar({ isOn });
    expect(screen.getByTestId("family-pill-A")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByTestId("family-pill-B")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByTestId("family-pill-custom")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("calls onToggle with the family key when a pill is clicked", () => {
    const onToggle = vi.fn();
    renderBar({ onToggle });
    fireEvent.click(screen.getByTestId("family-pill-B"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("B");
  });

  it("'Select all' calls onSelectAll", () => {
    const onSelectAll = vi.fn();
    renderBar({ onSelectAll });
    fireEvent.click(screen.getByTestId("family-select-all"));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it("'Deselect all' calls onClearAll", () => {
    const onClearAll = vi.fn();
    renderBar({ onClearAll });
    fireEvent.click(screen.getByTestId("family-clear-all"));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it("exposes an accessible group named 'Filter by family'", () => {
    renderBar();
    const group = screen.getByRole("group", { name: "Filter by family" });
    expect(group).toBeInTheDocument();
    // The pills live inside the group.
    expect(
      within(group).getByTestId("family-pill-A")
    ).toBeInTheDocument();
  });

  it("renders native toggle buttons for each pill", () => {
    renderBar();
    const pill = screen.getByTestId("family-pill-A");
    expect(pill.tagName).toBe("BUTTON");
    expect(pill).toHaveAttribute("type", "button");
  });
});
