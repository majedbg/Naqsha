// @vitest-environment jsdom
// Host-unavailability surfacing (#145) — a genuinely EMPTY host must tell the
// maker WHY, not hand them an empty canvas.
//
// Chladni's field is identically zero at equal mode numbers, so no nodal lines
// are drawn and no glyph can be placed whatever the maker picks. The Motif
// device therefore shows the reason from the single params-aware capability seam
// (lib/motif/hostCapability) and withholds the "Start with" mode chooser, which
// would otherwise create a motif that stamps nothing.
//
// The device is NOT hidden: hiding is what a silent empty result looks like.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Inspector from "./Inspector";
import { hostAvailability } from "../../lib/motif/hostCapability";
import { MOTIF_TYPE, createMotifParams } from "../../lib/motif/motifLayer";

vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: "studio" }),
}));

// Chladni is a field-capable pattern, so the Inspector renders FieldOverlay,
// which paints into a 2D canvas in a useEffect — jsdom has no canvas backend.
// Stub it (same approach as ModulationParamBox.test.jsx); nothing here depends
// on the overlay.
vi.mock("../FieldOverlay", () => ({
  default: () => <div data-testid="field-overlay-stub" />,
}));

beforeEach(() => {
  // Device open by default; these tests read the body directly.
  localStorage.removeItem("sonoform-motif-device-open");
});

function chladniHost(params) {
  return {
    id: "ch",
    name: "ch",
    patternType: "chladni",
    params,
    randomizeKeys: [],
    paramsCache: {},
  };
}

function motifOn(hostId) {
  return {
    id: "m1",
    name: "m1",
    type: MOTIF_TYPE,
    patternType: MOTIF_TYPE,
    params: createMotifParams({ hostLayerId: hostId, glyphRef: "leaf" }),
    randomizeKeys: [],
    paramsCache: {},
  };
}

function renderWith(layers, selectedLayerId) {
  return render(
    <Inspector
      layers={layers}
      selectedLayerId={selectedLayerId}
      onUpdateLayer={() => {}}
      onChangeLayerPattern={() => {}}
    />
  );
}

describe("Motif device on an available host", () => {
  it("a non-blank chladni shows the device and its Start-with chooser, with no notice", () => {
    renderWith([chladniHost({ m: 4, n: 3, blend: 0 })], "ch");
    expect(screen.getByTestId("motif-device")).toBeInTheDocument();
    expect(screen.getByTestId("motif-empty-start")).toBeInTheDocument();
    expect(screen.queryByTestId("motif-host-unavailable")).toBeNull();
  });

  it("existing hosts are untouched — a grid shows no notice", () => {
    renderWith(
      [{ id: "g", name: "g", patternType: "grid", params: {}, randomizeKeys: [], paramsCache: {} }],
      "g"
    );
    expect(screen.queryByTestId("motif-host-unavailable")).toBeNull();
    expect(screen.getByTestId("motif-empty-start")).toBeInTheDocument();
  });
});

describe("Motif device on a blank chladni plate", () => {
  const BLANK = [
    ["first mode pair equal", { m: 4, n: 4, blend: 0 }],
    ["second mode pair equal at full blend", { m: 4, n: 3, blend: 1, m2: 5, n2: 5 }],
  ];

  for (const [label, params] of BLANK) {
    it(`${label}: the device stays visible and shows the reason instead of the chooser`, () => {
      renderWith([chladniHost(params)], "ch");

      // Not hidden — a hidden device is exactly the silent empty result.
      expect(screen.getByTestId("motif-device")).toBeInTheDocument();

      const notice = screen.getByTestId("motif-host-unavailable");
      expect(notice).toBeInTheDocument();
      // The copy is the seam's reason verbatim, not a second string the UI
      // invented — so #154 can change the wording in one place.
      expect(notice).toHaveTextContent(hostAvailability("chladni", params).reason);

      // No "Start with" chooser: creating a motif here would stamp nothing.
      expect(screen.queryByTestId("motif-empty-start")).toBeNull();
    });
  }

  it("keeps existing motif rows visible alongside the reason (the maker keeps their chain)", () => {
    const host = chladniHost({ m: 4, n: 4, blend: 0 });
    renderWith([host, motifOn("ch")], "ch");
    expect(screen.getByTestId("motif-host-unavailable")).toBeInTheDocument();
    expect(screen.getAllByTestId("motif-row")).toHaveLength(1);
  });
});
