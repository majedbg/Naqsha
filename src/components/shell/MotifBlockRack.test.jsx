// @vitest-environment jsdom
// MotifBlockRack — compact one-line Block rows (Variant D) + type-scale sweep.
//
// Route / Every N / Density collapse to a ~one-line row (grip · unfold-chevron ·
// name · inline summary control · anchor chip · power); the chevron unfolds the
// EXISTING detail editors beneath. Skip / Field stay as full cards; the Sequencer
// stays expanded (it is the payload) and shows an "N placed" chip. The per-block
// anchor chips read from sieveCounts when the rack is given resolved host anchors.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import MotifBlockRack from "./MotifBlockRack";

// A chain that mounts every card body plus the deepest branches (a Random-mode
// sequence with a glyph slot whose angle-randomization is ON), so every place a
// literal size could hide actually renders once unfolded.
const fullChain = [
  { type: "route", roles: ["crossing"], pathScope: "all" },
  { type: "everyN", n: 2, offset: 1, continuous: true },
  { type: "skip", mask: [false, true, false] },
  { type: "density", density: 0.5, seed: 3, rngMode: "hash" },
  { type: "field", threshold: 0.5, invert: false },
  {
    type: "sequence",
    mode: "random",
    slots: [
      { glyphRef: "leaf", weight: 1.5, rotationRandom: { range: 30, spread: "flat" } },
      { rest: true, weight: 1 },
    ],
  },
];

const baseProps = {
  chain: fullChain,
  onEditChain: () => {},
  hostIsSemantic: true,
  customGlyphs: {},
  baseGlyphRef: "leaf",
  onEditSlotGlyph: () => {},
};

// Anchor fixtures for the sieve chips: minimal {id, role} shape (the engine reads
// `role` for route, `id` for everyN/density). 8 crossings + 4 edges.
const mk = (role, id) => ({ id, role, x: 0, y: 0, meta: { pathIndex: 0, closed: false } });
function anchors12() {
  const out = [];
  for (let i = 0; i < 12; i++) out.push(mk(i < 8 ? "crossing" : "edge", `a${i}`));
  return out;
}

// Find a rendered block card by its type.
const cardOf = (type) =>
  screen.getAllByTestId("motif-block").find((c) => c.getAttribute("data-block-type") === type);

// Unfold a collapsible row (route / everyN / density) via its chevron.
const unfold = (type) =>
  fireEvent.click(within(cardOf(type)).getByTestId("motif-block-disclosure"));

describe("MotifBlockRack — collapsed one-line rows", () => {
  it("Route/Every N/Density render COLLAPSED by default: chevron present, detail hidden", () => {
    render(<MotifBlockRack {...baseProps} />);
    for (const type of ["route", "everyN", "density"]) {
      const card = cardOf(type);
      const chevron = within(card).getByTestId("motif-block-disclosure");
      expect(chevron).toHaveAttribute("aria-expanded", "false");
    }
    // Detail-only controls are absent while collapsed.
    expect(screen.queryByTestId("motif-route-scope-all")).toBeNull();
    expect(screen.queryByTestId("motif-block-n")).toBeNull();
    expect(screen.queryByTestId("motif-block-density")).toBeNull();
  });

  it("the collapsed Route row carries the role-toggle summary control", () => {
    render(<MotifBlockRack {...baseProps} />);
    const card = cardOf("route");
    // The RoleGlyphToggles summary (distinct testid from the detail checkbox).
    expect(within(card).getByTestId("motif-role-toggle-crossing")).toBeInTheDocument();
    expect(within(card).getByTestId("motif-role-toggle-crossing")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("the collapsed Every N row carries the cadence strip + n scrub-numeral", () => {
    render(<MotifBlockRack {...baseProps} />);
    const card = cardOf("everyN");
    expect(within(card).getByTestId("cadence-strip")).toBeInTheDocument();
    expect(within(card).getByTestId("motif-summary-n")).toHaveTextContent("2");
  });

  it("the collapsed Density row carries the density scrub-numeral (formatted)", () => {
    render(<MotifBlockRack {...baseProps} />);
    const card = cardOf("density");
    expect(within(card).getByTestId("motif-summary-density")).toHaveTextContent("0.50");
  });

  it("the unfolded Every N detail renders the SAME cadence component, larger (edits offset)", () => {
    const onEditChain = vi.fn();
    render(<MotifBlockRack {...baseProps} onEditChain={onEditChain} />);
    unfold("everyN");
    const card = cardOf("everyN");
    // Two strips now: the collapsed-row summary + the detail one.
    const strips = within(card).getAllByTestId("cadence-strip");
    expect(strips).toHaveLength(2);
    // Click a beat in the DETAIL strip (second) — n=2 so beat 5 → offset 1.
    fireEvent.click(within(strips[1]).getByTestId("cadence-beat-5"));
    const mutate = onEditChain.mock.calls[0][0];
    expect(mutate(fullChain).find((b) => b.type === "everyN").offset).toBe(1);
  });

  it("unfolding a row flips aria-expanded and reveals the detail editors", () => {
    render(<MotifBlockRack {...baseProps} />);
    expect(screen.queryByTestId("motif-route-scope-all")).toBeNull();
    unfold("route");
    expect(within(cardOf("route")).getByTestId("motif-block-disclosure")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByTestId("motif-route-scope-all")).toBeInTheDocument();
    unfold("everyN");
    expect(screen.getByTestId("motif-block-n")).toBeInTheDocument();
    unfold("density");
    expect(screen.getByTestId("motif-block-density")).toBeInTheDocument();
  });

  it("Skip and Field stay full cards (no chevron); Sequencer stays expanded", () => {
    render(<MotifBlockRack {...baseProps} />);
    expect(within(cardOf("skip")).queryByTestId("motif-block-disclosure")).toBeNull();
    expect(within(cardOf("field")).queryByTestId("motif-block-disclosure")).toBeNull();
    // Sequencer body is always present (the slot strip renders with no unfold).
    expect(within(cardOf("sequence")).getByTestId("motif-slot-strip")).toBeInTheDocument();
  });
});

describe("MotifBlockRack — inline summary controls edit through the chain seam", () => {
  it("toggling a Route role in the collapsed summary writes roles via editChain", () => {
    const onEditChain = vi.fn();
    render(<MotifBlockRack {...baseProps} onEditChain={onEditChain} />);
    fireEvent.click(within(cardOf("route")).getByTestId("motif-role-toggle-edge"));
    expect(onEditChain).toHaveBeenCalledTimes(1);
    // Apply the mutate to the chain to confirm it adds 'edge' to the route block.
    const mutate = onEditChain.mock.calls[0][0];
    const next = mutate(fullChain);
    const route = next.find((b) => b.type === "route");
    expect(route.roles).toEqual(["crossing", "edge"]);
  });

  it("clicking a cadence beat writes the Every N OFFSET (n unchanged)", () => {
    const onEditChain = vi.fn();
    render(<MotifBlockRack {...baseProps} onEditChain={onEditChain} />);
    // n=2, so beat index 5 → offset = 5 mod 2 = 1.
    const card = cardOf("everyN");
    fireEvent.click(within(card).getByTestId("cadence-beat-5"));
    const mutate = onEditChain.mock.calls[0][0];
    const next = mutate(fullChain);
    const everyN = next.find((b) => b.type === "everyN");
    expect(everyN.offset).toBe(1);
    expect(everyN.n).toBe(2); // untouched
  });

  it("arrowing the Density scrub-numeral commits a stepped density via editChain", () => {
    const onEditChain = vi.fn();
    render(<MotifBlockRack {...baseProps} onEditChain={onEditChain} />);
    const scrub = within(cardOf("density")).getByTestId("motif-summary-density");
    fireEvent.keyDown(scrub, { key: "ArrowUp" });
    const mutate = onEditChain.mock.calls[0][0];
    const next = mutate(fullChain);
    expect(next.find((b) => b.type === "density").density).toBeCloseTo(0.55, 5);
  });
});

describe("MotifBlockRack — anchor-count chips (sieveCounts)", () => {
  it("no chips render when no anchors are supplied", () => {
    render(<MotifBlockRack {...baseProps} />);
    expect(screen.queryAllByTestId("motif-block-anchor-chip")).toHaveLength(0);
  });

  it("a collapsed row chip shows pre-cap in→out from the sieve", () => {
    const chain = [{ type: "route", roles: ["crossing"], pathScope: "all" }];
    render(<MotifBlockRack {...baseProps} chain={chain} anchors={anchors12()} />);
    // 12 anchors in, 8 crossings survive.
    const chip = within(cardOf("route")).getByTestId("motif-block-anchor-chip");
    expect(chip).toHaveTextContent("12");
    expect(chip).toHaveTextContent("8");
  });

  it("a DEAD block (0 survivors) reads tone-mild; a normal drop does not", () => {
    // roles:['tip'] with no tip anchors → 12 in, 0 out (dead).
    const dead = [{ type: "route", roles: ["tip"], pathScope: "all" }];
    const { unmount } = render(
      <MotifBlockRack {...baseProps} chain={dead} anchors={anchors12()} />
    );
    const deadChip = within(cardOf("route")).getByTestId("motif-block-anchor-chip");
    expect(deadChip).toHaveTextContent("0");
    expect(deadChip.className).toContain("text-tone-mild");
    unmount();
    // A normal drop (crossing: 12→8) is NOT tone-mild.
    render(
      <MotifBlockRack
        {...baseProps}
        chain={[{ type: "route", roles: ["crossing"], pathScope: "all" }]}
        anchors={anchors12()}
      />
    );
    const liveChip = within(cardOf("route")).getByTestId("motif-block-anchor-chip");
    expect(liveChip.className).not.toContain("text-tone-mild");
  });

  it("the Sequencer header shows 'N placed' from the sieve", () => {
    const chain = [
      { type: "route", roles: ["crossing"], pathScope: "all" },
      { type: "sequence", mode: "cycle", slots: [{ glyphRef: "leaf" }, { rest: true }] },
    ];
    render(<MotifBlockRack {...baseProps} chain={chain} anchors={anchors12()} />);
    // 8 crossings survive; a glyph/rest cycle places the glyph on ~half → some
    // non-zero count. Assert the chip exists and reads a number of placements.
    const placed = within(cardOf("sequence")).getByTestId("motif-seq-placed");
    expect(placed.textContent).toMatch(/\d+ placed/);
  });
});

describe("MotifBlockRack — type scale (typography pass)", () => {
  it("renders no arbitrary text-[Npx] font-size class across every card body", () => {
    const { container } = render(<MotifBlockRack {...baseProps} />);
    unfold("route");
    unfold("everyN");
    unfold("density");
    expect(screen.getAllByTestId("motif-block").length).toBe(fullChain.length);
    expect(container.innerHTML).not.toMatch(/text-\[\d+px\]/);
  });

  it("block-card names ride text-xs and route-scope pills ride the 2xs floor", () => {
    render(<MotifBlockRack {...baseProps} />);
    const routeCard = cardOf("route");
    expect(within(routeCard).getByText("Route").className).toContain("text-xs");
    unfold("route");
    expect(screen.getByTestId("motif-route-scope-all").className).toContain("text-2xs");
    // Slot micro-labels (Sequencer is always expanded).
    const angleLabel = screen.getByText("Angle rnd").closest("label");
    expect(angleLabel.className).toContain("text-2xs");
    expect(angleLabel.className).not.toMatch(/text-\[\d+px\]/);
  });
});
