// GlyphPickerChip — the motif row's glyph picker (motif-shell, D; replaces
// the bare native <select> the audit flagged: users choose motifs by SHAPE,
// so the option representation must be the shape itself).
//
// Figma-instance-menu pattern: the CURRENT value renders as a thumbnail chip,
// and the chip itself is the picker's entry point — clicking it opens an
// anchored flyout with search, recents, set tabs, and a thumbnail grid.
// Click commits (one undo entry via the caller's existing rebind seam);
// Escape or outside-click closes without committing.
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

export default function GlyphPickerChip({
  glyphRef,
  customGlyphs,
  libraryMotifs,
  onPick,
  onManageLibrary,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [set, setSet] = useState("all");
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const flyoutRef = useRef(null);
  const flyoutId = useId();

  // Every close path routes through here so focus management stays in one place
  // (WCAG 2.4.3): the trigger reclaims focus on close — EXCEPT "Manage library",
  // which intentionally hands focus onward to the library panel (restoreFocus
  // false there).
  const close = (restoreFocus = true) => {
    setOpen(false);
    setQuery("");
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
  // Read localStorage ONCE per open (not on every render while the flyout is
  // open, as the old inline `open ? readRecents()… : []` did). Recomputes only
  // when the flyout opens or the pickable-set changes; recents themselves only
  // move on commit, which closes the flyout, so a per-open read never goes stale.
  const recents = useMemo(
    () => (open ? readRecents().filter((id) => byId.has(id)) : []),
    [open, byId]
  );

  // Position the portaled flyout as position:fixed off the trigger's rect: flip
  // above when it would overflow the viewport bottom, clamp horizontally into
  // the viewport, and cap its height so it never exceeds the viewport even after
  // flipping (internal overflow-y-auto scrolls the rest). Recompute on open and
  // on resize/scroll while open (scroll uses capture — the trigger lives inside
  // the inspector's own overflow-auto region, so scroll never reaches window).
  useLayoutEffect(() => {
    // When closed the flyout is unmounted, so we leave pos stale and recompute it
    // fresh on the next open (before paint) rather than setState-ing here.
    if (!open) return undefined;
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
  }, [open]);

  // Outside-click closes without committing (the flyout is not modal). With the
  // flyout portaled to <body>, its native events still bubble to window, so
  // containment must treat clicks inside EITHER the chip (trigger) or the
  // portaled flyout as inside — DOM ancestry of the chip alone no longer covers
  // the flyout.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (flyoutRef.current?.contains(e.target)) return;
      close();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

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
    close(true);
  };

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

      {open && createPortal(
        <div
          ref={flyoutRef}
          data-testid="glyph-picker-flyout"
          id={flyoutId}
          role="dialog"
          aria-label="Choose a motif"
          data-placement={pos?.placement ?? "bottom"}
          onKeyDown={(e) => {
            // Escape closes from ANYWHERE in the flyout, not only the search
            // input; stopPropagation so an ancestor Escape handler doesn't also
            // fire on the same key.
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
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
              onClick={() => close()}
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
            {visible.map((e) => (
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
            {visible.length === 0 && (
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
                  // Intentionally does NOT restore focus to the trigger — the
                  // parent moves the user into the library panel.
                  close(false);
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
      )}
    </div>
  );
}
