// @vitest-environment jsdom
//
// The anchor-pitch control WHERE IT LIVES — inside the Inspector's motif
// device, beside layer Size (PRD #184, PR 2; hold-doc §8b).
//
// `MotifPitchField.test.jsx` covers the control's own behaviour. This file
// covers only what the Inspector is responsible for: which field on the layer
// gets written, that `binding` is not disturbed by writing it, and that the
// control is inert on a host `edgeOpts` structurally cannot reach.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Inspector from "./Inspector";
import { MOTIF_TYPE, createMotifParams } from "../../lib/motif/motifLayer";
import { DEFAULT_SPACING } from "../../lib/motif/pitchUnits";

vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: "studio" }),
}));

beforeEach(() => {
  localStorage.setItem("sonoform-motif-device-open", "0");
});

const hostLayer = (patternType) => ({
  id: "host1",
  name: "host1",
  patternType,
  params: {},
  randomizeKeys: [],
  paramsCache: {},
});

const motifLayer = (edgeOpts) => ({
  id: "m1",
  name: "m1",
  type: MOTIF_TYPE,
  patternType: MOTIF_TYPE,
  params: {
    ...createMotifParams({ hostLayerId: "host1", glyphRef: "leaf" }),
    ...(edgeOpts === undefined ? {} : { edgeOpts }),
  },
  randomizeKeys: [],
  paramsCache: {},
});

function expand(patternType, { edgeOpts, onUpdateLayer = vi.fn() } = {}) {
  render(
    <Inspector
      layers={[hostLayer(patternType), motifLayer(edgeOpts)]}
      selectedLayerId="host1"
      onUpdateLayer={onUpdateLayer}
      onChangeLayerPattern={() => {}}
    />,
  );
  fireEvent.click(screen.getByTestId("motif-toggle"));
  return { onUpdateLayer };
}

const readout = () => screen.getByTestId("motif-pitch-number-readout");

describe("Inspector — the pitch control's placement", () => {
  it("sits inside the motif row, beside layer Size", () => {
    // Per-LAYER, unlike `hold`: spacing is a property of the motif, not a slot.
    expand("flowfield");
    const row = screen.getByTestId("motif-row");
    expect(row).toContainElement(screen.getByTestId("motif-pitch"));
    expect(row).toContainElement(screen.getByTestId("motif-size"));
    // Same fixed placement tail as Size and Flip.
    expect(screen.getByTestId("motif-size").closest("div")).toBe(
      screen.getByTestId("motif-pitch").parentElement,
    );
  });

  it("shows the motif's stored spacing", () => {
    expand("flowfield", { edgeOpts: { spacing: 64 } });
    expect(readout().textContent).toBe("64 u");
  });

  it("falls back to the creation default for a motif that carries no edgeOpts", () => {
    // `motifLayer.js:80` defaults it on every new motif, but a document written
    // before that — or one hand-built — may have none.
    expand("flowfield", { edgeOpts: undefined });
    expect(readout().textContent).toBe(`${DEFAULT_SPACING} u`);
  });
});

describe("Inspector — what the pitch control writes", () => {
  it("writes params.edgeOpts.spacing, NOT anything under params.binding", () => {
    // `patchMotif` deep-merges into `binding`; `edgeOpts` is a SIBLING of it on
    // `params`, so it cannot go through that path and does not.
    const { onUpdateLayer } = expand("flowfield", { edgeOpts: { spacing: 24 } });
    fireEvent.keyDown(screen.getByTestId("motif-pitch-number"), { key: "ArrowUp" });
    expect(onUpdateLayer).toHaveBeenCalled();
    const [layerId, patch] = onUpdateLayer.mock.calls[0];
    expect(layerId).toBe("m1"); // the MOTIF's id, not the host's
    expect(patch.params.edgeOpts.spacing).toBe(25);
    expect(patch.params.binding).toBeDefined(); // re-spread whole, not dropped
  });

  it("preserves every other key on edgeOpts", () => {
    const { onUpdateLayer } = expand("flowfield", {
      edgeOpts: { spacing: 24, offset: 3, jitter: 0.2 },
    });
    fireEvent.keyDown(screen.getByTestId("motif-pitch-number"), { key: "ArrowUp" });
    const [, patch] = onUpdateLayer.mock.calls[0];
    expect(patch.params.edgeOpts).toEqual({ spacing: 25, offset: 3, jitter: 0.2 });
  });

  it("writes nothing when only the unit is flipped", () => {
    const { onUpdateLayer } = expand("flowfield", { edgeOpts: { spacing: 24 } });
    fireEvent.click(screen.getByRole("radio", { name: /^Density/ }));
    fireEvent.click(screen.getByRole("radio", { name: /^Spacing/ }));
    expect(onUpdateLayer).not.toHaveBeenCalled();
  });
});

describe("Inspector — inert where edgeOpts structurally does not reach", () => {
  it("is disabled with a reason on a SEMANTIC host", () => {
    // hold-doc §6: semantic extractors are count-based and own their own
    // density (spiral `edgeSamplesPerArm = 24`, Truchet `edgeSamplesPerArc = 3`,
    // both feeding `count:` into resampleByArcLength). Converting them from
    // count to distance would change the anchor IDS of every existing document.
    const { onUpdateLayer } = expand("grid");
    expect(screen.getByTestId("motif-pitch-number")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("motif-pitch-inert")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId("motif-pitch-number"), { key: "ArrowUp" });
    expect(onUpdateLayer).not.toHaveBeenCalled();
  });

  it("is live on an EDGE host", () => {
    expand("flowfield");
    expect(screen.getByTestId("motif-pitch-number")).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByTestId("motif-pitch-inert")).toBeNull();
  });
});
