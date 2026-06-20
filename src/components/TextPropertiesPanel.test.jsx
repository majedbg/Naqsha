// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import TextPropertiesPanel from "./TextPropertiesPanel";

// Leaf test for the text inspector panel (phase 5). It is rendered with
// font=null on first paint (useFont resolves async; never in jsdom), so the
// cap-height / engrave-warning readouts must no-op without throwing while the
// controls still render. Each control emits onUpdate(patch) of node fields.
function makeNode(overrides = {}) {
  return {
    id: "text-1",
    text: "Hello",
    fontId: "default",
    fontSize: 48,
    align: "left",
    lineHeight: 1.2,
    box: { w: 0, h: 0 },
    lineMode: "single",
    renderMode: "fill",
    color: "#000000",
    x: 0,
    y: 0,
    ...overrides,
  };
}

describe("TextPropertiesPanel", () => {
  it("renders controls without throwing when font=null", () => {
    expect(() =>
      render(
        <TextPropertiesPanel node={makeNode()} font={null} onUpdate={() => {}} />
      )
    ).not.toThrow();
    // The size spinbutton + the align/engrave radio groups are present.
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /align/i })).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: /engrave/i })
    ).toBeInTheDocument();
  });

  it("changing size emits onUpdate with a fontSize patch", () => {
    const onUpdate = vi.fn();
    render(
      <TextPropertiesPanel node={makeNode()} font={null} onUpdate={onUpdate} />
    );
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "10" } });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const patch = onUpdate.mock.calls[0][0];
    expect(patch).toHaveProperty("fontSize");
    // 10mm converts to px (> the raw mm number); just assert it's a finite px.
    expect(Number.isFinite(patch.fontSize)).toBe(true);
    expect(patch.fontSize).toBeGreaterThan(0);
  });

  it("changing align emits onUpdate({ align })", () => {
    const onUpdate = vi.fn();
    render(
      <TextPropertiesPanel node={makeNode()} font={null} onUpdate={onUpdate} />
    );
    const alignGroup = screen.getByRole("radiogroup", { name: /align/i });
    fireEvent.click(within(alignGroup).getByRole("radio", { name: "C" }));
    expect(onUpdate).toHaveBeenCalledWith({ align: "center" });
  });

  it("changing engrave style emits onUpdate({ renderMode })", () => {
    const onUpdate = vi.fn();
    render(
      <TextPropertiesPanel node={makeNode()} font={null} onUpdate={onUpdate} />
    );
    const engraveGroup = screen.getByRole("radiogroup", { name: /engrave/i });
    fireEvent.click(within(engraveGroup).getByRole("radio", { name: /outline/i }));
    expect(onUpdate).toHaveBeenCalledWith({ renderMode: "outline" });
  });

  it("changing color emits onUpdate({ color })", () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <TextPropertiesPanel node={makeNode()} font={null} onUpdate={onUpdate} />
    );
    const colorInput = container.querySelector('input[type="color"]');
    expect(colorInput).toBeTruthy();
    fireEvent.change(colorInput, { target: { value: "#ff0000" } });
    expect(onUpdate).toHaveBeenCalledWith({ color: "#ff0000" });
  });
});
