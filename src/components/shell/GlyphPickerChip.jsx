// GlyphPickerChip — the motif row's glyph picker (motif-shell, D; replaces
// the bare native <select> the audit flagged: users choose motifs by SHAPE,
// so the option representation must be the shape itself).
//
// Figma-instance-menu pattern: the CURRENT value renders as a thumbnail chip,
// and the chip itself is the picker's entry point — clicking it opens an
// anchored flyout with search, recents, set tabs, and a thumbnail grid.
// Click commits (one undo entry via the caller's existing rebind seam);
// Escape or outside-click closes without committing.
import { useEffect, useMemo, useRef, useState } from "react";
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
  const rootRef = useRef(null);

  const entries = useMemo(
    () => buildGlyphEntries({ customGlyphs, libraryMotifs }),
    [customGlyphs, libraryMotifs]
  );
  const byId = useMemo(() => {
    const m = new Map();
    for (const e of entries) m.set(e.glyphId, e);
    return m;
  }, [entries]);

  const current = getGlyph(glyphRef, customGlyphs);
  const currentEntry = byId.get(glyphRef);
  const recents = open ? readRecents().filter((id) => byId.has(id)) : [];

  // Outside-click closes without committing (the flyout is not modal).
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const visible = entries.filter(
    (e) => (set === "all" || e.set === set) && (!q || e.name.toLowerCase().includes(q))
  );

  const commit = (entry) => {
    pushRecent(entry.glyphId);
    setOpen(false);
    setQuery("");
    onPick(entry.payload);
  };

  return (
    <div className="relative min-w-0 flex-1" ref={rootRef}>
      <button
        type="button"
        data-testid="motif-glyph"
        data-glyph={glyphRef ?? ""}
        aria-label="Glyph"
        aria-expanded={open}
        title="Swap motif"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-xs border bg-paper px-1.5 py-1 text-left outline-none transition-colors duration-fast ${
          open ? "border-accent/60" : "border-hairline hover:border-violet"
        }`}
      >
        <span className="shrink-0 rounded-xs border border-hairline bg-paper-warm p-0.5 text-ink">
          <GlyphThumb glyph={current} size={22} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[11px] font-medium text-ink">
            {current?.name || glyphRef || "Missing glyph"}
          </span>
          <span className="truncate text-[8px] uppercase tracking-wide text-ink-soft">
            {currentEntry ? SETS.find((s) => s.id === currentEntry.set)?.label : "not in library"}
          </span>
        </span>
        <span className="ml-auto shrink-0 text-[10px] text-ink-soft" aria-hidden="true">
          ⌄
        </span>
      </button>

      {open && (
        <div
          data-testid="glyph-picker-flyout"
          className="absolute left-0 right-0 top-full z-30 mt-1 rounded-cell border border-hairline bg-paper p-2 shadow-lg"
        >
          <div className="mb-1.5 flex items-center gap-1.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
              placeholder="Search motifs…"
              aria-label="Search motifs"
              className="min-w-0 flex-1 rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs outline-none focus:border-ink-soft"
            />
            <button
              type="button"
              aria-label="Close picker"
              onClick={() => setOpen(false)}
              className="shrink-0 text-xs text-ink-soft hover:text-ink"
            >
              ✕
            </button>
          </div>

          {recents.length > 0 && (
            <div className="mb-1.5 flex items-center gap-1">
              <span className="mr-0.5 text-[9px] uppercase tracking-wider text-ink-soft">
                Recent
              </span>
              {recents.map((id) => (
                <button
                  key={id}
                  type="button"
                  title={byId.get(id).name}
                  onClick={() => commit(byId.get(id))}
                  className="rounded-xs p-0.5 text-ink hover:bg-paper-warm"
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
                className={`rounded-full px-1.5 py-0.5 text-[9px] transition-colors duration-fast ${
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
                className={`flex flex-col items-center gap-0.5 rounded-xs p-1 transition-colors duration-fast hover:bg-paper-warm ${
                  e.glyphId === glyphRef ? "bg-paper-warm ring-1 ring-accent" : ""
                }`}
              >
                <GlyphThumb glyph={e.glyph} size={26} className="text-ink" />
                <span className="w-full truncate text-center text-[8px] text-ink-soft">
                  {e.name}
                </span>
              </button>
            ))}
            {visible.length === 0 && (
              <span className="col-span-4 py-3 text-center text-[10px] text-ink-soft">
                No matches
              </span>
            )}
          </div>

          {onManageLibrary && (
            <div className="mt-1.5 border-t border-hairline pt-1.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onManageLibrary();
                }}
                className="text-[10px] text-accent hover:underline"
              >
                Manage library…
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
