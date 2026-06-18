// OperationPicker — the operation picker popover (Lane C / C2, GitHub issue #11).
//
// "Stroke = operation": picking a stroke means picking a NAMED FABRICATION
// PROCESS from the document's operation library — NOT an RGB color wheel. This
// menu lists the document operations (each = a color swatch + name); selecting
// one fires onSelect(operationId).
//
// Shared across all three entry points (control-bar swatch, tool-strip base chip,
// LayerTree row chip). Each trigger owns its own open/close state and renders this
// menu inline (NOT portaled to body) so it sits next to the trigger and is found
// by `within(region)` queries in the shell integration tests.
//
// Presentational: open/close + selection flow OUT through props. The caller wires
// the actual assignment (selected layer → operationId, or, with nothing selected,
// the document default operation for the next added layer).

// One menu entry per operation: a color swatch + the operation name. The active
// operation is marked so the current stroke reads at a glance.
function OperationEntry({ operation, active, onSelect }) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={`Operation: ${operation.name}`}
      aria-current={active ? "true" : undefined}
      title={operation.name}
      onClick={() => onSelect(operation.id)}
      className={`flex w-full items-center gap-2 rounded-xs px-1.5 py-1 text-left text-[11px] transition-colors duration-fast ease-out-quart ${
        active ? "bg-muted text-ink" : "text-ink-soft hover:bg-paper-warm hover:text-ink"
      }`}
    >
      <span
        data-op-swatch
        className="inline-block h-3 w-3 shrink-0 rounded-[2px] border border-hairline"
        style={{ backgroundColor: operation.color }}
      />
      <span className="truncate">{operation.name}</span>
    </button>
  );
}

export default function OperationPicker({
  operations = [],
  open = false,
  activeOperationId,
  onSelect = () => {},
  onClose = () => {},
}) {
  if (!open) return null;

  return (
    <div
      role="menu"
      aria-label="Operation"
      data-testid="operation-picker"
      className="absolute z-50 mt-1 min-w-[140px] rounded-sm border border-hairline bg-paper p-1 shadow-pop"
      // Dismiss on Escape; click-away is handled by the trigger's own overlay.
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {operations.length === 0 ? (
        <p className="px-1.5 py-1 text-[11px] text-ink-soft/60">No operations.</p>
      ) : (
        operations.map((op) => (
          <OperationEntry
            key={op.id}
            operation={op}
            active={op.id === activeOperationId}
            onSelect={onSelect}
          />
        ))
      )}
    </div>
  );
}
