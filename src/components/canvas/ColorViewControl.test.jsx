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

describe("ColorViewControl — 3D lens peer (S3)", () => {
  it("renders 3D as a third lens peer of Operation/Material", () => {
    setup();
    expect(screen.getByRole("radio", { name: "3D" })).toHaveAttribute("aria-checked", "false");
  });

  it("clicking 3D (inactive) emits onEnter3D and does NOT switch the 2D lens", () => {
    const onEnter3D = vi.fn();
    const onSetMode = vi.fn();
    render(
      <ColorViewControl
        mode="operation"
        materials={MATERIALS}
        onEnter3D={onEnter3D}
        onSetMode={onSetMode}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "3D" }));
    expect(onEnter3D).toHaveBeenCalledTimes(1);
    expect(onSetMode).not.toHaveBeenCalled();
  });

  it("when 3D is active, only 3D is checked (Operation/Material are not)", () => {
    render(<ColorViewControl mode="material" materials={MATERIALS} threeDActive />);
    expect(screen.getByRole("radio", { name: "3D" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Operation" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Material" })).toHaveAttribute("aria-checked", "false");
  });

  it("clicking the active 3D lens emits onExit3D (closes 3D, restores prior view)", () => {
    const onExit3D = vi.fn();
    render(<ColorViewControl mode="operation" materials={MATERIALS} threeDActive onExit3D={onExit3D} />);
    fireEvent.click(screen.getByRole("radio", { name: "3D" }));
    expect(onExit3D).toHaveBeenCalledTimes(1);
  });

  it("shows a Rebuild affordance only while 3D is active, and it emits onRebuild", () => {
    const onRebuild = vi.fn();
    const { rerender } = render(
      <ColorViewControl mode="operation" materials={MATERIALS} onRebuild={onRebuild} />,
    );
    expect(screen.queryByRole("button", { name: /Rebuild/ })).not.toBeInTheDocument();
    rerender(
      <ColorViewControl mode="operation" materials={MATERIALS} threeDActive onRebuild={onRebuild} />,
    );
    const rebuild = screen.getByRole("button", { name: /Rebuild/ });
    fireEvent.click(rebuild);
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });

  it("hides the material chip while 3D is active even if the underlying lens is material", () => {
    render(<ColorViewControl mode="material" material={MATERIALS[0]} materials={MATERIALS} threeDActive />);
    expect(screen.queryByText("Green Fluorescent")).not.toBeInTheDocument();
  });
});

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
