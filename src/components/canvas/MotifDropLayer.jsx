// MotifDropLayer — canvas-side half of the motif drag-apply flow
// (motif-shell, D). Renders nothing until a library drag is live, then:
//
//   • a full-surface drop zone whose plain drop applies to the SELECTED host
//     (the agreed disambiguation rule — canvas layers overlap spatially, so
//     "what did I drop on" must be deterministic, not hit-tested), or
//     explains why not when the selection isn't a host;
//   • a per-host badge stack on the right edge — the precise targets. Hovering
//     a badge reports up via onHoverHost so the library panel's mini tree can
//     highlight the matching row (two-way validation).
//
// Also owns the confirmation/error toast for every apply path (drop, mini
// tree, cap failures), fed by Studio through `toast`.
import { isMotifLayer } from "../../lib/motif/motifLayer";
import { isMotifHost } from "../../lib/motif/hostKinds";

const isEligibleHost = (l) => l && !isMotifLayer(l) && isMotifHost(l.patternType);

export default function MotifDropLayer({
  motifDrag,
  layers,
  selectedLayerId,
  hoverHostId,
  onHoverHost,
  onDropOnHost,
  onDropOnCanvas,
  toast,
}) {
  const hosts = (layers || []).filter(isEligibleHost);
  const selected = (layers || []).find((l) => l.id === selectedLayerId) || null;
  const selectedIsHost = isEligibleHost(selected);

  return (
    <>
      {motifDrag && (
        <div
          data-testid="motif-drop-layer"
          className="absolute inset-0 z-30 border-2 border-dashed border-accent/60 bg-accent/5"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onDropOnCanvas();
          }}
        >
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-cell border border-hairline bg-paper px-3 py-1.5 text-xs font-medium text-accent shadow-sm">
            {selectedIsHost
              ? `Drop to apply ${motifDrag.glyph?.name || "motif"} to ${
                  selected.name || selected.patternType
                }`
              : "Drop on a host badge → (or select a grid / spiral / recursive layer)"}
          </div>

          <div className="absolute right-3 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-1.5">
            {hosts.map((h) => (
              <div
                key={h.id}
                data-testid={`motif-drop-badge-${h.id}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (hoverHostId !== h.id) onHoverHost(h.id);
                }}
                onDragLeave={() => onHoverHost(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDropOnHost(h.id);
                }}
                className={`rounded-cell border px-2 py-1 text-xs shadow-sm transition-colors duration-fast ${
                  hoverHostId === h.id
                    ? "border-accent bg-saffron text-ink"
                    : "border-hairline bg-paper text-ink-soft"
                } ${h.id === selectedLayerId ? "font-semibold" : ""}`}
              >
                → {h.name || h.patternType}
              </div>
            ))}
            {hosts.length === 0 && (
              <div className="rounded-cell border border-hairline bg-paper px-2 py-1 text-xs text-ink-soft shadow-sm">
                No motif-capable layers
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          data-testid="motif-toast"
          className="absolute left-1/2 top-14 z-40 -translate-x-1/2 rounded-cell border border-hairline bg-paper px-3 py-1.5 text-xs shadow-sm"
        >
          {toast.kind === "error" ? (
            <span className="text-red-500">{toast.text}</span>
          ) : (
            <span className="text-ink">{toast.text}</span>
          )}
        </div>
      )}
    </>
  );
}
