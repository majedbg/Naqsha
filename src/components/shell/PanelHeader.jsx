// PanelHeader — the collapsible header row above a panel's layers (WI-5, spec
// §6). A panel is a physical substrate (acrylic, plywood, …) that a subset of
// layers belongs to via `layer.panelId`. This header carries: a collapse
// chevron, the panel name (double-click → inline rename), a MATERIAL chip
// (click → auto-collapsing stock picker), a THICKNESS chip (click → in/mm
// dropdown), a visibility toggle, and a ⋯ menu (which also reaches the
// substrate-details editor: kind / color / label).
//
// It is a DROP TARGET: dropping a dragged layer row reassigns that layer to this
// panel via onAssignLayerToPanel(layerId, panel.id).
//
// Props-driven (handlers injected). The single-open substrate-details editor is
// owned by LayerTree (editorOpen + onToggleEditor) so only one panel editor is
// open at a time; the material/thickness popovers are row-local (self-owned,
// like the ⋯ menu) and mutually exclusive within the row.

import { useState, useEffect, useRef } from "react";
import {
  SUBSTRATE_KINDS,
  INCH_THICKNESS_PRESETS,
  inchLabelForMm,
  thicknessChipLabel,
} from "../../lib/panels";
import { DEFAULT_PREVIEW_MATERIALS } from "../../lib/materialPreview";
import ConfirmDialog from "../ui/ConfirmDialog";
import RowMenu from "./RowMenu";

// Anchored dropdown shared by the row's material + thickness chips: dismisses on
// outside pointerdown (capture, so a click anywhere else closes it) and Escape —
// the MaterialPopover pattern (ColorViewControl), row-sized. Right-anchored like
// RowMenu so it never grows past the panel's clipped right edge.
function ChipPopover({ onClose, label, testid, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      aria-label={label}
      data-testid={testid}
      className="absolute right-0 top-full z-50 mt-1 w-52 rounded-sm border border-hairline bg-paper p-1.5 shadow-pop"
    >
      {children}
    </div>
  );
}

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
  // canvas-level Material lens). Drives the material chip's label + swatch.
  const panelMaterial =
    (panel.materialId && (materials || []).find((m) => m && m.id === panel.materialId)) || null;

  // Row-local popovers (material picker + thickness dropdown) — mutually
  // exclusive; each auto-collapses on selection, outside click, or Escape.
  const [materialOpen, setMaterialOpen] = useState(false);
  const [thicknessOpen, setThicknessOpen] = useState(false);
  // The thickness dropdown's unit tab. 'in' is the default stock naming (the
  // fresh 3mm panel reads "1/8 in"); the choice persists on the substrate.
  const thicknessUnit = substrate.thicknessUnit === "mm" ? "mm" : "in";
  // mm free-input draft — committed on Enter (single undo record), never per
  // keystroke. Re-seeded from the panel each time the dropdown opens.
  const [mmDraft, setMmDraft] = useState("");
  const openThickness = () => {
    setMaterialOpen(false);
    setMmDraft(String(Number.isFinite(substrate.thickness) ? substrate.thickness : 3));
    setThicknessOpen((o) => !o);
  };
  const commitMm = () => {
    const v = parseFloat(mmDraft);
    if (Number.isFinite(v) && v > 0) {
      patchSubstrate({ thickness: v, thicknessUnit: "mm" });
    }
  };

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

        {/* MATERIAL chip — click opens the stock picker; picking auto-collapses
            it. Shows a swatch dot + the material name, or "Auto" (follow the
            canvas-level Material lens). */}
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Panel material"
            aria-haspopup="listbox"
            aria-expanded={materialOpen}
            title={`Panel material — ${panelMaterial ? panelMaterial.name : `Auto (canvas material) · ${substrateSummary(substrate)}`}`}
            onClick={() => {
              setThicknessOpen(false);
              setMaterialOpen((o) => !o);
            }}
            className="flex items-center gap-1 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-[10px] text-ink-soft hover:text-ink"
          >
            {panelMaterial && (
              <span
                data-testid="panel-material-swatch"
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full border border-hairline"
                style={{ backgroundColor: panelMaterial.hex }}
              />
            )}
            <span className="max-w-[6.5rem] truncate">
              {panelMaterial ? panelMaterial.name : "Auto"}
            </span>
          </button>
          {materialOpen && (
            <ChipPopover
              onClose={() => setMaterialOpen(false)}
              label="Panel material options"
              testid="panel-material-popover"
            >
              <div role="listbox" aria-label="Panel material options" className="max-h-64 space-y-0.5 overflow-y-auto">
                <button
                  type="button"
                  role="option"
                  aria-selected={!panel.materialId}
                  onClick={() => {
                    onUpdatePanel?.(panel.id, { materialId: null });
                    setMaterialOpen(false);
                  }}
                  className={`flex w-full items-center gap-1.5 rounded-xs px-1.5 py-1 text-left text-[11px] ${!panel.materialId ? "bg-accent/15 text-ink" : "text-ink-soft hover:bg-paper-warm hover:text-ink"}`}
                >
                  <span aria-hidden className="h-3 w-3 shrink-0 rounded-[2px] border border-dashed border-ink-soft/50" />
                  Auto (canvas material)
                </button>
                {(materials || []).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={panel.materialId === m.id}
                    onClick={() => {
                      onUpdatePanel?.(panel.id, { materialId: m.id });
                      setMaterialOpen(false); // auto-collapse on pick
                    }}
                    className={`flex w-full items-center gap-1.5 rounded-xs px-1.5 py-1 text-left text-[11px] ${panel.materialId === m.id ? "bg-accent/15 text-ink" : "text-ink-soft hover:bg-paper-warm hover:text-ink"}`}
                  >
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-[2px] border border-hairline"
                      style={{ backgroundColor: m.hex }}
                    />
                    <span className="truncate">{m.name}</span>
                  </button>
                ))}
              </div>
            </ChipPopover>
          )}
        </div>

        {/* THICKNESS chip — same footprint as the material chip. Opens a
            dropdown with an in ↔ mm toggle: inches = the common acrylic
            increments (nominal metric equivalents stored, so 1/8 → 3mm);
            mm = a float input committed on Enter. Fresh panels read "1/8 in". */}
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Panel thickness"
            aria-haspopup="true"
            aria-expanded={thicknessOpen}
            title={`Panel thickness — ${thicknessChipLabel(substrate)}`}
            onClick={openThickness}
            className="rounded-xs border border-hairline bg-paper px-1 py-0.5 text-[10px] text-ink-soft hover:text-ink"
          >
            {thicknessChipLabel(substrate)}
          </button>
          {thicknessOpen && (
            <ChipPopover
              onClose={() => setThicknessOpen(false)}
              label="Panel thickness options"
              testid="panel-thickness-popover"
            >
              {/* Unit toggle — persists on the substrate so the chip keeps
                  reading in the unit the user works in. */}
              <div role="group" aria-label="Thickness unit" className="mb-1.5 flex gap-0.5">
                {["in", "mm"].map((u) => (
                  <button
                    key={u}
                    type="button"
                    aria-pressed={thicknessUnit === u}
                    onClick={() => patchSubstrate({ thicknessUnit: u })}
                    className={`flex-1 rounded-xs px-1.5 py-0.5 text-[10px] font-medium ${thicknessUnit === u ? "bg-accent/20 text-accent" : "text-ink-soft hover:bg-paper-warm hover:text-ink"}`}
                  >
                    {u}
                  </button>
                ))}
              </div>
              {thicknessUnit === "in" ? (
                <div className="grid grid-cols-3 gap-0.5">
                  {INCH_THICKNESS_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      aria-label={`${p.label} inch`}
                      aria-pressed={inchLabelForMm(substrate.thickness ?? 3) === p.label}
                      title={`${p.label} in (${p.mm}mm)`}
                      onClick={() => {
                        patchSubstrate({ thickness: p.mm, thicknessUnit: "in" });
                        setThicknessOpen(false);
                      }}
                      className={`rounded-xs border px-1 py-1 text-[11px] ${inchLabelForMm(substrate.thickness ?? 3) === p.label ? "border-violet/60 bg-accent/15 text-ink" : "border-hairline text-ink-soft hover:bg-paper-warm hover:text-ink"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              ) : (
                <label className="flex items-center gap-1 text-[10px] text-ink-soft">
                  Thickness
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    aria-label="Thickness in millimeters"
                    value={mmDraft}
                    onChange={(e) => setMmDraft(e.target.value)}
                    onBlur={commitMm}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitMm();
                        setThicknessOpen(false);
                      }
                    }}
                    className="w-16 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-xs text-ink outline-none"
                  />
                  mm
                </label>
              )}
            </ChipPopover>
          )}
        </div>

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

        {/* ⋯ options menu — folds Rename · Duplicate · Substrate details… ·
            Clear all layers · Delete. The relative wrapper anchors RowMenu's
            `absolute right-0` panel. */}
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
            onEditSubstrate={() => onToggleEditor?.(panel.id)}
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

      {/* Substrate-details editor (single-open, owned by LayerTree via
          editorOpen; opened from the ⋯ menu). Material + thickness moved onto
          the row chips — this keeps the remaining identity: kind / color /
          free-text label. */}
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
