// OperationsPanel — the pro shell's LightBurn-style operations / cut-settings
// panel (Lane C / C1, GitHub issue #10). Lives in the shell's right-bottom
// region (portaled in by Studio).
//
// Lists the document operation library as rows. Each row shows the operation's
// process, a color swatch, and the active machine's param fields (resolved from
// the machine-profile schema for `profileId` and the op's process — laser
// power/speed/passes, plotter pen #/pressure, drag-cutter force/blade/passes).
//
// All mutations flow OUT through callbacks so the panel stays presentational and
// the parent (Studio) routes them through the undo/redo history:
//   - onAddOperation()                     — append a new operation
//   - onCommitOperations(ops => nextOps)   — reorder / recolor / param-edit /
//                                            remove, expressed as a pure mapper
//
// Reorder = cut order: moving a row up/down commits a reorderOperations() mapper,
// and operations.js reflows the `order` field to match list position.
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

function ParamField({ field, value, onCommit }) {
  const label = field.unit ? `${field.label} (${field.unit})` : field.label;
  return (
    // Label ABOVE the input so several fields sit as equal columns in one row
    // instead of wrapping to a stack. min-w-0 + flex-1 lets the columns share
    // the tier's width and the inputs shrink rather than push each other down.
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span
        title={label}
        className="truncate text-[9px] uppercase tracking-wide text-ink-soft/70"
      >
        {label}
      </span>
      <input
        type="number"
        aria-label={field.label}
        value={value ?? field.default ?? ""}
        min={field.min}
        max={field.max}
        step={field.step}
        onChange={(e) => {
          const raw = e.target.value;
          const num = raw === "" ? "" : Number(raw);
          onCommit(num);
        }}
        className="w-full min-w-0 rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-[11px] text-ink outline-none focus:border-violet num"
      />
    </label>
  );
}

function OperationRow({
  op,
  index,
  total,
  profileId,
  onCommitOperations,
}) {
  const schema = paramSchemaFor(profileId, op.process);
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
      data-testid="operation-row"
      className="rounded-xs border border-hairline bg-paper px-2 py-1.5"
    >
      {/* Meta line: reorder · swatch · name (+ process tag when renamed) · lock. */}
      <div className="flex items-center gap-2">
        {/* Reorder (cut order). jsdom-friendly up/down stepping over
            reorderOperations(from,to). */}
        <span className="flex flex-col text-ink-soft/60 shrink-0" aria-label="Reorder operation">
          <button
            type="button"
            aria-label="Move operation up"
            disabled={index === 0}
            onClick={() => move(index - 1)}
            className="leading-none disabled:opacity-25 hover:text-ink"
          >
            <svg width="10" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 15 12 9 18 15" /></svg>
          </button>
          <button
            type="button"
            aria-label="Move operation down"
            disabled={index === total - 1}
            onClick={() => move(index + 1)}
            className="leading-none disabled:opacity-25 hover:text-ink"
          >
            <svg width="10" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        </span>

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
          className="h-4 w-4 shrink-0 cursor-pointer rounded-[3px] border border-hairline disabled:cursor-not-allowed disabled:opacity-60"
        />

        {/* Name — shown once. */}
        <span className="min-w-0 truncate text-xs text-ink">{op.name}</span>
        {showProcessTag && (
          <span className="shrink-0 text-[9px] uppercase tracking-wide text-ink-soft/50">
            {op.process}
          </span>
        )}

        {/* Color-lock hint — compact lock chip pushed to the row's trailing edge
            so it never crowds the name. */}
        {locked && (
          <span
            title="Color locked to laser convention"
            className="ml-auto flex shrink-0 items-center gap-1 text-[9px] uppercase tracking-wide text-ink-soft/50"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            Locked
          </span>
        )}
      </div>

      {/* Active-profile param fields — one aligned row of equal columns. */}
      {schema.length > 0 ? (
        <div className="mt-1.5 flex items-end gap-2">
          {schema.map((field) => (
            <ParamField
              key={field.key}
              field={field}
              value={op.machineParams?.[field.key]}
              onCommit={(value) =>
                onCommitOperations((ops) => setParam(ops, op.id, field.key, value))
              }
            />
          ))}
        </div>
      ) : (
        <p className="mt-1.5 text-[10px] italic text-ink-soft/50">
          No params for this process
        </p>
      )}
    </div>
  );
}

export default function OperationsPanel({
  operations = [],
  profileId,
  onCommitOperations = () => {},
  onAddOperation = () => {},
}) {
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
          the region is content-sized) so the list hugs its content and the region
          shrinks to fit. max-h caps it at ~2.5 operation cards before scrolling;
          min-h-0 lets it shrink + scroll on a short viewport. */}
      <div className="flex-auto min-h-0 max-h-60 overflow-auto p-1.5 space-y-1">
        {operations.map((op, i) => (
          <OperationRow
            key={op.id}
            op={op}
            index={i}
            total={operations.length}
            profileId={profileId}
            onCommitOperations={onCommitOperations}
          />
        ))}
        {operations.length === 0 && (
          <p className="px-1 py-2 text-[11px] text-ink-soft/60">
            No operations.
          </p>
        )}
      </div>
    </div>
  );
}

// Re-export for callers that build a default new operation. Kept here so the
// panel's "Add" semantics (process defaults to the first valid process) have a
// single home; Studio supplies the real add via operations.addOperation.
export { PROCESSES };
