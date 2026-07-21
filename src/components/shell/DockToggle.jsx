// DockToggle — the Inspector header dock-position toggle + collapse chevron
// (WI-5, inspector-dock spec). Lives INSIDE the portaled Inspector content (so
// the right-dock shell stays byte-unchanged) and reads dock state from the
// InspectorDockContext (WI-4). It renders at the TOP of the inspector content so
// that when the bottom shelf is collapsed (36px, overflow-hidden) this header
// still peeks and stays clickable.
//
// Null-safe: with no provider (legacy / standalone Inspector) it renders nothing,
// keeping existing Inspector tests and layouts unchanged.

import { useInspectorDockContext } from "./inspectorDockContext";

// Collapse chevron — mirrors PanelHeader's ChevronIcon (rotates -rotate-90 when
// collapsed, with the standard fast transition).
function ChevronIcon({ collapsed }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      aria-hidden="true"
      className={`transition-transform duration-fast ${
        collapsed ? "-rotate-90" : ""
      }`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// "Dock to bottom" glyph — a panel with a filled bar along the BOTTOM edge.
function DockBottomIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  );
}

// "Dock to right" glyph — a panel with a filled bar along the RIGHT edge.
function DockRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

export default function DockToggle() {
  const dock = useInspectorDockContext();
  if (!dock) return null; // standalone / legacy: render nothing.

  const isBottom = dock.dockPosition === "bottom";

  // The toggle names the DESTINATION (what the click does). Currently docked
  // right → click moves it to the bottom, and vice-versa.
  const toggleLabel = isBottom ? "Dock Right" : "Dock Bottom";

  return (
    <div
      data-testid="inspector-dock-header"
      className="flex items-center justify-end gap-1 ml-auto mt-2 mr-2"
    >
      {/* Collapse chevron — only meaningful in the bottom shelf (the right dock
          is always its full height). */}
      {isBottom && (
        <button
          type="button"
          aria-label={
            dock.collapsed ? "Expand properties" : "Collapse properties"
          }
          onClick={() => dock.toggleCollapsed?.()}
          className="shrink-0 text-ink-soft hover:text-ink"
        >
          <ChevronIcon collapsed={dock.collapsed} />
        </button>
      )}

      {/* Dock-position toggle — always shown when the dock context is present. */}
      <button
        type="button"
        aria-label={toggleLabel}
        title={toggleLabel}
        onClick={() => dock.toggleDock?.()}
        className="shrink-0 text-ink-soft hover:text-ink"
      >
        {isBottom ? <DockRightIcon /> : <DockBottomIcon />}
      </button>
    </div>
  );
}
