import { listTools } from "../../lib/tools/toolRegistry";

// Small overlay listing the canvas tools (plan §7). Select + Text are both
// active: Text drives create-by-drag / point-text + live editing. Sits absolute
// top-left of the canvas wrapper. Style matches the background button
// (bg-paper-warm / border-hairline / rounded-lg / shadow-lg).
export default function CanvasToolbar({ activeTool, setActiveTool }) {
  const tools = listTools();
  return (
    <div className="absolute top-4 left-4 z-20 flex flex-col gap-1 bg-paper-warm border border-hairline rounded-lg shadow-lg p-1">
      {tools.map((tool) => {
        const disabled = tool.enabled === false;
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            disabled={disabled}
            onClick={() => !disabled && setActiveTool(tool.id)}
            title={disabled ? "Coming soon" : tool.label}
            className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors text-left ${
              disabled
                ? "text-ink-soft/40 cursor-not-allowed"
                : isActive
                ? "bg-violet/15 text-violet"
                : "text-ink-soft hover:text-ink hover:bg-muted"
            }`}
          >
            {tool.label}
          </button>
        );
      })}
    </div>
  );
}
