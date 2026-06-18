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
  return (
    <label className="flex items-center gap-1 text-[10px] text-ink-soft">
      <span className="whitespace-nowrap">
        {field.label}
        {field.unit ? ` (${field.unit})` : ""}
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
        className="w-14 rounded-xs border border-hairline bg-paper-warm px-1 py-0.5 text-[10px] text-ink outline-none focus:border-violet num"
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

  const move = (to) => {
    if (to < 0 || to >= total) return;
    onCommitOperations((ops) => reorderOperations(ops, index, to));
  };

  return (
    <div
      data-testid="operation-row"
      className="flex flex-wrap items-center gap-2 rounded-xs border border-hairline bg-paper px-2 py-1.5"
    >
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
      <span className="flex items-center gap-1 shrink-0">
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
          className="h-4 w-4 cursor-pointer rounded-[2px] border border-hairline disabled:cursor-not-allowed disabled:opacity-60"
        />
        {locked && (
          <span
            title="Color locked to laser convention"
            className="text-[9px] uppercase tracking-wide text-ink-soft/60"
          >
            Locked
          </span>
        )}
      </span>

      {/* Name + process. */}
      <span className="flex min-w-[64px] flex-col leading-tight">
        <span className="truncate text-xs text-ink">{op.name}</span>
        <span className="text-[9px] uppercase tracking-wide text-ink-soft/60">
          {op.process}
        </span>
      </span>

      {/* Active-profile param fields. */}
      <span className="flex flex-1 flex-wrap items-center gap-2">
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
        {schema.length === 0 && (
          <span className="text-[10px] text-ink-soft/50 italic">
            No params for this process
          </span>
        )}
      </span>
    </div>
  );
}

export default function OperationsPanel({
  operations = [],
  profileId,
  onCommitOperations = () => {},
  onAddOperation = () => {},
  // ITP Camp kit mode (issue #18, plan §7.3). The enter/exit control lives here
  // and is surfaced ONLY when the active machine is Laser. Presentational: the
  // reversible enter/exit lifecycle is owned by Studio (useKitMode).
  kitAvailable = false,
  kitActive = false,
  kitName = "ITP Camp",
  onEnterKit = () => {},
  onExitKit = () => {},
}) {
  // Laser-gated: the kit is unavailable on plotter / drag-cutter.
  const showKitControl = kitAvailable && profileId === "laser";

  return (
    <div className="flex h-full flex-col" data-testid="operations-panel">
      {showKitControl && (
        <div className="flex shrink-0 items-center justify-between border-b border-hairline px-2 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
            {kitName} Kit
          </span>
          {kitActive ? (
            <button
              type="button"
              aria-label={`Exit ${kitName} Mode`}
              onClick={onExitKit}
              className="rounded-xs border border-ink bg-saffron px-2 py-0.5 text-[10px] font-medium text-ink hover:bg-saffron-hover"
            >
              Exit {kitName} Mode
            </button>
          ) : (
            <button
              type="button"
              aria-label={`Enter ${kitName} Mode`}
              onClick={onEnterKit}
              className="rounded-xs border border-hairline bg-paper-warm px-2 py-0.5 text-[10px] text-ink-soft hover:text-ink hover:bg-paper"
            >
              Enter {kitName} Mode
            </button>
          )}
        </div>
      )}
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

      <div className="flex-1 overflow-auto p-1.5 space-y-1">
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
