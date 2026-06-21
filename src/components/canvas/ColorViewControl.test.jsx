// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import ColorViewControl from "./ColorViewControl";

const MATERIALS = [
  { id: "green-fluorescent", name: "Green Fluorescent", type: "acrylic", hex: "#E6E954", category: "lighten" },
  { id: "clear", name: "Clear", type: "acrylic", hex: "#E7E7E7", category: "lighten" },
  { id: "birch-plywood", name: "Birch Plywood", type: "plywood", hex: "#D8B988", category: "burn" },
];

function setup(props = {}) {
  const onSetMode = vi.fn();
  const onSelectMaterial = vi.fn();
  render(
    <ColorViewControl
      mode="operation"
      material={null}
      materials={MATERIALS}
      onSetMode={onSetMode}
      onSelectMaterial={onSelectMaterial}
      {...props}
    />,
  );
  return { onSetMode, onSelectMaterial };
}

describe("ColorViewControl — lens toggle", () => {
  it("renders both lenses with Operation active by default", () => {
    setup();
    expect(screen.getByRole("radio", { name: "Operation" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Material" })).toHaveAttribute("aria-checked", "false");
  });

  it("clicking Operation emits onSetMode('operation')", () => {
    const { onSetMode } = setup({ mode: "material", material: MATERIALS[0] });
    fireEvent.click(screen.getByRole("radio", { name: "Operation" }));
    expect(onSetMode).toHaveBeenCalledWith("operation");
  });

  it("clicking Material emits onSetMode('material')", () => {
    const { onSetMode } = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Material" }));
    expect(onSetMode).toHaveBeenCalledWith("material");
  });

  it("shows the current-sheet chip only in material mode", () => {
    const { rerender } = renderWith({ mode: "operation", material: null });
    expect(screen.queryByText("Choose…")).not.toBeInTheDocument();
    rerender({ mode: "material", material: MATERIALS[0] });
    expect(screen.getByText("Green Fluorescent")).toBeInTheDocument();
  });
});

// Small helper for the rerender case above.
function renderWith(props) {
  const utils = render(
    <ColorViewControl materials={MATERIALS} onSetMode={() => {}} onSelectMaterial={() => {}} {...props} />,
  );
  return {
    rerender: (next) =>
      utils.rerender(
        <ColorViewControl materials={MATERIALS} onSetMode={() => {}} onSelectMaterial={() => {}} {...next} />,
      ),
  };
}

describe("ColorViewControl — material picker", () => {
  it("auto-opens with the prompt when a material is needed", () => {
    setup({ mode: "material", material: null, needsMaterialChoice: true });
    expect(screen.getByText("What material should we preview?")).toBeInTheDocument();
  });

  it("groups materials by type", () => {
    setup({ mode: "material", material: null, needsMaterialChoice: true });
    const box = screen.getByRole("listbox", { name: "Preview material" });
    expect(within(box).getByText("Acrylic")).toBeInTheDocument();
    expect(within(box).getByText("Plywood")).toBeInTheDocument();
    expect(within(box).getAllByRole("option")).toHaveLength(3);
  });

  it("selecting a material emits onSelectMaterial and closes the picker", () => {
    const { onSelectMaterial } = setup({ mode: "material", material: null, needsMaterialChoice: true });
    fireEvent.click(screen.getByRole("option", { name: /Birch Plywood/ }));
    expect(onSelectMaterial).toHaveBeenCalledWith("birch-plywood");
    expect(screen.queryByText("What material should we preview?")).not.toBeInTheDocument();
  });

  it("the chip toggles the picker open in material mode", () => {
    setup({ mode: "material", material: MATERIALS[0] });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Previewing Green Fluorescent/ }));
    expect(screen.getByRole("listbox", { name: "Preview material" })).toBeInTheDocument();
  });

  it("Escape closes the picker", () => {
    setup({ mode: "material", material: null, needsMaterialChoice: true });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
