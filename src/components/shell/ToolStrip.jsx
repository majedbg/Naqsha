// ToolStrip — the pro shell's left vertical tool strip (Lane B / B6, issue #9).
//
// Renders one button per registry tool (Select / Text / Hand / Zoom) plus the
// fill/stroke (operation) chip at the base. Presentational: the active tool +
// change handler are passed in (Studio owns the state via useActiveTool), so the
// same state drives the strip and the contextual control bar.
//
// Out of scope here: freehand drawing tools (none — decision 6) and the
// operation picker (#11). The chip renders the current/default operation and its
// onClick is a stub until #11 wires the picker.

import { TOOL_IDS, getTool } from "../../lib/tools/toolRegistry";

// Minimal inline glyphs (currentColor) so the strip reads without external
// assets. Keyed by tool id.
const GLYPHS = {
  select: (
    <path d="M5 3l6 14 2-5 5-2L5 3z" fill="currentColor" />
  ),
  text: (
    <text x="12" y="17" textAnchor="middle" fontSize="15" fontWeight="600" fill="currentColor">
      T
    </text>
  ),
  hand: (
    <path
      d="M8 11V6a1.2 1.2 0 012.4 0v4M10.4 10V5a1.2 1.2 0 012.4 0v5M12.8 10.5V6.5a1.2 1.2 0 012.4 0V13c0 3-2 5-5 5s-4.5-2-5-4l-1-2.5a1.2 1.2 0 012-1.3L8 11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  zoom: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="5.5" />
      <line x1="14.5" y1="14.5" x2="19" y2="19" />
      <line x1="10.5" y1="8" x2="10.5" y2="13" />
      <line x1="8" y1="10.5" x2="13" y2="10.5" />
    </g>
  ),
};

function ToolButton({ tool, active, onClick }) {
  return (
    <button
      type="button"
      aria-label={`${tool.label}${tool.hotkey ? ` (${tool.hotkey})` : ""}`}
      aria-pressed={active}
      title={`${tool.label}${tool.hotkey ? ` — ${tool.hotkey}` : ""}`}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-sm transition-colors duration-fast ease-out-quart ${
        active
          ? "bg-saffron text-ink"
          : "text-ink-soft hover:text-ink hover:bg-paper-warm"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        {GLYPHS[tool.id]}
      </svg>
    </button>
  );
}

export default function ToolStrip({ activeTool, onToolChange, operation }) {
  // The operation chip reflects the current/default operation (the picker is #11).
  const op = operation ?? { name: "Cut", color: "#e23b3b" };

  return (
    <div className="flex h-full flex-col items-center gap-1 py-2">
      <div className="flex flex-col items-center gap-1">
        {TOOL_IDS.map((id) => {
          const tool = getTool(id);
          return (
            <ToolButton
              key={id}
              tool={tool}
              active={activeTool === id}
              onClick={() => onToolChange?.(id)}
            />
          );
        })}
      </div>

      {/* Operation (fill/stroke) chip pinned at the base. Picker is #11; here a
          click is a no-op stub. */}
      <div className="mt-auto">
        <button
          type="button"
          aria-label={`Operation: ${op.name}`}
          title={`Operation: ${op.name} (picker coming soon)`}
          onClick={() => {
            /* operation picker is issue #11 — stubbed no-op */
          }}
          className="flex h-9 w-9 items-center justify-center rounded-sm border border-hairline hover:bg-paper-warm transition-colors duration-fast ease-out-quart"
        >
          <span
            className="block h-4 w-4 rounded-xs border border-hairline"
            style={{ backgroundColor: op.color }}
          />
        </button>
      </div>
    </div>
  );
}
