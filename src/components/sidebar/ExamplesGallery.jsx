/**
 * ExamplesGallery — a curated set of starting points, shown inside the left
 * panel in place of the Design/Prepare/Export tabs. Picking one loads it onto
 * the canvas and returns to Design. Closing returns to whatever tab was open.
 *
 * Stays within the Naqsha grammar: paper ground, hairline cells, a single
 * load-bearing accent on hover. Cards rise in on open, decelerating — the one
 * orchestrated motion moment.
 */
function ExampleCard({ example, index, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(example)}
      title={example.description || example.name}
      className="group anim-rise text-left focus:outline-none"
      // Patient staggered reveal, capped so a long list never feels slow.
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="relative aspect-square overflow-hidden rounded-xs border border-hairline bg-paper-warm transition-colors duration-medium ease-out-quart group-hover:border-violet group-focus-visible:border-violet">
        {example.thumbUrl ? (
          <img
            src={example.thumbUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-ink-soft">
            No preview
          </div>
        )}
        {/* Hover/focus affordance — saffron is interaction-only, so it surfaces
            here as a faint wash with a 'Load' cue, then recedes. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-saffron/0 opacity-0 transition-all duration-fast ease-out-quart group-hover:bg-saffron/10 group-hover:opacity-100 group-focus-visible:bg-saffron/10 group-focus-visible:opacity-100">
          <span className="rounded-xs bg-ink/70 px-2 py-0.5 text-[11px] font-medium text-paper">
            Load
          </span>
        </div>
      </div>
      <p className="mt-2xs truncate text-sm text-ink transition-colors duration-fast ease-out-quart group-hover:text-ink">
        {example.name}
      </p>
    </button>
  );
}

export default function ExamplesGallery({ examples = [], onSelect, onClose }) {
  return (
    <div className="flex h-full flex-col bg-panel">
      {/* Header — mirrors the sticky tab header so the mode feels native. */}
      <div className="flex shrink-0 items-center justify-between border-b border-paper-warm bg-panel px-3 py-3 pb-2.5">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-ink-soft">
            Start from
          </p>
          <h2 className="display text-md leading-tight text-ink">Examples</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close examples"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xs text-ink-soft transition-colors duration-fast ease-out-quart hover:bg-muted hover:text-ink"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Body */}
      {examples.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-lg text-center">
          <p className="text-sm text-ink">No examples yet</p>
          <p className="mt-2xs max-w-[40ch] text-sm leading-snug text-ink-soft">
            Curated starting points appear here. Until then, begin from a blank
            canvas or load one of your saved designs.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-sm">
            {examples.map((ex, i) => (
              <ExampleCard
                key={ex.id ?? ex._file ?? i}
                example={ex}
                index={i}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
