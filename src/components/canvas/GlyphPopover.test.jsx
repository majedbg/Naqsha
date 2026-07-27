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
