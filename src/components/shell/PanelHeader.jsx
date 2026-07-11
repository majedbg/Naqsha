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
import { DEFAULT_PREVIEW_MATERIALS } from "../../lib/materialPreview";
import ConfirmDialog from "../ui/ConfirmDialog";
import RowMenu from "./RowMenu";

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

// The ⋯ trigger glyph — three horizontal dots, matching the LayerRow overflow
// affordance. Decorative; the button carries the accessible name.
function MoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
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
  canDuplicate = false,
  canClearLayers = false,
  // Tooltip shown on a disabled Duplicate item. LayerTree (P6) threads the
  // precise reason ("Max 3 panels per document" vs "Not enough layer slots to
  // duplicate"); this generic default covers isolated/test use.
  duplicateDisabledReason = "Can't duplicate — panel or layer cap reached",
  onUpdatePanel,
  onDeletePanel,
  onDuplicatePanel,
  onClearPanelLayers,
  onAssignLayerToPanel,
  // The preview-material catalog the per-panel Material select offers. Defaults
  // to the built-in set (no org context in Studio yet — same default as
  // useColorView); org materials can drop in later via this prop.
  materials = DEFAULT_PREVIEW_MATERIALS,
}) {
  // The ⋯ options menu is self-owned (P5 locked decision): PanelHeader holds the
  // open/close state and renders <RowMenu /> itself, anchored in a relative
  // wrapper so RowMenu's `absolute right-0` panel lines up under the trigger.
  const [menuOpen, setMenuOpen] = useState(false);
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

  // Clear-all-layers confirm — a separate danger dialog (no "delete layers too?"
  // checkbox; the action IS the layer removal). Disabled-gating lives on the
  // menu item via RowMenu's clearLayersDisabled, so this only opens when allowed.
  const [clearing, setClearing] = useState(false);
  const confirmClear = () => {
    setClearing(false);
    onClearPanelLayers?.(panel.id);
  };


  const substrate = panel.substrate || {};

  // The panel's own catalog material, if chosen (null = Auto → follow the
  // canvas-level Material lens). Drives the summary chip label + swatch and the
  // editor's Material select below.
  const panelMaterial =
    (panel.materialId && (materials || []).find((m) => m && m.id === panel.materialId)) || null;

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

        {/* Substrate summary — click toggles the substrate editor. When the panel
            has its own material, the chip leads with a swatch dot + the material
            name so the per-panel stock reads at a glance. */}
        <button
          type="button"
          aria-expanded={editorOpen}
          title={`Edit substrate — ${panelMaterial ? panelMaterial.name : substrateSummary(substrate)}`}
          onClick={() => onToggleEditor?.(panel.id)}
          className="flex shrink-0 items-center gap-1 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-[10px] text-ink-soft hover:text-ink"
        >
          {panelMaterial && (
            <span
              data-testid="panel-material-swatch"
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full border border-hairline"
              style={{ backgroundColor: panelMaterial.hex }}
            />
          )}
          {panelMaterial
            ? `${panelMaterial.name}${substrate.thickness != null ? ` · ${substrate.thickness}mm` : ""}`
            : substrateSummary(substrate)}
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

        {/* ⋯ options menu — folds Rename · Duplicate · Clear all layers · Delete.
            The relative wrapper anchors RowMenu's `absolute right-0` panel. */}
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Panel options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Panel options"
            onClick={() => setMenuOpen((o) => !o)}
            className="text-ink-soft hover:text-ink"
          >
            <MoreIcon />
          </button>
          <RowMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            onRename={beginEdit}
            onDuplicate={() => onDuplicatePanel?.(panel.id)}
            duplicateDisabled={!canDuplicate}
            duplicateTitle={!canDuplicate ? duplicateDisabledReason : undefined}
            onClearLayers={() => setClearing(true)}
            clearLayersDisabled={!canClearLayers}
            clearLayersLabel="Clear all layers"
            clearLayersTitle={
              !canClearLayers ? "Document needs at least one layer" : undefined
            }
            onDelete={openDelete}
            deleteDisabled={!canDelete}
            deleteTitle={!canDelete ? "Can't delete the only panel" : undefined}
          />
        </div>
      </div>

      {/* Substrate editor (single-open, owned by LayerTree via editorOpen). */}
      {editorOpen && (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-2 py-1.5">
          {/* Per-panel material — the panel's OWN stock for the 3D preview.
              "Auto" (null) follows the canvas-level Material lens, the
              pre-per-panel behavior; a concrete choice overrides it for this
              panel only. Commits through onUpdatePanel like every panel edit,
              so it persists + undoes with the rest of the panel. */}
          <label className="flex w-full items-center gap-1 text-[10px] text-ink-soft">
            Material
            <select
              aria-label="Panel material"
              value={panel.materialId || ""}
              onChange={(e) => onUpdatePanel?.(panel.id, { materialId: e.target.value || null })}
              className="min-w-0 flex-1 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-xs text-ink outline-none"
            >
              <option value="">Auto (canvas material)</option>
              {(materials || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>

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

      {/* Clear-all-layers confirm — danger, no checkbox (the action is the wipe). */}
      <ConfirmDialog
        open={clearing}
        danger
        title={`Clear all layers on "${panel.name}"?`}
        confirmLabel="Clear"
        cancelLabel="Cancel"
        onConfirm={confirmClear}
        onCancel={() => setClearing(false)}
      />
    </div>
  );
}
