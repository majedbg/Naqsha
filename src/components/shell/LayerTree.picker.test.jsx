// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import LayerTree from "./LayerTree";
import { seedOperations } from "../../lib/operations";

// Issue #11 (Lane C / C2): the per-row operation chip (rendered in #5) now opens
// the operation picker and reassigns THAT row's layer via onAssignOperation(
// layerId, operationId). Clicking the chip must NOT also select the row.

function makeLayer(id, { operationId = "op-cut", name } = {}) {
  return { id, name: name || id, patternType: "flowfield", params: {}, visible: true, locked: false, operationId };
}

describe("LayerTree — row chip → picker (C2)", () => {
  it("clicking a row chip opens the picker for that row (not a color wheel)", () => {
    const operations = seedOperations();
    const { container } = render(
      <LayerTree
        layers={[makeLayer("l1"), makeLayer("l2", { operationId: "op-score" })]}
        operations={operations}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={() => {}}
        onUpdateLayer={() => {}}
        onReorderLayers={() => {}}
        onProfileChange={() => {}}
        onAssignOperation={() => {}}
      />
    );
    const rows = screen.getAllByTestId("layer-row");
    fireEvent.click(within(rows[0]).getByTestId("operation-chip"));
    const menu = screen.getByRole("menu", { name: /operation/i });
    expect(within(menu).getByRole("menuitem", { name: /engrave/i })).toBeInTheDocument();
    expect(container.querySelector('input[type="color"]')).toBeNull();
  });

  it("picking reassigns that row's layer via onAssignOperation(layerId, opId)", () => {
    const operations = seedOperations();
    const onAssignOperation = vi.fn();
    render(
      <LayerTree
        layers={[makeLayer("l1"), makeLayer("l2")]}
        operations={operations}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={() => {}}
        onUpdateLayer={() => {}}
        onReorderLayers={() => {}}
        onProfileChange={() => {}}
        onAssignOperation={onAssignOperation}
      />
    );
    const rows = screen.getAllByTestId("layer-row");
    fireEvent.click(within(rows[1]).getByTestId("operation-chip"));
    fireEvent.click(screen.getByRole("menuitem", { name: /score/i }));
    expect(onAssignOperation).toHaveBeenCalledWith("l2", "op-score");
  });

  it("clicking the chip does NOT select the row (stops propagation)", () => {
    const operations = seedOperations();
    const onSelectLayer = vi.fn();
    render(
      <LayerTree
        layers={[makeLayer("l1")]}
        operations={operations}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={onSelectLayer}
        onUpdateLayer={() => {}}
        onReorderLayers={() => {}}
        onProfileChange={() => {}}
        onAssignOperation={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("operation-chip"));
    expect(onSelectLayer).not.toHaveBeenCalled();
  });
});
