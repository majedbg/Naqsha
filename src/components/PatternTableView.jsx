// PatternTableView — the "Map" / periodic-table body, extracted verbatim from
// PatternPickerModal so the modal can host it behind a tab alongside the Grid
// gallery. Rendering is byte-equivalent to the pre-tab modal body: column
// headers (geometric → organic), one row per spatial form, and a trailing
// Custom section for ready dynamic/AI patterns with no taxonomy slot.
//
// It owns NO state: the modal feeds it the placed `cells`, the `custom` id list,
// and a `cardFor(id, meta, size?)` render helper (so the gate/ready/onPick
// wiring stays in one place, shared with the Grid view).

import { GEOM_ORGANIC_BANDS, SPATIAL_FORM_ROWS } from '../constants';

export default function PatternTableView({ cells = {}, custom = [], cardFor }) {
  return (
    <div className="min-w-[640px]">
      {/* column headers */}
      <div
        className="grid gap-1.5 mb-2"
        style={{ gridTemplateColumns: `66px repeat(${GEOM_ORGANIC_BANDS.length}, minmax(104px, 1fr))` }}
      >
        <div />
        {GEOM_ORGANIC_BANDS.map((b) => (
          <div key={b.level} className="px-1">
            <div className="text-[11px] font-semibold text-ink">{b.label}</div>
            <div className="text-[10px] text-ink-soft">{b.hint}</div>
          </div>
        ))}
      </div>

      {/* rows */}
      {SPATIAL_FORM_ROWS.map((row) => {
        const rowHasAny = GEOM_ORGANIC_BANDS.some((b) => (cells[`${row.key}|${b.level}`] || []).length);
        if (!rowHasAny) return null; // hide fully-empty rows to save height
        return (
          <div
            key={row.key}
            className="grid gap-1.5 mb-1.5 items-start"
            style={{ gridTemplateColumns: `66px repeat(${GEOM_ORGANIC_BANDS.length}, minmax(104px, 1fr))` }}
          >
            <div className="text-[10px] text-ink-soft pt-1.5 pr-1 leading-tight">{row.label}</div>
            {GEOM_ORGANIC_BANDS.map((b) => {
              const items = cells[`${row.key}|${b.level}`] || [];
              return (
                <div key={b.level} className="flex flex-wrap gap-1.5 min-h-[8px]">
                  {items.map(({ id, meta }) => cardFor(id, meta))}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* custom / AI patterns with no taxonomy slot */}
      {custom.length > 0 && (
        <div className="mt-4 pt-3 border-t border-hairline">
          <div className="text-[11px] text-ink-soft mb-2">Custom</div>
          <div className="flex flex-wrap gap-1.5">
            {custom.map((id) =>
              cardFor(id, { family: 'C', det: 'seeded', mark: 'line', sym: false, blurb: 'Custom pattern' })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
