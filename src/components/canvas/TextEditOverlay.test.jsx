// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TextEditOverlay from "./TextEditOverlay";

// Leaf test for the on-canvas edit textarea (phase 5). Rendered with font=null
// (jsdom never loads a real opentype font); the component's `if (font)` guard
// skips TextNode sizing, so it still renders a focusable textarea bound to the
// node's text. We assert the two lifecycle signals it owns: onEditText (typing)
// and onExitEdit (Escape).
function makeNode(overrides = {}) {
  return {
    id: "text-1",
    text: "ab",
    fontId: "default",
    fontSize: 48,
    align: "left",
    lineHeight: 1.2,
    box: { w: 0, h: 0 },
    lineMode: "single",
    renderMode: "fill",
    color: "#000000",
    x: 10,
    y: 20,
    ...overrides,
  };
}

describe("TextEditOverlay", () => {
  it("renders a textarea bound to the node text (font=null is safe)", () => {
    render(
      <TextEditOverlay
        node={makeNode()}
        font={null}
        onEditText={() => {}}
        onExitEdit={() => {}}
      />
    );
    const ta = screen.getByRole("textbox");
    expect(ta).toBeInTheDocument();
    expect(ta).toHaveValue("ab");
  });

  it("typing fires onEditText(node.id, value)", () => {
    const onEditText = vi.fn();
    render(
      <TextEditOverlay
        node={makeNode({ text: "" })}
        font={null}
        onEditText={onEditText}
        onExitEdit={() => {}}
      />
    );
    const ta = screen.getByRole("textbox");
    fireEvent.change(ta, { target: { value: "Hi" } });
    expect(onEditText).toHaveBeenCalledWith("text-1", "Hi");
  });

  it("Escape fires onExitEdit()", () => {
    const onExitEdit = vi.fn();
    render(
      <TextEditOverlay
        node={makeNode()}
        font={null}
        onEditText={() => {}}
        onExitEdit={onExitEdit}
      />
    );
    const ta = screen.getByRole("textbox");
    fireEvent.keyDown(ta, { key: "Escape" });
    expect(onExitEdit).toHaveBeenCalledTimes(1);
  });
});
