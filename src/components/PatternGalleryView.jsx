// PatternGalleryView — the "Grid" gallery: a top family-filter pill bar over a
// dense, family-clustered grid of ~140px cards, with a gentle empty state.
//
// It owns NO pattern state and does NOT know how a card is rendered: the caller
// passes the FULL unfiltered `patterns` (typically getVisiblePatterns(...)), the
// selection state + callbacks from usePatternPicker, and a `renderCard(item)`
// render-prop. Keeping card rendering external means this view needs no useGate /
// thumbnail mocking to test — the caller wraps PatternCard (size=140) with the
// gate/ready/onPick wiring.
//
// Derivations (families list, filtered+clustered grid) are memoized.

import { useMemo } from "react";
import { PATTERN_FAMILIES } from "../constants";
import { familyMetaFor } from "../lib/patternCatalog";
import FamilyFilterBar from "./FamilyFilterBar";

// Canonical family order: PATTERN_FAMILIES key order, with synthetic 'custom'
// always last. Lower rank sorts first.
const FAMILY_RANK = (() => {
  const rank = {};
  Object.keys(PATTERN_FAMILIES).forEach((k, i) => {
    rank[k] = i;
  });
  rank.custom = Object.keys(PATTERN_FAMILIES).length; // custom last
  return rank;
})();

const rankOf = (key) => (key in FAMILY_RANK ? FAMILY_RANK[key] : Number.MAX_SAFE_INTEGER);

export default function PatternGalleryView({
  patterns = [],
  isOn,
  onToggle,
  onSelectAll,
  onClearAll,
  renderCard,
}) {
  // 1. Families for the pill bar — grouped over the FULL set, counts STATIC.
  //    Ordered by family rank (custom last). Counts never shrink on toggle.
  const families = useMemo(() => {
    const counts = new Map();
    for (const p of patterns) {
      counts.set(p.familyKey, (counts.get(p.familyKey) || 0) + 1);
    }
    return [...counts.keys()]
      .sort((a, b) => rankOf(a) - rankOf(b))
      .map((key) => {
        const meta = familyMetaFor(key) || { label: key, color: "#888" };
        return { key, label: meta.label, color: meta.color, count: counts.get(key) };
      });
  }, [patterns]);

  // 2. Grid items — keep only on-families, then sort by family rank so same-
  //    family colors cluster into contiguous runs (stable within a family).
  const gridItems = useMemo(() => {
    const on = patterns.filter((p) => (isOn ? isOn(p.familyKey) : true));
    return on
      .map((p, i) => ({ p, i }))
      .sort((a, b) => rankOf(a.p.familyKey) - rankOf(b.p.familyKey) || a.i - b.i)
      .map(({ p }) => p);
  }, [patterns, isOn]);

  const isEmpty = gridItems.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <FamilyFilterBar
        families={families}
        isOn={isOn}
        onToggle={onToggle}
        onSelectAll={onSelectAll}
        onClearAll={onClearAll}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isEmpty ? (
          <div
            data-testid="gallery-empty"
            className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center"
          >
            <p className="text-[13px] text-ink-soft">No families selected.</p>
            <button
              type="button"
              data-testid="gallery-empty-select-all"
              onClick={() => onSelectAll && onSelectAll()}
              className="rounded-xs border border-hairline px-3 py-1.5 text-[12px] text-ink-soft transition-colors duration-fast ease-out-quart hover:border-violet hover:text-violet"
            >
              Select all
            </button>
          </div>
        ) : (
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 140px))",
              justifyContent: "start",
            }}
          >
            {gridItems.map((item) => renderCard(item))}
          </div>
        )}
      </div>
    </div>
  );
}
