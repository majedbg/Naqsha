// PanelHeader — the collapsible header row above a panel's layers (WI-5, spec
// §6). A panel is a physical substrate (acrylic, plywood, …) that a subset of
// layers belongs to via `layer.panelId`. This header carries: a collapse
// chevron, the panel name (double-click → inline rename), a substrate summary
// (kind + thickness; click → substrate editor), a visibility toggle, and a
// delete control (danger ConfirmDialog with a "delete the layers too?" checkbox).
//
// It is a DROP TARGET: dropping a dragged layer row reassigns that layer to this
// panel via onAssignLayerToPanel(layerId, panel.id).
//
// Props-driven (handlers injected). The single-open substrate editor is owned by
// LayerTree (editorOpen + onToggleEditor) so only one panel editor is open at a
// time, mirroring the row-menu single-open pattern.

import { useState, useEffect, useRef } from "react";
import { SUBSTRATE_KINDS } from "../../lib/panels";
import ConfirmDialog from "../ui/ConfirmDialog";

function ChevronIcon({ collapsed }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      aria-hidden="true"
      className={`transition-transform duration-fast ${collapsed ? "-rotate-90" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

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

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

// A compact substrate summary string, e.g. "acrylic · 3mm". For the 'other'
// kind, prefer the free-text label when present.
function substrateSummary(substrate) {
  if (!substrate) return "—";
  const kind = substrate.kind === "other" && substrate.label ? substrate.label : substrate.kind;
  const thickness = substrate.thickness != null ? `${substrate.thickness}mm` : "";
  return thickness ? `${kind} · ${thickness}` : kind;
}

export default function PanelHeader({
  panel,
  layerCount = 0,
  collapsed = false,
  onToggleCollapse,
  editorOpen = false,
  onToggleEditor,
  canDelete = true,
  onUpdatePanel,
  onDeletePanel,
  onAssignLayerToPanel,
}) {
  // Inline rename — mirrors LayerRow's rename (§7). Commit trims + rejects empty.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(panel.name);
  const inputRef = useRef(null);

  const beginEdit = () => {
    setDraft(panel.name);
    setEditing(true);
  };
  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const commitName = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== panel.name) {
      onUpdatePanel?.(panel.id, { name: trimmed });
    }
    setEditing(false);
  };

  // Delete confirm + its "delete the layers too?" checkbox (controlled, default
  // unchecked).
  const [confirming, setConfirming] = useState(false);
  const [deleteLayers, setDeleteLayers] = useState(false);

  const openDelete = () => {
    setDeleteLayers(false);
    setConfirming(true);
  };
  const confirmDelete = () => {
    setConfirming(false);
    onDeletePanel?.(panel.id, { deleteLayers });
  };

  const substrate = panel.substrate || {};

  // The editor's `kind` is tracked locally so the 'other' → label-input reveal is
  // immediate, independent of whether the parent re-renders the panel prop (it
  // commits through onUpdatePanel either way). Re-syncs when the prop kind moves.
  const [editKind, setEditKind] = useState(substrate.kind || "acrylic");
  useEffect(() => {
    setEditKind(substrate.kind || "acrylic");
  }, [substrate.kind]);

  // Substrate editor commit — patch the whole substrate object so partial edits
  // preserve the rest.
  const patchSubstrate = (patch) => {
    onUpdatePanel?.(panel.id, { substrate: { ...substrate, ...patch } });
  };

  return (
    <div
      data-testid="panel-header"
      // Drop target: reassign a dragged layer to THIS panel. dragOver must
      // preventDefault so the drop fires.
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const layerId = e.dataTransfer?.getData("text/plain");
        if (layerId) onAssignLayerToPanel?.(layerId, panel.id);
      }}
      className="rounded-xs border border-hairline bg-paper-warm"
    >
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        {/* Collapse chevron */}
        <button
          type="button"
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
          onClick={() => onToggleCollapse?.(panel.id)}
          className="shrink-0 text-ink-soft hover:text-ink"
        >
          <ChevronIcon collapsed={collapsed} />
        </button>

        {/* Panel name — double-click enters inline rename. */}
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            aria-label="Panel name"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitName();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              }
            }}
            className="flex-1 min-w-0 rounded-xs border border-violet bg-paper px-1 py-0 text-xs font-semibold text-ink outline-none"
          />
        ) : (
          <span
            className="flex-1 min-w-0 truncate text-xs font-semibold text-ink"
            onDoubleClick={beginEdit}
          >
            {panel.name}
          </span>
        )}

        {/* Substrate summary — click toggles the substrate editor. */}
        <button
          type="button"
          aria-expanded={editorOpen}
          title={`Edit substrate — ${substrateSummary(substrate)}`}
          onClick={() => onToggleEditor?.(panel.id)}
          className="shrink-0 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-[10px] text-ink-soft hover:text-ink"
        >
          {substrateSummary(substrate)}
        </button>

        {/* Visibility toggle */}
        <button
          type="button"
          aria-label={panel.visible ? "Hide panel" : "Show panel"}
          title={panel.visible ? "Hide panel" : "Show panel"}
          onClick={() => onUpdatePanel?.(panel.id, { visible: !panel.visible })}
          className="shrink-0 text-ink-soft hover:text-ink"
        >
          <EyeIcon open={panel.visible} />
        </button>

        {/* Delete control — disabled when this is the only panel (always >= 1). */}
        <button
          type="button"
          aria-label="Delete panel"
          title={canDelete ? "Delete panel" : "Can't delete the only panel"}
          disabled={!canDelete}
          onClick={openDelete}
          className="shrink-0 text-ink-soft hover:text-tone-strong disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <TrashIcon />
        </button>
      </div>

      {/* Substrate editor (single-open, owned by LayerTree via editorOpen). */}
      {editorOpen && (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-2 py-1.5">
          <label className="flex items-center gap-1 text-[10px] text-ink-soft">
            Kind
            <select
              aria-label="Substrate kind"
              value={editKind}
              onChange={(e) => {
                setEditKind(e.target.value);
                patchSubstrate({ kind: e.target.value });
              }}
              className="rounded-xs border border-hairline bg-paper px-1 py-0.5 text-xs text-ink outline-none"
            >
              {SUBSTRATE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1 text-[10px] text-ink-soft">
            Thickness
            <input
              type="number"
              aria-label="Substrate thickness"
              value={substrate.thickness ?? ""}
              onChange={(e) => patchSubstrate({ thickness: Number(e.target.value) })}
              className="w-14 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-xs text-ink outline-none"
            />
          </label>

          <label className="flex items-center gap-1 text-[10px] text-ink-soft">
            Color
            <input
              type="color"
              aria-label="Substrate color"
              value={substrate.color || "#cccccc"}
              onChange={(e) => patchSubstrate({ color: e.target.value })}
              className="h-6 w-8 rounded-xs border border-hairline bg-paper p-0 outline-none"
            />
          </label>

          {editKind === "other" && (
            <label className="flex items-center gap-1 text-[10px] text-ink-soft">
              Label
              <input
                type="text"
                aria-label="Substrate label"
                value={substrate.label || ""}
                onChange={(e) => patchSubstrate({ label: e.target.value })}
                className="min-w-0 flex-1 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-xs text-ink outline-none"
              />
            </label>
          )}
        </div>
      )}

      {/* Delete confirm — danger, with a checkbox child to also drop the layers. */}
      <ConfirmDialog
        open={confirming}
        danger
        title={`Delete "${panel.name}"?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(false)}
      >
        <label className="mt-2xs flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            aria-label="Delete the layers on this panel too?"
            checked={deleteLayers}
            onChange={(e) => setDeleteLayers(e.target.checked)}
          />
          Delete the layers on this panel too?
        </label>
      </ConfirmDialog>
    </div>
  );
}
