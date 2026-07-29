// @vitest-environment jsdom
//
// DragNumber — the shared draggable numeral primitive (issue #138, spec of
// record = the #135 prototype resolution).
//
// The control is an INVISIBLE VERTICAL SLIDER: pointer position maps to value
// (never rate/velocity). Two mappings:
//   linear    — constant px per step (default; integer counts, ranges that
//               contain or cross 0)
//   geometric — value × 2^(dy / 100px); ×2 up and ÷2 down are the same travel
//
// Clamping is EDGE RE-ANCHOR (slip): the raw value is pinned inside the range
// on every move, so reversing direction at an end responds on the very next
// pixel — no dead zone. Under `geometric` the raw floors at max(min, step/4)
// so a range whose min is 0 can't absorb the value (0 × anything = 0).
//
// The seam: `onChange` fires live (every grid crossing during a drag, every
// arrow key, the typed value) and `onCommit` fires ONCE per gesture — pointer
// up, Enter, or blur — so a consumer creates exactly one undo entry per
// gesture. A gesture that ends where it started commits nothing.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import DragNumber from "./DragNumber";

// Source path for the token guard below. Resolved off the vitest root rather
// than `import.meta.url` — under the jsdom environment that is not a file: URL.
const SOURCE = resolve(process.cwd(), "src/components/ui/DragNumber.jsx");

const base = {
  value: 50,
  min: 0,
  max: 100,
  step: 1,
  label: "Density",
};

// Pointer helpers. Screen Y grows downward, so DRAGGING UP means a DECREASING
// clientY — every `y` below is an absolute pointer position, not a delta.
const down = (el, y = 0) =>
  fireEvent.pointerDown(el, { clientY: y, pointerId: 1, button: 0 });
const move = (el, y, opts = {}) =>
  fireEvent.pointerMove(el, { clientY: y, pointerId: 1, ...opts });
const up = (el, y = 0) => fireEvent.pointerUp(el, { clientY: y, pointerId: 1 });

const lastArg = (fn) => fn.mock.calls.at(-1)?.[0];

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe("DragNumber — display + a11y", () => {
  it("is a slider with value/min/max, the label as accessible name, and the formatted readout as aria-valuetext", () => {
    render(<DragNumber {...base} value={1.3} min={0.25} max={4} step={0.01} format={(v) => `${Math.round(v * 100)}%`} />);
    const s = screen.getByRole("slider", { name: "Density" });
    expect(s).toHaveAttribute("aria-valuenow", "1.3");
    expect(s).toHaveAttribute("aria-valuemin", "0.25");
    expect(s).toHaveAttribute("aria-valuemax", "4");
    expect(s).toHaveAttribute("aria-valuetext", "130%");
    expect(s).toHaveTextContent("130%");
  });

  it("renders the readout with the tabular-figure `num` class", () => {
    render(<DragNumber {...base} testId="dn" />);
    expect(screen.getByTestId("dn-readout").className).toContain("num");
  });

  it("gives the row a 24px hit area, an ns-resize cursor and a violet focus ring", () => {
    render(<DragNumber {...base} testId="dn" />);
    const s = screen.getByTestId("dn");
    expect(s).toHaveStyle({ height: "24px" });
    expect(s).toHaveStyle({ touchAction: "none" });
    expect(s.className).toContain("cursor-ns-resize");
    expect(s.className).toContain("focus-visible:ring-violet");
  });

  it("uses design tokens only — no hex colour literals in the source", () => {
    const src = readFileSync(SOURCE, "utf8");
    // Comments stripped first — issue references like "#138" are hex-shaped.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
    expect(code.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(src).toContain("var(--ink)");
    expect(src).toContain("var(--saffron)");
  });
});

describe("DragNumber — the whole control is the drag surface", () => {
  it("a drag started on the READOUT (not just the thumb) scrubs the value", () => {
    const onChange = vi.fn();
    render(<DragNumber {...base} onChange={onChange} testId="dn" />);
    const readout = screen.getByTestId("dn-readout");
    down(readout, 0);
    move(readout, -80); // 80px up
    expect(onChange).toHaveBeenCalled();
    expect(lastArg(onChange)).toBeGreaterThan(50);
    up(readout, -80);
  });

  it("a drag started on the THUMB scrubs the value too", () => {
    const onChange = vi.fn();
    render(<DragNumber {...base} onChange={onChange} testId="dn" />);
    const thumb = screen.getByTestId("dn-thumb");
    down(thumb, 0);
    move(thumb, -80);
    expect(lastArg(onChange)).toBeGreaterThan(50);
  });
});

describe("DragNumber — linear mapping", () => {
  it("maps a constant number of pixels per step (8px default), upward", () => {
    const onChange = vi.fn();
    render(<DragNumber {...base} value={10} onChange={onChange} />);
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, -80); // 80px up ÷ 8px-per-step = +10 steps
    expect(lastArg(onChange)).toBe(20);
  });

  it("maps downward travel to a decrease", () => {
    const onChange = vi.fn();
    render(<DragNumber {...base} value={10} onChange={onChange} />);
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, 40); // 40px down = −5 steps
    expect(lastArg(onChange)).toBe(5);
  });

  it("honours an explicit pxPerStep", () => {
    const onChange = vi.fn();
    render(<DragNumber {...base} value={10} pxPerStep={2} onChange={onChange} />);
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, -20); // 20px ÷ 2 = +10
    expect(lastArg(onChange)).toBe(20);
  });

  it("emits only values on the step grid", () => {
    const onChange = vi.fn();
    render(<DragNumber {...base} value={50} step={5} onChange={onChange} />);
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, -37); // 37px × (5 / 8) = +23.125 → raw 73.125 → grid 75
    expect(lastArg(onChange)).toBe(75);
    for (const [v] of onChange.mock.calls) expect(v % 5).toBe(0);
  });
});

describe("DragNumber — geometric mapping (100px per doubling)", () => {
  const geo = { value: 1, min: 0.25, max: 4, step: 0.01, label: "Scale", mapping: "geometric" };

  it("doubles the value over 100px up and halves it over 100px down", () => {
    const onChange = vi.fn();
    render(<DragNumber {...geo} onChange={onChange} />);
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, -100);
    expect(lastArg(onChange)).toBe(2);
    move(s, 0); // back to the grab point
    expect(lastArg(onChange)).toBe(1);
    move(s, 100);
    expect(lastArg(onChange)).toBe(0.5);
  });

  it("×2 up and ÷2 down are the same travel from any starting value", () => {
    const onChange = vi.fn();
    render(<DragNumber {...geo} value={0.5} onChange={onChange} />);
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, -100);
    expect(lastArg(onChange)).toBe(1);
    move(s, -200);
    expect(lastArg(onChange)).toBe(2);
  });

  it("honours an explicit pxPerDoubling", () => {
    const onChange = vi.fn();
    render(<DragNumber {...geo} pxPerDoubling={50} onChange={onChange} />);
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, -50);
    expect(lastArg(onChange)).toBe(2);
  });

  it("floors the multiplicative raw at max(min, step/4) so a 0-min range can recover", () => {
    // 0 × anything = 0: without the floor, bottoming out would trap the value
    // at zero for the rest of the gesture. The emitted value may legitimately
    // snap to 0 at the bottom — what must hold is that reversing brings it back.
    const onChange = vi.fn();
    render(<DragNumber {...geo} min={0} value={1} onChange={onChange} />);
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, 2000); // 20 halvings — bottomed out
    expect(lastArg(onChange)).toBe(0);
    move(s, 1900); // reverse 100px: floor 0.0025 × 2 = 0.005 → grid 0.01
    expect(lastArg(onChange)).toBeGreaterThan(0);
  });
});

describe("DragNumber — edge re-anchor (slip, no dead zone)", () => {
  it("reversing after pinning at max responds on the next pixel", () => {
    const onChange = vi.fn();
    render(<DragNumber {...base} value={100} onChange={onChange} />);
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, -200); // far past max — raw pins at 100, nothing to emit
    move(s, -192); // 8px back down = exactly one step
    expect(lastArg(onChange)).toBe(99);
  });

  it("reversing after pinning at min responds on the next pixel", () => {
    const onChange = vi.fn();
    render(<DragNumber {...base} value={0} onChange={onChange} />);
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, 200); // far past min
    move(s, 192); // 8px back up
    expect(lastArg(onChange)).toBe(1);
  });

  it("re-anchors at the top of a geometric range too", () => {
    const onChange = vi.fn();
    render(
      <DragNumber value={1} min={0.25} max={4} step={0.01} label="Scale" mapping="geometric" onChange={onChange} />
    );
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, -1000); // way past max — raw pins at 4
    move(s, -900); // reverse one doubling → 2
    expect(lastArg(onChange)).toBe(2);
  });
});

describe("DragNumber — one commit per gesture", () => {
  it("streams onChange during the drag and fires onCommit once, on pointer up", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<DragNumber {...base} onChange={onChange} onCommit={onCommit} />);
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, -8);
    move(s, -16);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onCommit).not.toHaveBeenCalled();
    up(s, -16);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(52);
  });

  it("a drag that ends where it started commits nothing", () => {
    const onCommit = vi.fn();
    render(<DragNumber {...base} onCommit={onCommit} />);
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, -80);
    move(s, 0);
    up(s, 0);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("a keyboard step is its own gesture — one onChange and one onCommit", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<DragNumber {...base} onChange={onChange} onCommit={onCommit} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(51);
  });

  it("a typed entry commits once", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<DragNumber {...base} onChange={onChange} onCommit={onCommit} testId="dn" />);
    const s = screen.getByTestId("dn");
    down(s, 10);
    up(s, 10); // no movement → type-in
    const input = screen.getByTestId("dn-input");
    fireEvent.change(input, { target: { value: "77" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(77);
  });
});

describe("DragNumber — modifier gains apply to travel, never to the grid", () => {
  it("Shift doubles the drag travel", () => {
    const onChange = vi.fn();
    render(<DragNumber {...base} value={10} onChange={onChange} />);
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, -80, { shiftKey: true }); // 80px × 2 ÷ 8 = +20
    expect(lastArg(onChange)).toBe(30);
  });

  it("Option/Alt tenths the drag travel", () => {
    const onChange = vi.fn();
    render(<DragNumber {...base} value={10} onChange={onChange} />);
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, -80, { altKey: true }); // 80px × 0.1 ÷ 8 = +1
    expect(lastArg(onChange)).toBe(11);
  });

  it("modifiers never move the value off the step grid", () => {
    const onChange = vi.fn();
    render(<DragNumber {...base} value={50} step={5} onChange={onChange} />);
    const s = screen.getByRole("slider");
    down(s, 0);
    move(s, -13, { altKey: true });
    move(s, -57, { shiftKey: true });
    for (const [v] of onChange.mock.calls) expect(v % 5).toBe(0);
  });
});

describe("DragNumber — keyboard", () => {
  it("Arrow Up/Right step up, Down/Left step down", () => {
    const onCommit = vi.fn();
    render(<DragNumber {...base} onCommit={onCommit} />);
    const s = screen.getByRole("slider");
    fireEvent.keyDown(s, { key: "ArrowUp" });
    expect(lastArg(onCommit)).toBe(51);
    fireEvent.keyDown(s, { key: "ArrowRight" });
    expect(lastArg(onCommit)).toBe(51);
    fireEvent.keyDown(s, { key: "ArrowDown" });
    expect(lastArg(onCommit)).toBe(49);
    fireEvent.keyDown(s, { key: "ArrowLeft" });
    expect(lastArg(onCommit)).toBe(49);
  });

  it("Shift + Arrow moves two steps", () => {
    const onCommit = vi.fn();
    render(<DragNumber {...base} onCommit={onCommit} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowUp", shiftKey: true });
    expect(lastArg(onCommit)).toBe(52);
  });

  it("Option + Arrow floors at ONE grid step — never sub-grid", () => {
    // The fine gain is ×0.1 of travel on the pointer; on the keyboard 0.1 of a
    // step would round straight back to the current value and read as dead.
    const onCommit = vi.fn();
    render(<DragNumber value={1.3} min={0.25} max={4} step={0.01} label="Scale" onCommit={onCommit} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowUp", altKey: true });
    expect(lastArg(onCommit)).toBe(1.31);
  });

  it("Home and End jump to min and max", () => {
    const onCommit = vi.fn();
    render(<DragNumber {...base} onCommit={onCommit} />);
    const s = screen.getByRole("slider");
    fireEvent.keyDown(s, { key: "Home" });
    expect(lastArg(onCommit)).toBe(0);
    fireEvent.keyDown(s, { key: "End" });
    expect(lastArg(onCommit)).toBe(100);
  });

  it("a keypress that cannot change the value commits nothing", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<DragNumber {...base} value={100} onChange={onChange} onCommit={onCommit} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowUp" });
    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("Enter opens the type-in", () => {
    render(<DragNumber {...base} testId="dn" />);
    fireEvent.keyDown(screen.getByTestId("dn"), { key: "Enter" });
    expect(screen.getByTestId("dn-input")).toBeInTheDocument();
  });
});

describe("DragNumber — type-in", () => {
  it("a click with no movement opens the type-in seeded with the formatted value", () => {
    render(<DragNumber {...base} value={1.3} min={0.25} max={4} step={0.01} format={(v) => `${Math.round(v * 100)}%`} testId="dn" />);
    const s = screen.getByTestId("dn");
    down(s, 10);
    up(s, 10);
    expect(screen.getByTestId("dn-input")).toHaveValue("130%");
  });

  it("blur commits the draft", () => {
    const onCommit = vi.fn();
    render(<DragNumber {...base} onCommit={onCommit} testId="dn" />);
    fireEvent.keyDown(screen.getByTestId("dn"), { key: "Enter" });
    const input = screen.getByTestId("dn-input");
    fireEvent.change(input, { target: { value: "33" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(33);
  });

  it("Escape cancels without committing — and the trailing blur stays a no-op", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<DragNumber {...base} onChange={onChange} onCommit={onCommit} testId="dn" />);
    fireEvent.keyDown(screen.getByTestId("dn"), { key: "Enter" });
    const input = screen.getByTestId("dn-input");
    fireEvent.change(input, { target: { value: "33" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input); // browsers fire this as the input unmounts
    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("a typed value out of range is clamped and snapped", () => {
    const onCommit = vi.fn();
    render(<DragNumber {...base} step={5} onCommit={onCommit} testId="dn" />);
    fireEvent.keyDown(screen.getByTestId("dn"), { key: "Enter" });
    const input = screen.getByTestId("dn-input");
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(100);
  });

  it("nonsense typing commits nothing", () => {
    const onCommit = vi.fn();
    render(<DragNumber {...base} onCommit={onCommit} testId="dn" />);
    fireEvent.keyDown(screen.getByTestId("dn"), { key: "Enter" });
    const input = screen.getByTestId("dn-input");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("format and parse round-trip the scale consumer's percent-on-a-1%-grid readout", () => {
    // The paired contract: a non-default `format` needs a matching `parse`.
    const onCommit = vi.fn();
    const format = (v) => `${Math.round(v * 100)}%`;
    const parse = (s) => parseFloat(s) / 100;
    render(
      <DragNumber
        value={1.3}
        min={0.25}
        max={4}
        step={0.01}
        label="Scale"
        format={format}
        parse={parse}
        onCommit={onCommit}
        testId="dn"
      />
    );
    fireEvent.keyDown(screen.getByTestId("dn"), { key: "Enter" });
    const input = screen.getByTestId("dn-input");
    expect(input).toHaveValue("130%"); // format(1.3)
    fireEvent.change(input, { target: { value: "71" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(0.71); // parse → value space
    // 71% and 72% are distinct on the 1% grid.
    expect(format(0.71)).not.toBe(format(0.72));
  });
});

describe("DragNumber — motion", () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = realMatchMedia;
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it("animates the thumb with the 240ms quint motion tokens", () => {
    mockMatchMedia(false);
    render(<DragNumber {...base} testId="dn" />);
    const g = screen.getByTestId("dn-thumb").querySelector("[data-thumb-group]");
    expect(g.style.transition).toContain("transform");
    expect(g.style.transition).toContain("var(--motion-medium)");
    expect(g.style.transition).toContain("var(--ease-out-quint)");
  });

  it("under prefers-reduced-motion the thumb crossfades instead of rotating", () => {
    mockMatchMedia(true);
    render(<DragNumber {...base} testId="dn" />);
    const root = screen.getByTestId("dn");
    expect(root).toHaveAttribute("data-reduced-motion", "true");
    const g = screen.getByTestId("dn-thumb").querySelector("[data-thumb-group]");
    expect(g.style.transition).toContain("opacity");
    expect(g.style.transition).not.toContain("transform");
  });
});

// ---------------------------------------------------------------------------
// #139 additions: the readout slot, and the format/parse pairing warning.

const PCT = (v) => `${Math.round(v * 100)}%`;
const UNPCT = (s) => parseFloat(s) / 100;

describe("DragNumber — slotWidth", () => {
  it("reserves a fixed, LEFT-anchored readout slot so a digit-count change cannot move the thumb", () => {
    // 7% and 100% differ in digit count; with no slot the row resizes and the
    // whole control slides sideways as the value crosses 10% and 100%.
    const { rerender } = render(
      <DragNumber {...base} testId="dn" slotWidth="4ch" format={PCT} parse={UNPCT} />,
    );
    const readout = screen.getByTestId("dn-readout");
    expect(readout.style.width).toBe("4ch");
    expect(readout.className).toContain("text-left");
    expect(readout.className).toContain("shrink-0");

    rerender(
      <DragNumber
        {...base}
        testId="dn"
        value={7}
        slotWidth="4ch"
        format={PCT}
        parse={UNPCT}
      />,
    );
    // The slot is unchanged by the value — that is the whole point.
    expect(screen.getByTestId("dn-readout").style.width).toBe("4ch");
  });

  it("omitting slotWidth leaves the readout intrinsically sized (no regression)", () => {
    render(<DragNumber {...base} testId="dn" />);
    const readout = screen.getByTestId("dn-readout");
    expect(readout.style.width).toBe("");
    expect(readout.className).not.toContain("text-left");
  });
});

describe("DragNumber — format/parse are a paired contract", () => {
  let warn;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it("warns in DEV when a custom format arrives without a parse", () => {
    render(<DragNumber {...base} label="Unpaired scale" format={PCT} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("Unpaired scale");
    expect(warn.mock.calls[0][0]).toContain("parse");
  });

  it("warns only ONCE per label, however many times it renders", () => {
    const { rerender } = render(<DragNumber {...base} label="Noisy" format={PCT} />);
    rerender(<DragNumber {...base} label="Noisy" value={51} format={PCT} />);
    rerender(<DragNumber {...base} label="Noisy" value={52} format={PCT} />);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("stays silent when format and parse are supplied together", () => {
    render(<DragNumber {...base} label="Paired scale" format={PCT} parse={UNPCT} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("stays silent for the default format", () => {
    render(<DragNumber {...base} label="Plain default" />);
    expect(warn).not.toHaveBeenCalled();
  });
});

// The `disabled` prop (#187). Its consumer is a control that is honestly INERT
// under some upstream mode — the slot card's `hold` row in `fixed` sizing — and
// the point is that it stays VISIBLE and keeps showing its value while refusing
// every route to a write. A control that disappeared when it stopped applying
// would teach nothing about the mode it disappeared under.
describe("DragNumber — disabled", () => {
  it("refuses the drag, the keyboard and click-to-type, but still reads its value", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<DragNumber {...base} disabled onChange={onChange} onCommit={onCommit} />);
    const el = screen.getByTestId("drag-number");

    // Drag: a full scrub emits nothing.
    down(el, 100);
    move(el, 60);
    up(el, 60);

    // Keyboard: every route, including the ones that jump to an end.
    fireEvent.keyDown(el, { key: "ArrowUp" });
    fireEvent.keyDown(el, { key: "End" });
    fireEvent.keyDown(el, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    // Enter must not have opened the type-in either.
    expect(screen.queryByTestId("drag-number-input")).toBeNull();
    // Still legible, still announced, and out of the tab order.
    expect(screen.getByTestId("drag-number-readout").textContent).toBe("50");
    expect(el.getAttribute("aria-disabled")).toBe("true");
    expect(el.getAttribute("tabindex")).toBe("-1");
  });

  it("a press with no movement does not open the type-in", () => {
    render(<DragNumber {...base} disabled />);
    const el = screen.getByTestId("drag-number");
    down(el, 40);
    up(el, 40); // no movement — the click path
    expect(screen.queryByTestId("drag-number-input")).toBeNull();
  });

  it("stays fully live when not disabled (the flag is opt-in)", () => {
    const onCommit = vi.fn();
    render(<DragNumber {...base} onCommit={onCommit} />);
    fireEvent.keyDown(screen.getByTestId("drag-number"), { key: "ArrowUp" });
    expect(onCommit).toHaveBeenCalledWith(51);
  });
});
