// @vitest-environment jsdom
// Trace sweep (issue #91) — the per-motif-row Trace affordance inside MotifDevice.
// Exercised through the public <Inspector> with a controllable `trace` prop (the
// useTraceSweep contract), so this asserts the WIRING (button → toggle, pressed
// state, reduced-motion scrubber, lit-row RhythmStrip marker) without the rAF loop.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Inspector from "./Inspector";
import { MOTIF_TYPE, createMotifParams } from "../../lib/motif/motifLayer";
import { applyModeChain } from "../../lib/motif/modeMatch";

vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: "studio" }),
}));

beforeEach(() => {
  // Device defaults open, but keep these deterministic.
  localStorage.setItem("sonoform-motif-device-open", "1");
});

function hostLayer(id = "host1", patternType = "grid") {
  return { id, name: id, patternType, params: {}, randomizeKeys: [], paramsCache: {} };
}

// Build the motif from a real preset so its mode column lights a NON-custom row
// (the row that carries the RhythmStrip the Trace marker rides). A hand-written
// legacy binding would light "Custom", which draws no strip.
const preset = applyModeChain("alternate-xo", "grid");

function motifLayer(id, hostId) {
  return {
    id,
    name: id,
    type: MOTIF_TYPE,
    patternType: MOTIF_TYPE,
    params: createMotifParams({
      hostLayerId: hostId,
      glyphRef: preset.glyphRef,
      anchorMode: preset.anchorMode,
      binding: preset.binding,
    }),
    randomizeKeys: [],
    paramsCache: {},
  };
}

const idleTrace = () => ({
  activeMotifId: null,
  activeCount: 0,
  progressIndex: 0,
  playing: false,
  mode: "idle",
  frac: 0,
  toggle: vi.fn(),
  scrub: vi.fn(),
  stop: vi.fn(),
});

function renderWithTrace(trace) {
  return render(
    <Inspector
      layers={[hostLayer("host1", "grid"), motifLayer("m1", "host1")]}
      selectedLayerId="host1"
      onUpdateLayer={() => {}}
      onChangeLayerPattern={() => {}}
      trace={trace}
    />
  );
}

describe("MotifDevice Trace button (issue #91)", () => {
  it("renders a Trace button per motif row with the right a11y contract", () => {
    renderWithTrace(idleTrace());
    const btn = screen.getByTestId("motif-trace");
    expect(btn).toHaveAttribute("aria-label", "Trace placement order");
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("self-hides when no controller is wired (legacy/isolated callers)", () => {
    render(
      <Inspector
        layers={[hostLayer("host1", "grid"), motifLayer("m1", "host1")]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(screen.queryByTestId("motif-trace")).toBeNull();
  });

  it("pressing Trace toggles the sweep for that motif", () => {
    const trace = idleTrace();
    renderWithTrace(trace);
    fireEvent.click(screen.getByTestId("motif-trace"));
    expect(trace.toggle).toHaveBeenCalledWith("m1");
  });

  it("reflects the active (pressed) state when this motif is tracing", () => {
    const trace = { ...idleTrace(), activeMotifId: "m1", playing: true, mode: "auto", frac: 0.4 };
    renderWithTrace(trace);
    expect(screen.getByTestId("motif-trace")).toHaveAttribute("aria-pressed", "true");
  });

  it("does NOT show the manual scrubber during an auto sweep", () => {
    const trace = { ...idleTrace(), activeMotifId: "m1", mode: "auto", playing: true };
    renderWithTrace(trace);
    expect(screen.queryByTestId("motif-trace-scrubber")).toBeNull();
  });

  it("reduced-motion: reveals a manual Trace-position scrubber for the active motif", () => {
    const trace = {
      ...idleTrace(),
      activeMotifId: "m1",
      activeCount: 10,
      progressIndex: 3,
      mode: "manual",
    };
    renderWithTrace(trace);
    const scrubber = screen.getByTestId("motif-trace-scrubber");
    expect(scrubber).toHaveAttribute("aria-label", "Trace position");
    expect(scrubber).toHaveAttribute("max", "10");
    expect(scrubber).toHaveValue("3");
    fireEvent.change(scrubber, { target: { value: "7" } });
    expect(trace.scrub).toHaveBeenCalledWith(7);
  });

  it("scrubs the lit-row RhythmStrip marker to the trace fraction", () => {
    const trace = { ...idleTrace(), activeMotifId: "m1", mode: "auto", playing: true, frac: 0.5 };
    const { container } = renderWithTrace(trace);
    // The lit row renders a RhythmStrip; its marker line appears only with a frac.
    expect(container.querySelector('[data-testid="rhythm-marker"]')).toBeTruthy();
  });
});
