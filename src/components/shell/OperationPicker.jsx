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

import { useLayoutEffect, useRef, useState } from "react";

// Minimum gap to keep between the menu and the viewport edge.
const VIEWPORT_MARGIN = 8;

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
  const menuRef = useRef(null);
  // Pixel nudge that pulls the menu back inside the viewport. The trigger's
  // anchor classes (right-0 / left-full / bottom-0) place the menu next to its
  // button with no edge awareness, so near a screen edge the natural position
  // overflows. We measure the rendered rect and translate it back in-bounds.
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!open) return undefined;
    const el = menuRef.current;
    if (!el) return undefined;

    const measure = () => {
      // Clear our own translate so the rect reflects the natural anchored spot.
      el.style.transform = "";
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let x = 0;
      let y = 0;
      if (rect.right > vw - VIEWPORT_MARGIN) x = vw - VIEWPORT_MARGIN - rect.right;
      if (rect.left + x < VIEWPORT_MARGIN) x = VIEWPORT_MARGIN - rect.left;
      if (rect.bottom > vh - VIEWPORT_MARGIN) y = vh - VIEWPORT_MARGIN - rect.bottom;
      if (rect.top + y < VIEWPORT_MARGIN) y = VIEWPORT_MARGIN - rect.top;

      setOffset({ x, y });
    };

    measure();
    window.addEventListener("resize", measure);
    // Capture-phase scroll so we re-measure when any ancestor scrolls.
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, operations]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Operation"
      data-testid="operation-picker"
      className="absolute z-50 mt-1 max-h-[60vh] min-w-[140px] overflow-y-auto rounded-sm border border-hairline bg-paper p-1 shadow-pop"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
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
