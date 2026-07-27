// @vitest-environment jsdom
//
// DragDial — the compact bearing cell approved as variant D of the #139
// prototype. Three controls in one 24px row: a live needle, a vertical drag at
// 1px = 1° that WRAPS, and a press-without-drag that opens the full radial.
//
// It shares `useDragValue` with DragNumber, so the mechanics tests here are
// deliberately about what DIFFERS — wrapping instead of clamping, degrees
// instead of steps, a click that discloses instead of one that types.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DragDial from "./DragDial";
import { wrap360 } from "./useDragValue";

// Screen Y grows downward, so dragging UP means a DECREASING clientY. Every `y`
// is an absolute pointer position, not a delta.
const down = (el, y = 0) => fireEvent.pointerDown(el, { clientY: y, pointerId: 1, button: 0 });
const move = (el, y, opts = {}) => fireEvent.pointerMove(el, { clientY: y, pointerId: 1, ...opts });
const up = (el, y = 0) => fireEvent.pointerUp(el, { clientY: y, pointerId: 1 });

const dial = () => screen.getByTestId("drag-dial");
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

describe("wrap360", () => {
  it("brings any bearing into [0,360) and rounds to whole degrees", () => {
    expect(wrap360(0)).toBe(0);
    expect(wrap360(359.4)).toBe(359);
    expect(wrap360(360)).toBe(0);
    expect(wrap360(361)).toBe(1);
    expect(wrap360(-1)).toBe(359);
    expect(wrap360(-721)).toBe(359);
    expect(wrap360(1080)).toBe(0);
  });
});

describe("DragDial — the drag law: 1px = 1 degree, wrapping", () => {
  it("dragging UP increases the bearing, one degree per pixel", () => {
    const onChange = vi.fn();
    render(<DragDial value={10} onChange={onChange} />);
    const el = dial();
    down(el, 100);
    move(el, 70); // 30px up
    expect(lastArg(onChange)).toBe(40);
  });

  it("dragging DOWN decreases it", () => {
    const onChange = vi.fn();
    render(<DragDial value={100} onChange={onChange} />);
    const el = dial();
    down(el, 100);
    move(el, 145); // 45px down
    expect(lastArg(onChange)).toBe(55);
  });

  it("WRAPS through 0 rather than clamping — the whole point of not using DragNumber", () => {
    const onChange = vi.fn();
    render(<DragDial value={10} onChange={onChange} />);
    const el = dial();
    down(el, 100);
    move(el, 120); // 20px down: 10 → -10 → 350
    expect(lastArg(onChange)).toBe(350);
  });

  it("wraps in the other direction, and keeps counting past a full revolution", () => {
    const onChange = vi.fn();
    render(<DragDial value={0} onChange={onChange} />);
    const el = dial();
    down(el, 500);
    move(el, 100); // 400px up: 400° → 40°
    expect(lastArg(onChange)).toBe(40);
  });

  it("a full revolution costs 360px and lands back on the same bearing", () => {
    const onChange = vi.fn();
    render(<DragDial value={90} onChange={onChange} />);
    const el = dial();
    down(el, 400);
    move(el, 220); // 180px up — half a turn
    expect(lastArg(onChange)).toBe(270);
    move(el, 40); // another 180px — all the way round
    expect(lastArg(onChange)).toBe(90);
  });

  it("emits nothing for a move that crosses no degree boundary", () => {
    // The gesture's raw runs free, but only a CHANGE in the quantized bearing
    // is emitted — a single 360px move lands where it started and says nothing.
    const onChange = vi.fn();
    render(<DragDial value={90} onChange={onChange} />);
    const el = dial();
    down(el, 400);
    move(el, 40);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Shift doubles the travel; Option gives ten pixels per degree", () => {
    const onChange = vi.fn();
    const { rerender } = render(<DragDial value={0} onChange={onChange} />);
    let el = dial();
    down(el, 100);
    move(el, 80, { shiftKey: true }); // 20px × 2 = 40°
    expect(lastArg(onChange)).toBe(40);
    up(el, 80);

    onChange.mockClear();
    rerender(<DragDial value={0} onChange={onChange} />);
    el = dial();
    down(el, 100);
    move(el, 80, { altKey: true }); // 20px × 0.1 = 2°
    expect(lastArg(onChange)).toBe(2);
  });
});

describe("DragDial — one commit per gesture", () => {
  it("emits onChange live and onCommit exactly once, on pointer-up", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<DragDial value={0} onChange={onChange} onCommit={onCommit} />);
    const el = dial();
    down(el, 100);
    move(el, 90);
    move(el, 80);
    move(el, 70);
    expect(onChange.mock.calls.length).toBeGreaterThan(1);
    expect(onCommit).not.toHaveBeenCalled();
    up(el, 70);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(30);
  });

  it("a gesture that ends where it started commits nothing", () => {
    const onCommit = vi.fn();
    render(<DragDial value={45} onChange={() => {}} onCommit={onCommit} />);
    const el = dial();
    down(el, 100);
    move(el, 70);
    move(el, 100); // back to the start
    up(el, 100);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("a cancelled pointer does not open the flyout", () => {
    const onOpen = vi.fn();
    render(<DragDial value={0} onChange={() => {}} onOpen={onOpen} />);
    const el = dial();
    down(el, 100);
    fireEvent.pointerCancel(el, { clientY: 100, pointerId: 1 });
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("DragDial — press without drag discloses the radial", () => {
  it("a press released under the 3px threshold opens the flyout and changes nothing", () => {
    const onOpen = vi.fn();
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<DragDial value={0} onChange={onChange} onCommit={onCommit} onOpen={onOpen} />);
    const el = dial();
    down(el, 100);
    move(el, 102); // 2px — jitter, not a scrub
    up(el, 102);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("a real drag does NOT open the flyout", () => {
    const onOpen = vi.fn();
    render(<DragDial value={0} onChange={() => {}} onOpen={onOpen} />);
    const el = dial();
    down(el, 100);
    move(el, 60);
    up(el, 60);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("Enter opens the flyout", () => {
    const onOpen = vi.fn();
    render(<DragDial value={0} onChange={() => {}} onOpen={onOpen} />);
    fireEvent.keyDown(dial(), { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("DragDial — keyboard", () => {
  it("arrows step one degree and commit in the same press", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<DragDial value={10} onChange={onChange} onCommit={onCommit} />);
    fireEvent.keyDown(dial(), { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith(11);
    expect(onCommit).toHaveBeenCalledWith(11);
  });

  it("Shift+arrow steps TEN degrees — AngleDial's convention, not the drag's ×2", () => {
    const onCommit = vi.fn();
    render(<DragDial value={10} onChange={() => {}} onCommit={onCommit} />);
    fireEvent.keyDown(dial(), { key: "ArrowUp", shiftKey: true });
    expect(onCommit).toHaveBeenCalledWith(20);
  });

  it("arrows wrap at both ends", () => {
    const onCommit = vi.fn();
    const { rerender } = render(<DragDial value={359} onChange={() => {}} onCommit={onCommit} />);
    fireEvent.keyDown(dial(), { key: "ArrowRight" });
    expect(onCommit).toHaveBeenCalledWith(0);
    rerender(<DragDial value={0} onChange={() => {}} onCommit={onCommit} />);
    fireEvent.keyDown(dial(), { key: "ArrowLeft" });
    expect(onCommit).toHaveBeenLastCalledWith(359);
  });

  it("ignores keys it does not own", () => {
    const onChange = vi.fn();
    const onOpen = vi.fn();
    render(<DragDial value={0} onChange={onChange} onOpen={onOpen} />);
    fireEvent.keyDown(dial(), { key: "a" });
    fireEvent.keyDown(dial(), { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("DragDial — the rotational cue", () => {
  it("shows nothing at rest", () => {
    render(<DragDial value={0} onChange={() => {}} />);
    expect(screen.queryByTestId("dial-cue")).not.toBeInTheDocument();
  });

  it("curves CLOCKWISE while the drag is increasing the bearing", () => {
    render(<DragDial value={0} onChange={() => {}} />);
    const el = dial();
    down(el, 100);
    move(el, 70); // up ⇒ bearing increases ⇒ clockwise
    expect(screen.getByTestId("dial-cue")).toHaveAttribute("data-dir", "cw");
  });

  it("curves COUNTERCLOCKWISE while the drag is decreasing it", () => {
    render(<DragDial value={90} onChange={() => {}} />);
    const el = dial();
    down(el, 100);
    move(el, 130);
    expect(screen.getByTestId("dial-cue")).toHaveAttribute("data-dir", "ccw");
  });

  it("flips the whole arc when the drag reverses, not just the arrowhead", () => {
    render(<DragDial value={90} onChange={() => {}} />);
    const el = dial();
    down(el, 100);
    move(el, 70);
    const cw = screen.getByTestId("dial-cue").querySelector("path").getAttribute("d");
    move(el, 130);
    const ccw = screen.getByTestId("dial-cue").querySelector("path").getAttribute("d");
    expect(ccw).not.toBe(cw);
    // Sweep flag: 1 = clockwise, 0 = counterclockwise.
    expect(cw).toMatch(/ 0 1 /);
    expect(ccw).toMatch(/ 0 0 /);
  });

  it("keeps every drawn point inside the viewBox at every bearing (no clipping)", () => {
    // The arrowhead reaches r≈12.94 against a half-box of 14; this sweeps the
    // whole circle rather than trusting the arithmetic.
    for (let angle = 0; angle < 360; angle += 5) {
      const { unmount } = render(<DragDial value={angle} onChange={() => {}} />);
      const el = dial();
      down(el, 100);
      move(el, 70);
      const cue = screen.getByTestId("dial-cue");
      const pts = cue
        .querySelector("polygon")
        .getAttribute("points")
        .split(" ")
        .flatMap((p) => p.split(",").map(Number));
      for (const n of pts) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(28);
      }
      unmount();
    }
  });
});

describe("DragDial — readout slot and motion", () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it("keeps the readout in a fixed left-anchored slot across digit counts", () => {
    const { rerender } = render(<DragDial value={1} onChange={() => {}} />);
    const readout = () => screen.getByTestId("drag-dial-readout");
    expect(readout().style.width).toBe("4ch");
    expect(readout().className).toContain("text-left");
    expect(readout().textContent).toBe("1°");
    rerender(<DragDial value={359} onChange={() => {}} />);
    expect(readout().style.width).toBe("4ch");
    expect(readout().textContent).toBe("359°");
  });

  it("animates the face on the 240ms quint motion tokens", () => {
    mockMatchMedia(false);
    render(<DragDial value={0} onChange={() => {}} />);
    const face = screen.getByTestId("drag-dial-face");
    expect(face.style.transition).toContain("var(--motion-medium)");
    expect(face.style.transition).toContain("var(--ease-out-quint)");
    expect(face.style.transition).toContain("transform");
  });

  it("under prefers-reduced-motion it crossfades instead of swelling", () => {
    mockMatchMedia(true);
    render(<DragDial value={0} onChange={() => {}} />);
    expect(dial()).toHaveAttribute("data-reduced-motion", "true");
    const face = screen.getByTestId("drag-dial-face");
    expect(face.style.transition).toContain("opacity");
    expect(face.style.transition).not.toContain("transform");
    expect(face.style.transform).toBe("");
  });
});

describe("DragDial — ARIA", () => {
  it("is a clean slider: no aria-expanded on a role that cannot carry it", () => {
    render(<DragDial value={45} onChange={() => {}} open label="Glyph angle" />);
    const el = dial();
    expect(el).toHaveAttribute("role", "slider");
    expect(el).not.toHaveAttribute("aria-expanded");
    expect(el).toHaveAttribute("aria-label", "Glyph angle");
    expect(el).toHaveAttribute("aria-valuemin", "0");
    expect(el).toHaveAttribute("aria-valuemax", "360");
    expect(el).toHaveAttribute("aria-valuenow", "45");
    expect(el).toHaveAttribute("aria-valuetext", "45°");
    // Enter is advertised, since the press-to-disclose gesture is invisible.
    expect(el).toHaveAttribute("aria-keyshortcuts", "Enter");
  });

  it("is reachable by keyboard", () => {
    render(<DragDial value={0} onChange={() => {}} />);
    expect(dial()).toHaveAttribute("tabindex", "0");
  });
});

describe("DragDial — token discipline", () => {
  it("uses design tokens only — no hex colour literals in the source", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "src/components/ui/DragDial.jsx"), "utf8");
    // Comments stripped first — issue references like "#139" are hex-shaped.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
    expect(code.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(src).toContain("var(--ink)");
    expect(src).toContain("var(--saffron)");
  });
});
