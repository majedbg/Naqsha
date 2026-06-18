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

import { useState, useEffect, useRef } from "react";
import { PATTERN_TYPES } from "../../constants";
import { resolveOperation } from "../../lib/operations";
import { PROFILE_IDS, getProfile } from "../../lib/machineProfiles";
import OperationPicker from "./OperationPicker";
import RowMenu from "./RowMenu";
import ConfirmDialog from "../ui/ConfirmDialog";

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

// The operation chip (op-swatch, spec §3.1): a color swatch + the operation's
// uppercase INITIAL (Cut→C, Score→S, Engrave→E), resolved from the layer's
// operationId through the document operation library. The FULL operation name
// never shows inline — it lives in the swatch's hover `title` tooltip (and in the
// dropdown). Reflects the assigned operation and updates when `operationId` (or
// the library) changes. Clicking it opens the OperationPicker and reassigns THIS
// row's layer (#11/C2). The click is kept from bubbling so opening the picker
// never also selects the row.
function OperationChip({ layer, operations, onAssignOperation }) {
  const op = resolveOperation(operations, layer.operationId);
  const color = op?.color ?? "#000000";
  const name = op?.name ?? "—";
  const initial = name && name !== "—" ? name.charAt(0).toUpperCase() : "—";
  const [open, setOpen] = useState(false);
  const canPick = Array.isArray(operations) && operations.length > 0 && !!onAssignOperation;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        data-testid="operation-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Operation: ${name}`}
        title={name}
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
        <span className="tabular-nums">{initial}</span>
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

// The dice (🎲) glyph — "randomize PARAMS" for this layer (spec §5). Distinct
// from the legacy rand-SEED die, which is REMOVED entirely (§3.1).
function DiceIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="16" cy="16" r="1" fill="currentColor" />
      <circle cx="16" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="16" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}
// The ⋯ overflow trigger — opens this row's RowMenu (rename/duplicate/download/
// delete). The menu panel itself is RowMenu (WI-4); this is the caller-owned
// trigger.
function MoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

function LayerRow({
  layer, index, total, selected, operations, compact,
  onSelect, onUpdateLayer, onReorderLayers, onAssignOperation,
  onDeleteLayer, onDuplicateLayer, onRandomizeLayerParams, onExportLayer,
  menuOpen, onRequestMenu, onCloseMenu,
}) {
  const move = (to) => {
    if (to < 0 || to >= total) return;
    onReorderLayers(index, to);
  };

  // Inline rename state (spec §7). `editing` flips the name span to an <input>;
  // `draft` holds the in-progress text. Entering edit mode focuses + selects all
  // (so typing replaces). Commit (Enter/blur) trims and rejects empty/whitespace;
  // Esc reverts. Both double-click and ⋯→Rename funnel through `beginEdit`.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(layer.name);
  const inputRef = useRef(null);

  const beginEdit = () => {
    setDraft(layer.name);
    setEditing(true);
  };
  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== layer.name) {
      onUpdateLayer(layer.id, { name: trimmed, nameIsCustom: true });
    }
    setEditing(false);
  };
  const cancel = () => setEditing(false);

  // ConfirmDialog state, hoisted to the row so it survives the menu unmounting on
  // select (RowMenu fires its callback then closes). `confirm` ∈ null | "delete"
  // | "randomize".
  const [confirm, setConfirm] = useState(null);

  // A per-row inline action button (dice). Stops propagation so it never selects
  // the row. Rendered only when its handler is supplied.
  const requestRandomize = (e) => {
    e.stopPropagation();
    if (layer.locked) return; // dice is disabled on locked layers (no confirm).
    setConfirm("randomize");
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

      {/* Name — full-row click selects; DOUBLE-click enters inline rename (§7). */}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          aria-label="Layer name"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            else if (e.key === "Escape") { e.preventDefault(); cancel(); }
          }}
          className="flex-1 min-w-0 rounded-xs border border-violet bg-paper px-1 py-0 text-xs text-ink outline-none"
        />
      ) : (
        <span
          className="flex-1 min-w-0 truncate text-xs text-ink"
          onDoubleClick={(e) => { e.stopPropagation(); beginEdit(); }}
        >
          {layer.name}
        </span>
      )}

      {/* Operation chip (op-swatch) */}
      <OperationChip layer={layer} operations={operations} onAssignOperation={onAssignOperation} />

      {/* 🎲 dice — randomize PARAMS (§5). Disabled on a locked layer (no confirm).
          Hidden when `compact` (responsive §3.2). Only rendered with a handler. */}
      {onRandomizeLayerParams && !compact && (
        <button
          type="button"
          aria-label="Randomize layer params"
          title={layer.locked ? "Layer locked" : "Randomize parameters"}
          disabled={!!layer.locked}
          onClick={requestRandomize}
          className="shrink-0 text-ink-soft hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <DiceIcon />
        </button>
      )}

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

      {/* ⋯ overflow trigger + its RowMenu (WI-4). The trigger is caller-owned;
          LayerTree tracks ONE open menu id, so opening this row closes any other.
          Rename always available (needs only onUpdateLayer); duplicate/download/
          delete items are gated on their handlers. */}
      <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label="Row actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="More"
          // Keep the trigger's mousedown from reaching document: otherwise
          // RowMenu's mousedown click-away (WI-4) would pre-close the open menu a
          // beat before this click's toggle reopened it — so clicking ⋯ again
          // never closed it. Click-away elsewhere is unaffected.
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRequestMenu(layer.id); }}
          className="shrink-0 text-ink-soft hover:text-ink"
        >
          <MoreIcon />
        </button>
        <RowMenu
          open={menuOpen}
          onClose={onCloseMenu}
          onRename={beginEdit}
          onDuplicate={onDuplicateLayer ? () => onDuplicateLayer(layer.id) : undefined}
          onDownload={onExportLayer ? () => onExportLayer(layer.id) : undefined}
          onDelete={onDeleteLayer ? () => setConfirm("delete") : undefined}
        />
      </div>

      {/* Confirm dialogs — hoisted to the row so they outlive the menu closing
          on select. Wrapped so their (fixed-overlay) clicks never bubble up to
          the row's select handler. Randomize is NOT danger; Delete is danger,
          with truthful copy (there is no undo). */}
      <span onClick={(e) => e.stopPropagation()}>
        <ConfirmDialog
          open={confirm === "randomize"}
          title="Randomize parameters?"
          message="This overwrites the current values for this layer."
          confirmLabel="Randomize"
          cancelLabel="Cancel"
          onConfirm={() => { setConfirm(null); onRandomizeLayerParams?.(layer.id); }}
          onCancel={() => setConfirm(null)}
        />
        <ConfirmDialog
          open={confirm === "delete"}
          danger
          title={`Delete "${layer.name}"?`}
          message="This can't be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => { setConfirm(null); onDeleteLayer?.(layer.id); }}
          onCancel={() => setConfirm(null)}
        />
      </span>
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
  onRandomizeLayerParams,
  onExportLayer,
  onRandomizeAll,
  onRandomizeAllParams,
  // Responsive (spec §3.2): below a ~240px panel width the host passes
  // `compact` to hide the 🎲 dice. No container-query plugin is installed on this
  // Tailwind v3 build, so the panel width is threaded via this boolean (kept
  // testable in jsdom, which can't evaluate `@container`).
  compact = false,
}) {
  // One row menu open at a time: the tree owns the open-menu layer id (spec §4).
  const [openMenuId, setOpenMenuId] = useState(null);
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
            onRandomizeLayerParams={onRandomizeLayerParams}
            onExportLayer={onExportLayer}
            compact={compact}
            menuOpen={openMenuId === layer.id}
            onRequestMenu={(id) => setOpenMenuId((cur) => (cur === id ? null : id))}
            onCloseMenu={() => setOpenMenuId(null)}
          />
        ))}
      </div>
    </div>
  );
}
