// @vitest-environment jsdom
//
// useFootprintReveal — the shared footprint-reveal state (issue #188, PRD #184;
// spec of record `docs/motif-hold-and-pitch-decisions.md`, decisions 18 + 19).
//
// The rule set under test, stated as behaviour rather than structure:
//   • `pointerenter` raises the reveal — inspecting costs no commitment
//   • drag start raises it too, and DRAG START BEATS POINTERLEAVE: a leave that
//     arrives mid-drag must not release, because a DragNumber's vertical drag
//     walks the cursor far outside the field it started in
//   • drag commit releases, and so does a gesture that commits NOTHING
//     (`useDragValue` suppresses `onCommit` when a drag ends where it started —
//     the reveal must not survive that)
//   • unmounting mid-drag releases: a slot deleted while its field is being
//     dragged must not leave the overlay stuck over the artwork
//
// Every assertion below reads the state a gesture LEFT BEHIND, through the
// context's public `scope`. Nothing here reaches into the hook's internals.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import DragNumber from "../ui/DragNumber";
import {
  FootprintRevealProvider,
  useFootprintReveal,
  useFootprintRevealTrigger,
} from "./footprintRevealContext";

const SOURCE = resolve(process.cwd(), "src/components/shell/footprintRevealContext.js");

// Pointer helpers, copied from DragNumber.test.jsx so a gesture here means
// exactly what it means there. Screen Y grows downward: dragging UP is a
// DECREASING clientY, and every `y` is an absolute position, not a delta.
const down = (el, y = 0) =>
  fireEvent.pointerDown(el, { clientY: y, pointerId: 1, button: 0 });
const move = (el, y) => fireEvent.pointerMove(el, { clientY: y, pointerId: 1 });
const up = (el, y = 0) => fireEvent.pointerUp(el, { clientY: y, pointerId: 1 });

// Scopes are PLAIN OBJECTS the hook never interprets — these literals are the
// convention #189/#192 should follow, written out here rather than built by a
// constructor the hook exports, so nothing about scope shape lives in the hook.
const SCOPE_A = { kind: "slot", layerId: "L1", seqIndex: 0, zoneId: null, slotIndex: 2 };
const SCOPE_B = { kind: "layer", layerId: "L1" };

/** Reads the shared state. Renders the live scope as text, `none` when clear. */
function Readout({ testId = "scope" }) {
  const { scope } = useFootprintReveal();
  return <div data-testid={testId}>{scope ? JSON.stringify(scope) : "none"}</div>;
}

/** One control bound to the reveal: pointer props on the row, the drag seam on
 *  the DragNumber. This is the call shape a consumer (#187, #189, #192) has. */
function Trigger({ scope, testId, onChange, onCommit, value = 50 }) {
  const fp = useFootprintRevealTrigger(scope, { onChange, onCommit });
  return (
    <div {...fp.pointerProps} data-testid={`${testId}-row`}>
      <DragNumber
        value={value}
        min={0}
        max={100}
        step={1}
        label={testId}
        testId={testId}
        onChange={fp.onChange}
        onCommit={fp.onCommit}
      />
    </div>
  );
}

/** The LAYER SIZE shape (#192): a bare `<input type="number">` with NO drag
 *  lifecycle at all. `pointerProps` on the row it sits in, `focusProps` on the
 *  field — and its own `onChange` left strictly alone, because routing a
 *  keystroke through `fp.onChange` would latch `dragging` on a gesture that
 *  never emits a `pointerup` and strand the reveal forever. */
function FieldTrigger({ scope, testId, onChange }) {
  const fp = useFootprintRevealTrigger(scope);
  return (
    <label {...fp.pointerProps} data-testid={`${testId}-row`}>
      <input
        type="number"
        data-testid={testId}
        aria-label={testId}
        defaultValue={18}
        onChange={onChange}
        {...fp.focusProps}
      />
    </label>
  );
}

/** A DRAG control that also takes focus — the case where `blur` and a running
 *  gesture collide (a pointerdown on a field moves focus). */
function DragFocusTrigger({ scope, testId, onCommit }) {
  const fp = useFootprintRevealTrigger(scope, { onCommit });
  return (
    <div {...fp.pointerProps} {...fp.focusProps} data-testid={`${testId}-row`}>
      <DragNumber
        value={50}
        min={0}
        max={100}
        step={1}
        label={testId}
        testId={testId}
        onChange={fp.onChange}
        onCommit={fp.onCommit}
      />
    </div>
  );
}

function setup({ showA = true, showB = false, onChange, onCommit } = {}) {
  const ui = (props) => (
    <FootprintRevealProvider>
      <Readout />
      {props.showA && (
        <Trigger scope={SCOPE_A} testId="a" onChange={onChange} onCommit={onCommit} />
      )}
      {props.showB && <Trigger scope={SCOPE_B} testId="b" />}
    </FootprintRevealProvider>
  );
  const view = render(ui({ showA, showB }));
  return {
    ...view,
    show: (next) => view.rerender(ui({ showA, showB, ...next })),
    scope: () => screen.getByTestId("scope").textContent,
    row: (id) => screen.getByTestId(`${id}-row`),
    dn: (id) => screen.getByTestId(id),
  };
}

describe("useFootprintReveal — hover raises, leave releases", () => {
  it("starts with nothing revealed", () => {
    const t = setup();
    expect(t.scope()).toBe("none");
  });

  it("raises the reveal on pointerenter, carrying the trigger's scope", () => {
    const t = setup();
    fireEvent.pointerEnter(t.row("a"));
    expect(t.scope()).toBe(JSON.stringify(SCOPE_A));
  });

  it("releases on pointerleave when no drag is running", () => {
    const t = setup();
    fireEvent.pointerEnter(t.row("a"));
    fireEvent.pointerLeave(t.row("a"));
    expect(t.scope()).toBe("none");
  });

  it("hands the reveal over when the pointer moves from one control to another", () => {
    const t = setup({ showB: true });
    fireEvent.pointerEnter(t.row("a"));
    // Native dispatch order: leave always precedes the next enter.
    fireEvent.pointerLeave(t.row("a"));
    fireEvent.pointerEnter(t.row("b"));
    expect(t.scope()).toBe(JSON.stringify(SCOPE_B));
  });

  it("a pointerleave from a control that never revealed does not clear another's reveal", () => {
    const t = setup({ showB: true });
    fireEvent.pointerEnter(t.row("b"));
    fireEvent.pointerLeave(t.row("a"));
    expect(t.scope()).toBe(JSON.stringify(SCOPE_B));
  });
});

describe("useFootprintReveal — drag start beats pointerleave", () => {
  it("raises the reveal on drag start with no pointerenter at all", () => {
    const t = setup();
    const dn = t.dn("a");
    down(dn, 100);
    move(dn, 80); // past MOVE_THRESHOLD and across the grid ⇒ first onChange
    expect(t.scope()).toBe(JSON.stringify(SCOPE_A));
  });

  it("KEEPS the reveal when the cursor leaves the field mid-drag", () => {
    const t = setup();
    const dn = t.dn("a");
    fireEvent.pointerEnter(t.row("a"));
    down(dn, 100);
    move(dn, 80);
    fireEvent.pointerLeave(t.row("a")); // the drag walked the cursor off the row
    expect(t.scope()).toBe(JSON.stringify(SCOPE_A));
    move(dn, 40); // …and it keeps working out there
    expect(t.scope()).toBe(JSON.stringify(SCOPE_A));
  });

  it("releases on commit, even though the cursor never left the field", () => {
    const onCommit = vi.fn();
    const t = setup({ onCommit });
    const dn = t.dn("a");
    fireEvent.pointerEnter(t.row("a"));
    down(dn, 100);
    move(dn, 80);
    up(dn, 80);
    expect(onCommit).toHaveBeenCalledTimes(1); // the consumer's seam still fires
    expect(t.scope()).toBe("none");
  });

  it("releases after a leave-then-commit, the whole point of the rule", () => {
    const t = setup();
    const dn = t.dn("a");
    down(dn, 100);
    move(dn, 80);
    fireEvent.pointerLeave(t.row("a"));
    up(dn, 80);
    expect(t.scope()).toBe("none");
  });
});

describe("useFootprintReveal — the ways a gesture can end", () => {
  // useDragValue suppresses onCommit when a drag ends exactly where it started.
  // A reveal cleared only by onCommit would be STUCK ON here.
  it("releases when a drag returns to its starting value and commits nothing", () => {
    const onCommit = vi.fn();
    const t = setup({ onCommit });
    const dn = t.dn("a");
    down(dn, 100);
    move(dn, 80); // up 20px ⇒ value moved
    expect(t.scope()).toBe(JSON.stringify(SCOPE_A));
    move(dn, 100); // …and back to exactly where it started
    up(dn, 100);
    expect(onCommit).not.toHaveBeenCalled();
    expect(t.scope()).toBe("none");
  });

  it("releases when the gesture is cancelled rather than lifted", () => {
    const t = setup();
    const dn = t.dn("a");
    down(dn, 100);
    move(dn, 80);
    fireEvent.pointerCancel(dn, { pointerId: 1 });
    expect(t.scope()).toBe("none");
  });

  it("releases when the control unmounts mid-drag", () => {
    const t = setup();
    const dn = t.dn("a");
    down(dn, 100);
    move(dn, 80);
    expect(t.scope()).toBe(JSON.stringify(SCOPE_A));
    t.show({ showA: false }); // the slot is deleted under the drag
    expect(t.scope()).toBe("none");
  });

  it("releases when the control unmounts while merely hovered", () => {
    const t = setup();
    fireEvent.pointerEnter(t.row("a"));
    t.show({ showA: false });
    expect(t.scope()).toBe("none");
  });

  it("leaves no window listener behind that could clear a LATER reveal", () => {
    // An arrow key runs onChange→onCommit with no pointer involved. If the
    // commit path forgot to detach the gesture's pointerup guard, the user's
    // next unrelated click would release somebody else's reveal.
    const t = setup({ showB: true });
    fireEvent.keyDown(t.dn("a"), { key: "ArrowUp" });
    fireEvent.pointerEnter(t.row("b"));
    expect(t.scope()).toBe(JSON.stringify(SCOPE_B));
    fireEvent.pointerUp(window, { pointerId: 9 });
    expect(t.scope()).toBe(JSON.stringify(SCOPE_B));
  });

  it("keeps the reveal while the type-in editor is open, and releases when it commits", () => {
    const t = setup();
    fireEvent.pointerEnter(t.row("a"));
    const dn = t.dn("a");
    down(dn, 100);
    up(dn, 100); // press without travel ⇒ the type-in editor, not a scrub
    const input = screen.getByRole("textbox");
    expect(t.scope()).toBe(JSON.stringify(SCOPE_A));
    fireEvent.change(input, { target: { value: "62" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(t.scope()).toBe("none");
  });
});

// ── FOCUS / BLUR (#192) ──────────────────────────────────────────────────
// Layer Size is a bare `<input type="number">` with no drag lifecycle — the
// DEGENERATE case of the same gesture system, not a rival one. `focus`/`blur` is
// needed regardless of hover, because a field reached by TAB never gets a
// `pointerenter` and would otherwise explain nothing to a keyboard user.
//
// The handlers live in the hook rather than at the call site so that `raised`
// stays the hook's single source of truth: a consumer calling `reveal`/`release`
// by hand desyncs that ref and the hook then believes it owns a reveal it does
// not. They are returned as their OWN key, so the `hold` caller (#187) is
// untouched by their existence.
describe("useFootprintReveal — focus and blur, for a field with no drag", () => {
  const field = (props = {}) =>
    render(
      <FootprintRevealProvider>
        <Readout />
        <FieldTrigger scope={SCOPE_B} testId="size" {...props} />
      </FootprintRevealProvider>,
    );
  const scopeText = () => screen.getByTestId("scope").textContent;

  it("raises on focus with no pointer involved at all — the TAB case", () => {
    field();
    fireEvent.focus(screen.getByTestId("size"));
    expect(scopeText()).toBe(JSON.stringify(SCOPE_B));
  });

  it("releases on blur", () => {
    field();
    fireEvent.focus(screen.getByTestId("size"));
    fireEvent.blur(screen.getByTestId("size"));
    expect(scopeText()).toBe("none");
  });

  it("raises on hover too, and a hover that never focused still releases on leave", () => {
    field();
    fireEvent.pointerEnter(screen.getByTestId("size-row"));
    expect(scopeText()).toBe(JSON.stringify(SCOPE_B));
    fireEvent.pointerLeave(screen.getByTestId("size-row"));
    expect(scopeText()).toBe("none");
  });

  it("EITHER source releases — a leave clears the reveal even while the field is still focused", () => {
    // RULED, and pinned deliberately rather than smoothed over: reveal on
    // pointerenter AND focus, release on pointerleave AND blur. So a user who
    // tabs in and then happens to sweep the cursor across the field and off it
    // loses the reveal while still typing in the field.
    //
    // The alternative — latching hover and focus separately and releasing only
    // when BOTH are false — was rejected here: it makes `end()` conditional, and
    // `end()` is also what the unmount effect and the window pointerup guard
    // call, so every condition on it is a new way to STRAND a reveal on screen.
    // Over-releasing is recoverable (re-enter the field); a stuck overlay drawn
    // over the artwork is the failure this whole module exists to prevent.
    // Reported as an open question, not silently chosen.
    field();
    fireEvent.focus(screen.getByTestId("size"));
    fireEvent.pointerEnter(screen.getByTestId("size-row"));
    fireEvent.pointerLeave(screen.getByTestId("size-row"));
    expect(scopeText()).toBe("none");
  });

  it("releases when the field unmounts while focused", () => {
    // The PROVIDER stays mounted and only the field goes away — a fresh
    // provider would read "none" no matter what the hook did.
    const ui = (show) => (
      <FootprintRevealProvider>
        <Readout />
        {show && <FieldTrigger scope={SCOPE_B} testId="size" />}
      </FootprintRevealProvider>
    );
    const view = render(ui(true));
    fireEvent.focus(screen.getByTestId("size"));
    expect(scopeText()).toBe(JSON.stringify(SCOPE_B));
    view.rerender(ui(false));
    expect(scopeText()).toBe("none");
  });

  it("does NOT arm a drag latch — typing leaves nothing that could strand the reveal", () => {
    // The trap this shape exists to avoid: routing the field's own `onChange`
    // through `fp.onChange` calls `beginDrag()`, which latches `dragging` and
    // arms a `{once:true}` window pointerup guard. A keystroke fires no
    // pointerup, so the latch never clears and `onPointerLeave` short-circuits
    // for the rest of the session — the reveal is stranded over the artwork.
    const onChange = vi.fn();
    field({ onChange });
    const input = screen.getByTestId("size");
    fireEvent.pointerEnter(screen.getByTestId("size-row"));
    fireEvent.change(input, { target: { value: "24" } });
    expect(onChange).toHaveBeenCalledTimes(1); // the field's own handler still runs
    fireEvent.pointerLeave(screen.getByTestId("size-row"));
    expect(scopeText()).toBe("none");
  });

  it("keeps the reveal when a BLUR arrives mid-drag, and releases on commit", () => {
    // Same rule as pointerleave, and necessary rather than merely symmetric: a
    // pointerdown can move focus, so a blur mid-gesture would clear `raised` and
    // leave the rest of the drag drawing nothing while the pointerup guard's
    // release became a no-op. THE GESTURE owns the reveal until it ends —
    // neither the cursor nor focus does.
    const onCommit = vi.fn();
    render(
      <FootprintRevealProvider>
        <Readout />
        <DragFocusTrigger scope={SCOPE_A} testId="d" onCommit={onCommit} />
      </FootprintRevealProvider>,
    );
    const dn = screen.getByTestId("d");
    down(dn, 100);
    move(dn, 80);
    fireEvent.blur(screen.getByTestId("d-row"));
    expect(scopeText()).toBe(JSON.stringify(SCOPE_A));
    move(dn, 40);
    expect(scopeText()).toBe(JSON.stringify(SCOPE_A));
    up(dn, 40);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(scopeText()).toBe("none");
  });
});

describe("useFootprintReveal — plumbing", () => {
  it("is a safe no-op with no provider mounted", () => {
    render(
      <>
        <Readout />
        <Trigger scope={SCOPE_A} testId="a" />
      </>,
    );
    fireEvent.pointerEnter(screen.getByTestId("a-row"));
    expect(screen.getByTestId("scope").textContent).toBe("none");
  });

  it("keeps the scope OPAQUE — any shape round-trips verbatim, including one it has never seen", () => {
    // The hook classifies nothing. A trigger PR 2 has not written yet must be
    // able to raise a scope shape this file knows nothing about.
    const unheardOf = { kind: "pitch", layerId: "L1", channel: "spacing", units: "mm" };
    const view = render(
      <FootprintRevealProvider>
        <Readout />
        <Trigger scope={unheardOf} testId="p" />
      </FootprintRevealProvider>,
    );
    fireEvent.pointerEnter(screen.getByTestId("p-row"));
    expect(screen.getByTestId("scope").textContent).toBe(JSON.stringify(unheardOf));
    view.unmount();
  });

  it("distinguishes a slot in a FLAT sequence from the same index in each ZONE", () => {
    // Zoned slotIndex is ZONE-LOCAL (sequencer.js `dealZone`), so index alone is
    // ambiguous: `zoneId` is what tells apex slot 1 from stem slot 1, and null
    // is what tells a flat sequence's slot 1 from both. The overlay reads these
    // fields off the revealed scope; the hook only carries them.
    const flat = { kind: "slot", layerId: "L1", seqIndex: 0, zoneId: null, slotIndex: 1 };
    const apex = { ...flat, zoneId: "apex" };
    const stem = { ...flat, zoneId: "stem" };
    const seen = [flat, apex, stem].map((scope) => {
      const view = render(
        <FootprintRevealProvider>
          <Readout />
          <Trigger scope={scope} testId="s" />
        </FootprintRevealProvider>,
      );
      fireEvent.pointerEnter(screen.getByTestId("s-row"));
      const text = screen.getByTestId("scope").textContent;
      view.unmount();
      return text;
    });
    expect(new Set(seen).size).toBe(3);
  });

  it("carries no CSS hover in the reveal path", () => {
    // Comments stripped: the module's prose says `:hover` a lot, explaining why
    // it cannot serve. What must not appear is a `:hover` / `hover:` in the CODE.
    const code = readFileSync(SOURCE, "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/hover:/);
    expect(code).not.toMatch(/:hover/);
    expect(code).not.toMatch(/matchMedia/);
  });
});
