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
function OperationChip({ layer, operations, onAssignOperation }) {
  const op = resolveOperation(operations, layer.operationId);
  const color = op?.color ?? "#000000";
  const name = op?.name ?? "—";
  const [open, setOpen] = useState(false);
  const canPick = Array.isArray(operations) && operations.length > 0 && !!onAssignOperation;

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

function LayerRow({ layer, index, total, selected, operations, onSelect, onUpdateLayer, onReorderLayers, onAssignOperation }) {
  const move = (to) => {
    if (to < 0 || to >= total) return;
    onReorderLayers(index, to);
  };
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
          disabled={index === 0}
          onClick={(e) => { e.stopPropagation(); move(index - 1); }}
          className="leading-none disabled:opacity-25 hover:text-ink"
        >
          <svg width="10" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 15 12 9 18 15" /></svg>
        </button>
        <button
          type="button"
          aria-label="Move layer down"
          disabled={index === total - 1}
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
      <OperationChip layer={layer} operations={operations} onAssignOperation={onAssignOperation} />

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
          />
        ))}
      </div>
    </div>
  );
}
