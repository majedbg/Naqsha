// @vitest-environment jsdom
//
// GlyphPopover — the per-glyph override card (#139, approved variant D), and
// the pure placement geometry behind it.
//
// The geometry is tested WITHOUT a browser: `placeSurface` takes the anchor
// rect, the surface size, the rect to dodge and the viewport as plain numbers,
// so every branch — flip-above, the four horizontal alignments, the dodge, the
// clamp of last resort — is arithmetic that can be pinned exactly.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import GlyphPopover from "./GlyphPopover";
import { glyphScreenRect, placeSurface } from "./glyphPopoverPlacement";
import {
  FootprintRevealProvider,
  useFootprintReveal,
} from "../shell/footprintRevealContext";
import {
  clearGlyphClipboard,
  copyGlyphSettings,
  readGlyphClipboard,
} from "../../lib/motif/glyphClipboard";

const rect = (left, top, w, h) => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
  width: w,
  height: h,
});
const VP = { w: 1000, h: 800 };
const CARD = { w: 120, h: 100 };

describe("placeSurface — below by default, flipped above near the bottom", () => {
  it("sits below the anchor with a 6px gap", () => {
    const p = placeSurface(rect(400, 300, 10, 10), CARD, null, VP);
    expect(p.top).toBe(316); // 300 + 10 + GAP
    expect(p.left).toBe(400); // start-aligned
    expect(p.flipped).toBe(false);
  });

  it("flips ABOVE when the surface would run past the viewport bottom", () => {
    const p = placeSurface(rect(400, 760, 10, 10), CARD, null, VP);
    expect(p.flipped).toBe(true);
    expect(p.top).toBe(654); // 760 - GAP - 100
  });

  it("never lets a flipped surface run off the TOP either", () => {
    const p = placeSurface(rect(400, 20, 10, 10), CARD, null, { w: 1000, h: 60 });
    expect(p.flipped).toBe(true);
    expect(p.top).toBeGreaterThanOrEqual(8);
  });
});

describe("placeSurface — the horizontal alignments, in order", () => {
  it("end-aligns when start-aligning would overflow the right edge", () => {
    const p = placeSurface(rect(920, 300, 10, 10), CARD, null, VP);
    expect(p.left).toBe(810); // anchor.right - w = 930 - 120
  });

  it("clamps on-screen rather than vanishing when nothing fits", () => {
    const p = placeSurface(rect(0, 300, 10, 10), { w: 2000, h: 50 }, null, VP);
    expect(p.left).toBeGreaterThanOrEqual(8);
  });
});

describe("placeSurface — dodging the glyph being edited", () => {
  // The vertical flip is what makes the dodge necessary: below the anchor the
  // surface runs AWAY from the glyph; flipped above it runs straight over it.
  const anchorLow = rect(400, 760, 10, 10);

  it("skips an alignment that would cover the glyph, and says so", () => {
    // Sits where a START-aligned flipped card would land, but clear of the
    // END-aligned one — so exactly one alignment is skipped.
    const glyph = rect(420, 640, 70, 120);
    const p = placeSurface(anchorLow, CARD, glyph, VP);
    expect(p.flipped).toBe(true);
    expect(p.dodged).toBe(true);
    const box = { left: p.left, right: p.left + CARD.w, top: p.top, bottom: p.top + CARD.h };
    expect(box.left < glyph.right && box.right > glyph.left).toBe(false);
  });

  it("does not report a dodge when the first alignment was already clear", () => {
    const p = placeSurface(anchorLow, CARD, rect(0, 0, 20, 20), VP);
    expect(p.dodged).toBe(false);
  });

  it("accepts the overlap rather than going off-screen when nothing clears it", () => {
    const everywhere = rect(0, 0, 1000, 800);
    const p = placeSurface(anchorLow, CARD, everywhere, VP);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + CARD.w).toBeLessThanOrEqual(VP.w - 8);
  });
});

describe("glyphScreenRect — canvas radius to screen box without threading zoom", () => {
  it("derives the zoom factor from the dot's own measured size", () => {
    // A dot drawn at canvas radius 5 measuring 20px on screen means 2× zoom, so
    // a glyph of canvas radius 30 is 60px on screen — 120px across.
    const box = glyphScreenRect(rect(100, 100, 20, 20), 5, 30);
    expect(box).toEqual({ left: 50, right: 170, top: 50, bottom: 170 });
  });

  it("returns null rather than NaN for a glyph that is not placed", () => {
    expect(glyphScreenRect(rect(100, 100, 20, 20), 5, undefined)).toBeNull();
    expect(glyphScreenRect(null, 5, 30)).toBeNull();
    expect(glyphScreenRect(rect(100, 100, 0, 0), 5, 30)).toBeNull();
  });
});

/* ------------------------------------------------------------- the card */

const anchor = rect(400, 300, 10, 10);

function renderPopover(props = {}) {
  return render(
    <GlyphPopover anchorRect={anchor} scale={1} angle={0} onPreview={() => {}} {...props} />,
  );
}

beforeEach(() => clearGlyphClipboard());
afterEach(() => clearGlyphClipboard());

describe("GlyphPopover — the card", () => {
  it("is a labelled dialog holding the eye, scale and angle", () => {
    renderPopover({ label: "vine" });
    const card = screen.getByTestId("glyph-popover");
    expect(card).toHaveAttribute("role", "dialog");
    expect(card).toHaveAttribute("aria-label", "vine overrides");
    expect(screen.getByTestId("glyph-popover-eye")).toBeInTheDocument();
    expect(screen.getByTestId("glyph-popover-scale")).toBeInTheDocument();
    expect(screen.getByTestId("glyph-popover-dial")).toBeInTheDocument();
  });

  it("shows the scale as a percentage on a 1% grid", () => {
    renderPopover({ scale: 1.3 });
    expect(screen.getByTestId("glyph-popover-scale-readout").textContent).toBe("130%");
    expect(screen.getByTestId("glyph-popover-scale")).toHaveAttribute("aria-valuemin", "0.25");
    expect(screen.getByTestId("glyph-popover-scale")).toHaveAttribute("aria-valuemax", "4");
  });

  it("keeps the card at its approved 90px minimum width", () => {
    renderPopover();
    expect(screen.getByTestId("glyph-popover").style.minWidth).toBe("90px");
  });

  it("flips the eye label with the hidden state", () => {
    const { rerender } = renderPopover({ hidden: false });
    expect(screen.getByTestId("glyph-popover-eye")).toHaveAttribute("aria-label", "Hide glyph");
    rerender(
      <GlyphPopover anchorRect={anchor} scale={1} angle={0} hidden onPreview={() => {}} />,
    );
    expect(screen.getByTestId("glyph-popover-eye")).toHaveAttribute("aria-label", "Show glyph");
    expect(screen.getByTestId("glyph-popover-eye")).toHaveAttribute("aria-pressed", "true");
  });

  it("reports the eye press once, without deciding what hidden should become", () => {
    // The 4-state machine lives in overrides.js; the card only reports the press.
    const onToggleHidden = vi.fn();
    renderPopover({ onToggleHidden });
    fireEvent.click(screen.getByTestId("glyph-popover-eye"));
    expect(onToggleHidden).toHaveBeenCalledTimes(1);
    expect(onToggleHidden.mock.calls[0]).toHaveLength(1); // the click event only
  });
});

describe("GlyphPopover — the actions menu", () => {
  const openMenu = () => fireEvent.click(screen.getByTestId("glyph-popover-more"));

  it("holds copy, paste and reset behind the … cell", () => {
    renderPopover();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    openMenu();
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Copy settings",
      "Paste settings",
      "Reset glyph",
    ]);
  });

  it("disables paste with the exact hover text while the buffer is empty", () => {
    const onPaste = vi.fn();
    renderPopover({ onPaste });
    openMenu();
    const paste = screen.getByRole("menuitem", { name: /paste/i });
    expect(paste).toHaveAttribute("aria-disabled", "true");
    expect(paste).toHaveAttribute("title", "paste unavailable — no motif settings copied");
    fireEvent.click(paste);
    expect(onPaste).not.toHaveBeenCalled();
  });

  it("enables paste as soon as something is copied, with no hover text", () => {
    copyGlyphSettings({ scale: 2, angle: 90 });
    const onPaste = vi.fn();
    renderPopover({ onPaste });
    openMenu();
    const paste = screen.getByRole("menuitem", { name: /paste/i });
    expect(paste).not.toHaveAttribute("aria-disabled");
    expect(paste).not.toHaveAttribute("title");
    fireEvent.click(paste);
    expect(onPaste).toHaveBeenCalledTimes(1);
  });

  it("re-enables paste LIVE when the buffer fills while the card is open", () => {
    // The buffer is a module singleton, so the card subscribes rather than
    // reading once — copy from one glyph, paste into another without reopening.
    renderPopover();
    openMenu();
    expect(screen.getByRole("menuitem", { name: /paste/i })).toHaveAttribute("aria-disabled");
    act(() => copyGlyphSettings({ scale: 2, angle: 90 }));
    expect(screen.getByRole("menuitem", { name: /paste/i })).not.toHaveAttribute("aria-disabled");
  });

  it("fires copy and reset and closes the menu", () => {
    const onCopy = vi.fn();
    const onReset = vi.fn();
    renderPopover({ onCopy, onReset });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /copy/i }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /reset/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe("GlyphPopover — the angle flyout", () => {
  it("opens on a press-without-drag and holds the full radial", () => {
    renderPopover({ angle: 45 });
    expect(screen.queryByTestId("glyph-popover-flyout")).not.toBeInTheDocument();
    const cell = screen.getByTestId("glyph-popover-dial");
    fireEvent.pointerDown(cell, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(cell, { clientY: 100, pointerId: 1 });
    const flyout = screen.getByTestId("glyph-popover-flyout");
    expect(flyout).toHaveAttribute("role", "dialog");
    // The radial is the real AngleDial, wrapping, announcing 0–360.
    const radial = within(flyout).getByRole("slider");
    expect(radial).toHaveAttribute("aria-valuemin", "0");
    expect(radial).toHaveAttribute("aria-valuemax", "360");
    expect(radial).toHaveAttribute("aria-valuenow", "45");
  });

  it("takes focus when it opens — the disclosure the slider cannot carry in ARIA", () => {
    renderPopover();
    const cell = screen.getByTestId("glyph-popover-dial");
    fireEvent.pointerDown(cell, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(cell, { clientY: 100, pointerId: 1 });
    const flyout = screen.getByTestId("glyph-popover-flyout");
    expect(flyout.contains(document.activeElement)).toBe(true);
  });

  it("does NOT open on a real drag", () => {
    renderPopover();
    const cell = screen.getByTestId("glyph-popover-dial");
    fireEvent.pointerDown(cell, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(cell, { clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(cell, { clientY: 60, pointerId: 1 });
    expect(screen.queryByTestId("glyph-popover-flyout")).not.toBeInTheDocument();
  });
});

describe("GlyphPopover — preview vs commit", () => {
  it("the scale cell previews live and commits once", () => {
    const onPreview = vi.fn();
    const onCommitScale = vi.fn();
    renderPopover({ onPreview, onCommitScale });
    const cell = screen.getByTestId("glyph-popover-scale");
    fireEvent.pointerDown(cell, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(cell, { clientY: 250, pointerId: 1 });
    fireEvent.pointerMove(cell, { clientY: 200, pointerId: 1 });
    expect(onPreview.mock.calls.length).toBeGreaterThan(1);
    expect(onPreview.mock.calls[0][0]).toHaveProperty("scale");
    expect(onCommitScale).not.toHaveBeenCalled();
    fireEvent.pointerUp(cell, { clientY: 200, pointerId: 1 });
    expect(onCommitScale).toHaveBeenCalledTimes(1);
  });

  it("the angle cell previews live and commits once", () => {
    const onPreview = vi.fn();
    const onCommitAngle = vi.fn();
    renderPopover({ onPreview, onCommitAngle });
    const cell = screen.getByTestId("glyph-popover-dial");
    fireEvent.pointerDown(cell, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(cell, { clientY: 270, pointerId: 1 });
    expect(onPreview.mock.calls.at(-1)[0]).toEqual({ angle: 30 });
    expect(onCommitAngle).not.toHaveBeenCalled();
    fireEvent.pointerUp(cell, { clientY: 270, pointerId: 1 });
    expect(onCommitAngle).toHaveBeenCalledTimes(1);
    expect(onCommitAngle).toHaveBeenCalledWith(30);
  });
});

describe("GlyphPopover — Escape", () => {
  it("closes the card", () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close the card while the flyout owns Escape", () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    const cell = screen.getByTestId("glyph-popover-dial");
    fireEvent.pointerDown(cell, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(cell, { clientY: 100, pointerId: 1 });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------- header · drag · dismiss */
// Interaction pass (2026-07-27, Majed): row 1 reads as a WINDOW HEADER — a
// lighter bar with a grip you can drag the card by — the card dodges the glyph
// it is editing, and a clean click anywhere else dismisses it.
describe("GlyphPopover — the draggable header", () => {
  // jsdom reports every element as 0×0, and placement arithmetic needs a real
  // card size. 90×80 is the approved minimum width and a plausible height.
  let sizes;
  beforeEach(() => {
    sizes = [
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight"),
    ];
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 90 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 80 });
  });
  afterEach(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", sizes[0]);
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", sizes[1]);
  });

  const header = () => screen.getByTestId("glyph-popover-header");
  const card = () => screen.getByTestId("glyph-popover");
  const at = () => ({ top: card().style.top, left: card().style.left });

  it("row 1 is a labelled drag handle carrying a grip", () => {
    renderPopover();
    expect(header()).toBeInTheDocument();
    expect(header()).toHaveAttribute("aria-label", "Drag to move");
    expect(within(header()).getByTestId("glyph-popover-grip")).toBeInTheDocument();
  });

  it("dragging the header moves the card by the pointer delta", () => {
    renderPopover();
    const before = at();
    fireEvent.pointerDown(header(), { clientX: 400, clientY: 300, pointerId: 1, button: 0 });
    fireEvent.pointerMove(window, { clientX: 460, clientY: 330, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 460, clientY: 330, pointerId: 1 });
    expect(parseFloat(at().left)).toBe(parseFloat(before.left) + 60);
    expect(parseFloat(at().top)).toBe(parseFloat(before.top) + 30);
  });

  it("a dragged card stays PINNED — auto-placement stops fighting the user", () => {
    const { rerender } = renderPopover();
    fireEvent.pointerDown(header(), { clientX: 400, clientY: 300, pointerId: 1, button: 0 });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 500, clientY: 300, pointerId: 1 });
    const pinned = at();
    // The anchor moves (a live edit re-places the glyph) — the card must not.
    rerender(
      <GlyphPopover anchorRect={rect(100, 700, 10, 10)} scale={1} angle={0} onPreview={() => {}} />,
    );
    expect(at()).toEqual(pinned);
  });

  it("pressing the eye or the … does not start a drag", () => {
    const onToggleHidden = vi.fn();
    renderPopover({ onToggleHidden });
    const before = at();
    const eye = screen.getByTestId("glyph-popover-eye");
    fireEvent.pointerDown(eye, { clientX: 400, clientY: 300, pointerId: 1, button: 0 });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 400, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 500, clientY: 400, pointerId: 1 });
    expect(at()).toEqual(before);
  });

  it("the card itself dodges the glyph it is editing", () => {
    // Anchor near the bottom ⇒ the card flips ABOVE the dot, straight over the
    // glyph — the case the flyout already handles and the card did not.
    renderPopover({
      anchorRect: rect(400, 760, 10, 10),
      glyphRect: rect(400, 700, 40, 60),
    });
    expect(card()).toHaveAttribute("data-dodged", "true");
  });
});

describe("GlyphPopover — dismiss on a clean click outside", () => {
  const downUp = (target, from, to = from) => {
    fireEvent.pointerDown(target, { clientX: from[0], clientY: from[1], pointerId: 1 });
    fireEvent.pointerUp(target, { clientX: to[0], clientY: to[1], pointerId: 1 });
  };

  it("a full click on the canvas closes the card", () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    downUp(document.body, [50, 50]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a DRAG that happens to end outside does not close it", () => {
    // Load-bearing: scale and angle are drag controls, and a canvas pan is a
    // drag too. Only a press-and-release in the same spot dismisses.
    const onClose = vi.fn();
    renderPopover({ onClose });
    downUp(document.body, [50, 50], [300, 220]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a gesture that STARTS inside the card never closes it, wherever it ends", () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    fireEvent.pointerDown(screen.getByTestId("glyph-popover-scale"), {
      clientX: 400, clientY: 300, pointerId: 1,
    });
    fireEvent.pointerUp(document.body, { clientX: 400, clientY: 300, pointerId: 1 });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clicking another anchor dot does not close it — the card just moves there", () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    const dot = document.createElement("div");
    dot.setAttribute("data-anchor-id", "edge:1:4");
    document.body.appendChild(dot);
    downUp(dot, [120, 120]);
    expect(onClose).not.toHaveBeenCalled();
    dot.remove();
  });
});

describe("glyphClipboard — one session-scoped slot", () => {
  it("stores scale and angle only, never hidden", () => {
    copyGlyphSettings({ scale: 2, angle: 90, hidden: true });
    expect(readGlyphClipboard()).toEqual({ scale: 2, angle: 90 });
  });

  it("refuses a half-resolved payload rather than poisoning a later paste", () => {
    copyGlyphSettings({ scale: 2 });
    expect(readGlyphClipboard()).toBeNull();
    copyGlyphSettings({ scale: NaN, angle: 0 });
    expect(readGlyphClipboard()).toBeNull();
  });

  it("keeps angle 0 — a legitimate bearing, not an absent value", () => {
    copyGlyphSettings({ scale: 1, angle: 0 });
    expect(readGlyphClipboard()).toEqual({ scale: 1, angle: 0 });
  });

  it("holds ONE slot: a second copy replaces the first", () => {
    copyGlyphSettings({ scale: 2, angle: 90 });
    copyGlyphSettings({ scale: 0.5, angle: 10 });
    expect(readGlyphClipboard()).toEqual({ scale: 0.5, angle: 10 });
  });
});

// ── THE FOOTPRINT REVEAL (#192, PRD #184) ──────────────────────────────────
// The per-glyph override SCALE is the third of PR 1's four triggers: it moves a
// radius, so it raises the same overlay `hold`, slot Scale and layer Size do
// (decision 18). The card owns the hook and the overlay passes the scope down,
// so there is one gesture system rather than a second one bolted onto the
// caller.
//
// ⚠️ THE ROW, NOT THE CARD. This popover funnels scale, the angle dial AND the
// angle flyout through ONE shared `onPreview`. Wrapping `onPreview` itself — or
// putting `pointerProps` on the card root — would raise the footprint overlay on
// an ANGLE drag, which moves no radius at all and appears nowhere in decision
// 18's list. Half of this block exists to keep both of those wrong wirings red,
// and each needs its OWN assertion. Dragging the dial pins the `onPreview`
// variant; it does NOT pin the card-root one, because React synthesises
// `onPointerEnter` as NON-BUBBLING — an enter fired on the dial's row never
// reaches a handler on the card, so that wiring would stay green here while a
// real browser, where `pointerenter` does fire up the ancestor chain, showed
// rings on every angle gesture. The card root is entered DIRECTLY below.
describe("GlyphPopover — the footprint reveal (#192)", () => {
  const SCOPE = { kind: "glyph", layerId: "m1", anchorId: "crossing:3" };

  function Readout() {
    const { scope } = useFootprintReveal();
    return <div data-testid="reveal-scope">{scope ? JSON.stringify(scope) : "none"}</div>;
  }

  const mount = (props = {}) =>
    render(
      <FootprintRevealProvider>
        <Readout />
        <GlyphPopover
          anchorRect={anchor}
          scale={1}
          angle={0}
          onPreview={() => {}}
          footprintScope={SCOPE}
          {...props}
        />
      </FootprintRevealProvider>,
    );

  const scopeText = () => screen.getByTestId("reveal-scope").textContent;
  const scaleRow = () => screen.getByTestId("glyph-popover-scale").parentElement;

  it("the scale row raises the reveal on hover and releases on leave", () => {
    mount();
    expect(scopeText()).toBe("none");
    fireEvent.pointerEnter(scaleRow());
    expect(scopeText()).toBe(JSON.stringify(SCOPE));
    fireEvent.pointerLeave(scaleRow());
    expect(scopeText()).toBe("none");
  });

  it("a scale DRAG holds the reveal past the row and releases on commit", () => {
    const onPreview = vi.fn();
    const onCommitScale = vi.fn();
    mount({ onPreview, onCommitScale });
    const cell = screen.getByTestId("glyph-popover-scale");
    fireEvent.pointerDown(cell, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(cell, { clientY: 250, pointerId: 1 });
    expect(scopeText()).toBe(JSON.stringify(SCOPE));
    // The card's own seam is untouched — the rings can only move if the live
    // preview still lands.
    expect(onPreview.mock.calls.at(-1)[0]).toHaveProperty("scale");
    // The drag walks the cursor off the row, as a vertical scrub always does.
    fireEvent.pointerLeave(scaleRow());
    expect(scopeText()).toBe(JSON.stringify(SCOPE));
    fireEvent.pointerUp(cell, { clientY: 250, pointerId: 1 });
    expect(onCommitScale).toHaveBeenCalledTimes(1);
    // THE COMMITTED VALUE STILL ARRIVES. The wrapper releases the reveal and
    // then forwards, so a wrap that swallowed its argument would leave every
    // other popover test green while per-glyph scale silently stopped being
    // written — the record edit is the only thing keeping the ring where the
    // drag left it.
    const [committed] = onCommitScale.mock.calls[0];
    expect(typeof committed).toBe("number");
    expect(committed).toBeGreaterThan(1); // dragged UP ⇒ larger
    expect(scopeText()).toBe("none");
  });

  it("the ANGLE dial raises NOTHING — angle moves no radius", () => {
    const onPreview = vi.fn();
    mount({ onPreview });
    const dial = screen.getByTestId("glyph-popover-dial");
    fireEvent.pointerEnter(dial.parentElement);
    expect(scopeText()).toBe("none");
    fireEvent.pointerDown(dial, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(dial, { clientY: 270, pointerId: 1 });
    // The angle preview fires; the reveal does not. Both halves matter — the
    // shared `onPreview` is exactly what makes the wrong wiring easy.
    expect(onPreview.mock.calls.at(-1)[0]).toEqual({ angle: 30 });
    expect(scopeText()).toBe("none");
    fireEvent.pointerUp(dial, { clientY: 270, pointerId: 1 });
    expect(scopeText()).toBe("none");
  });

  it("the CARD ROOT raises nothing — the hover surface is the scale row alone", () => {
    // Fired on the card itself, not on a descendant: `onPointerEnter` does not
    // bubble in React, so entering a child could never exercise a handler up
    // here and the drag tests above cannot see this mistake. In a browser it is
    // the loudest version of it — every hover anywhere on the card, including
    // the header, the menu and the angle dial, would ring the glyph.
    mount();
    fireEvent.pointerEnter(screen.getByTestId("glyph-popover"));
    expect(scopeText()).toBe("none");
    fireEvent.pointerEnter(screen.getByTestId("glyph-popover-header"));
    expect(scopeText()).toBe("none");
  });

  it("the angle FLYOUT raises nothing either", () => {
    mount();
    const dial = screen.getByTestId("glyph-popover-dial");
    fireEvent.pointerDown(dial, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(dial, { clientY: 100, pointerId: 1 });
    const flyout = screen.getByTestId("glyph-popover-flyout");
    const radial = within(flyout).getByRole("slider");
    fireEvent.keyDown(radial, { key: "ArrowRight" });
    fireEvent.pointerEnter(flyout);
    expect(scopeText()).toBe("none");
  });

  it("is inert with no scope passed — every existing caller is unaffected", () => {
    mount({ footprintScope: undefined });
    fireEvent.pointerEnter(scaleRow());
    expect(scopeText()).toBe("none");
  });

  it("releases when the card unmounts mid-drag", () => {
    // Opening a different dot re-keys the card, and a glyph deleted under the
    // gesture unmounts it outright. Neither may leave the rings on screen.
    const view = mount();
    const cell = screen.getByTestId("glyph-popover-scale");
    fireEvent.pointerDown(cell, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(cell, { clientY: 250, pointerId: 1 });
    expect(scopeText()).toBe(JSON.stringify(SCOPE));
    view.rerender(
      <FootprintRevealProvider>
        <Readout />
      </FootprintRevealProvider>,
    );
    expect(scopeText()).toBe("none");
  });
});
