// @vitest-environment jsdom
// Right-rail folder tabs (WI-tabs) — when the inspector docks to the RIGHT rail
// and the selected layer is an eligible motif host, the Motif device and the
// pattern params are split into two folder tabs instead of stacking (reaching
// params no longer means collapsing the motif module). The active view is
// cached PER LAYER above the per-layer remount boundary, so leaving a layer and
// coming back restores its last-open view. Bottom shelf / no-provider keep the
// classic stacked module chain with the Motif device's own disclosure.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Inspector from "./Inspector";
import { InspectorDockProvider } from "./inspectorDockContext";
import { MOTIF_TYPE, createMotifParams } from "../../lib/motif/motifLayer";

vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: "studio" }),
}));

beforeEach(() => {
  // Neutralize the persisted motif-device disclosure so the classic-layout
  // assertions below aren't influenced by a prior run.
  localStorage.removeItem("sonoform-motif-device-open");
});

function hostLayer(id, patternType = "grid") {
  return {
    id,
    name: id,
    patternType,
    params: {},
    randomizeKeys: [],
    paramsCache: {},
  };
}

function motifLayer(id, hostId) {
  return {
    id,
    name: id,
    type: MOTIF_TYPE,
    patternType: MOTIF_TYPE,
    params: createMotifParams({ hostLayerId: hostId, glyphRef: "leaf" }),
    randomizeKeys: [],
    paramsCache: {},
  };
}

function renderRail(props) {
  return render(
    <InspectorDockProvider value={{ dockPosition: "right" }}>
      <Inspector
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        {...props}
      />
    </InspectorDockProvider>
  );
}

describe("Inspector right-rail folder tabs", () => {
  it("shows Pattern/Motif tabs for a host layer, defaulting to Pattern", () => {
    renderRail({ layers: [hostLayer("h")], selectedLayerId: "h" });

    expect(screen.getByTestId("inspector-tabs")).toBeInTheDocument();
    const pattern = screen.getByTestId("inspector-tab-pattern");
    const motif = screen.getByTestId("inspector-tab-motif");
    // Default view is Pattern (the whole point: easy param access).
    expect(pattern).toHaveAttribute("aria-selected", "true");
    expect(motif).toHaveAttribute("aria-selected", "false");
    // Pattern view = param groups, NOT the motif device.
    expect(screen.queryByTestId("motif-device")).toBeNull();
    // No stacked motif disclosure chevron in tabbed mode.
    expect(screen.queryByTestId("motif-toggle")).toBeNull();
  });

  it("switches to the embedded (chevron-less) Motif device on tab click", () => {
    renderRail({ layers: [hostLayer("h")], selectedLayerId: "h" });

    fireEvent.click(screen.getByTestId("inspector-tab-motif"));

    expect(screen.getByTestId("inspector-tab-motif")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    // The device renders, always-open, with NO internal collapse toggle.
    expect(screen.getByTestId("motif-device")).toBeInTheDocument();
    expect(screen.queryByTestId("motif-toggle")).toBeNull();
  });

  it("badges the Motif tab with the host's motif count", () => {
    renderRail({
      layers: [hostLayer("h"), motifLayer("m1", "h"), motifLayer("m2", "h")],
      selectedLayerId: "h",
    });
    expect(screen.getByTestId("inspector-tab-motif")).toHaveTextContent("2");
  });

  it("caches the active view per layer across selection changes", () => {
    const layers = [hostLayer("a"), hostLayer("b")];
    const { rerender } = renderRail({ layers, selectedLayerId: "a" });

    // Open Motif on layer A.
    fireEvent.click(screen.getByTestId("inspector-tab-motif"));
    expect(screen.getByTestId("inspector-tab-motif")).toHaveAttribute(
      "aria-selected",
      "true"
    );

    // Switch to layer B — unvisited, so it defaults to Pattern.
    const rerenderRail = (selectedLayerId) =>
      rerender(
        <InspectorDockProvider value={{ dockPosition: "right" }}>
          <Inspector
            layers={layers}
            selectedLayerId={selectedLayerId}
            onUpdateLayer={() => {}}
            onChangeLayerPattern={() => {}}
          />
        </InspectorDockProvider>
      );
    rerenderRail("b");
    expect(screen.getByTestId("inspector-tab-pattern")).toHaveAttribute(
      "aria-selected",
      "true"
    );

    // Back to layer A — its Motif choice is restored from the cache.
    rerenderRail("a");
    expect(screen.getByTestId("inspector-tab-motif")).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("ArrowLeft/ArrowRight move between tabs", () => {
    renderRail({ layers: [hostLayer("h")], selectedLayerId: "h" });
    const tablist = screen.getByRole("tablist");

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByTestId("inspector-tab-motif")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(screen.getByTestId("inspector-tab-pattern")).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("does NOT tab non-host layers (no Motif view to split to)", () => {
    // A pattern with no motif-host extractor keeps the classic single stack.
    renderRail({ layers: [hostLayer("h", "flowField")], selectedLayerId: "h" });
    expect(screen.queryByTestId("inspector-tabs")).toBeNull();
  });

  it("does NOT tab on the bottom shelf (Ableton module row stays)", () => {
    render(
      <InspectorDockProvider value={{ dockPosition: "bottom" }}>
        <Inspector
          layers={[hostLayer("h")]}
          selectedLayerId="h"
          onUpdateLayer={() => {}}
          onChangeLayerPattern={() => {}}
        />
      </InspectorDockProvider>
    );
    expect(screen.queryByTestId("inspector-tabs")).toBeNull();
    // Classic disclosure survives on the shelf.
    expect(screen.getByTestId("motif-toggle")).toBeInTheDocument();
  });

  it("does NOT tab with no dock provider (mobile / legacy stacked)", () => {
    render(
      <Inspector
        layers={[hostLayer("h")]}
        selectedLayerId="h"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.queryByTestId("inspector-tabs")).toBeNull();
    expect(screen.getByTestId("motif-toggle")).toBeInTheDocument();
  });
});

describe("MotifDevice docked bottom collapsed strip (Ableton)", () => {
  function renderBottom(props, open) {
    // The device persists its disclosure; seed it so we control open/collapsed.
    localStorage.setItem("sonoform-motif-device-open", open ? "1" : "0");
    return render(
      <InspectorDockProvider value={{ dockPosition: "bottom" }}>
        <Inspector
          onUpdateLayer={() => {}}
          onChangeLayerPattern={() => {}}
          {...props}
        />
      </InspectorDockProvider>
    );
  }

  it("collapses to a data-strip rail with a sideways label", () => {
    renderBottom({ layers: [hostLayer("h")], selectedLayerId: "h" }, false);
    const strip = screen.getByTestId("motif-device");
    expect(strip).toHaveAttribute("data-collapsed", "true");
    expect(strip).toHaveAttribute("data-strip");
    // The label doubles as the expand affordance.
    const toggle = screen.getByTestId("motif-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent(/motif/i);
  });

  it("shows Trace + hide-eye icons on the strip ONLY when motifs exist", () => {
    // Empty host: no play / eye (nothing to trace or hide).
    const { unmount } = renderBottom(
      { layers: [hostLayer("h")], selectedLayerId: "h" },
      false
    );
    expect(screen.queryByTestId("motif-strip-trace")).toBeNull();
    expect(screen.queryByTestId("motif-strip-visibility")).toBeNull();
    unmount();

    // With a motif, both ride along on the strip.
    renderBottom(
      { layers: [hostLayer("h"), motifLayer("m1", "h")], selectedLayerId: "h" },
      false
    );
    // trace prop absent here ⇒ no play button (self-hides without a controller),
    // but the eye is always available when motifs exist.
    expect(screen.getByTestId("motif-strip-visibility")).toHaveAttribute(
      "aria-label",
      "Hide motifs"
    );
  });

  it("the strip eye toggles ALL of the host's motifs' visibility", () => {
    const onUpdateLayer = vi.fn();
    localStorage.setItem("sonoform-motif-device-open", "0");
    render(
      <InspectorDockProvider value={{ dockPosition: "bottom" }}>
        <Inspector
          layers={[
            hostLayer("h"),
            motifLayer("m1", "h"),
            motifLayer("m2", "h"),
          ]}
          selectedLayerId="h"
          onUpdateLayer={onUpdateLayer}
          onChangeLayerPattern={() => {}}
        />
      </InspectorDockProvider>
    );
    fireEvent.click(screen.getByTestId("motif-strip-visibility"));
    // Both motifs hidden (visible:false) in one gesture; host untouched.
    expect(onUpdateLayer).toHaveBeenCalledWith("m1", { visible: false });
    expect(onUpdateLayer).toHaveBeenCalledWith("m2", { visible: false });
    expect(onUpdateLayer).not.toHaveBeenCalledWith(
      "h",
      expect.objectContaining({ visible: expect.anything() })
    );
  });

  it("the strip label expands the device back to its full body", () => {
    renderBottom({ layers: [hostLayer("h")], selectedLayerId: "h" }, false);
    expect(screen.getByTestId("motif-device")).toHaveAttribute("data-collapsed");
    fireEvent.click(screen.getByTestId("motif-toggle"));
    // Expanded: no longer a strip.
    expect(screen.getByTestId("motif-device")).not.toHaveAttribute(
      "data-collapsed"
    );
  });

  it("does NOT strip on the right rail (that path uses tabs / normal stack)", () => {
    localStorage.setItem("sonoform-motif-device-open", "0");
    render(
      <InspectorDockProvider value={{ dockPosition: "right" }}>
        <Inspector
          layers={[hostLayer("h", "flowField")]}
          selectedLayerId="h"
          onUpdateLayer={() => {}}
          onChangeLayerPattern={() => {}}
        />
      </InspectorDockProvider>
    );
    // flowField is a non-host → no motif device at all, definitely no strip.
    expect(screen.queryByTestId("motif-device")).toBeNull();
  });
});
