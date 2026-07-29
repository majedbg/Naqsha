// @vitest-environment jsdom
// MotifBlockRack — compact one-line Block rows (Variant D) + type-scale sweep.
//
// Route / Every N / Density collapse to a ~one-line row (grip · unfold-chevron ·
// name · inline summary control · anchor chip · power); the chevron unfolds the
// EXISTING detail editors beneath. Skip / Field stay as full cards; the Sequencer
// stays expanded (it is the payload) and shows an "N placed" chip. The per-block
// anchor chips read from sieveCounts when the rack is given resolved host anchors.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";
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

// ── Branch order (T4) ───────────────────────────────────────────────────────
describe("MotifBlockRack — Branch order card", () => {
  const orderChain = [{ type: "order", min: 2, max: null }];
  const orderProps = { ...baseProps, chain: orderChain };

  it("renders as a full card (no chevron) with both bounds; blank max = Any", () => {
    render(<MotifBlockRack {...orderProps} />);
    const card = cardOf("order");
    expect(within(card).queryByTestId("motif-block-disclosure")).toBeNull();
    expect(within(card).getByTestId("motif-block-order-min")).toHaveValue(2);
    const max = within(card).getByTestId("motif-block-order-max");
    expect(max).toHaveValue(null); // unbounded above renders blank…
    expect(max).toHaveAttribute("placeholder", "Any"); // …and says so
  });

  it("is offered in the add-block menu", () => {
    render(<MotifBlockRack {...orderProps} />);
    const menu = screen.getByTestId("motif-block-add");
    expect(
      within(menu)
        .getAllByRole("option")
        .map((o) => o.value)
    ).toContain("order");
  });

  it("editing a bound writes through the SAME editChain seam as every other block", () => {
    const onEditChain = vi.fn();
    render(<MotifBlockRack {...orderProps} onEditChain={onEditChain} />);
    fireEvent.change(within(cardOf("order")).getByTestId("motif-block-order-max"), {
      target: { value: "3" },
    });
    const next = onEditChain.mock.calls[0][0](orderChain);
    expect(next[0]).toEqual({ type: "order", min: 2, max: 3 });
  });

  it("clearing the max writes null (unbounded), never 0", () => {
    const onEditChain = vi.fn();
    render(
      <MotifBlockRack
        {...baseProps}
        chain={[{ type: "order", min: 2, max: 4 }]}
        onEditChain={onEditChain}
      />
    );
    fireEvent.change(within(cardOf("order")).getByTestId("motif-block-order-max"), {
      target: { value: "" },
    });
    const next = onEditChain.mock.calls[0][0]([{ type: "order", min: 2, max: 4 }]);
    expect(next[0].max).toBeNull();
  });

  it("CANNOT author an inverted band — raising min carries max with it", () => {
    const chain = [{ type: "order", min: 1, max: 2 }];
    const onEditChain = vi.fn();
    render(<MotifBlockRack {...baseProps} chain={chain} onEditChain={onEditChain} />);
    fireEvent.change(within(cardOf("order")).getByTestId("motif-block-order-min"), {
      target: { value: "5" },
    });
    expect(onEditChain.mock.calls[0][0](chain)[0]).toEqual({ type: "order", min: 5, max: 5 });
  });

  it("…and lowering the max pulls min down with it", () => {
    const chain = [{ type: "order", min: 3, max: 4 }];
    const onEditChain = vi.fn();
    render(<MotifBlockRack {...baseProps} chain={chain} onEditChain={onEditChain} />);
    fireEvent.change(within(cardOf("order")).getByTestId("motif-block-order-max"), {
      target: { value: "1" },
    });
    expect(onEditChain.mock.calls[0][0](chain)[0]).toEqual({ type: "order", min: 1, max: 1 });
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

  // #154 (amendment A2). The render intersects a stored Route's roles with what
  // the host actually emits, so the chip has to count the SAME chain the canvas
  // runs — otherwise the card reads "→ 0" beside a canvas full of glyphs, which
  // is the D2 divergence in its third surface.
  it("counts the COERCED chain: a dead role on spiral reads its live fallback, not 0", () => {
    // Spiral emits crossings/edges/tips and never a cell, so a stored ['cell']
    // Route survives nothing — and the render falls back to spiral's default
    // role, `edge`. The fixture's 4 edge anchors are what the canvas would place.
    render(
      <MotifBlockRack
        {...baseProps}
        chain={[{ type: "route", roles: ["cell"], pathScope: "all" }]}
        hostPatternType="spiral"
        anchors={anchors12()}
      />
    );
    const chip = within(cardOf("route")).getByTestId("motif-block-anchor-chip");
    expect(chip).toHaveTextContent("12");
    expect(chip).toHaveTextContent("4");
    expect(chip.className).not.toContain("text-tone-mild"); // not a dead block
  });

  it("a LIVE role on a semantic host is counted verbatim — coercion is a no-op there", () => {
    render(
      <MotifBlockRack
        {...baseProps}
        chain={[{ type: "route", roles: ["crossing"], pathScope: "all" }]}
        hostPatternType="grid"
        anchors={anchors12()}
      />
    );
    const chip = within(cardOf("route")).getByTestId("motif-block-anchor-chip");
    expect(chip).toHaveTextContent("8");
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
    // Slot card (Sequencer is always expanded). The "Angle rnd" micro-label it
    // used to pin became an icon toggle in the 2026-07-28 rework, so the floor
    // is now pinned on the chip WHOLE — readouts on the scale, no raw px size
    // anywhere in it.
    const chip = screen.getAllByTestId("motif-slot")[0];
    expect(
      within(chip).getByTestId("motif-slot-scale-readout").className
    ).toMatch(/text-(2)?xs/);
    expect(chip.innerHTML).not.toMatch(/text-\[\d+px\]/);
  });
});

// ── #187: the slot card's `hold` row ─────────────────────────────────────────
//
// The ROW ITSELF is deliberately not asserted (PRD #184 excludes it — dedicated
// presentation assertions would encode detail expected to move; it is verified
// by eye at review). What IS pinned here is the storage contract, which is not
// presentation and would regress silently: absent `hold` means absent, so a
// value of 0 must be written as `undefined`. Writing a literal 0 would grow a
// no-op key on every document a gesture merely passes through 0, and looks
// identical on screen.
describe("MotifBlockRack — `hold` writes absence, not a literal 0", () => {
  const holdChain = [
    {
      type: "sequence",
      mode: "cycle",
      slots: [{ glyphRef: "leaf", hold: 0.5 }],
    },
  ];

  // The patch this gesture pushed through the chain seam, applied to holdChain.
  const slotAfter = (onEditChain) => {
    const mutate = onEditChain.mock.calls.at(-1)[0];
    return mutate(holdChain).find((b) => b.type === "sequence").slots[0];
  };

  it("commits a nonzero hold as the float, and 0 as `undefined`", () => {
    const onEditChain = vi.fn();
    render(<MotifBlockRack {...baseProps} chain={holdChain} onEditChain={onEditChain} />);
    const row = screen.getByTestId("motif-slot-hold");

    // Down one step from 0.5 — the field writes at all, on the 0…1 float scale.
    fireEvent.keyDown(row, { key: "ArrowDown" });
    expect(slotAfter(onEditChain).hold).toBeCloseTo(0.49, 5);

    // Home snaps to min (0). That must clear the key, not store a zero.
    onEditChain.mockClear();
    fireEvent.keyDown(row, { key: "Home" });
    expect(slotAfter(onEditChain).hold).toBeUndefined();
  });

  // `sizingMode` travels six hops from the Inspector call site (rack → block
  // card → body → sequence body → strip → chip, plus a zone section on the way
  // when the sequence is zoned). What is pinned is the CONSEQUENCE — the row
  // refuses to write — not its appearance, and a silent break anywhere on that
  // chain would leave a live control claiming to do something it cannot.
  it("is inert in `fixed` sizing, and stays on the card rather than vanishing", () => {
    const onEditChain = vi.fn();
    render(
      <MotifBlockRack
        {...baseProps}
        chain={holdChain}
        sizingMode="fixed"
        onEditChain={onEditChain}
      />
    );
    const row = screen.getByTestId("motif-slot-hold"); // present, not hidden
    fireEvent.keyDown(row, { key: "Home" });
    fireEvent.keyDown(row, { key: "ArrowDown" });
    expect(onEditChain).not.toHaveBeenCalled();
    // Scale, which `fixed` mode does NOT make inert, is untouched by this.
    fireEvent.keyDown(screen.getByTestId("motif-slot-scale"), { key: "ArrowDown" });
    expect(onEditChain).toHaveBeenCalled();
  });

  it("reaches a ZONED sequence too — the zone section is an extra hop", () => {
    const onEditChain = vi.fn();
    const zoned = [
      {
        type: "sequence",
        zones: [{ zone: "apex", mode: "cycle", slots: [{ glyphRef: "leaf" }] }],
      },
    ];
    render(
      <MotifBlockRack {...baseProps} chain={zoned} sizingMode="fixed" onEditChain={onEditChain} />
    );
    fireEvent.keyDown(screen.getByTestId("motif-slot-hold"), { key: "End" });
    expect(onEditChain).not.toHaveBeenCalled();
  });
});

// ── Wave 3 (#79): zoned Sequencer sections (Apex / Stem) ──────────────────────
describe("MotifBlockRack — zoned Sequencer sections", () => {
  // A chain-form motif whose terminal sequence is ZONED (apex + stem), seqIndex=1.
  const zonedChain = [
    { type: "route", roles: ["crossing"], pathScope: "all" },
    {
      type: "sequence",
      zones: [
        { zone: "apex", mode: "cycle", ends: "both", slots: [{ glyphRef: "flower" }] },
        { zone: "stem", mode: "cycle", slots: [{ glyphRef: "leaf" }, { rest: true }] },
      ],
    },
  ];
  const seqOf = (chain) => chain.find((b) => b.type === "sequence");
  const zoneOf = (chain, id) => seqOf(chain).zones.find((z) => z.zone === id);
  const zoneSection = (id) =>
    screen.getAllByTestId("motif-zone").find((s) => s.getAttribute("data-zone") === id);

  it("renders one SECTION per zone with Apex/Stem headers + info tooltips", () => {
    render(<MotifBlockRack {...baseProps} chain={zonedChain} />);
    const sections = screen.getAllByTestId("motif-zone");
    expect(sections.map((s) => s.getAttribute("data-zone"))).toEqual(["apex", "stem"]);
    expect(within(zoneSection("apex")).getByText("Apex")).toBeInTheDocument();
    expect(within(zoneSection("stem")).getByText("Stem")).toBeInTheDocument();
    // ⓘ affordance carries the maker-facing zone explanation.
    expect(within(zoneSection("apex")).getByTestId("motif-zone-info")).toHaveAttribute(
      "title",
      expect.stringContaining("A closed loop has no Apex")
    );
    expect(within(zoneSection("stem")).getByTestId("motif-zone-info")).toHaveAttribute(
      "title",
      expect.stringContaining("where leaves sprout")
    );
    // Two isolated slot strips — one per zone — so a drag never crosses a zone.
    expect(screen.getAllByTestId("motif-slot-strip")).toHaveLength(2);
  });

  it("the Apex end-selector renders VECTOR arrows (Apex only) and writes ends via editChain", () => {
    const onEditChain = vi.fn();
    render(<MotifBlockRack {...baseProps} chain={zonedChain} onEditChain={onEditChain} />);
    const ends = within(zoneSection("apex")).getByTestId("motif-zone-ends");
    // Three states, each an inline SVG arrow (never a text arrow glyph).
    for (const label of ["Both ends", "Upper end", "Lower end"]) {
      const btn = within(ends).getByLabelText(label);
      expect(btn.querySelector("svg path")).not.toBeNull();
    }
    expect(ends.textContent).not.toMatch(/[↕↑↓]/);
    // Default 'both' is the lit state.
    expect(within(ends).getByLabelText("Both ends")).toHaveAttribute("aria-pressed", "true");
    // Stem has NO end-selector.
    expect(within(zoneSection("stem")).queryByTestId("motif-zone-ends")).toBeNull();
    // Choosing 'up' writes ends through setZoneEnds on the Apex zone.
    fireEvent.click(within(ends).getByLabelText("Upper end"));
    const next = onEditChain.mock.calls[0][0](zonedChain);
    expect(zoneOf(next, "apex").ends).toBe("up");
    expect(zoneOf(next, "stem")).toBe(zoneOf(zonedChain, "stem")); // Stem untouched (identity)
  });

  it("the per-zone deal toggle writes zone.mode via setZoneMode (isolated to that zone)", () => {
    const onEditChain = vi.fn();
    render(<MotifBlockRack {...baseProps} chain={zonedChain} onEditChain={onEditChain} />);
    fireEvent.click(within(zoneSection("stem")).getByTestId("motif-zone-mode-random"));
    const next = onEditChain.mock.calls[0][0](zonedChain);
    expect(zoneOf(next, "stem").mode).toBe("random");
    expect(zoneOf(next, "apex").mode).toBe("cycle"); // Apex untouched
  });

  it("per-zone + Glyph adds a base-glyph slot to THAT zone via addZoneSlot", () => {
    const onEditChain = vi.fn();
    render(<MotifBlockRack {...baseProps} chain={zonedChain} onEditChain={onEditChain} />);
    fireEvent.click(within(zoneSection("stem")).getByTestId("motif-slot-add"));
    const next = onEditChain.mock.calls[0][0](zonedChain);
    expect(zoneOf(next, "stem").slots).toHaveLength(3);
    expect(zoneOf(next, "stem").slots[2]).toEqual({ glyphRef: "leaf" }); // baseGlyphRef
    expect(zoneOf(next, "apex").slots).toHaveLength(1); // Apex untouched
  });

  it("removing a zone slot is zone-addressed and isolated (Apex survivors untouched)", () => {
    const onEditChain = vi.fn();
    render(<MotifBlockRack {...baseProps} chain={zonedChain} onEditChain={onEditChain} />);
    const stemChips = within(zoneSection("stem")).getAllByTestId("motif-slot");
    // Delete moved into the "…" menu in the 2026-07-28 slot-card rework.
    fireEvent.click(within(stemChips[0]).getByTestId("motif-slot-menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete slot" })); // drop leaf
    const next = onEditChain.mock.calls[0][0](zonedChain);
    expect(zoneOf(next, "stem").slots).toEqual([{ rest: true }]);
    expect(zoneOf(next, "apex").slots).toEqual([{ glyphRef: "flower" }]);
  });

  it("FLAT sequences keep the flat slot row (no zone sections)", () => {
    render(<MotifBlockRack {...baseProps} />); // fullChain — flat sequence
    expect(screen.queryAllByTestId("motif-zone")).toHaveLength(0);
    expect(within(cardOf("sequence")).getByTestId("motif-seq-mode")).toBeInTheDocument();
  });
});

// ── #150 (PRD #143): the Cell Zone is VISIBLE AND CONFIGURABLE ────────────────
// A Zone only ever arrives from a chip factory — there is no addZone anywhere in
// the codebase, for ANY Zone — so "visible and configurable, not an implicit
// partition" means exactly what it means for Apex and Stem: the rack renders it
// with its own title, its own explanation, its own deal toggle and its own Slot
// strip, and every edit is zone-addressed by id.
describe("MotifBlockRack — the Cell Zone", () => {
  const threeZoneChain = [
    { type: "route", roles: ["crossing", "edge", "tip", "cell"], pathScope: "all" },
    {
      type: "sequence",
      zones: [
        { zone: "apex", mode: "cycle", ends: "both", slots: [{ glyphRef: "rosette" }] },
        { zone: "stem", mode: "cycle", slots: [{ glyphRef: "leaf" }] },
        { zone: "cell", mode: "cycle", slots: [{ glyphRef: "rosette" }] },
      ],
    },
  ];
  const cellOnlyChain = [
    { type: "route", roles: ["cell"], pathScope: "all" },
    { type: "sequence", zones: threeZoneChain[1].zones },
  ];
  const seqOf = (chain) => chain.find((b) => b.type === "sequence");
  const zoneOf = (chain, id) => seqOf(chain).zones.find((z) => z.zone === id);
  const sectionIds = () =>
    screen.getAllByTestId("motif-zone").map((s) => s.getAttribute("data-zone"));
  const zoneSection = (id) =>
    screen.getAllByTestId("motif-zone").find((s) => s.getAttribute("data-zone") === id);

  it("renders APPENDED — Apex, Stem, then Cell — with the Cell title and tooltip", () => {
    render(<MotifBlockRack {...baseProps} chain={threeZoneChain} hostPatternType="truchet" />);
    expect(sectionIds()).toEqual(["apex", "stem", "cell"]);
    expect(within(zoneSection("cell")).getByText("Cell")).toBeInTheDocument();
    expect(within(zoneSection("cell")).getByTestId("motif-zone-info")).toHaveAttribute(
      "title",
      "The enclosed areas of the pattern — each tile, circle or face takes a glyph of its own. " +
        "Some patterns are all cells and no path."
    );
    // Never the raw zone id, and never an empty tooltip.
    expect(within(zoneSection("cell")).queryByText("cell")).toBeNull();
  });

  it("gives Cell its own deal toggle and Slot strip, and NO end-selector", () => {
    render(<MotifBlockRack {...baseProps} chain={threeZoneChain} hostPatternType="truchet" />);
    const cell = zoneSection("cell");
    expect(within(cell).getByTestId("motif-zone-mode")).toBeInTheDocument();
    expect(within(cell).getByTestId("motif-slot-strip")).toBeInTheDocument();
    // A region has no upper or lower end — the selector stays Apex-only.
    expect(within(cell).queryByTestId("motif-zone-ends")).toBeNull();
    expect(within(zoneSection("apex")).getByTestId("motif-zone-ends")).toBeInTheDocument();
  });

  it("edits inside Cell are zone-addressed and leave Apex and Stem untouched", () => {
    const onEditChain = vi.fn();
    render(
      <MotifBlockRack
        {...baseProps}
        chain={threeZoneChain}
        hostPatternType="truchet"
        onEditChain={onEditChain}
      />
    );
    fireEvent.click(within(zoneSection("cell")).getByTestId("motif-zone-mode-random"));
    const afterMode = onEditChain.mock.calls[0][0](threeZoneChain);
    expect(zoneOf(afterMode, "cell").mode).toBe("random");
    expect(zoneOf(afterMode, "apex")).toBe(zoneOf(threeZoneChain, "apex"));
    expect(zoneOf(afterMode, "stem")).toBe(zoneOf(threeZoneChain, "stem"));

    fireEvent.click(within(zoneSection("cell")).getByTestId("motif-slot-add-rest"));
    const afterSlot = onEditChain.mock.calls[1][0](threeZoneChain);
    expect(zoneOf(afterSlot, "cell").slots).toEqual([{ glyphRef: "rosette" }, { rest: true }]);
    expect(zoneOf(afterSlot, "stem").slots).toEqual([{ glyphRef: "leaf" }]);
  });

  // Decision (#150): only Zones that can actually RECEIVE an anchor are shown.
  // The role→Zone reading rule comes from zones.js `zonesForRoles`, fed by the one
  // host→roles capability seam — never a conditional grown here.
  it("a CELL-ONLY host shows Cell alone — no Apex or Stem that can never fill", () => {
    render(
      <MotifBlockRack {...baseProps} chain={cellOnlyChain} hostPatternType="circlepacking" />
    );
    expect(sectionIds()).toEqual(["cell"]);
  });

  it("an EDGE host shows Apex and Stem and no Cell", () => {
    render(<MotifBlockRack {...baseProps} chain={threeZoneChain} hostPatternType="flowfield" />);
    expect(sectionIds()).toEqual(["apex", "stem"]);
  });

  it("a MIXED host (Truchet) shows all three — tiles fill while arcs run", () => {
    render(
      <MotifBlockRack
        {...baseProps}
        chain={threeZoneChain}
        hostPatternType="truchet"
        hostParams={{ tiles: 6, tileSet: "arcs" }}
      />
    );
    expect(sectionIds()).toEqual(["apex", "stem", "cell"]);
  });

  it("hiding a Zone is a VIEW, never a write — the chain still carries all three", () => {
    const onEditChain = vi.fn();
    render(
      <MotifBlockRack
        {...baseProps}
        chain={cellOnlyChain}
        hostPatternType="circlepacking"
        onEditChain={onEditChain}
      />
    );
    expect(onEditChain).not.toHaveBeenCalled();
    expect(seqOf(cellOnlyChain).zones.map((z) => z.zone)).toEqual(["apex", "stem", "cell"]);
  });

  it("a caller naming NO host still renders every Zone the chain carries", () => {
    render(<MotifBlockRack {...baseProps} chain={threeZoneChain} />);
    expect(sectionIds()).toEqual(["apex", "stem", "cell"]);
  });

  // BOUNDARY PARAMS, not defaults. The Zone list is params-aware because
  // `rolesForHost` is, and both of these hosts change their answer on a param.
  it("a SINGLE-AXIS grid shows Apex and Stem and no Cell (it routes through edge capture)", () => {
    render(
      <MotifBlockRack
        {...baseProps}
        chain={threeZoneChain}
        hostPatternType="grid"
        hostParams={{ drawVertical: 1, drawHorizontal: 0 }}
      />
    );
    expect(sectionIds()).toEqual(["apex", "stem"]);
    // …and a TWO-axis grid, the same host, shows all three.
    cleanup();
    render(
      <MotifBlockRack
        {...baseProps}
        chain={threeZoneChain}
        hostPatternType="grid"
        hostParams={{ drawVertical: 1, drawHorizontal: 1 }}
      />
    );
    expect(sectionIds()).toEqual(["apex", "stem", "cell"]);
  });

  it("an UNAVAILABLE host shows no Zone at all — a blank plate can fill nothing", () => {
    // Chladni at equal mode numbers draws literally nothing, so it emits no
    // roles, so no Zone can receive an anchor. This matches what the Route card
    // already does with its role checkboxes on the same host (#145/#146) — the
    // rack does not invent a second answer.
    render(
      <MotifBlockRack
        {...baseProps}
        chain={threeZoneChain}
        hostPatternType="chladni"
        hostParams={{ m: 3, n: 3 }}
      />
    );
    expect(screen.queryAllByTestId("motif-zone")).toHaveLength(0);
    // The same host with unequal modes is an ordinary edge host again.
    cleanup();
    render(
      <MotifBlockRack
        {...baseProps}
        chain={threeZoneChain}
        hostPatternType="chladni"
        hostParams={{ m: 4, n: 3 }}
      />
    );
    expect(sectionIds()).toEqual(["apex", "stem"]);
  });
});

// ── Wave 3 (#79): slot glyph-swap picker (Feature B) ──────────────────────────
describe("MotifBlockRack — slot glyph-swap picker", () => {
  // fullChain's terminal sequence sits at index 5; slot 0 is a 'leaf' glyph.
  const SEQ_INDEX = 5;
  const seqPreview = (i = 0) =>
    within(cardOf("sequence")).getAllByTestId("motif-slot-edit")[i];

  it("clicking a slot preview opens the PICKER, not the pen editor", () => {
    const onEditSlotGlyph = vi.fn();
    render(<MotifBlockRack {...baseProps} onEditSlotGlyph={onEditSlotGlyph} />);
    fireEvent.click(seqPreview(0));
    expect(onEditSlotGlyph).not.toHaveBeenCalled();
    expect(screen.getByTestId("glyph-picker-flyout")).toBeInTheDocument();
  });

  it("tile #1 is the slot's CURRENT glyph (ring) wearing a pencil badge → editor", () => {
    const onEditSlotGlyph = vi.fn();
    render(<MotifBlockRack {...baseProps} onEditSlotGlyph={onEditSlotGlyph} />);
    fireEvent.click(seqPreview(0));
    const current = screen.getByTestId("motif-slot-current");
    expect(current.className).toContain("ring-accent"); // marked current
    fireEvent.click(within(current).getByTestId("motif-slot-edit-pen"));
    expect(onEditSlotGlyph).toHaveBeenCalledWith(SEQ_INDEX, 0, "leaf");
  });

  it("picking another tile swaps via onSwapSlotGlyph with the FLAT address + payload", () => {
    const onSwapSlotGlyph = vi.fn();
    render(<MotifBlockRack {...baseProps} onSwapSlotGlyph={onSwapSlotGlyph} />);
    fireEvent.click(seqPreview(0));
    // 'leaf' is the current tile (excluded from the grid) — pick a different builtin.
    fireEvent.click(screen.getByTestId("glyph-option-diamond"));
    expect(onSwapSlotGlyph).toHaveBeenCalledTimes(1);
    const [address, payload] = onSwapSlotGlyph.mock.calls[0];
    expect(address).toEqual({ seqIndex: SEQ_INDEX, slotIndex: 0 });
    expect(payload).toMatchObject({ kind: "builtin", glyphId: "diamond" });
  });

  it("the slot's current glyph never appears as a recents chip (no same-value swap)", () => {
    // Seed recents with the slot's OWN glyph ('leaf') — it must not surface as a
    // recents button, or clicking it would fire a phantom same-value swap.
    localStorage.setItem("sonoform-recent-glyphs", JSON.stringify(["leaf", "diamond"]));
    const onSwapSlotGlyph = vi.fn();
    render(<MotifBlockRack {...baseProps} onSwapSlotGlyph={onSwapSlotGlyph} />);
    fireEvent.click(seqPreview(0)); // current glyph is 'leaf'
    // 'leaf' is pinned as tile #1, not offered as a recents chip.
    expect(screen.queryByRole("button", { name: "Leaf" })).toBeNull();
    localStorage.clear();
  });

  it("zoned slots carry the ZONE in both the swap address and the editor callback", () => {
    const onSwapSlotGlyph = vi.fn();
    const onEditSlotGlyph = vi.fn();
    const zonedChain = [
      { type: "route", roles: ["crossing"], pathScope: "all" },
      {
        type: "sequence",
        zones: [
          { zone: "apex", mode: "cycle", ends: "both", slots: [{ glyphRef: "flower" }] },
          { zone: "stem", mode: "cycle", slots: [{ glyphRef: "leaf" }] },
        ],
      },
    ];
    render(
      <MotifBlockRack
        {...baseProps}
        chain={zonedChain}
        onSwapSlotGlyph={onSwapSlotGlyph}
        onEditSlotGlyph={onEditSlotGlyph}
      />
    );
    const stem = screen
      .getAllByTestId("motif-zone")
      .find((s) => s.getAttribute("data-zone") === "stem");
    fireEvent.click(within(stem).getByTestId("motif-slot-edit"));
    // Swap → zoned address.
    fireEvent.click(screen.getByTestId("glyph-option-diamond"));
    expect(onSwapSlotGlyph).toHaveBeenCalledWith(
      { seqIndex: 1, zone: "stem", slotIndex: 0 },
      expect.objectContaining({ kind: "builtin", glyphId: "diamond" })
    );
    // Editor → zone passed as the 4th arg.
    fireEvent.click(within(stem).getByTestId("motif-slot-edit"));
    fireEvent.click(screen.getByTestId("motif-slot-edit-pen"));
    expect(onEditSlotGlyph).toHaveBeenCalledWith(1, 0, "leaf", "stem");
  });
});

// ── Route role availability (#146 creates the seam, #144 adds three hosts) ───
// The Route block offers only the roles the HOST actually emits, and it learns
// that from the ONE params-aware capability seam (lib/motif/hostRoles.js) — never
// from a conditional in this component. Asserted from the outside: which role
// checkboxes are rendered.
describe("MotifBlockRack — Route offers only the roles the host emits", () => {
  const rolesOffered = () => {
    unfold("route");
    return ["crossing", "edge", "tip", "cell"].filter(
      (k) => within(cardOf("route")).queryByTestId(`motif-block-role-${k}`) != null
    );
  };

  it("offers Cells and NO OTHER ROLE on Circle Packing", () => {
    render(<MotifBlockRack {...baseProps} hostPatternType="circlepacking" hostParams={{}} />);
    expect(rolesOffered()).toEqual(["cell"]);
  });

  it("offers all four roles on a two-axis grid", () => {
    render(
      <MotifBlockRack
        {...baseProps}
        hostPatternType="grid"
        hostParams={{ drawVertical: 1, drawHorizontal: 1 }}
      />
    );
    expect(rolesOffered()).toEqual(["crossing", "edge", "tip", "cell"]);
  });

  it("is params-aware — a single-axis grid offers Edges alone", () => {
    render(
      <MotifBlockRack
        {...baseProps}
        hostPatternType="grid"
        hostParams={{ drawVertical: 1, drawHorizontal: 0 }}
      />
    );
    expect(rolesOffered()).toEqual(["edge"]);
  });

  it("a host type + params narrow the offer — and OVERRIDE a stale hostIsSemantic (#144)", () => {
    // The discriminating case: a caller says the host is semantic, but the host
    // is a COLUMNS-ONLY grid, which routes through edge capture and emits only
    // `edge`. The seam is params-aware and says edges; a component-local
    // `hostIsSemantic ? all four : edges` conditional would offer all four.
    render(
      <MotifBlockRack
        {...baseProps}
        hostIsSemantic
        hostPatternType="grid"
        hostParams={{ drawHorizontal: 0 }}
      />
    );
    expect(rolesOffered()).toEqual(["edge"]);
  });

  it("offers Edges alone on a native edge host", () => {
    render(<MotifBlockRack {...baseProps} hostPatternType="flowfield" hostParams={{}} />);
    expect(rolesOffered()).toEqual(["edge"]);
  });

  // ── #154 criterion 5, asserted at the OFFER surface ────────────────────────
  // The criterion is worded about what the Route card offers, so it is checked
  // here as well as at the seam: a tessellation has no free termini and an open
  // arm encloses no region, and both options were pickable — and dead — until now.
  it("Voronoi no longer offers Tips (#154)", () => {
    render(<MotifBlockRack {...baseProps} hostPatternType="voronoi" hostParams={{}} />);
    expect(rolesOffered()).toEqual(["crossing", "edge", "cell"]);
  });

  it("Spiral no longer offers Cells (#154)", () => {
    render(<MotifBlockRack {...baseProps} hostPatternType="spiral" hostParams={{}} />);
    expect(rolesOffered()).toEqual(["crossing", "edge", "tip"]);
  });

  it("each #144 capture host offers Edges alone", () => {
    for (const type of ["radialetch", "hilbert", "lissajous"]) {
      const { unmount } = render(
        <MotifBlockRack {...baseProps} hostIsSemantic hostPatternType={type} hostParams={{}} />
      );
      expect(rolesOffered(), `wrong roles offered on "${type}"`).toEqual(["edge"]);
      unmount();
    }
  });

  it("offers Edges on a live Chladni and NOTHING on a blank plate (#145 composition)", () => {
    // The seam folds availability in: an unavailable host emits no geometry, so
    // Route offers no roles. The maker is not left picking a role that silently
    // places nothing — the Inspector's notice (hostCapability's `reason`) says
    // why the plate is blank.
    const { unmount } = render(
      <MotifBlockRack {...baseProps} hostPatternType="chladni" hostParams={{ m: 4, n: 3 }} />
    );
    expect(rolesOffered()).toEqual(["edge"]);
    unmount();
    render(
      <MotifBlockRack {...baseProps} hostPatternType="chladni" hostParams={{ m: 4, n: 4 }} />
    );
    expect(rolesOffered()).toEqual([]);
  });

  it("a caller that names no host keeps the pre-#146 semantic/edge split", () => {
    const { unmount } = render(<MotifBlockRack {...baseProps} />);
    expect(rolesOffered()).toEqual(["crossing", "edge", "tip", "cell"]);
    unmount();
    // …and the FALSE half of that legacy boolean (#144).
    render(<MotifBlockRack {...baseProps} hostIsSemantic={false} />);
    expect(rolesOffered()).toEqual(["edge"]);
  });
});
