// FamilyFilterBar — presentational (dumb) family-filter pill bar for the Grid
// gallery view. It owns NO state: the gallery feeds it `families` (already in
// display order, custom last) plus selection state via `isOn` and the toggle /
// all / none callbacks from the usePatternPicker hook.
//
// Visual language mirrors the modal legend (family-color dot + label), with the
// PatternSelect button idioms (rounded-xs, border-hairline, text tokens, the
// duration-fast / ease-out-quart transition). reduced-motion is honored by the
// global CSS — no JS needed.

export default function FamilyFilterBar({
  families = [],
  isOn,
  onToggle,
  onSelectAll,
  onClearAll,
}) {
  return (
    <div
      role="group"
      aria-label="Filter by family"
      className="flex flex-wrap items-center gap-1.5"
    >
      {families.map((f) => {
        const on = isOn ? isOn(f.key) : true;
        return (
          <button
            key={f.key}
            type="button"
            data-testid={`family-pill-${f.key}`}
            aria-pressed={on}
            onClick={() => onToggle && onToggle(f.key)}
            // ON: family-color border + faint tint fill + family-color text.
            // OFF: hairline outline, dimmed text, desaturated dot (handled
            // below via opacity). Inline style carries the dynamic family color
            // (Tailwind can't do arbitrary runtime hex); Tailwind does the rest.
            className="group flex items-center gap-1.5 rounded-xs border px-2 py-1 text-[11px] font-medium leading-none transition-[color,background-color,border-color,transform] duration-fast ease-out-quart motion-safe:active:scale-[0.95]"
            style={
              on
                ? {
                    borderColor: f.color,
                    background: `${f.color}1f`,
                    color: f.color,
                  }
                : {
                    borderColor: "var(--hairline)",
                    color: "var(--ink-soft)",
                  }
            }
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full transition-opacity duration-fast ease-out-quart"
              style={{ background: f.color, opacity: on ? 1 : 0.4 }}
            />
            <span>{f.label}</span>
            <span className={on ? "opacity-80" : "opacity-60"}>{f.count}</span>
          </button>
        );
      })}

      {/* All / None — plain small buttons. */}
      <span className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          data-testid="family-select-all"
          onClick={() => onSelectAll && onSelectAll()}
          className="rounded-xs border border-hairline px-2 py-1 text-[11px] text-ink-soft transition-[color,border-color,transform] duration-fast ease-out-quart hover:border-violet hover:text-violet motion-safe:active:scale-[0.95]"
        >
          Select all
        </button>
        <button
          type="button"
          data-testid="family-clear-all"
          onClick={() => onClearAll && onClearAll()}
          className="rounded-xs border border-hairline px-2 py-1 text-[11px] text-ink-soft transition-[color,border-color,transform] duration-fast ease-out-quart hover:border-violet hover:text-violet motion-safe:active:scale-[0.95]"
        >
          Deselect all
        </button>
      </span>
    </div>
  );
}
