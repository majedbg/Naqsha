// Examples gallery (re-homed in #16). Previously rendered inside the legacy
// LeftPanel; with the two-pane layout gone it is now shown as a canvas overlay
// in the pro shell, opened from the File > Examples menu item. Presentational:
// lists curated example designs as thumbnail cards and reports a pick / close.
export default function ExamplesGallery({ examples = [], onSelect, onClose }) {
  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-hairline bg-paper-warm">
        <h2 className="text-sm font-semibold text-ink">Examples</h2>
        <button
          onClick={onClose}
          aria-label="Close examples"
          className="text-xs text-ink-soft hover:text-ink transition-colors duration-fast ease-out-quart"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {examples.length === 0 ? (
          <p className="text-xs text-ink-soft">No examples available.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {examples.map((example) => (
              <button
                key={example._file ?? example.name}
                onClick={() => onSelect?.(example)}
                className="group flex flex-col gap-2 rounded-md border border-hairline bg-paper p-2 text-left transition-colors duration-fast ease-out-quart hover:border-violet"
              >
                <div className="aspect-square w-full overflow-hidden rounded-xs bg-surface">
                  {example.thumbUrl ? (
                    <img
                      src={example.thumbUrl}
                      alt={example.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-ink-soft/60">
                      No preview
                    </div>
                  )}
                </div>
                <span className="truncate text-[11px] font-medium text-ink-soft group-hover:text-ink">
                  {example.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
