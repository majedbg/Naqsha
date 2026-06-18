// @vitest-environment jsdom
//
// WI-6 — Studio wiring for the Object Tree panel (spec §7, §9).
//
// Two concerns, tested at the level where each is genuinely observable:
//
//  1. Lock-aware randomization (spec §9) — asserted at the `useLayers` HOOK level.
//     The route DOM never surfaces a layer's `params`/`seed`, so the only place
//     these guards are observable is the hook itself, where we read
//     `result.current.layers[i].params/seed` directly and control `Math.random`.
//     Four guards, one test each: randomizeAllParams, randomizeAll,
//     randomizeLayerParams, randomizeLayer all skip a locked layer.
//
//  2. Rename round-trip (spec §7) — asserted at the ROUTE level. A tree rename
//     flows through Studio → `updateLayer` → the rendered name. This is a
//     regression/characterization test: `onUpdateLayer={updateLayer}` is already
//     wired, so it is green without any production change.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudioRoute from "./StudioRoute";
import useLayers from "../lib/useLayers";

// ---------------------------------------------------------------------------
// 1. Lock-aware randomization — useLayers hook tests (deterministic, no DOM).
// ---------------------------------------------------------------------------
//
// randomSeed() === Math.floor(Math.random() * 100000) → range [0, 99999].
// We seed sentinel values OUTSIDE every reachable output so "changed" is
// airtight (the sentinel can never be produced by randomization):
//   - seed sentinel 999999          (unreachable: > 99999)
//   - particleCount sentinel -1     (flowfield particleCount ∈ [100, 3000])
//
// The locked layer is set up so it WOULD randomize absent the guard:
// patternType 'flowfield' (exists in PATTERN_PARAM_DEFS) + a non-empty
// randomizeKeys. Otherwise the early-return on empty keys would make the test
// vacuously green without exercising the guard.

function setup() {
  return renderHook(() => useLayers({ persistToLocal: false, maxLayers: 6 }));
}

const SEED_SENTINEL = 999999; // > 99999, unreachable by randomSeed()
const PARTICLE_SENTINEL = -1; // < 100, unreachable by particleCount randomization

// Prepare a hook with two layers: index 0 LOCKED, index 1 UNLOCKED. Both set to
// flowfield with a known randomizeKey and sentinel params/seed so randomization
// would visibly change them if it ran.
function setupTwoLayers() {
  const view = setup();
  const { result } = view;

  // Add a 2nd layer.
  act(() => result.current.addLayer());
  expect(result.current.layers.length).toBe(2);

  const lockedId = result.current.layers[0].id;
  const unlockedId = result.current.layers[1].id;

  // Normalize both layers to a randomizable flowfield with sentinel values.
  act(() => {
    result.current.updateLayer(lockedId, {
      patternType: "flowfield",
      randomizeKeys: ["particleCount"],
      params: { particleCount: PARTICLE_SENTINEL },
      seed: SEED_SENTINEL,
      locked: true,
    });
    result.current.updateLayer(unlockedId, {
      patternType: "flowfield",
      randomizeKeys: ["particleCount"],
      params: { particleCount: PARTICLE_SENTINEL },
      seed: SEED_SENTINEL,
      locked: false,
    });
  });

  const byId = (id) => result.current.layers.find((l) => l.id === id);
  return { result, lockedId, unlockedId, byId };
}

describe("useLayers — lock-aware randomization (WI-6 / spec §9)", () => {
  beforeEach(() => {
    // Deterministic randomness — 0.5 → seeds 50000, mid-range params.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("randomizeAllParams skips locked layers (locked params unchanged, unlocked changed)", () => {
    const { result, lockedId, unlockedId, byId } = setupTwoLayers();

    act(() => result.current.randomizeAllParams());

    // Locked: sentinel preserved → guard held.
    expect(byId(lockedId).params.particleCount).toBe(PARTICLE_SENTINEL);
    // Unlocked: randomized away from the unreachable sentinel.
    expect(byId(unlockedId).params.particleCount).not.toBe(PARTICLE_SENTINEL);
  });

  it("randomizeAll (seeds) skips locked layers (locked seed unchanged, unlocked changed)", () => {
    const { result, lockedId, unlockedId, byId } = setupTwoLayers();

    act(() => result.current.randomizeAll());

    expect(byId(lockedId).seed).toBe(SEED_SENTINEL);
    expect(byId(unlockedId).seed).not.toBe(SEED_SENTINEL);
  });

  it("randomizeLayerParams is a no-op on a locked layer", () => {
    const { result, lockedId, byId } = setupTwoLayers();

    act(() => result.current.randomizeLayerParams(lockedId));

    expect(byId(lockedId).params.particleCount).toBe(PARTICLE_SENTINEL);
  });

  it("randomizeLayerParams still randomizes an unlocked layer (guard is targeted)", () => {
    const { result, unlockedId, byId } = setupTwoLayers();

    act(() => result.current.randomizeLayerParams(unlockedId));

    expect(byId(unlockedId).params.particleCount).not.toBe(PARTICLE_SENTINEL);
  });

  it("randomizeLayer (seed) is a no-op on a locked layer", () => {
    const { result, lockedId, byId } = setupTwoLayers();

    act(() => result.current.randomizeLayer(lockedId));

    expect(byId(lockedId).seed).toBe(SEED_SENTINEL);
  });

  it("randomizeLayer still randomizes an unlocked layer's seed", () => {
    const { result, unlockedId, byId } = setupTwoLayers();

    act(() => result.current.randomizeLayer(unlockedId));

    expect(byId(unlockedId).seed).not.toBe(SEED_SENTINEL);
  });
});

// ---------------------------------------------------------------------------
// 2. Rename round-trip — route level (the rendered name is observable here).
// ---------------------------------------------------------------------------

vi.mock("../components/RightPanel", () => ({
  default: () => <div data-testid="canvas-surface">canvas</div>,
}));
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({
    loading: false,
    user: null,
    tier: "guest",
    profile: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

function renderPro() {
  return render(
    <MemoryRouter>
      <StudioRoute proShell={true} />
    </MemoryRouter>
  );
}

describe("StudioRoute — Object Tree rename round-trip (WI-6 / spec §7)", () => {
  beforeEach(() => localStorage.clear());

  it("renaming a row round-trips through updateLayer and renders the new name", () => {
    renderPro();
    const tree = screen.getByRole("region", { name: /object tree|layers/i });
    const row = within(tree).getAllByTestId("layer-row")[0];

    // The auto name is whatever the default layer rendered with. The name span
    // is the SPAN carrying the "truncate" class (the row's primary text); narrow
    // the candidate set with `selector` so callback `element` is always that span
    // (avoids matching nested SVG nodes whose className isn't a plain string).
    const nameSpan = within(row).getByText(
      (_, el) => el?.classList?.contains("truncate"),
      { selector: "span.truncate" }
    );
    fireEvent.doubleClick(nameSpan);

    const input = within(row).getByRole("textbox");
    fireEvent.change(input, { target: { value: "My Renamed Layer" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Round-tripped through Studio → updateLayer → rendered tree.
    expect(
      within(tree).getByText("My Renamed Layer")
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Header "Rand Params" wiring + lock-skip — route level (spec §9).
//
// Proves the tree-header button actually reaches `randomizeAllParams` AND that
// the lock guard gates it end-to-end. The Inspector region renders the selected
// layer's params as sliders, so we snapshot the slider values to detect change
// without reading hook internals. Randomness is pinned for determinism.
// ---------------------------------------------------------------------------

describe("StudioRoute — header Rand Params wiring + lock-skip (WI-6 / spec §9)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => vi.restoreAllMocks());

  function sliderValues() {
    const inspector = screen.getByRole("region", { name: "Inspector" });
    return within(inspector)
      .getAllByRole("slider")
      .map((s) => s.value ?? s.getAttribute("aria-valuenow"));
  }

  it("clicking header 'Rand Params' leaves a LOCKED layer's params unchanged, then changes them once unlocked", () => {
    renderPro();
    const tree = screen.getByRole("region", { name: /object tree|layers/i });
    const row = within(tree).getAllByTestId("layer-row")[0];

    // Select the row (so the Inspector shows ITS params) and lock it.
    fireEvent.click(row);
    fireEvent.click(within(row).getByRole("button", { name: "Lock layer" }));

    const before = sliderValues();
    expect(before.length).toBeGreaterThan(0);

    // Header "Rand Params" — wired to randomizeAllParams. Locked → no change.
    fireEvent.click(
      within(tree).getByRole("button", { name: "Randomize all params" })
    );
    expect(sliderValues()).toEqual(before);

    // Unlock the same layer; now the SAME header click must mutate at least one
    // param — proving the header→handler wiring works and the guard was the only
    // thing holding it (genuine, non-vacuous coverage).
    fireEvent.click(within(row).getByRole("button", { name: "Unlock layer" }));
    fireEvent.click(
      within(tree).getByRole("button", { name: "Randomize all params" })
    );
    expect(sliderValues()).not.toEqual(before);
  });
});
