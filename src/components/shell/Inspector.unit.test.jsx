// @vitest-environment jsdom
// Inspector unit-tag display/convert end-to-end (issue #13).
//
// Threads the active `unit` from the Inspector into the LayerParams context, so a
// tagged length param (spirograph `d`, wave `amplitude`) renders in the active
// unit while an untagged param (`revolutions`) renders raw. Editing a tagged
// param must hand layer state PX values (output unchanged).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import Inspector from "./Inspector";
import { DEFAULT_PARAMS } from "../../constants";
import { PX_PER_MM } from "../../lib/units";

let mockTier = "studio";
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: mockTier }),
}));

function makeLayer(id, patternType) {
  return {
    id,
    name: id,
    patternType,
    params: { ...DEFAULT_PARAMS[patternType] },
    randomizeKeys: [],
    paramsCache: {},
  };
}

function Harness({ patternType, unit, onUpdateSpy }) {
  const [layers, setLayers] = useState([makeLayer("l1", patternType)]);
  const updateLayer = (id, patch) => {
    onUpdateSpy?.(id, patch);
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  return (
    <Inspector
      layers={layers}
      selectedLayerId="l1"
      unit={unit}
      onUpdateLayer={updateLayer}
      onChangeLayerPattern={() => {}}
    />
  );
}

beforeEach(() => {
  mockTier = "studio";
});

describe("Inspector unit-tag display/convert", () => {
  it("shows a tagged length param in mm while untagged stays raw", () => {
    render(<Harness patternType="spirograph" unit="mm" />);
    const dPx = DEFAULT_PARAMS.spirograph.d;
    const dMm = (dPx / PX_PER_MM).toFixed(1);
    // Tagged 'd' (Pen Offset) reads in mm.
    expect(
      screen.getByRole("button", { name: /Pen Offset:.*click to edit/ })
    ).toHaveTextContent(dMm);
    // Untagged 'revolutions' reads raw (px / unitless number unchanged).
    expect(
      screen.getByRole("button", { name: /Revolutions:.*click to edit/ })
    ).toHaveTextContent(String(DEFAULT_PARAMS.spirograph.revolutions));
  });

  it("editing a tagged param in mm writes PX back to layer state", () => {
    const onUpdateSpy = vi.fn();
    render(<Harness patternType="wave" unit="mm" onUpdateSpy={onUpdateSpy} />);
    // Edit amplitude (tagged) by typing a mm value.
    fireEvent.click(screen.getByRole("button", { name: /Amplitude:.*click to edit/ }));
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "20" } }); // 20 mm
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onUpdateSpy).toHaveBeenCalled();
    const [, patch] = onUpdateSpy.mock.calls[onUpdateSpy.mock.calls.length - 1];
    // 20 mm -> px (snapped to px step 1), stored as px.
    expect(patch.params.amplitude).toBeCloseTo(Math.round(20 * PX_PER_MM), 6);
  });

  it("with unit='px' (or unset) tagged params display raw px", () => {
    render(<Harness patternType="spirograph" unit="px" />);
    expect(
      screen.getByRole("button", { name: /Pen Offset:.*click to edit/ })
    ).toHaveTextContent(String(DEFAULT_PARAMS.spirograph.d));
  });

  it("re-renders the readout when the active unit switches live (mm -> in)", () => {
    const dPx = DEFAULT_PARAMS.spirograph.d;
    const { rerender } = render(
      <Inspector
        layers={[makeLayer("l1", "spirograph")]}
        selectedLayerId="l1"
        unit="mm"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: /Pen Offset:.*click to edit/ })
    ).toHaveTextContent((dPx / PX_PER_MM).toFixed(1));

    rerender(
      <Inspector
        layers={[makeLayer("l1", "spirograph")]}
        selectedLayerId="l1"
        unit="in"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    // Now in inches — 96 px/in, value reformats without any re-selection.
    expect(
      screen.getByRole("button", { name: /Pen Offset:.*click to edit/ })
    ).toHaveTextContent((dPx / 96).toFixed(2));
  });
});
