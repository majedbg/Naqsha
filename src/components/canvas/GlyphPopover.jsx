// GlyphPopover — the per-glyph motif-override card (#139, approved variant D).
//
// Opened by clicking a glyph's purple dot on the canvas; anchored to that dot.
// A vertical column, deliberately the smallest surface that holds everything:
//
//   row 1   the eye-toggle, and a "…" cell whose menu holds copy / paste / reset
//   row 2   scale — a <DragNumber>, geometric, percent on a 1% grid
//   row 3   angle — a <DragDial>, 1px = 1°, wrapping; a press without a drag
//           opens the full <AngleDial> as a flyout
//
// PORTALLED to <body> and positioned in viewport coordinates. The canvas sits
// inside a CSS `scale(finalScale)` box, so a popover rendered in that subtree
// would zoom with the artwork — text and chrome included — and `position:fixed`
// inside a transformed ancestor is captured by that ancestor rather than the
// viewport. Both problems disappear at the body.
//
// This component OWNS NO DOCUMENT STATE. It reads a resolved `{hidden, scale,
// angle}` and reports gestures upward; the caller does the record edit through
// `overrides.js` and wraps it so exactly one undo entry lands per gesture.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import AngleDial from "../ui/AngleDial";
import DragDial from "../ui/DragDial";
import DragNumber from "../ui/DragNumber";
import Menu from "../ui/Menu";
import {
  GLYPH_PASTE_EMPTY_HINT,
  readGlyphClipboard,
  subscribeGlyphClipboard,
} from "../../lib/motif/glyphClipboard";
import {
  EDGE,
  placeSurface,
  SCALE_FORMAT,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_PARSE,
  SCALE_STEP,
  viewportSize,
} from "./glyphPopoverPlacement";

/* ------------------------------------------------------------------ icons */

function EyeIcon({ open }) {
  return open ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// Two columns of dots in the header's gap — the drag affordance, visible before
// you hover rather than only in the cursor.
function GripIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
      {[4, 7, 10].map((cy) => (
        <g key={cy}>
          <circle cx="3.5" cy={cy} r="0.9" />
          <circle cx="6.5" cy={cy} r="0.9" />
        </g>
      ))}
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

/* ------------------------------------------------------------- placement */

// Re-solve after EVERY render (no dep array) so a moving anchor, a resized
// glyph or a window resize all re-place immediately. `setPos` returns the
// previous object when nothing moved, so this cannot loop.
function usePlacement(ref, anchorRect, avoidRect, active) {
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!active) return undefined;
    const place = () => {
      const el = ref.current;
      if (!el || !anchorRect) return;
      const next = placeSurface(
        anchorRect,
        { w: el.offsetWidth, h: el.offsetHeight },
        avoidRect,
      );
      setPos((prev) =>
        prev &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.flipped === next.flipped &&
        prev.dodged === next.dodged
          ? prev
          : next,
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  });
  return pos;
}

// Drag the card by its header. Returns the PINNED viewport position (null until
// the first drag) plus the pointerdown handler the header wears.
//
// A pin, not an offset: once the user has put the card somewhere, auto-placement
// stops moving it for as long as this card is open — a live edit re-places the
// glyph every frame, and a card that chased the anchor would be unusable. The
// pin dies with the card (the caller keys the component by anchor id), so the
// next glyph opens auto-placed again.
function useCardDrag(ref, basePos) {
  const [pinned, setPinned] = useState(null);
  const drag = useRef(null);

  const onPointerDown = (e) => {
    // Only the bar itself, never the controls sitting on it.
    if (e.button !== 0 || e.target.closest("button")) return;
    // Start from where the card CURRENTLY is — the pin if it has one, else the
    // auto-placed position. Read from state, not from a measured rect: the two
    // agree, and this needs no layout read mid-gesture.
    const base = pinned || basePos;
    if (!base) return;
    drag.current = { x: e.clientX, y: e.clientY, top: base.top, left: base.left };
    e.preventDefault(); // no text selection while dragging
    e.stopPropagation();
  };

  useEffect(() => {
    const move = (e) => {
      const d = drag.current;
      if (!d) return;
      const el = ref.current;
      const w = el?.offsetWidth ?? 0;
      const h = el?.offsetHeight ?? 0;
      const vp = viewportSize();
      // Clamped so the card can never be dragged off-screen and stranded.
      setPinned({
        top: Math.min(Math.max(d.top + (e.clientY - d.y), EDGE), Math.max(EDGE, vp.h - EDGE - h)),
        left: Math.min(Math.max(d.left + (e.clientX - d.x), EDGE), Math.max(EDGE, vp.w - EDGE - w)),
      });
    };
    const up = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [ref]);

  return { pinned, onPointerDown };
}

// Dismiss on a CLEAN CLICK outside: pointer pressed and released outside every
// glyph surface, within DISMISS_SLOP of the same spot.
//
// Not pointerdown alone and not pointerup alone — both are wrong here. Scale and
// angle are DRAG controls whose gestures routinely leave the card, and a canvas
// pan is a drag too; either would dismiss the card mid-edit. Requiring a press
// AND a release in the same place is what makes "click away to dismiss" safe
// next to drag-everything chrome.
//
// The anchor DOTS count as inside: clicking another dot just moves the card to
// it, with no close-then-reopen flicker in between.
const DISMISS_SLOP = 4;
const isGlyphSurface = (node) =>
  !!(node && node.closest && node.closest("[data-glyph-surface], [data-anchor-id]"));

function useDismissOnClickOutside(onClose) {
  useEffect(() => {
    let down = null;
    const onDown = (e) => {
      down = isGlyphSurface(e.target) ? null : { x: e.clientX, y: e.clientY };
    };
    const onUp = (e) => {
      const start = down;
      down = null;
      if (!start || isGlyphSurface(e.target)) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > DISMISS_SLOP) return;
      onClose();
    };
    // CAPTURE phase: the dots and the card stop propagation on pointerdown for
    // the canvas select-overlay's benefit, which would otherwise hide these.
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
    };
  }, [onClose]);
}

/* --------------------------------------------------------------- popover */

export default function GlyphPopover({
  /** Screen rect of the dot this popover belongs to. */
  anchorRect,
  /** Screen rect the ANGLE FLYOUT must keep clear of — the glyph being edited. */
  glyphRect,
  /** Resolved state: what the glyph is actually doing right now. */
  hidden = false,
  scale = 1,
  angle = 0,
  /** Live preview — every grid crossing. No undo entry. */
  onPreview = () => {},
  /** One per gesture. The caller turns each of these into ONE undo entry. */
  onCommitScale = () => {},
  onCommitAngle = () => {},
  onToggleHidden = () => {},
  onPaste = () => {},
  onReset = () => {},
  onCopy = () => {},
  onClose = () => {},
  label = "Glyph",
  testId = "glyph-popover",
}) {
  const cardRef = useRef(null);
  const moreRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuFlip, setMenuFlip] = useState(false);
  const [dialOpen, setDialOpen] = useState(false);

  const buffer = useSyncExternalStore(
    subscribeGlyphClipboard,
    readGlyphClipboard,
    () => null,
  );

  // The card dodges the GLYPH the way the flyout always has: flipping above a
  // low anchor puts the card straight over the thing being edited.
  const pos = usePlacement(cardRef, anchorRect, glyphRect, true);
  const { pinned, onPointerDown: onHeaderPointerDown } = useCardDrag(cardRef, pos);
  const at = pinned || pos;

  useDismissOnClickOutside(onClose);

  // Escape closes the whole popover — but only once the flyout and menu, which
  // own Escape while they are open, have had their turn.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (dialOpen || menuOpen) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialOpen, menuOpen, onClose]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const toggleMenu = () => {
    // Flip above when the trigger sits low enough that the menu would run off
    // the viewport. Measured rather than passed in: unlike a tree row, this card
    // can be anywhere on screen.
    const r = moreRef.current?.getBoundingClientRect();
    if (r) setMenuFlip(r.bottom + 118 > viewportSize().h);
    setMenuOpen((o) => !o);
  };

  const items = [
    { label: "Copy settings", onActivate: onCopy },
    {
      label: "Paste settings",
      disabled: !buffer,
      title: buffer ? undefined : GLYPH_PASTE_EMPTY_HINT,
      onActivate: onPaste,
    },
    { separator: true },
    { label: "Reset glyph", onActivate: onReset },
  ];

  const card = (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={`${label} overrides`}
      data-testid={testId}
      data-glyph-surface=""
      data-flipped={pos?.flipped || undefined}
      data-dodged={pos?.dodged || undefined}
      data-pinned={pinned ? "true" : undefined}
      // VERDICT 2026-07-27: 90px min-width, height automatic.
      style={{
        position: "fixed",
        top: at ? at.top : -9999,
        left: at ? at.left : -9999,
        visibility: at ? "visible" : "hidden",
        minWidth: 90,
      }}
      className="pointer-events-auto z-[80] inline-flex flex-col overflow-hidden rounded-sm border border-hairline bg-paper shadow-pop"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* row 1 — the window header: eye · grip · "…". A lighter bar than the
          rows below it, draggable anywhere that isn't one of its two buttons. */}
      <div
        data-testid={`${testId}-header`}
        aria-label="Drag to move"
        onPointerDown={onHeaderPointerDown}
        className="relative flex cursor-grab items-center justify-between gap-2xs border-b border-hairline bg-paper-warm px-2xs py-[2px] active:cursor-grabbing"
      >
        <button
          type="button"
          aria-label={hidden ? "Show glyph" : "Hide glyph"}
          aria-pressed={hidden}
          title={hidden ? "Show glyph" : "Hide glyph"}
          data-testid={`${testId}-eye`}
          onClick={onToggleHidden}
          className={[
            "inline-flex h-6 w-6 items-center justify-center rounded-xs border border-transparent",
            hidden ? "text-saffron" : "text-ink-soft",
            "hover:border-hairline hover:bg-paper-warm hover:text-ink",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet",
          ].join(" ")}
        >
          <EyeIcon open={!hidden} />
        </button>
        <span
          data-testid={`${testId}-grip`}
          aria-hidden="true"
          className="pointer-events-none flex-1 flex justify-center text-ink-soft/50"
        >
          <GripIcon />
        </span>
        <button
          ref={moreRef}
          type="button"
          aria-label="Glyph actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Copy · paste · reset"
          data-testid={`${testId}-more`}
          onClick={toggleMenu}
          className={[
            "inline-flex h-6 w-6 items-center justify-center rounded-xs border border-transparent",
            menuOpen ? "border-hairline bg-paper-warm text-ink" : "text-ink-soft",
            "hover:border-hairline hover:bg-paper-warm hover:text-ink",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet",
          ].join(" ")}
        >
          <MoreIcon />
        </button>
        <Menu
          open={menuOpen}
          items={items}
          onClose={closeMenu}
          ariaLabel="Glyph actions"
          testId={`${testId}-menu`}
          className={`absolute right-0 z-50 ${
            menuFlip ? "bottom-full mb-2xs" : "top-full mt-2xs"
          } min-w-[132px] rounded-sm border border-hairline bg-paper p-1 shadow-pop`}
        />
      </div>

      {/* row 2 — scale */}
      <div className="flex justify-start px-2xs py-2xs">
        <DragNumber
          value={scale}
          min={SCALE_MIN}
          max={SCALE_MAX}
          step={SCALE_STEP}
          mapping="geometric"
          onChange={(v) => onPreview({ scale: v })}
          onCommit={onCommitScale}
          label="Glyph scale"
          format={SCALE_FORMAT}
          parse={SCALE_PARSE}
          slotWidth="4ch"
          testId={`${testId}-scale`}
        />
      </div>

      {/* row 3 — angle */}
      <div className="flex justify-start border-t border-hairline px-2xs py-2xs">
        <DragDial
          value={angle}
          onChange={(v) => onPreview({ angle: v })}
          onCommit={onCommitAngle}
          onOpen={() => setDialOpen((o) => !o)}
          open={dialOpen}
          label="Glyph angle"
          testId={`${testId}-dial`}
        />
      </div>
    </div>
  );

  return (
    <>
      {createPortal(card, document.body)}
      {dialOpen && (
        <AngleFlyout
          cardRef={cardRef}
          glyphRect={glyphRect}
          angle={angle}
          onPreview={onPreview}
          onCommit={onCommitAngle}
          onClose={() => setDialOpen(false)}
          testId={`${testId}-flyout`}
        />
      )}
    </>
  );
}

/* ----------------------------------------------------------- angle flyout */

function AngleFlyout({ cardRef, glyphRect, angle, onPreview, onCommit, onClose, testId }) {
  const ref = useRef(null);
  const [anchor, setAnchor] = useState(null);

  // The flyout hangs off the CARD, and dodges the GLYPH. Re-read every render
  // so a card that moves takes its flyout with it; `setAnchor` returns the
  // previous object when nothing moved, so this settles after one pass.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor((prev) =>
      prev && prev.top === r.top && prev.left === r.left && prev.bottom === r.bottom
        ? prev
        : { top: r.top, left: r.left, right: r.right, bottom: r.bottom },
    );
  });

  const pos = usePlacement(ref, anchor, glyphRect, true);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const el = ref.current;
    el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The disclosure relationship the slider cannot carry in ARIA: a labelled
  // dialog that takes focus when it opens.
  useEffect(() => {
    ref.current?.querySelector('[role="slider"]')?.focus();
  }, []);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Glyph angle"
      data-testid={testId}
      data-glyph-surface=""
      data-flipped={pos?.flipped || undefined}
      data-dodged={pos?.dodged || undefined}
      style={{
        position: "fixed",
        top: pos ? pos.top : -9999,
        left: pos ? pos.left : -9999,
        visibility: pos ? "visible" : "hidden",
      }}
      className="pointer-events-auto z-[85] flex flex-col items-center gap-2xs rounded-sm border border-hairline bg-paper px-xs py-2xs shadow-pop"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <AngleDial
        label="Absolute bearing"
        value={angle}
        min={0}
        max={360}
        step={1}
        wrap
        onChange={(v) => onPreview({ angle: v })}
        onCommit={onCommit}
      />
    </div>,
    document.body,
  );
}
