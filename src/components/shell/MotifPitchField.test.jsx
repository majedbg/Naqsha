// @vitest-environment jsdom
//
// MotifPitchField — the anchor-pitch control (PRD #184, PR 2).
//
// The arithmetic is tested as arithmetic in `src/lib/motif/pitchUnits.test.js`
// and the flash timing in `src/components/ui/dragNumberFlash.test.js`. What is
// left for this file is the WIRING: that the toggle writes nothing, that the
// one rounding is reached through the real control, that the flash is raised by
// the flip, and that the graphic tells the truth about the floor and the
// sparse end.
//
// `stripWidth` is passed explicitly throughout — jsdom lays nothing out and has
// no ResizeObserver, so a measured width would be 0 and every geometric
// assertion would be vacuous. Same seam `InspectorShelf` uses.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MotifPitchField from "./MotifPitchField";
import {
  DEFAULT_SPACING,
  MAX_SPACING,
  MIN_SPACING,
  densityOf,
} from "../../lib/motif/pitchUnits";

const WIDTH = 224; // the 224px rail floor

const down = (el, y = 0) => fireEvent.pointerDown(el, { clientY: y, pointerId: 1, button: 0 });
const move = (el, y, opts = {}) =>
  fireEvent.pointerMove(el, { clientY: y, pointerId: 1, ...opts });
const up = (el, y = 0) => fireEvent.pointerUp(el, { clientY: y, pointerId: 1 });

function setup(over = {}) {
  const onChangeSpacing = vi.fn();
  const onFlushHistory = vi.fn();
  const props = {
    spacing: DEFAULT_SPACING,
    onChangeSpacing,
    onFlushHistory,
    stripWidth: WIDTH,
    ...over,
  };
  const utils = render(<MotifPitchField {...props} />);
  const rerenderWith = (next) =>
    utils.rerender(<MotifPitchField {...props} {...next} />);
  return { onChangeSpacing, onFlushHistory, rerenderWith, ...utils };
}

const numeral = () => screen.getByTestId("motif-pitch-number");
const readout = () => screen.getByTestId("motif-pitch-number-readout");
const pickUnit = (word) => fireEvent.click(screen.getByRole("radio", { name: new RegExp(`^${word}`) }));

describe("MotifPitchField — the two readings", () => {
  it("opens in SPACING, the stored and canonical unit", () => {
    // hold-doc decision 12: "one glyph every N units" is what is on disk, joins
    // the radius unit system, and is monotone in the readable direction.
    setup();
    expect(readout().textContent).toBe("24 u");
    expect(screen.getByRole("radio", { name: /^Spacing/ })).toBeChecked();
  });

  it("shows the reciprocal, formatted, in density state", () => {
    setup();
    pickUnit("Density");
    expect(readout().textContent).toBe("4.2 /100u"); // 100/24 = 4.166…
  });

  it("names the unit in the numeral's accessible label and value text", () => {
    setup();
    expect(numeral()).toHaveAttribute("aria-label", expect.stringContaining("units between anchors"));
    expect(numeral()).toHaveAttribute("aria-valuetext", "24 u");
    pickUnit("Density");
    expect(numeral()).toHaveAttribute("aria-label", expect.stringContaining("anchors per 100 units"));
    expect(numeral()).toHaveAttribute("aria-valuetext", "4.2 /100u");
  });

  it("says ANCHORS, never glyphs, and says which way the dots move", () => {
    // Decision 4 + decision 13. Rests, weighted deals, junction-skips and
    // `no-fit` all leave anchors carrying no glyph, so this must not promise
    // "distance between glyphs". The eyebrow that used to carry it does not fit
    // on row one at the rail floor (ruling D), so the caption carries it.
    setup();
    const caption = screen.getByTestId("motif-pitch-caption");
    expect(caption.textContent).toMatch(/anchor gaps/);
    expect(caption.textContent).toMatch(/widen/);
    expect(caption.textContent).not.toMatch(/glyph/i);
    pickUnit("Density");
    // Decision 7's consequence, made legible: up-drag SPREADS in spacing state
    // and CROWDS in density state. The graphic is the only surface on which
    // that reversal reads as anything but a bug.
    expect(screen.getByTestId("motif-pitch-caption").textContent).toMatch(/crowd/);
  });

  it("never puts an eyebrow label on row one", () => {
    // Jointly unsatisfiable with the 9ch numeral and the word pair at 224px:
    // eyebrow 49 + gaps 11 + numeral 88 leaves 76px against a ~101px toggle.
    setup();
    expect(screen.queryByText(/^Pitch$/)).toBeNull();
    expect(screen.queryByText(/^Anchors$/)).toBeNull();
  });
});

describe("MotifPitchField — the toggle writes nothing", () => {
  it("stores nothing at all when the unit is flipped, N times", () => {
    const { onChangeSpacing } = setup();
    for (let i = 0; i < 12; i++) {
      pickUnit(i % 2 === 0 ? "Density" : "Spacing");
    }
    // Bit-identity across N toggles is STRUCTURAL, not maintained: the toggle
    // swaps `format`/`parse` and the mark, and no write occurs at all.
    expect(onChangeSpacing).not.toHaveBeenCalled();
  });

  it("re-derives the density display from the stored spacing every render", () => {
    const { rerenderWith } = setup();
    pickUnit("Density");
    expect(readout().textContent).toBe("4.2 /100u");
    rerenderWith({ spacing: 50 });
    expect(readout().textContent).toBe("2.0 /100u");
    // …and back, with no state of its own to drift.
    rerenderWith({ spacing: DEFAULT_SPACING });
    expect(readout().textContent).toBe("4.2 /100u");
  });
});

describe("MotifPitchField — exactly one rounding, in the parent", () => {
  it("lands typed density 4.2 on spacing 24", () => {
    const { onChangeSpacing } = setup();
    pickUnit("Density");
    down(numeral(), 10);
    up(numeral(), 10); // click with no movement → type-in
    const input = screen.getByTestId("motif-pitch-number-input");
    fireEvent.change(input, { target: { value: "4.2" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // round(100 / 4.2) = round(23.809…) = 24. One rounding, here.
    expect(onChangeSpacing).toHaveBeenCalledWith(24);
  });

  it("emits INTEGER spacing from every density drag frame", () => {
    const { onChangeSpacing } = setup();
    pickUnit("Density");
    const el = numeral();
    down(el, 0);
    for (const y of [-12, -30, -55, -80]) move(el, y);
    up(el, -80);
    expect(onChangeSpacing).toHaveBeenCalled();
    for (const [v] of onChangeSpacing.mock.calls) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(MIN_SPACING);
      expect(v).toBeLessThanOrEqual(MAX_SPACING);
    }
  });

  it("parses the LEADING token, so the unit suffix is not folded into the number", () => {
    // DragNumber's DEFAULT_PARSE strips every non-numeric character and would
    // read "4.2 /100u" as 4.2100 — the exact hazard DragNumber.jsx:76-86 warns
    // about, reached by a route that does not rescale the value.
    const { onChangeSpacing } = setup();
    pickUnit("Density");
    down(numeral(), 10);
    up(numeral(), 10);
    const input = screen.getByTestId("motif-pitch-number-input");
    expect(input.value).toBe("4.2 /100u"); // the editor opens on the FORMATTED value
    fireEvent.keyDown(input, { key: "Enter" });
    // Re-committing the displayed string lands back on the SAME stored spacing.
    // DEFAULT_PARSE would read 4.2100 and slam into the floor instead — the
    // stored value would move because the user pressed Enter on what was
    // already there.
    expect(onChangeSpacing).toHaveBeenCalled();
    for (const [v] of onChangeSpacing.mock.calls) expect(v).toBe(DEFAULT_SPACING);
  });

  it("refuses a string with no leading number rather than snapping to an end", () => {
    const { onChangeSpacing } = setup();
    down(numeral(), 10);
    up(numeral(), 10);
    const input = screen.getByTestId("motif-pitch-number-input");
    fireEvent.change(input, { target: { value: "wide" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChangeSpacing).not.toHaveBeenCalled();
  });

  it("raises the number on an UP-drag in BOTH states (decision 7)", () => {
    const { onChangeSpacing, rerenderWith } = setup();
    const dragUp = () => {
      const el = numeral();
      down(el, 0);
      move(el, -60);
      up(el, -60);
    };
    dragUp();
    // Spacing state: bigger number ⇒ bigger stored spacing ⇒ dots SPREAD.
    expect(Math.max(...onChangeSpacing.mock.calls.map(([v]) => v))).toBeGreaterThan(DEFAULT_SPACING);

    onChangeSpacing.mockClear();
    rerenderWith({});
    pickUnit("Density");
    dragUp();
    // Density state: bigger number ⇒ SMALLER stored spacing ⇒ dots CROWD.
    // Same gesture, opposite effect on the artwork — knowingly accepted, and
    // the reason the caption and the graphic exist.
    expect(Math.min(...onChangeSpacing.mock.calls.map(([v]) => v))).toBeLessThan(DEFAULT_SPACING);
  });
});

describe("MotifPitchField — one undo entry per gesture", () => {
  it("flushes once before the first live frame and once on commit", () => {
    const { onFlushHistory } = setup();
    const el = numeral();
    down(el, 0);
    move(el, -20);
    move(el, -40);
    move(el, -60);
    expect(onFlushHistory).toHaveBeenCalledTimes(1); // opened, not re-opened
    up(el, -60);
    expect(onFlushHistory).toHaveBeenCalledTimes(2); // closed on commit
  });

  it("closes the window even when the gesture ends where it started", () => {
    // `useDragValue` suppresses `onCommit` there, so a latch cleared only by
    // commit would stay open and let the NEXT gesture join this entry.
    const { onFlushHistory } = setup();
    const el = numeral();
    down(el, 0);
    move(el, -40);
    move(el, 0);
    fireEvent.pointerUp(window, { pointerId: 1 });
    up(el, 0);
    expect(onFlushHistory.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("MotifPitchField — the flash announces the flip", () => {
  let animateSpy;
  beforeEach(() => {
    animateSpy = vi
      .spyOn(Element.prototype, "animate")
      .mockImplementation(() => ({ cancel: () => {} }));
  });
  afterEach(() => animateSpy.mockRestore());

  it("flashes the thumb when the unit flips", () => {
    setup();
    expect(animateSpy).not.toHaveBeenCalled(); // mount is not a change
    pickUnit("Density");
    expect(animateSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps ONE DragNumber instance across the flip, so the flash can fire", () => {
    // The reconciliation this depends on: both branches of PitchNumeral return
    // a bare <DragNumber> at the same position. Wrap either one and the
    // instance remounts, the latch re-seeds, and the glow silently stops.
    setup();
    const before = numeral();
    pickUnit("Density");
    expect(numeral()).toBe(before);
  });

  it("flashes even where the numeral is BYTE-IDENTICAL across the flip", () => {
    // spacing 10 ⇒ density 100/10 = 10.0. Same digits, different meaning. The
    // most confusing state the control can reach, so this is where the signal
    // is most warranted — never gate it on `value !== prevValue`.
    setup({ spacing: 10 });
    expect(readout().textContent).toBe("10 u");
    pickUnit("Density");
    expect(readout().textContent).toBe("10.0 /100u");
    expect(animateSpy).toHaveBeenCalledTimes(1);
  });

  it("does not flash while the user is the cause", () => {
    setup();
    const el = numeral();
    down(el, 0);
    move(el, -40);
    move(el, -80);
    up(el, -80);
    expect(animateSpy).not.toHaveBeenCalled();
  });
});

describe("MotifPitchField — the graphic", () => {
  it("is an illustration, not a control", () => {
    // Ruling B: no click, no button role, no accessible name, no live region.
    // The toggle is a real radiogroup and carries all of it natively.
    setup();
    const g = screen.getByTestId("motif-pitch-graphic");
    expect(g).toHaveAttribute("aria-hidden", "true");
    expect(g.querySelector("button")).toBeNull();
    expect(g.getAttribute("role")).toBeNull();
    expect(document.querySelector("[aria-live]")).toBeNull();
  });

  it("draws nothing rather than guessing before the strip is laid out", () => {
    setup({ stripWidth: 0 });
    expect(screen.getByTestId("motif-pitch-graphic")).toHaveAttribute("data-measured", "false");
  });

  it("switches which mark is lit, and never moves a dot on the flip", () => {
    // The stillness IS the proof that the toggle writes nothing.
    setup();
    const dotXs = () =>
      [...screen.getByTestId("motif-pitch-graphic").querySelectorAll("circle")].map(
        (c) => c.parentElement.style.transform,
      );
    const before = dotXs();
    expect(screen.getByTestId("motif-pitch-spacing-mark").style.opacity).toBe("1");
    expect(screen.getByTestId("motif-pitch-density-mark").style.opacity).toBe("0");
    pickUnit("Density");
    expect(screen.getByTestId("motif-pitch-density-mark").style.opacity).toBe("1");
    expect(screen.getByTestId("motif-pitch-spacing-mark").style.opacity).toBe("0");
    expect(dotXs()).toEqual(before);
  });

  it("carries a live numeral ON each mark", () => {
    // ⚠️ Load-bearing TWICE: decision 11 (reduced motion — the information must
    // never live in the motion) and decision 14 (above spacing ~100 the window
    // is empty and the numeral is the only thing left saying anything true).
    setup();
    const spacingMark = screen.getByTestId("motif-pitch-spacing-mark");
    expect(spacingMark).toContainElement(screen.getByTestId("motif-pitch-spacing-numeral"));
    expect(screen.getByTestId("motif-pitch-spacing-numeral").textContent).toBe("24 u");
    const densityMark = screen.getByTestId("motif-pitch-density-mark");
    expect(densityMark).toContainElement(screen.getByTestId("motif-pitch-density-numeral"));
    expect(screen.getByTestId("motif-pitch-density-numeral").textContent).toBe("4.2");
  });

  it("SHOWS the MIN_EDGE_SPACING floor rather than silently clamping", () => {
    // hold-doc §4e. A control that clamps in silence lets the number lie, which
    // is the class of hidden default that started the whole investigation.
    const { rerenderWith } = setup();
    expect(screen.getByTestId("motif-pitch-floor")).toHaveAttribute("data-at-floor", "false");
    expect(screen.getByTestId("motif-pitch-floor").textContent).toBe(`min ${MIN_SPACING}`);
    rerenderWith({ spacing: MIN_SPACING });
    expect(screen.getByTestId("motif-pitch-floor")).toHaveAttribute("data-at-floor", "true");
    expect(screen.getByTestId("motif-pitch-floor").textContent).toBe(`at min ${MIN_SPACING} u`);
    // …and says it in DENSITY state too, where the numeral would otherwise
    // simply stop at 25.0 with no explanation.
    pickUnit("Density");
    expect(screen.getByTestId("motif-pitch-density-mark").textContent).toMatch(/at min gap 4 u/);
  });

  it("announces the floor in BOTH states, not only on the aria-hidden graphic", () => {
    // The graphic carries the floor visually, but it is aria-hidden, so the
    // numeral's own label is the only channel a screen reader has. Without it
    // the control clamps in silence for exactly the user who cannot see the
    // hatched ghost dimension explaining why.
    const { rerenderWith } = setup();
    expect(numeral().getAttribute("aria-label")).not.toMatch(/minimum|min/i);
    rerenderWith({ spacing: MIN_SPACING });
    expect(numeral().getAttribute("aria-label")).toMatch(/at minimum/);
    pickUnit("Density");
    expect(readout().textContent).toBe("25.0 /100u"); // the number has stopped…
    expect(numeral().getAttribute("aria-label")).toMatch(/at maximum/); // …and says why
    expect(numeral().getAttribute("aria-label")).toMatch(/minimum gap/);
  });

  it("keeps the dots still under reduced motion, and the reading with them", () => {
    // Decision 11, both halves: the dots JUMP with no tween, and the live
    // numeral sits ON the mark — so the information never lives in the motion.
    // Not a disabled graphic.
    const realMatchMedia = window.matchMedia;
    window.matchMedia = (q) => ({
      matches: true,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
    try {
      setup();
      const g = screen.getByTestId("motif-pitch-graphic");
      expect(g).toHaveAttribute("data-reduced-motion", "true");
      const dotGroups = [...g.querySelectorAll("circle")].map((c) => c.parentElement);
      expect(dotGroups.length).toBeGreaterThan(0);
      for (const el of dotGroups) expect(el.style.transition).toBe("none");
      // The marks stop cross-fading too, and the numerals are still there.
      expect(screen.getByTestId("motif-pitch-spacing-mark").style.transition).toBe("none");
      expect(screen.getByTestId("motif-pitch-spacing-numeral").textContent).toBe("24 u");
      expect(screen.getByTestId("motif-pitch-density-numeral").textContent).toBe("4.2");
    } finally {
      window.matchMedia = realMatchMedia;
    }
  });

  it("keeps the window literally 100 units at the sparse end, and empties it", () => {
    // Decision 14, accepted with no mitigation: the honest answer above spacing
    // ~100 genuinely IS "fewer than one per 100 units", and the numeral on the
    // mark reads "0.20 / in 100 u" over empty ground — a true sentence.
    setup({ spacing: MAX_SPACING });
    pickUnit("Density");
    expect(screen.getByTestId("motif-pitch-density-numeral").textContent).toBe("0.20");
    expect(densityOf(MAX_SPACING)).toBeCloseTo(0.195, 3);
  });

  it("truncates the dimension line with a caret rather than rescaling", () => {
    // §7c. The badge is gone but its rule survives: the drawing never changes
    // scale to make a value fit. It says "this gap continues past here" in the
    // notation a drawing already uses for it.
    setup({ spacing: MAX_SPACING });
    expect(screen.getByTestId("motif-pitch-spacing-numeral").textContent).toBe("512 u");
    const carets = [
      screen.queryByTestId("motif-pitch-caret-left"),
      screen.queryByTestId("motif-pitch-caret-right"),
    ].filter(Boolean);
    expect(carets.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps drawing a dimension line right across the range", () => {
    // Without the force-included centre pair it would stop over the top third.
    const { rerenderWith } = setup();
    for (const spacing of [MIN_SPACING, 24, 100, 144, 256, MAX_SPACING]) {
      rerenderWith({ spacing });
      expect(screen.getByTestId("motif-pitch-spacing-numeral").textContent).toBe(`${spacing} u`);
    }
  });

  it("uses design tokens only — no hex colour literals anywhere it draws", () => {
    setup();
    const g = screen.getByTestId("motif-pitch-graphic");
    for (const el of g.querySelectorAll("[fill], [stroke]")) {
      for (const attr of ["fill", "stroke"]) {
        const v = el.getAttribute(attr);
        if (v && v !== "none" && !v.startsWith("url(")) expect(v).toMatch(/^var\(--/);
      }
    }
  });
});

describe("MotifPitchField — inert on a semantic host", () => {
  it("is disabled WITH A REASON rather than hidden", () => {
    // hold-doc §6: `edgeOpts` reaches edge hosts only. Semantic extractors are
    // count-based and own their own density, so the control cannot reach them.
    // A control that vanishes teaches nothing about why.
    const { onChangeSpacing } = setup({ disabled: true });
    expect(numeral()).toHaveAttribute("aria-disabled", "true");
    expect(numeral()).toHaveAttribute("tabindex", "-1");
    expect(numeral().getAttribute("title")).toMatch(/count-based/);
    expect(screen.getByTestId("motif-pitch-inert")).toBeInTheDocument();
    // Still visible, still showing its value.
    expect(readout().textContent).toBe("24 u");
    const el = numeral();
    down(el, 0);
    move(el, -60);
    up(el, -60);
    fireEvent.keyDown(el, { key: "ArrowUp" });
    expect(onChangeSpacing).not.toHaveBeenCalled();
  });

  it("still lets the unit be read the other way round", () => {
    // The toggle writes nothing, so nothing about it is unsafe here — and being
    // able to read the inert value in either unit is strictly more informative.
    setup({ disabled: true });
    pickUnit("Density");
    expect(readout().textContent).toBe("4.2 /100u");
  });
});
