// @vitest-environment jsdom
//
// Inspector × SheetInspector (#75) — with nothing selected AND Sheet props
// provided, the Inspector's empty state becomes the Sheet inspector. Without
// Sheet props (legacy callers / standalone tests) the neutral placeholder
// survives unchanged, and a selection always wins over the Sheet section.
//
// NEW test file per the in-repo convention (Inspector.motif / .unit / ...);
// does not touch Inspector.test.jsx.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Inspector from "./Inspector";
import { DEFAULT_PARAMS } from "../../constants";

// Same convention as Inspector.test.jsx: the selected-layer branch reads the
// gate via useAuth; mock it to a known tier so the real checkGate runs.
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: "studio" }),
}));

function makeLayer(id, patternType, name) {
  return {
    id,
    name: name || id,
    patternType,
    params: { ...DEFAULT_PARAMS[patternType] },
    randomizeKeys: [],
    paramsCache: {},
  };
}

function sheetProps(overrides = {}) {
  return {
    canvasW: 768,
    canvasH: 1024,
    bedSize: { width: 300, height: 400 },
    onApplySheetSize: vi.fn(),
    ...overrides,
  };
}

describe("Inspector — empty selection becomes the Sheet inspector (#75)", () => {
  it("shows the Sheet section (not the placeholder) when nothing is selected and Sheet props are wired", () => {
    render(
      <Inspector
        layers={[makeLayer("l1", "flowfield", "Flow")]}
        selectedLayerId={null}
        unit="mm"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        {...sheetProps()}
      />
    );
    expect(screen.getByTestId("inspector-sheet")).toBeInTheDocument();
    expect(screen.queryByTestId("inspector-empty")).not.toBeInTheDocument();
  });

  it("keeps the legacy neutral placeholder when Sheet props are not provided (back-compat)", () => {
    render(
      <Inspector
        layers={[makeLayer("l1", "flowfield", "Flow")]}
        selectedLayerId={null}
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.getByTestId("inspector-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("inspector-sheet")).not.toBeInTheDocument();
  });

  it("a selection wins: per-layer editor renders, Sheet section does not (AC6)", () => {
    render(
      <Inspector
        layers={[makeLayer("l1", "flowfield", "Flow")]}
        selectedLayerId="l1"
        unit="mm"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        {...sheetProps()}
      />
    );
    expect(screen.queryByTestId("inspector-sheet")).not.toBeInTheDocument();
    expect(screen.queryByTestId("inspector-empty")).not.toBeInTheDocument();
  });
});
