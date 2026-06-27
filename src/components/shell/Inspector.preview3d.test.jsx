// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Inspector from "./Inspector";
import { DEFAULT_PARAMS } from "../../constants";

// Inspector composes controls that read the gate via useAuth — mock it (studio
// tier) so the modulator UI renders, mirroring Inspector.test.jsx.
let mockTier = "studio";
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: mockTier }),
}));

// FieldOverlay paints into a 2D canvas in a useEffect; jsdom has no canvas
// backend, so stub it (same convention as ModulatorRange.test.jsx).
vi.mock("../FieldOverlay", () => ({
  default: () => <div data-testid="field-overlay-stub" />,
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

beforeEach(() => {
  mockTier = "studio";
});

describe("Inspector — Preview in 3D (S8, Surface B launch)", () => {
  it("shows the button for a field-producing guide (chladni) and fires openHeightSurface(layer.id)", () => {
    const onPreviewField = vi.fn();
    const guide = makeLayer("guide-1", "chladni", "Guide");
    render(
      <Inspector
        layers={[guide]}
        selectedLayerId="guide-1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onPreviewField={onPreviewField}
      />
    );

    const btn = screen.getByTestId("modulator-preview-3d");
    fireEvent.click(btn);

    expect(onPreviewField).toHaveBeenCalledTimes(1);
    expect(onPreviewField).toHaveBeenCalledWith("guide-1");
  });

  it("does not render the button for a layer that produces no field", () => {
    render(
      <Inspector
        layers={[makeLayer("f-1", "flowfield", "Flow")]}
        selectedLayerId="f-1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onPreviewField={() => {}}
      />
    );
    expect(screen.queryByTestId("modulator-preview-3d")).toBeNull();
  });

  it("no-ops safely when onPreviewField is not wired (standalone / legacy)", () => {
    render(
      <Inspector
        layers={[makeLayer("guide-1", "chladni", "Guide")]}
        selectedLayerId="guide-1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    // Clicking must not throw even with no handler supplied.
    expect(() => fireEvent.click(screen.getByTestId("modulator-preview-3d"))).not.toThrow();
  });

  it("reads 'Preview in 3D' and opens when no 3D preview is active", () => {
    const onPreviewField = vi.fn();
    const onClosePreview = vi.fn();
    render(
      <Inspector
        layers={[makeLayer("guide-1", "chladni", "Guide")]}
        selectedLayerId="guide-1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onPreviewField={onPreviewField}
        onClosePreview={onClosePreview}
        threeDSubMode="off"
        threeDFocusLayerId={null}
      />
    );
    const btn = screen.getByTestId("modulator-preview-3d");
    expect(btn).toHaveTextContent("Preview in 3D");
    fireEvent.click(btn);
    expect(onPreviewField).toHaveBeenCalledWith("guide-1");
    expect(onClosePreview).not.toHaveBeenCalled();
  });

  it("reads 'Close preview' and closes when THIS guide is being previewed in Surface B", () => {
    const onPreviewField = vi.fn();
    const onClosePreview = vi.fn();
    render(
      <Inspector
        layers={[makeLayer("guide-1", "chladni", "Guide")]}
        selectedLayerId="guide-1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onPreviewField={onPreviewField}
        onClosePreview={onClosePreview}
        threeDSubMode="height-surface"
        threeDFocusLayerId="guide-1"
      />
    );
    const btn = screen.getByTestId("modulator-preview-3d");
    expect(btn).toHaveTextContent("Close preview");
    fireEvent.click(btn);
    expect(onClosePreview).toHaveBeenCalledTimes(1);
    expect(onPreviewField).not.toHaveBeenCalled();
  });

  it("reads 'Preview in 3D' and re-focuses when a DIFFERENT guide is previewed", () => {
    const onPreviewField = vi.fn();
    const onClosePreview = vi.fn();
    render(
      <Inspector
        layers={[makeLayer("guide-1", "chladni", "Guide")]}
        selectedLayerId="guide-1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onPreviewField={onPreviewField}
        onClosePreview={onClosePreview}
        threeDSubMode="height-surface"
        threeDFocusLayerId="some-other-guide"
      />
    );
    const btn = screen.getByTestId("modulator-preview-3d");
    expect(btn).toHaveTextContent("Preview in 3D");
    fireEvent.click(btn);
    expect(onPreviewField).toHaveBeenCalledWith("guide-1");
    expect(onClosePreview).not.toHaveBeenCalled();
  });
});
