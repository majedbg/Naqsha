// LayerTree — the pro shell's left object-tree column (Lane B / B2, issue #5).
//
// One compact row per layer carrying: visibility toggle, lock, drag handle
// (reorder), pattern-type icon, and an operation chip (color + name resolved
// THROUGH the document operation library). A machine-profile selector is pinned
// at the TOP of the column; switching it sets the document's active profile and
// re-maps the operation library (so chip colors update — laser locks
// cut/score/engrave to convention, plotter/drag leave them editable).
//
// This is NOT LayerCard: that card's full chrome (rename / seed / duplicate /
// param body) belongs to the inspector + operations panel, not this tree. We
// reuse the *behaviors* (onUpdateLayer for visibility/lock, onReorderLayers for
// order) and the visibility SVG, composed into a slim Figma-style row.
//
// Selection is driven by props: clicking a row calls onSelectLayer(id); the
// hosted Studio feeds that id to the Inspector. The operation chip's click is a
// documented NO-OP stub here — the reassign picker is issue #11/C2; this slice
// only RENDERS the chip and updates it when `operationId` changes.

import { useState } from "react";
import { PATTERN_TYPES } from "../../constants";
import { resolveOperation } from "../../lib/operations";
import { PROFILE_IDS, getProfile } from "../../lib/machineProfiles";
import OperationPicker from "./OperationPicker";

// Human label for a pattern type (falls back to the raw id for AI / extras /
// import layers not in the static table).
function patternLabel(patternType) {
  return PATTERN_TYPES.find((p) => p.id === patternType)?.label ?? patternType;
}

// Eye / eye-off icons mirror LayerCard's visibility control so the tree reads the
// same as the legacy panel.
function EyeIcon({ open }) {
  return open ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function LockIcon({ locked }) {
  return locked ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 019.9-1" />
    </svg>
  );
}

// Generic pattern-type glyph (a small node mark). The tree shows it as a type
// affordance per row; a per-pattern icon set is out of scope for #5.
function PatternIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// The operation chip: a color swatch + name, resolved from the layer's
// operationId through the document operation library. Reflects the assigned
// operation and updates when `operationId` (or the library) changes. Clicking it
// opens the OperationPicker and reassigns THIS row's layer (#11/C2). The click is
// kept from bubbling so opening the picker never also selects the row.
function OperationChip({ layer, operations, onAssignOperation, disabled = false }) {
  const op = resolveOperation(operations, layer.operationId);
  const color = op?.color ?? "#000000";
  const name = op?.name ?? "—";
  const [open, setOpen] = useState(false);
  const canPick =
    !disabled && Array.isArray(operations) && operations.length > 0 && !!onAssignOperation;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        data-testid="operation-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Operation: ${name}`}
        onClick={(e) => {
          e.stopPropagation();
          if (canPick) setOpen((v) => !v);
        }}
        className="flex items-center gap-1 rounded-xs border border-hairline bg-paper-warm px-1 py-0.5 text-[10px] text-ink-soft"
      >
        <span
          data-chip-swatch
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] border border-hairline"
          style={{ backgroundColor: color }}
        />
        <span className="truncate">{name}</span>
      </button>
      {open && canPick && (
        <>
          {/* Click-away; stop propagation so dismissing never selects the row. */}
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          />
          <div className="absolute right-0 top-full" onClick={(e) => e.stopPropagation()}>
            <OperationPicker
              operations={operations}
              open
              activeOperationId={layer.operationId}
              onSelect={(operationId) => {
                onAssignOperation(layer.id, operationId);
                setOpen(false);
              }}
              onClose={() => setOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}

// Small inline glyphs for the re-homed per-row actions. Kept stroke-only to match
// the visibility/lock icons already in this row.
function DuplicateIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function RandomizeIcon() {
  // A small die mark — the legacy "randomize seed" affordance.
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="16" cy="16" r="1" fill="currentColor" />
      <circle cx="16" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}
function RandomizeParamsIcon() {
  // A sliders mark — distinguishes "randomize the checked PARAMS" from the die
  // (randomize seed) above.
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}
function ExportIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function LayerRow({ layer, index, total, selected, operations, onSelect, onUpdateLayer, onReorderLayers, onAssignOperation, onDeleteLayer, onDuplicateLayer, onRandomizeLayer, onRandomizeLayerParams, onExportLayer }) {
  // Full lock enforcement: a locked layer is protected from edits. Its mutating
  // row actions (reorder, randomize, duplicate, export, delete) and operation
  // reassignment are disabled; only the visibility toggle and the lock/unlock
  // button stay live (so it can still be hidden or unlocked), and the row stays
  // selectable (the inspector shows it read-only with an unlock affordance).
  const locked = !!layer.locked;
  const move = (to) => {
    if (locked || to < 0 || to >= total) return;
    onReorderLayers(index, to);
  };
  // A per-row action button: stops propagation so triggering the action never
  // also selects the row (matching the visibility/lock toggles already here).
  // Rendered only when the corresponding handler is supplied, so LayerTree stays
  // back-compatible with callers (and existing tests) that don't pass them.
  // Disabled (not hidden) when the layer is locked, so the affordance is visibly
  // unavailable rather than vanishing.
  const action = (handler, label, Icon, danger = false) =>
    handler ? (
      <button
        type="button"
        aria-label={label}
        title={locked ? `${label} (layer locked)` : label}
        disabled={locked}
        onClick={(e) => { e.stopPropagation(); if (!locked) handler(layer.id); }}
        className={`shrink-0 text-ink-soft disabled:opacity-30 disabled:cursor-not-allowed ${danger ? "hover:text-red-500" : "hover:text-ink"}`}
      >
        <Icon />
      </button>
    ) : null;
  return (
    <div
      data-testid="layer-row"
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect(layer.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(layer.id);
        }
      }}
      className={`flex items-center gap-1.5 rounded-xs px-1.5 py-1 cursor-pointer transition-colors duration-fast ${
        selected ? "bg-muted" : "hover:bg-paper-warm"
      }`}
    >
      {/* Drag handle (reorder). Native DnD is finicky in jsdom; the handle wraps
          up/down stepping over onReorderLayers(from,to) so the order behavior is
          testable and keyboard-reachable. */}
      <span data-testid="drag-handle" className="flex flex-col text-ink-soft/60 shrink-0" aria-label="Reorder layer">
        <button
          type="button"
          aria-label="Move layer up"
          disabled={index === 0 || locked}
          onClick={(e) => { e.stopPropagation(); move(index - 1); }}
          className="leading-none disabled:opacity-25 hover:text-ink"
        >
          <svg width="10" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 15 12 9 18 15" /></svg>
        </button>
        <button
          type="button"
          aria-label="Move layer down"
          disabled={index === total - 1 || locked}
          onClick={(e) => { e.stopPropagation(); move(index + 1); }}
          className="leading-none disabled:opacity-25 hover:text-ink"
        >
          <svg width="10" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
      </span>

      {/* Pattern-type icon */}
      <span className="text-ink-soft shrink-0" title={patternLabel(layer.patternType)}>
        <PatternIcon />
      </span>

      {/* Name */}
      <span className="flex-1 min-w-0 truncate text-xs text-ink">{layer.name}</span>

      {/* Operation chip */}
      <OperationChip layer={layer} operations={operations} onAssignOperation={onAssignOperation} disabled={locked} />

      {/* Visibility toggle */}
      <button
        type="button"
        aria-label={layer.visible ? "Hide layer" : "Show layer"}
        title={layer.visible ? "Hide layer" : "Show layer"}
        onClick={(e) => { e.stopPropagation(); onUpdateLayer(layer.id, { visible: !layer.visible }); }}
        className="shrink-0 text-ink-soft hover:text-ink"
      >
        <EyeIcon open={layer.visible} />
      </button>

      {/* Lock toggle (newly introduced — no prior `locked` field) */}
      <button
        type="button"
        aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
        title={layer.locked ? "Unlock layer" : "Lock layer"}
        onClick={(e) => { e.stopPropagation(); onUpdateLayer(layer.id, { locked: !layer.locked }); }}
        className="shrink-0 text-ink-soft hover:text-ink"
      >
        <LockIcon locked={!!layer.locked} />
      </button>

      {/* Re-homed per-row actions (#16 AC2): randomize seed, duplicate, export,
          delete — each wired to the surviving useLayers / export handler. Only
          rendered when the handler is supplied. */}
      {action(onRandomizeLayer, "Randomize layer", RandomizeIcon)}
      {action(onRandomizeLayerParams, "Randomize layer params", RandomizeParamsIcon)}
      {action(onDuplicateLayer, "Duplicate layer", DuplicateIcon)}
      {action(onExportLayer, "Export layer", ExportIcon)}
      {action(onDeleteLayer, "Delete layer", TrashIcon, true)}
    </div>
  );
}

export default function LayerTree({
  layers = [],
  operations = [],
  profileId,
  selectedLayerId,
  onSelectLayer,
  onUpdateLayer,
  onReorderLayers,
  onProfileChange,
  onAssignOperation,
  // Re-homed per-layer + header actions (#16 AC2). All optional so the tree stays
  // back-compatible with callers/tests that don't supply them.
  onDeleteLayer,
  onDuplicateLayer,
  onRandomizeLayer,
  onRandomizeLayerParams,
  onExportLayer,
  onRandomizeAll,
  onRandomizeAllParams,
  // Add-layer affordance (#new). When supplied, a dashed "+ New" row is pinned
  // below the list; clicking it opens the document's pattern picker. `addDisabled`
  // greys it out at the tier's layer cap so the click can't silently no-op.
  onAddLayer,
  addDisabled = false,
}) {
  return (
    <div className="flex h-full flex-col" data-testid="layer-tree">
      {/* Machine-profile selector — pinned at the TOP of the column. */}
      <div className="shrink-0 border-b border-hairline p-2">
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink-soft mb-1">
          Machine
        </label>
        <select
          aria-label="Machine profile"
          value={profileId}
          onChange={(e) => onProfileChange(e.target.value)}
          className="w-full rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs text-ink outline-none focus:border-violet"
        >
          {PROFILE_IDS.map((id) => (
            <option key={id} value={id}>
              {getProfile(id).label}
            </option>
          ))}
        </select>
      </div>

      {/* Re-homed randomize-all header actions (#16 AC2). The legacy
          LayersSection header offered "Rand Seeds" / "Rand Params" across every
          layer; they re-home here as tree-header actions wired to the surviving
          randomizeAll / randomizeAllParams. Only shown when supplied. */}
      {(onRandomizeAll || onRandomizeAllParams) && (
        <div className="shrink-0 flex items-center justify-end gap-3 border-b border-hairline px-2 py-1">
          {onRandomizeAllParams && (
            <button
              type="button"
              aria-label="Randomize all params"
              title="Randomize all checked params across every layer"
              onClick={onRandomizeAllParams}
              className="text-[11px] text-ink-soft hover:text-saffron transition-colors"
            >
              Rand Params
            </button>
          )}
          {onRandomizeAll && (
            <button
              type="button"
              aria-label="Randomize all seeds"
              title="Randomize seeds for every layer"
              onClick={onRandomizeAll}
              className="text-[11px] text-ink-soft hover:text-saffron transition-colors"
            >
              Rand Seeds
            </button>
          )}
        </div>
      )}

      {/* Layer rows (top = front, matching the legacy panel's ordering). */}
      <div className="flex-1 overflow-auto p-1.5 space-y-0.5">
        {layers.map((layer, i) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            index={i}
            total={layers.length}
            selected={layer.id === selectedLayerId}
            operations={operations}
            onSelect={onSelectLayer}
            onUpdateLayer={onUpdateLayer}
            onReorderLayers={onReorderLayers}
            onAssignOperation={onAssignOperation}
            onDeleteLayer={onDeleteLayer}
            onDuplicateLayer={onDuplicateLayer}
            onRandomizeLayer={onRandomizeLayer}
            onRandomizeLayerParams={onRandomizeLayerParams}
            onExportLayer={onExportLayer}
          />
        ))}

        {/* "+ New" add-layer row — sits directly BELOW the last layer (inside the
            scroll list, not pinned to the column's bottom) so it's always near the
            layers, never stranded at the foot of a tall empty column. Opens the
            pattern picker (the periodic table) via onAddLayer. Disabled at the
            tier's layer cap. Only rendered when a handler is supplied, so the tree
            stays back-compatible with callers/tests that don't pass it. */}
        {onAddLayer && (
          <button
            type="button"
            data-testid="layer-add-row"
            aria-label="New layer"
            title={addDisabled ? "Layer limit reached" : "New layer — choose a pattern"}
            disabled={addDisabled}
            onClick={() => onAddLayer()}
            className={`flex w-full items-center gap-1.5 rounded-xs border border-dashed border-hairline px-1.5 py-1.5 text-xs text-ink-soft transition-colors duration-fast ${
              addDisabled
                ? "opacity-40 cursor-not-allowed"
                : "hover:border-violet hover:text-ink hover:bg-paper-warm cursor-pointer"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="flex-1 text-left">New</span>
          </button>
        )}
      </div>
    </div>
  );
}
