import { useEffect, useState } from "react";
import {
  PATTERN_TYPES,
  PATTERN_TAXONOMY,
  PATTERN_FAMILIES,
  PATTERN_SYMBOLS,
} from "../constants";
import { getDynamicTypes, onRegistryChange } from "../lib/patternRegistry";
import PatternPickerModal from "./PatternPickerModal";

// PatternSelect — the compact pattern-swap control for the Inspector. Replaces the
// old PatternTabs pill list (which scaled badly once the pattern count grew): it
// shows ONLY the current pattern as a select-style trigger, and defers the full
// choice to the periodic-table grid (PatternPickerModal) — the SAME picker used
// when a new layer is added. Picking swaps the selected layer's pattern via
// onChange (handlePatternChange), exactly as a pill tap used to.
//
// The trigger keeps the active pattern's label as button text (no aria-label
// override) so it stays reachable by name — both for users and the Inspector
// tests that assert on the active pattern button.

function labelFor(id, dynamicTypes) {
  const fromStatic = PATTERN_TYPES.find((t) => t.id === id);
  if (fromStatic) return fromStatic.label;
  const fromDynamic = dynamicTypes.find((t) => t.id === id);
  if (fromDynamic) return fromDynamic.label;
  return PATTERN_TAXONOMY[id]?.label || id;
}

export default function PatternSelect({ active, onChange }) {
  const [open, setOpen] = useState(false);
  // Subscribe to the dynamic registry so AI / runtime patterns resolve a label
  // (mirrors PatternPickerModal). Static patterns don't need this, but the
  // subscription is cheap and keeps the active label correct for every pattern.
  const [dynamicTypes, setDynamicTypes] = useState(getDynamicTypes());
  useEffect(
    () => onRegistryChange(() => setDynamicTypes([...getDynamicTypes()])),
    []
  );

  const meta = PATTERN_TAXONOMY[active];
  // Family colour is a hex (e.g. "#8a5"); fall back to the neutral ink token for
  // AI / dynamic patterns with no taxonomy entry. The `${hex}1f` alpha-append
  // below is only valid on a hex, so the swatch tint is applied ONLY when a real
  // family colour resolves (otherwise: no tint, just the symbol on paper).
  const famColor = PATTERN_FAMILIES[meta?.family]?.color || null;
  const label = labelFor(active, dynamicTypes);
  const symbol = PATTERN_SYMBOLS[active] || label.slice(0, 2);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${label} — click to change pattern`}
        className="group flex w-full items-center gap-2 rounded-xs border border-hairline bg-paper-warm px-2 py-1.5 text-left transition-colors duration-fast ease-out-quart hover:border-violet hover:bg-muted"
      >
        {/* Family-colour swatch + element symbol — the picker-card visual
            language, shrunk to a single chip. */}
        <span
          aria-hidden="true"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-xs text-[10px] font-semibold leading-none"
          style={{
            background: famColor ? `${famColor}1f` : "var(--paper)",
            color: famColor || "var(--ink-soft)",
          }}
        >
          {symbol}
        </span>

        {/* Current pattern name — the button's accessible name. */}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
          {label}
        </span>

        {/* Edit affordance — pencil + "Change", pinned to the right edge. */}
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-ink-soft group-hover:text-violet">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          Change
        </span>
      </button>

      <PatternPickerModal
        open={open}
        onClose={() => setOpen(false)}
        onPick={(id) => {
          onChange(id);
          setOpen(false);
        }}
      />
    </>
  );
}
