import { useId, useRef } from "react";
import { GENERATED_GLYPHS, GLYPHS } from "./paramIcons";

/*
 * IconSelect — a single-select grid of glyph buttons. Replaces a slider or a
 * native <select> where the value is better read as a symbol than a number or
 * a word.
 *
 * Two modes:
 *   Generated — `range={{min,max,step}}` + `glyph="symmetry"`: iterates the
 *               range and draws the ranged glyph per value.
 *   Enumerated — `options={[{value,label,glyph}]}`: one button per option,
 *               glyph looked up by name (WI-5 shapes).
 *
 * Craft: selected = saffron painted cell with an ink glyph (P2, one load-
 * bearing accent). Unselected = paper ground + hairline. Keyboard is a true
 * radiogroup — Arrow moves *and* commits, Home/End jump to ends, roving
 * tabindex, violet focus-visible ring (P5). Fill transition is patient and
 * reduced-motion safe (P4).
 */
export default function IconSelect({
  label,
  value,
  onChange,
  tooltip,
  range,
  glyph,
  options,
}) {
  const autoId = useId();
  const groupId = `iconselect-${autoId}`;
  const btnRefs = useRef([]);

  // Normalise both modes to a flat item list: { value, node, ariaLabel }.
  let items = [];
  if (options) {
    items = options.map((o) => ({
      value: o.value,
      node: GLYPHS[o.glyph] ?? null,
      ariaLabel: o.label ?? String(o.value),
    }));
  } else if (range) {
    const gen = GENERATED_GLYPHS[glyph];
    const { min, max, step = 1 } = range;
    for (let v = min; v <= max; v += step) {
      const rounded = parseFloat(v.toFixed(6));
      items.push({
        value: rounded,
        node: gen ? gen(rounded) : null,
        ariaLabel: `${label} ${rounded}`,
      });
    }
  }

  const selectedIndex = items.findIndex((it) => it.value === value);
  // Roving tabindex anchor: the selected button, or the first if none match.
  const tabIndexAnchor = selectedIndex >= 0 ? selectedIndex : 0;

  const move = (toIndex) => {
    const i = Math.max(0, Math.min(items.length - 1, toIndex));
    onChange(items[i].value);
    btnRefs.current[i]?.focus();
  };

  const handleKeyDown = (e, idx) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        move(idx + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        move(idx - 1);
        break;
      case "Home":
        e.preventDefault();
        move(0);
        break;
      case "End":
        e.preventDefault();
        move(items.length - 1);
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        onChange(items[idx].value);
        break;
      default:
        break;
    }
  };

  return (
    <div className="flex flex-col gap-2xs">
      {/* Label row — mirrors Slider's label + tooltip affordance. */}
      <div className="group/tooltip relative flex items-center gap-2xs min-w-0">
        <span
          id={groupId}
          className="text-xs text-ink-soft truncate cursor-default"
        >
          {label}
        </span>
        {tooltip && (
          <>
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center w-3 h-3 text-[10px] text-ink-soft/70 cursor-help"
            >
              ?
            </span>
            <div
              role="tooltip"
              className="absolute bottom-full left-0 mb-1.5 hidden group-hover/tooltip:block z-50 px-xs py-2xs text-xs text-ink bg-paper border border-hairline rounded-sm whitespace-nowrap max-w-[240px]"
            >
              {tooltip}
            </div>
          </>
        )}
      </div>

      {/* Wrapping grid of glyph buttons. */}
      <div
        role="radiogroup"
        aria-labelledby={groupId}
        className="flex flex-wrap gap-2xs"
      >
        {items.map((it, idx) => {
          const selected = it.value === value;
          return (
            <button
              key={it.value}
              ref={(el) => (btnRefs.current[idx] = el)}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={it.ariaLabel}
              title={it.ariaLabel}
              tabIndex={idx === tabIndexAnchor ? 0 : -1}
              onClick={() => onChange(it.value)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={[
                "flex items-center justify-center w-7 h-7 rounded-cell border p-1",
                "transition-colors duration-medium ease-out-quart motion-reduce:transition-none",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet focus-visible:outline-offset-1",
                selected
                  ? "bg-saffron border-saffron text-ink"
                  : "bg-transparent border-hairline text-ink-soft hover:bg-muted hover:text-ink",
              ].join(" ")}
            >
              {it.node}
            </button>
          );
        })}
      </div>
    </div>
  );
}
