// GlyphPickerChip — the motif row's glyph picker (motif-shell, D; replaces
// the bare native <select> the audit flagged: users choose motifs by SHAPE,
// so the option representation must be the shape itself).
//
// Figma-instance-menu pattern: the CURRENT value renders as a thumbnail chip,
// and the chip itself is the picker's entry point — clicking it opens an
// anchored flyout with search, recents, set tabs, and a thumbnail grid.
// Click commits (one undo entry via the caller's existing rebind seam);
// Escape or outside-click closes without committing.
//
// The anchored FLYOUT body (positioning + portal + outside-click + escape +
// search / recents / set tabs / thumbnail grid) is extracted as the exported
// `GlyphPickerFlyout` so a second trigger — a Sequencer SLOT's glyph preview
// (Feature B, zoned Sequencer) — can reuse the exact same picker without
// duplicating the machinery. The chip owns only its trigger + open state +
// focus-return; the flyout owns everything anchored to that trigger. A slot
// caller passes `firstTile` to pin the slot's CURRENT glyph as tile #1 with a
// pencil "edit" badge (opens the pen editor) whose body-click just closes.
import { useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import GlyphThumb from "../ui/GlyphThumb";
import { getGlyph } from "../../lib/motif/glyphs";
import { buildGlyphEntries } from "../../lib/motif/glyphEntries";

const SETS = [
  { id: "all", label: "All" },
  { id: "builtin", label: "Built-in" },
  { id: "custom", label: "In document" },
  { id: "library", label: "My library" },
];

// Recents (Procreate lesson: the last few picks cover most picks). Device-
// local, not per-document — a picker convenience, not document state.
const RECENTS_KEY = "sonoform-recent-glyphs";
function readRecents() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTS_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function pushRecent(id) {
  try {
    const next = [id, ...readRecents().filter((x) => x !== id)].slice(0, 6);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* private mode — recents just stay session-blank */
  }
}

// House icon language (see EyeIcon in MotifLibraryPanel / LeftRailNav): crafted
// inline SVG, currentColor, hairline stroke. aria-hidden — the buttons/labels
// they sit in already carry accessible names.
function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
// The pencil "edit" badge that rides tile #1 (the slot's current glyph) — opens
// the pen editor for that slot. Same crafted-inline-SVG idiom as the chevron.
function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 6l4 4M4 20l1-4L16 5l3 3L8 19l-4 1z" />
    </svg>
  );
}

// ── the anchored flyout body (portal + positioning + outside-click + escape) ──
//
// Rendered by BOTH the row chip and a Sequencer slot's glyph preview. It owns
// no trigger — the caller passes `triggerRef` (the button it anchors to) and
// `rootRef` (the containing element outside-click treats as "inside"), plus
// `onRequestClose(restoreFocus)`. The caller mounts it only while open (so its
// mount-time positioning reads the trigger's live rect), and query / set-tab /
// recents state is local, resetting for free on unmount. `firstTile` (slot
// case) pins the current glyph as tile #1 with a pencil badge; its body-click
// just closes (it is already the current glyph).
export function GlyphPickerFlyout({
  onRequestClose,
  triggerRef,
  rootRef,
  flyoutId,
  glyphRef,
  customGlyphs,
  libraryMotifs,
  onPick,
  onManageLibrary,
  firstTile = null,
}) {
  const [query, setQuery] = useState("");
  const [set, setSet] = useState("all");
  const [pos, setPos] = useState(null);
  const flyoutRef = useRef(null);

  const entries = useMemo(
    () => buildGlyphEntries({ customGlyphs, libraryMotifs }),
    [customGlyphs, libraryMotifs]
  );
  const byId = useMemo(() => {
    const m = new Map();
    for (const e of entries) m.set(e.glyphId, e);
    return m;
  }, [entries]);

  // Read localStorage ONCE on open (the flyout mounts fresh each open, so a
  // mount-time memo never goes stale — recents only move on commit, which
  // closes the flyout). In the slot case the current glyph is pinned as tile #1,
  // so it is excluded from recents too — otherwise clicking it as a recent chip
  // would commit a same-value swap (a NEW slot object, not a no-op) and burn a
  // phantom undo entry, the exact trap tile #1's body-click-closes rule avoids.
  const currentTileId = firstTile?.glyphId;
  const recents = useMemo(
    () => readRecents().filter((id) => byId.has(id) && id !== currentTileId),
    [byId, currentTileId]
  );

  // Position the portaled flyout as position:fixed off the trigger's rect: flip
  // above when it would overflow the viewport bottom, clamp horizontally into
  // the viewport, and cap its height so it never exceeds the viewport even after
  // flipping (internal overflow-y-auto scrolls the rest). Recompute on mount and
  // on resize/scroll (scroll uses capture — the trigger lives inside the
  // inspector's own overflow-auto region, so scroll never reaches window).
  useLayoutEffect(() => {
    const recompute = () => {
      const t = triggerRef.current;
      if (!t) return;
      const rect = t.getBoundingClientRect();
      const EST = 320; // estimated flyout height — avoids a measure→reflow cycle
      const GAP = 4;
      const MARGIN = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.max(240, rect.width);
      const flip = rect.bottom + EST > vh;
      const left = Math.max(MARGIN, Math.min(rect.left, vw - width - MARGIN));
      setPos(
        flip
          ? {
              placement: "top",
              left,
              width,
              bottom: vh - rect.top + GAP,
              maxHeight: rect.top - GAP - MARGIN,
            }
          : {
              placement: "bottom",
              left,
              width,
              top: rect.bottom + GAP,
              maxHeight: vh - rect.bottom - GAP - MARGIN,
            }
      );
    };
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [triggerRef]);

  // Outside-click closes without committing (the flyout is not modal). With the
  // flyout portaled to <body>, its native events still bubble to window, so
  // containment must treat clicks inside EITHER the anchor (trigger/root) or the
  // portaled flyout as inside.
  useEffect(() => {
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (flyoutRef.current?.contains(e.target)) return;
      onRequestClose(true);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [rootRef, onRequestClose]);

  // Defer the query so each keystroke doesn't synchronously re-filter and
  // re-reconcile the whole thumbnail grid (useDeferredValue, not a manual
  // debounce — it stays act()-synchronous, so the existing search tests need no
  // fake timers). The filter is memoized on the entries / set tab / deferred
  // query so it recomputes only when one of those actually changes.
  const deferredQuery = useDeferredValue(query);
  const q = deferredQuery.trim().toLowerCase();
  const visible = useMemo(
    () =>
      entries.filter(
        (e) => (set === "all" || e.set === set) && (!q || e.name.toLowerCase().includes(q))
      ),
    [entries, set, q]
  );

  const commit = (entry) => {
    pushRecent(entry.glyphId);
    onPick(entry.payload);
    onRequestClose(true);
  };

  // Slot case: the current glyph is pinned as tile #1, so the remaining grid
  // excludes it (never a duplicate); the base grid marks the current entry with
  // a ring in place.
  const gridEntries = firstTile
    ? visible.filter((e) => e.glyphId !== firstTile.glyphId)
    : visible;

  return createPortal(
    <div
      ref={flyoutRef}
      data-testid="glyph-picker-flyout"
      id={flyoutId}
      role="dialog"
      aria-label="Choose a motif"
      data-placement={pos?.placement ?? "bottom"}
      onKeyDown={(e) => {
        // Escape closes from ANYWHERE in the flyout, not only the search input;
        // stopPropagation so an ancestor Escape handler doesn't also fire.
        if (e.key === "Escape") {
          e.stopPropagation();
          onRequestClose(true);
        }
      }}
      style={{
        position: "fixed",
        left: pos?.left,
        width: pos?.width,
        top: pos?.top,
        bottom: pos?.bottom,
        maxHeight: pos?.maxHeight,
      }}
      className="z-30 overflow-y-auto rounded-cell border border-hairline bg-paper p-2 shadow-pop"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search motifs…"
          aria-label="Search motifs"
          className="min-w-0 flex-1 rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs outline-none focus:border-ink-soft"
        />
        <button
          type="button"
          aria-label="Close picker"
          onClick={() => onRequestClose(true)}
          className="-my-2 -mr-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xs text-ink-soft hover:text-ink"
        >
          <CloseIcon />
        </button>
      </div>

      {recents.length > 0 && (
        <div className="mb-1.5 flex items-center gap-1">
          <span className="mr-0.5 text-2xs uppercase tracking-wider text-ink-soft">
            Recent
          </span>
          {recents.map((id) => (
            <button
              key={id}
              type="button"
              aria-label={byId.get(id).name}
              title={byId.get(id).name}
              onClick={() => commit(byId.get(id))}
              className="-m-1 flex min-h-11 min-w-11 items-center justify-center rounded-xs p-0.5 text-ink hover:bg-paper-warm"
            >
              <GlyphThumb glyph={byId.get(id).glyph} size={20} />
            </button>
          ))}
        </div>
      )}

      <div className="mb-1.5 flex flex-wrap gap-1">
        {SETS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={set === s.id}
            onClick={() => setSet(s.id)}
            className={`-my-2 inline-flex min-h-11 items-center rounded-full px-1.5 py-0.5 text-2xs transition-colors duration-fast ${
              set === s.id
                ? "bg-ink text-paper"
                : "text-ink-soft hover:bg-paper-warm hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid max-h-44 grid-cols-4 gap-1 overflow-y-auto">
        {/* Slot case — tile #1 is the slot's CURRENT glyph: marked current
            (ring), wearing a pencil badge (opens the pen editor). Clicking its
            BODY just closes (it's already the current glyph — never a swap, so
            no phantom undo entry). */}
        {firstTile && (
          <div
            data-testid="motif-slot-current"
            className="relative flex flex-col items-center justify-center gap-0.5 rounded-xs bg-paper-warm p-1 ring-1 ring-accent"
          >
            <button
              type="button"
              data-testid="motif-slot-edit-pen"
              aria-label="Edit glyph"
              title="Edit this slot's glyph"
              onClick={(e) => {
                e.stopPropagation();
                firstTile.onEdit();
              }}
              className="absolute left-0.5 top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-hairline bg-paper text-ink-soft hover:text-ink"
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              aria-label={`Current glyph — ${firstTile.name}`}
              title={firstTile.name}
              onClick={() => onRequestClose(true)}
              className="flex min-h-11 w-full flex-col items-center justify-center gap-0.5"
            >
              <GlyphThumb glyph={firstTile.glyph} size={26} className="text-ink" />
              <span className="w-full truncate text-center text-2xs text-ink-soft">
                {firstTile.name}
              </span>
            </button>
          </div>
        )}
        {gridEntries.map((e) => (
          <button
            key={e.key}
            type="button"
            data-testid={`glyph-option-${e.glyphId}`}
            title={e.name}
            onClick={() => commit(e)}
            className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xs p-1 transition-colors duration-fast hover:bg-paper-warm ${
              e.glyphId === glyphRef ? "bg-paper-warm ring-1 ring-accent" : ""
            }`}
          >
            <GlyphThumb glyph={e.glyph} size={26} className="text-ink" />
            <span className="w-full truncate text-center text-2xs text-ink-soft">
              {e.name}
            </span>
          </button>
        ))}
        {gridEntries.length === 0 && !firstTile && (
          <span className="col-span-4 py-3 text-center text-2xs text-ink-soft">
            No matches
          </span>
        )}
      </div>

      {onManageLibrary && (
        <div className="mt-1.5 border-t border-hairline pt-1.5">
          <button
            type="button"
            onClick={() => {
              // Intentionally does NOT restore focus to the trigger — the parent
              // moves the user into the library panel.
              onRequestClose(false);
              onManageLibrary();
            }}
            className="text-2xs text-accent hover:underline"
          >
            Manage library…
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}

export default function GlyphPickerChip({
  glyphRef,
  customGlyphs,
  libraryMotifs,
  onPick,
  onManageLibrary,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const flyoutId = useId();

  // Every close path routes through here so focus management stays in one place
  // (WCAG 2.4.3): the trigger reclaims focus on close — EXCEPT "Manage library",
  // which intentionally hands focus onward to the library panel (restoreFocus
  // false there).
  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const entries = useMemo(
    () => buildGlyphEntries({ customGlyphs, libraryMotifs }),
    [customGlyphs, libraryMotifs]
  );
  const byId = useMemo(() => {
    const m = new Map();
    for (const e of entries) m.set(e.glyphId, e);
    return m;
  }, [entries]);

  const current = useMemo(
    () => getGlyph(glyphRef, customGlyphs),
    [glyphRef, customGlyphs]
  );
  const currentEntry = useMemo(() => byId.get(glyphRef), [byId, glyphRef]);

  return (
    <div className="relative min-w-0 flex-1" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        data-testid="motif-glyph"
        data-glyph={glyphRef ?? ""}
        aria-label="Glyph"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={flyoutId}
        title="Swap motif"
        onClick={() => (open ? close() : setOpen(true))}
        className={`flex min-h-11 w-full items-center gap-2 rounded-xs border bg-paper px-1.5 py-1 text-left outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-violet ${
          open ? "border-accent/60" : "border-hairline hover:border-violet"
        }`}
      >
        <span className="shrink-0 rounded-xs border border-hairline bg-paper-warm p-0.5 text-ink">
          <GlyphThumb glyph={current} size={22} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-medium text-ink">
            {current?.name || glyphRef || "Missing glyph"}
          </span>
          <span className="truncate text-2xs uppercase tracking-wide text-ink-soft">
            {currentEntry ? SETS.find((s) => s.id === currentEntry.set)?.label : "not in library"}
          </span>
        </span>
        <span className="ml-auto shrink-0 text-ink-soft">
          <ChevronIcon />
        </span>
      </button>

      {open && (
        <GlyphPickerFlyout
          onRequestClose={close}
          triggerRef={triggerRef}
          rootRef={rootRef}
          flyoutId={flyoutId}
          glyphRef={glyphRef}
          customGlyphs={customGlyphs}
          libraryMotifs={libraryMotifs}
          onPick={onPick}
          onManageLibrary={onManageLibrary}
        />
      )}
    </div>
  );
}
