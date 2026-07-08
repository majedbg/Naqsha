// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import OperationsPanel from "./OperationsPanel";
import { seedOperations } from "../../lib/operations";
import { remapOperationsToProfile } from "../../lib/machineProfiles";

function noop() {}

const baseProps = {
  onCommitOperations: noop,
  onAddOperation: noop,
};

describe("OperationsPanel (C1 — LightBurn-style operations / cut-settings panel)", () => {
  // (a) RENDER — columns show the active profile's param fields, one shared
  // row per field so the same field can be skimmed/compared across ops.
  it("renders one column per operation with the LASER param fields (power/speed/passes)", () => {
    const operations = seedOperations();
    render(
      <OperationsPanel
        {...baseProps}
        operations={operations}
        profileId="laser"
      />
    );
    const columns = screen.getAllByTestId("operation-column");
    expect(columns).toHaveLength(3);
    // Cut's column shows power/speed/passes inputs, each labeled per-operation
    // (e.g. "Cut Power (%)") so the row can hold one input per operation.
    expect(screen.getByLabelText(/cut power/i)).toBeTruthy();
    expect(screen.getByLabelText(/cut speed/i)).toBeTruthy();
    expect(screen.getByLabelText(/cut passes/i)).toBeTruthy();
  });

  it("renders the DRAG-CUTTER param fields (force/blade/passes) when the profile is dragCutter", () => {
    const operations = remapOperationsToProfile(seedOperations(), "dragCutter");
    render(
      <OperationsPanel
        {...baseProps}
        operations={operations}
        profileId="dragCutter"
      />
    );
    expect(screen.getByLabelText(/cut force/i)).toBeTruthy();
    expect(screen.getByLabelText(/cut blade/i)).toBeTruthy();
    expect(screen.getByLabelText(/cut passes/i)).toBeTruthy();
  });

  it("renders the PLOTTER param fields (pen #/pressure) when the profile is plotter", () => {
    const operations = remapOperationsToProfile(seedOperations(), "plotter");
    render(
      <OperationsPanel
        {...baseProps}
        operations={operations}
        profileId="plotter"
      />
    );
    expect(screen.getByLabelText(/cut pen #/i)).toBeTruthy();
    expect(screen.getByLabelText(/cut pressure/i)).toBeTruthy();
  });

  // (b) INTERACTION — add / reorder / recolor / param-edit flow through helpers.
  it("calls onAddOperation when Add is clicked", () => {
    const onAddOperation = vi.fn();
    render(
      <OperationsPanel
        {...baseProps}
        operations={seedOperations()}
        profileId="laser"
        onAddOperation={onAddOperation}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /add operation/i }));
    expect(onAddOperation).toHaveBeenCalledTimes(1);
  });

  it("reorder maps to cut order: moving a column right commits a reordered library", () => {
    const onCommitOperations = vi.fn();
    const operations = seedOperations();
    render(
      <OperationsPanel
        {...baseProps}
        operations={operations}
        profileId="laser"
        onCommitOperations={onCommitOperations}
      />
    );
    // Move the first column (Cut) right one.
    const columns = screen.getAllByTestId("operation-column");
    fireEvent.click(
      within(columns[0]).getByRole("button", { name: /move operation right/i })
    );
    expect(onCommitOperations).toHaveBeenCalledTimes(1);
    // The committed mapper, applied to the library, swaps order 0<->1.
    const mapper = onCommitOperations.mock.calls[0][0];
    const next = mapper(operations);
    expect(next[0].id).toBe("op-score");
    expect(next[0].order).toBe(0);
    expect(next[1].id).toBe("op-cut");
  });

  it("editing a param input commits an updated machineParams for that operation", () => {
    const onCommitOperations = vi.fn();
    const operations = seedOperations();
    render(
      <OperationsPanel
        {...baseProps}
        operations={operations}
        profileId="laser"
        onCommitOperations={onCommitOperations}
      />
    );
    const powerInput = screen.getByLabelText(/cut power/i);
    fireEvent.change(powerInput, { target: { value: "42" } });
    expect(onCommitOperations).toHaveBeenCalled();
    const mapper = onCommitOperations.mock.calls.at(-1)[0];
    const next = mapper(operations);
    expect(next.find((o) => o.id === "op-cut").machineParams.power).toBe(42);
  });

  it("recolor commits a recolored library when the profile leaves colors editable (plotter)", () => {
    const onCommitOperations = vi.fn();
    const operations = remapOperationsToProfile(seedOperations(), "plotter");
    render(
      <OperationsPanel
        {...baseProps}
        operations={operations}
        profileId="plotter"
        onCommitOperations={onCommitOperations}
      />
    );
    const column = screen.getAllByTestId("operation-column")[0];
    const swatch = within(column).getByLabelText(/color/i);
    fireEvent.change(swatch, { target: { value: "#0a0b0c" } });
    expect(onCommitOperations).toHaveBeenCalled();
    const mapper = onCommitOperations.mock.calls.at(-1)[0];
    const next = mapper(operations);
    expect(next[0].color).toBe("#0a0b0c");
  });

  // (d) GUARD — laser reserved colors are locked.
  it("locks the color swatch for laser reserved operations (disabled, surfaced)", () => {
    const onCommitOperations = vi.fn();
    const operations = seedOperations();
    render(
      <OperationsPanel
        {...baseProps}
        operations={operations}
        profileId="laser"
        onCommitOperations={onCommitOperations}
      />
    );
    const cutColumn = screen.getAllByTestId("operation-column")[0];
    const swatch = within(cutColumn).getByLabelText(/color/i);
    expect(swatch.disabled).toBe(true);
    expect(within(cutColumn).getByText(/locked/i)).toBeTruthy();
  });
});
