// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import OperationPicker from "./OperationPicker";
import { seedOperations } from "../../lib/operations";

// Issue #11 (Lane C / C2): the operation picker. Clicking the stroke/operation
// swatch (control bar), the tool-strip base chip, or a LayerTree row chip opens
// THIS picker — a list of the document's operations (each a NAMED PROCESS with a
// color swatch), NOT an RGB color wheel. Picking one fires onSelect(operationId).

describe("OperationPicker (C2 — operation list, not a color wheel)", () => {
  it("when open, lists one entry per document operation (named processes)", () => {
    const operations = seedOperations();
    render(
      <OperationPicker
        operations={operations}
        open
        onSelect={() => {}}
        onClose={() => {}}
      />
    );
    const menu = screen.getByRole("menu", { name: /operation/i });
    // One entry per operation, each labelled by the operation name.
    expect(within(menu).getByRole("menuitem", { name: /cut/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /score/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /engrave/i })).toBeInTheDocument();
  });

  it("is NOT an RGB color wheel — no color input is rendered", () => {
    const operations = seedOperations();
    const { container } = render(
      <OperationPicker operations={operations} open onSelect={() => {}} onClose={() => {}} />
    );
    expect(container.querySelector('input[type="color"]')).toBeNull();
    expect(container.querySelector('input[type="range"]')).toBeNull();
  });

  it("each entry shows the operation's color swatch", () => {
    const operations = seedOperations();
    render(
      <OperationPicker operations={operations} open onSelect={() => {}} onClose={() => {}} />
    );
    const cut = screen.getByRole("menuitem", { name: /cut/i });
    const swatch = cut.querySelector("[data-op-swatch]");
    expect(swatch).toHaveStyle({ backgroundColor: "#FF0000" });
  });

  it("fires onSelect with the operation id when an entry is clicked", () => {
    const operations = seedOperations();
    const onSelect = vi.fn();
    render(
      <OperationPicker operations={operations} open onSelect={onSelect} onClose={() => {}} />
    );
    fireEvent.click(screen.getByRole("menuitem", { name: /score/i }));
    expect(onSelect).toHaveBeenCalledWith("op-score");
  });

  it("renders nothing when open is false", () => {
    const operations = seedOperations();
    render(
      <OperationPicker operations={operations} open={false} onSelect={() => {}} onClose={() => {}} />
    );
    expect(screen.queryByRole("menu", { name: /operation/i })).not.toBeInTheDocument();
  });
});
