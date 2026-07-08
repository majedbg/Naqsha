// OperationsPanel — the pro shell's LightBurn-style operations / cut-settings
// panel (Lane C / C1, GitHub issue #10). Lives in the shell's right-bottom
// region (portaled in by Studio).
//
// Lists the document operation library as COLUMNS (one per operation — Cut,
// Score, Engrave, ...), with the active machine's param fields (resolved from
// the machine-profile schema for `profileId` and the op's process — laser
// power/speed/passes, plotter pen #/pressure, drag-cutter force/blade/passes)
// laid out as shared ROWS beneath a single subheading each. That makes the
// panel read like a small table: skim across a row (e.g. POWER) to compare
// the same field across every operation, instead of hunting for it inside
// each operation's own repeated block. A single CSS grid (auto-flow: row, the
// default) drives the alignment — every cell is emitted in row-major DOM
// order, so browsers place them into columns/rows without any manual
// grid-row/grid-column bookkeeping.
//
// All mutations flow OUT through callbacks so the panel stays presentational and
// the parent (Studio) routes them through the undo/redo history:
//   - onAddOperation()                     — append a new operation
//   - onCommitOperations(ops => nextOps)   — reorder / recolor / param-edit /
//                                            remove, expressed as a pure mapper
//
// Reorder = cut order: moving a column left/right commits a reorderOperations()
// mapper, and operations.js reflows the `order` field to match list position.
//
// Color lock: when the active profile locks a process's color to convention
// (laser cut/score/engrave), the swatch is disabled and a "Locked" hint is
// surfaced; plotter/drag-cutter leave colors editable.

import {
  reorderOperations,
  recolorOperation,
  PROCESSES,
} from "../../lib/operations";
import { paramSchemaFor, lockedColorFor } from "../../lib/machineProfiles";
import { isBandOperation } from "../../lib/variableWeight";

// Update one operation's machineParams[key] immutably.
function setParam(ops, id, key, value) {
  return ops.map((o) =>
    o.id === id
      ? { ...o, machineParams: { ...o.machineParams, [key]: value } }
      : o
  );
}

// The union of param fields across every operation currently in the library,
// in first-seen order. In practice all ops sharing one profile also share one
// field schema (laser's cut/score/engrave all resolve to the same array), so
// this is just that schema — but a mixed-process future (or a mid-swap
// library) is handled gracefully: a field only some ops have still gets one
// shared row, with the other ops rendering an empty cell in it.
function collectFieldRows(operations, profileId) {
  const byKey = new Map();
  for (const op of operations) {
    for (const field of paramSchemaFor(profileId, op.process)) {
      if (!byKey.has(field.key)) byKey.set(field.key, field);
    }
  }
  return [...byKey.values()];
}

function OperationColumnHeader({
  op,
  index,
  total,
  profileId,
  onCommitOperations,
}) {
  // Variable-weight band ops keep their RESERVED spectrum colors — they are
  // exempt from the laser color-lock (#17 / #4 follow-up), so the swatch stays
  // editable and the "Locked" hint is suppressed for them.
  const locked =
    !isBandOperation(op) && lockedColorFor(profileId, op.process) !== null;
  // Default ops name themselves after their process ("Cut" / "cut"), which
  // rendered as a redundant title + uppercase subtitle. Only surface the
  // process as a separate tag when it adds information — i.e. the op was
  // renamed to something other than its process (an unnamed op shows it too).
  const showProcessTag = op.name.trim().toLowerCase() !== op.process.toLowerCase();

  const move = (to) => {
    if (to < 0 || to >= total) return;
    onCommitOperations((ops) => reorderOperations(ops, index, to));
  };

  return (
    <div
      data-testid="operation-column"
      className="flex min-w-0 flex-col items-center gap-1 rounded-xs border border-hairline bg-paper px-1 py-1.5 text-center"
    >
      {/* Reorder (cut order) · swatch, on one compact line. Left/right — not
          up/down — now that operations run column-wise. */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Move operation left"
          disabled={index === 0}
          onClick={() => move(index - 1)}
          className="leading-none text-ink-soft/60 disabled:opacity-25 hover:text-ink"
        >
          <svg width="8" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 6 9 12 15 18" /></svg>
        </button>

        {/* Color swatch — disabled (locked) for laser reserved processes. */}
        <input
          type="color"
          aria-label={`${op.name} color`}
          value={op.color}
          disabled={locked}
          onChange={(e) => {
            // Read the value eagerly: the synthetic event is pooled/reused, so
            // closing over `e` in the deferred mapper would read a stale value.
            const nextColor = e.target.value;
            onCommitOperations((ops) =>
              recolorOperation(ops, op.id, nextColor)
            );
          }}
          className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded-[3px] border border-hairline disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="button"
          aria-label="Move operation right"
          disabled={index === total - 1}
          onClick={() => move(index + 1)}
          className="leading-none text-ink-soft/60 disabled:opacity-25 hover:text-ink"
        >
          <svg width="8" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 6 15 12 9 18" /></svg>
        </button>
      </div>

      {/* Name — shown once. */}
      <span className="max-w-full min-w-0 truncate text-[11px] text-ink" title={op.name}>
        {op.name}
      </span>
      {showProcessTag && (
        <span className="truncate text-[8px] uppercase tracking-wide text-ink-soft/50">
          {op.process}
        </span>
      )}

      {/* Color-lock hint. */}
      {locked && (
        <span
          title="Color locked to laser convention"
          className="flex shrink-0 items-center gap-0.5 text-[8px] uppercase tracking-wide text-ink-soft/50"
        >
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          Locked
        </span>
      )}
    </div>
  );
}

// One shared row for a field (e.g. POWER): a subheading emitted once, then one
// input per operation — so the whole row reads left-to-right as a direct
// comparison across Cut / Score / Engrave. Returns a Fragment (transparent in
// the DOM) so its cells fall into the parent grid's own row/column tracks.
function FieldRow({ field, operations, profileId, onCommitOperations }) {
  const label = field.unit ? `${field.label} (${field.unit})` : field.label;
  return (
    <>
      <span
        title={label}
        className="flex items-center truncate text-[9px] uppercase tracking-wide text-ink-soft/70"
      >
        {label}
      </span>
      {operations.map((op) => {
        const opField = paramSchemaFor(profileId, op.process).find(
          (f) => f.key === field.key
        );
        if (!opField) {
          return (
            <div
              key={op.id}
              aria-hidden="true"
              className="flex items-center justify-center rounded-xs border border-dashed border-hairline/50 px-1.5 py-1 text-[10px] text-ink-soft/30"
            >
              —
            </div>
          );
        }
        return (
          <input
            key={op.id}
            type="number"
            aria-label={`${op.name} ${label}`}
            value={op.machineParams?.[field.key] ?? opField.default ?? ""}
            min={opField.min}
            max={opField.max}
            step={opField.step}
            onChange={(e) => {
              const raw = e.target.value;
              const num = raw === "" ? "" : Number(raw);
              onCommitOperations((ops) => setParam(ops, op.id, field.key, num));
            }}
            // Columns are much narrower here than the old one-operation-per-row
            // layout, so the native spin-button chrome (which a browser reserves
            // space for regardless of width) is what was pushing 3-digit values
            // like "100" out of view. Suppressing it (an existing pattern — see
            // CommitSlider/Slider) gives the digits that room back.
            className="w-full min-w-0 rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-[11px] text-ink outline-none focus:border-violet num [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        );
      })}
    </>
  );
}

export default function OperationsPanel({
  operations = [],
  profileId,
  onCommitOperations = () => {},
  onAddOperation = () => {},
}) {
  const fieldRows = collectFieldRows(operations, profileId);

  return (
    <div className="flex max-h-full min-h-0 flex-col" data-testid="operations-panel">
      <div className="flex shrink-0 items-center justify-between border-b border-hairline px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
          Operations
        </span>
        <button
          type="button"
          aria-label="Add operation"
          onClick={onAddOperation}
          className="rounded-xs border border-hairline bg-paper-warm px-1.5 py-0.5 text-[10px] text-ink-soft hover:text-ink hover:bg-paper"
        >
          + Add
        </button>
      </div>

      {/* flex-auto (basis:auto, NOT flex-1's basis:0 — which collapses to 0 when
          the region is content-sized) so the grid hugs its content and the region
          shrinks to fit. max-h caps it before scrolling; min-h-0 lets it shrink +
          scroll on a short viewport. */}
      <div className="flex-auto min-h-0 max-h-60 overflow-auto p-1.5" data-testid="operations-list">
        {operations.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-ink-soft/60">
            No operations.
          </p>
        ) : (
          <div
            className="grid items-stretch gap-x-2 gap-y-1.5"
            style={{
              // Operation columns floor at 3rem so a number value (e.g. "100")
              // never gets clipped when the shell's left panel is dragged down
              // toward its minimum width — below that floor the row scrolls
              // (the list region is already overflow-auto) instead of
              // silently truncating what the field reads.
              gridTemplateColumns: `minmax(2.75rem,auto) repeat(${operations.length}, minmax(3rem,1fr))`,
            }}
          >
            {/* Corner cell above the field-label column — intentionally blank. */}
            <span aria-hidden="true" />
            {operations.map((op, i) => (
              <OperationColumnHeader
                key={op.id}
                op={op}
                index={i}
                total={operations.length}
                profileId={profileId}
                onCommitOperations={onCommitOperations}
              />
            ))}

            {fieldRows.length > 0 ? (
              fieldRows.map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  operations={operations}
                  profileId={profileId}
                  onCommitOperations={onCommitOperations}
                />
              ))
            ) : (
              <p
                className="col-span-full text-[10px] italic text-ink-soft/50"
                style={{ gridColumn: `1 / span ${operations.length + 1}` }}
              >
                No params for this process
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Re-export for callers that build a default new operation. Kept here so the
// panel's "Add" semantics (process defaults to the first valid process) have a
// single home; Studio supplies the real add via operations.addOperation.
export { PROCESSES };
