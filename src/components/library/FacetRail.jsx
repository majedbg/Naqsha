// FacetRail — the Library find bar (S10, issue #59; PRD story 36). Renders the
// derived facets (deriveFacets) as multi-select chip groups with per-value
// counts, and reports selection changes up to LibraryView, which owns the
// facetState and applies filterEntries. The rail holds NO state of its own —
// it is a pure function of (facets, facetState) — so filtering can never leak
// into the store / the picker (locked invariant: one entity, two surfaces).

import { FACET_KEYS } from '../../lib/library/facets';

const CHIP_BASE =
  'inline-flex items-center gap-1.5 pl-2 pr-2 py-0.5 rounded-sm border text-[11px] leading-tight transition-colors duration-fast ease-out-quart';
const CHIP_OFF =
  'bg-paper-warm border-hairline text-ink-soft hover:text-ink hover:border-ink-faint';
const CHIP_ON = 'bg-saffron/15 border-saffron text-ink';

export default function FacetRail({ facets, facetState, onToggle, onClear }) {
  if (!facets || facets.length === 0) return null;
  const activeCount = FACET_KEYS.reduce((n, k) => n + (facetState?.[k]?.length || 0), 0);

  return (
    <div
      data-testid="facet-rail"
      className="flex flex-col gap-2.5 pb-3 mb-3 border-b border-hairline"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-ink-soft">Filter</span>
        {activeCount > 0 && (
          <button
            type="button"
            data-testid="facet-clear-all"
            onClick={onClear}
            className="text-[11px] text-violet hover:underline"
          >
            Clear all ({activeCount})
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {facets.map((facet) => (
          <div key={facet.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
            <span className="text-[11px] text-ink-faint w-16 shrink-0">{facet.label}</span>
            <div className="flex flex-wrap gap-1.5" data-testid={`facet-${facet.key}`}>
              {facet.values.map((v) => {
                const on = v.selected;
                return (
                  <button
                    key={v.value}
                    type="button"
                    aria-pressed={on}
                    data-testid={`facet-chip-${facet.key}-${v.value}`}
                    onClick={() => onToggle(facet.key, v.value)}
                    title={
                      v.soft
                        ? `${v.label} — may be partial (an off-center crop can hide rotations)`
                        : undefined
                    }
                    className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}
                  >
                    {facet.key === 'color' && v.swatch && (
                      <span
                        className="inline-block w-3 h-3 rounded-xs border border-hairline"
                        style={{ backgroundColor: v.swatch }}
                        aria-hidden
                      />
                    )}
                    <span>
                      {v.label}
                      {v.soft && <span aria-hidden> ~</span>}
                    </span>
                    <span className="text-ink-faint tabular-nums">{v.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
