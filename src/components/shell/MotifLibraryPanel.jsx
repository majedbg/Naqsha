// MotifLibraryPanel — the left panel's "Motifs" surface (motif-shell, D).
//
// The app-level motif BROWSER (variant D of the 2026-07 prototypes,
// docs/motif-flow-audit-2026-07.md): a compact READ-ONLY layer tree on top
// (eye toggle only — the explicit drop target, per the agreed drop rules)
// and the library below it as a thumbnail-first grid with search + set tabs.
// Apply is drag: onto a mini-tree host row, or onto the canvas (Studio's
// MotifDropLayer handles that side; `dragHoverHostId` mirrors the canvas
// badge under the cursor into the mini tree for two-way validation).
//
// Data is real: Built-in = MOTIF_GLYPHS, Custom = the document's customGlyphs
// (minus library-keyed copies, same dedupe as MotifDevice), My library = the
// signed-in user's user_motifs rows. Deletes are guarded by glyphUseCount so
// a referenced glyph can never be removed into a dangling glyphRef.
import { useMemo, useRef, useState } from "react";
import GlyphThumb from "../ui/GlyphThumb";
import { isMotifLayer } from "../../lib/motif/motifLayer";
import { isMotifHost } from "../../lib/motif/hostKinds";
import { glyphUseCount } from "../../lib/motif/glyphUsage";
import { buildGlyphEntries } from "../../lib/motif/glyphEntries";

const SETS = [
  { id: "all", label: "All" },
  { id: "builtin", label: "Built-in" },
  { id: "custom", label: "In document" },
  { id: "library", label: "My library" },
];

const isEligibleHost = (l) => l && !isMotifLayer(l) && isMotifHost(l.patternType);

function EyeIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      {open ? (
        <>
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" opacity="0.35" />
          <line x1="4" y1="20" x2="20" y2="4" />
        </>
      )}
    </svg>
  );
}

// Compact read-only tree: name + eye only. Host rows are drop targets; while
// a drag is live, non-hosts dim and hosts get a dashed invitation outline.
function MiniLayerTree({
  layers,
  selectedLayerId,
  onUpdateLayer,
  motifDrag,
  dragHoverHostId,
  onDropOnLayer,
}) {
  const [rowHover, setRowHover] = useState(null);
  return (
    <div className="border-b border-hairline p-2" data-testid="motif-mini-tree">
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
        {motifDrag ? "Drop onto a layer" : "Layers"}
      </h3>
      <div className="max-h-40 space-y-0.5 overflow-y-auto">
        {(layers || []).map((layer) => {
          const host = isEligibleHost(layer);
          const highlighted = dragHoverHostId === layer.id || rowHover === layer.id;
          return (
            <div
              key={layer.id}
              data-testid={`mini-tree-row-${layer.id}`}
              onDragOver={(e) => {
                if (!host || !motifDrag) return;
                e.preventDefault();
                if (rowHover !== layer.id) setRowHover(layer.id);
              }}
              onDragLeave={() => setRowHover((h) => (h === layer.id ? null : h))}
              onDrop={(e) => {
                if (!host || !motifDrag) return;
                e.preventDefault();
                setRowHover(null);
                onDropOnLayer(layer.id);
              }}
              className={`flex items-center gap-1.5 rounded-xs border px-1.5 py-1 text-xs transition-colors duration-fast ${
                highlighted
                  ? "border-accent bg-saffron/20 text-ink"
                  : motifDrag && host
                    ? "border-dashed border-accent/50 text-ink"
                    : "border-transparent text-ink-soft"
              } ${layer.id === selectedLayerId ? "bg-paper-warm" : ""} ${
                motifDrag && !host ? "opacity-40" : ""
              }`}
            >
              <span className="w-4 shrink-0 text-center text-[9px] font-semibold uppercase">
                {(layer.patternType || "?").slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1 truncate">{layer.name || layer.patternType}</span>
              {host && (
                <span className="shrink-0 text-[8px] uppercase tracking-wide text-accent">host</span>
              )}
              <button
                type="button"
                aria-label={layer.visible ? "Hide layer" : "Show layer"}
                title={layer.visible ? "Hide layer" : "Show layer"}
                onClick={() => onUpdateLayer?.(layer.id, { visible: !layer.visible })}
                className="shrink-0 text-ink-soft hover:text-ink"
              >
                <EyeIcon open={layer.visible} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MotifLibraryPanel({
  layers,
  selectedLayerId,
  onUpdateLayer,
  customGlyphs,
  libraryMotifs,
  libraryError,
  motifDrag,
  onMotifDragChange,
  dragHoverHostId,
  onApplyToHost,
  onImportSvg,
  onDeleteCustomGlyph,
  onDeleteLibraryMotif,
}) {
  const [query, setQuery] = useState("");
  const [set, setSet] = useState("all");
  const fileInputRef = useRef(null);

  // One flat, set-tagged list — buildGlyphEntries is shared with the
  // device's GlyphPickerChip, so both surfaces agree on the copied-library-
  // motif dedupe. Panel-only affordances (delete) key off the set here.
  const entries = useMemo(
    () =>
      buildGlyphEntries({ customGlyphs, libraryMotifs }).map((e) => ({
        ...e,
        deletable: e.set === "custom",
        libraryRow: e.set === "library",
      })),
    [customGlyphs, libraryMotifs]
  );

  const q = query.trim().toLowerCase();
  const visible = entries.filter(
    (e) => (set === "all" || e.set === set) && (!q || e.name.toLowerCase().includes(q))
  );

  return (
    <div className="flex h-full flex-col" data-testid="motif-library-panel">
      <MiniLayerTree
        layers={layers}
        selectedLayerId={selectedLayerId}
        onUpdateLayer={onUpdateLayer}
        motifDrag={motifDrag}
        dragHoverHostId={dragHoverHostId}
        onDropOnLayer={(layerId) => {
          if (motifDrag) onApplyToHost(motifDrag, layerId);
          onMotifDragChange(null);
        }}
      />

      <div className="space-y-1.5 border-b border-hairline p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search motifs…"
          aria-label="Search motifs"
          className="w-full rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs outline-none focus:border-ink-soft"
        />
        <div className="flex flex-wrap gap-1">
          {SETS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={set === s.id}
              onClick={() => setSet(s.id)}
              className={`rounded-full px-1.5 py-0.5 text-[9px] transition-colors duration-fast ${
                set === s.id ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-warm hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {set === "library" && libraryError && (
          <p className="mb-2 rounded-xs border border-amber-400/50 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
            Library unavailable — sign in (or check the connection) to load your
            saved motifs.
          </p>
        )}
        <div className="grid grid-cols-3 gap-1.5">
          {visible.map((e) => {
            const useCount = e.deletable ? glyphUseCount(layers, e.glyphId) : 0;
            const canDelete =
              (e.deletable && useCount === 0 && onDeleteCustomGlyph) ||
              (e.libraryRow && onDeleteLibraryMotif);
            return (
              <div
                key={e.key}
                draggable
                onDragStart={(ev) => {
                  onMotifDragChange(e.payload);
                  ev.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={() => onMotifDragChange(null)}
                title={`${e.name} — drag onto a layer or the canvas`}
                className="group relative flex cursor-grab flex-col items-center gap-0.5 rounded-xs border border-transparent p-1 transition-colors duration-fast hover:border-hairline hover:bg-paper-warm active:cursor-grabbing"
              >
                <GlyphThumb glyph={e.glyph} size={30} className="text-ink" />
                <span className="w-full truncate text-center text-[8px] text-ink-soft">{e.name}</span>
                {e.deletable && useCount > 0 && (
                  <span
                    className="absolute right-0.5 top-0.5 rounded-full bg-paper-warm px-1 text-[7px] tabular-nums text-ink-soft"
                    title={`Referenced ${useCount}× in this document`}
                  >
                    {useCount}
                  </span>
                )}
                {canDelete && (
                  <button
                    type="button"
                    aria-label={`Delete ${e.name}`}
                    title={e.libraryRow ? "Remove from my library" : "Delete from document"}
                    onClick={() =>
                      e.libraryRow ? onDeleteLibraryMotif(e.glyphId) : onDeleteCustomGlyph(e.glyphId)
                    }
                    className="absolute right-0.5 top-0.5 hidden rounded-full bg-paper px-1 text-[9px] text-ink-soft hover:text-red-500 group-hover:block"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="col-span-3 py-4 text-center text-[10px] text-ink-soft">
              {q ? "No matches." : "Nothing here yet — import an SVG below."}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-hairline p-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".svg,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onImportSvg(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-[10px] text-accent hover:underline"
        >
          Import SVG…
        </button>
        <span className="ml-auto text-[9px] text-ink-soft">
          Drag a motif onto a host layer
        </span>
      </div>
    </div>
  );
}
