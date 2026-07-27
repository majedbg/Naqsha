// @vitest-environment jsdom
//
// AngleDial — the commit seam added in #139.
//
// The dial has always emitted `onChange` on every pointer-move. Wired straight
// to a document edit that floods the undo stack: one entry per pixel of drag.
// Charting decision 6 for the per-glyph popover is "exactly one undo entry per
// gesture", so the dial gains an `onCommit` of the same shape DragNumber uses —
// live `onChange` for preview, one `onCommit` on pointer-up for the entry.
//
// Also covered: under `wrap` the dial ignores min/max entirely (resolveDrag
// returns a raw 0–360 with no clamp), so ARIA must announce the range the
// control actually honours rather than the one the caller asked for.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AngleDial from "./AngleDial";

// The dial maps pointer position through getBoundingClientRect, which jsdom
// reports as all-zero. Give it a real 104px box centred at (52, 52) so a
// position maps to a bearing the way it does in a browser.
function mockDialBox() {
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 104, height: 104, right: 104, bottom: 104, x: 0, y: 0 };
  };
}
const realRect = Element.prototype.getBoundingClientRect;

// Bearings are clockwise from 12 o'clock, so due EAST of centre is 90°.
const EAST = { clientX: 104, clientY: 52 };
const SOUTH = { clientX: 52, clientY: 104 };

const wrapProps = { label: "Bearing", min: 0, max: 360, step: 1, wrap: true };

beforeEach(mockDialBox);
afterEach(() => {
  Element.prototype.getBoundingClientRect = realRect;
});

const dial = () => screen.getByRole("slider");

describe("AngleDial — onCommit fires once per gesture", () => {
  it("emits onChange on every move but onCommit exactly once, on pointer-up", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<AngleDial {...wrapProps} value={0} onChange={onChange} onCommit={onCommit} />);
    const el = dial();

    fireEvent.pointerDown(el, { ...EAST, pointerId: 1 });
    fireEvent.pointerMove(el, { ...SOUTH, pointerId: 1 });
    fireEvent.pointerMove(el, { ...EAST, pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onChange.mock.calls.length).toBeGreaterThan(1);

    fireEvent.pointerUp(el, { ...EAST, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(90); // due east
  });

  it("commits the LAST emitted value, not the pointer-down value", () => {
    const onCommit = vi.fn();
    render(<AngleDial {...wrapProps} value={0} onChange={() => {}} onCommit={onCommit} />);
    const el = dial();
    fireEvent.pointerDown(el, { ...EAST, pointerId: 1 });
    fireEvent.pointerMove(el, { ...SOUTH, pointerId: 1 });
    fireEvent.pointerUp(el, { ...SOUTH, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith(180);
  });

  it("commits nothing when the gesture lands back where it started", () => {
    const onCommit = vi.fn();
    // Pointer-down due east on a dial already reading 90 changes nothing.
    render(<AngleDial {...wrapProps} value={90} onChange={() => {}} onCommit={onCommit} />);
    const el = dial();
    fireEvent.pointerDown(el, { ...EAST, pointerId: 1 });
    fireEvent.pointerUp(el, { ...EAST, pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("a second gesture commits again — the seam does not latch", () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <AngleDial {...wrapProps} value={0} onChange={() => {}} onCommit={onCommit} />,
    );
    fireEvent.pointerDown(dial(), { ...EAST, pointerId: 1 });
    fireEvent.pointerUp(dial(), { ...EAST, pointerId: 1 });
    rerender(<AngleDial {...wrapProps} value={90} onChange={() => {}} onCommit={onCommit} />);
    fireEvent.pointerDown(dial(), { ...SOUTH, pointerId: 1 });
    fireEvent.pointerUp(dial(), { ...SOUTH, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenLastCalledWith(180);
  });

  it("a key press is its own gesture: one onChange and one onCommit", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<AngleDial {...wrapProps} value={10} onChange={onChange} onCommit={onCommit} />);
    fireEvent.keyDown(dial(), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(11);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(11);
  });

  it("Home commits too", () => {
    const onCommit = vi.fn();
    render(<AngleDial {...wrapProps} value={10} onChange={() => {}} onCommit={onCommit} />);
    fireEvent.keyDown(dial(), { key: "Home" });
    expect(onCommit).toHaveBeenCalledWith(0);
  });

  it("a key press that cannot move the value commits nothing", () => {
    const onCommit = vi.fn();
    render(<AngleDial {...wrapProps} value={0} onChange={() => {}} onCommit={onCommit} />);
    fireEvent.keyDown(dial(), { key: "Home" }); // already at 0
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("stays usable for callers that pass no onCommit at all (existing consumers)", () => {
    const onChange = vi.fn();
    render(<AngleDial {...wrapProps} value={0} onChange={onChange} />);
    const el = dial();
    expect(() => {
      fireEvent.pointerDown(el, { ...EAST, pointerId: 1 });
      fireEvent.pointerUp(el, { ...EAST, pointerId: 1 });
      fireEvent.keyDown(el, { key: "ArrowRight" });
    }).not.toThrow();
    expect(onChange).toHaveBeenCalled();
  });
});

describe("AngleDial — wrap mode announces the range it actually honours", () => {
  let warn;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("reports 0–360 in ARIA when wrapping, whatever bounds were passed", () => {
    render(
      <AngleDial
        label="Odd bounds"
        value={10}
        min={100}
        max={170}
        step={1}
        wrap
        onChange={() => {}}
      />,
    );
    expect(dial()).toHaveAttribute("aria-valuemin", "0");
    expect(dial()).toHaveAttribute("aria-valuemax", "360");
  });

  it("warns once when a wrapping dial is given bounds it will ignore", () => {
    render(
      <AngleDial
        label="Odd bounds warn"
        value={10}
        min={100}
        max={170}
        step={1}
        wrap
        onChange={() => {}}
      />,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("Odd bounds warn");
  });

  it("stays silent — and reports the caller's bounds — when NOT wrapping", () => {
    render(
      <AngleDial
        label="Divergence"
        value={137.5}
        min={100}
        max={170}
        step={0.01}
        onChange={() => {}}
      />,
    );
    expect(warn).not.toHaveBeenCalled();
    expect(dial()).toHaveAttribute("aria-valuemin", "100");
    expect(dial()).toHaveAttribute("aria-valuemax", "170");
  });

  it("stays silent for the live wrap callers, which all pass 0/360", () => {
    render(<AngleDial {...wrapProps} label="Start Angle" value={0} onChange={() => {}} />);
    expect(warn).not.toHaveBeenCalled();
  });
});
