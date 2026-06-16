import Select from "./ui/Select";
import NumberInput from "./ui/NumberInput";
import ColorPicker from "./ui/ColorPicker";
import { listFonts } from "../lib/text/fontRegistry";
import { capHeightPx, effectiveFontSize } from "../lib/text/fitText";
import { textEngraveWarnings } from "../lib/text/engraveCheck";
import { pxToUnit, unitToPx } from "../lib/units";

// Properties panel for the selected text node (plan P3-4). Lives in the Design
// tab. Each control calls `onUpdate(patch)` — the parent (Studio) applies the
// patch live and coalesces the history commit, so a property edit is one
// undoable action and re-layout happens automatically (TextNode.layout reads
// these fields). Engrave-only per workshop model: color = engrave paint,
// fill/outline = the two engrave sub-modes (no cut/score role selector).

const FONT_OPTIONS = listFonts().map((f) => ({ value: f.id, label: f.label }));

// Minimum authored size in px — keeps the glyphs visible/selectable if a user
// types 0 into the mm field.
const MIN_FONT_PX = 1;

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-ink-soft">{label}</span>
      <div className="flex gap-1">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              title={opt.title}
              onClick={() => onChange(opt.value)}
              className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
                active
                  ? "bg-accent/20 text-accent border-violet/40"
                  : "bg-muted text-ink-soft border-hairline hover:text-ink hover:border-ink-soft"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TextPropertiesPanel({ node, font, onUpdate }) {
  if (!node) return null;

  // The field shows the AUTHORED size; the cap readout shows the ACTUAL engraved
  // cap height at the EFFECTIVE size — for a single-line area box wide enough to
  // trip the width-fit cap (§5) these diverge, and the cap (the fabrication
  // number) must reflect what truly engraves, matching the glyphs + SVG export.
  const effSize = effectiveFontSize(node, font);
  const sizeMm = pxToUnit(node.fontSize || 0, "mm");
  const capMm = pxToUnit(capHeightPx(font, effSize), "mm");
  const widthLimited = effSize < (node.fontSize || 0) - 1e-3;
  const warnings = textEngraveWarnings(node, font);

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-paper-warm p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
          Text
        </h3>
        <span className="text-[10px] text-ink-soft font-mono truncate max-w-[55%]" title={node.text}>
          {node.text ? `“${node.text}”` : "empty"}
        </span>
      </div>

      <Select
        label="Font"
        value={node.fontId}
        options={FONT_OPTIONS}
        onChange={(v) => onUpdate({ fontId: v })}
      />

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <NumberInput
            label="Size (mm)"
            value={Number(sizeMm.toFixed(1))}
            min={0.5}
            step={0.5}
            onChange={(mm) =>
              onUpdate({ fontSize: Math.max(unitToPx(mm, "mm"), MIN_FONT_PX) })
            }
          />
        </div>
        <span
          className="pb-1.5 text-[10px] text-ink-soft whitespace-nowrap"
          title={
            widthLimited
              ? "This line is auto-fit to the box width, so it engraves smaller than the set size. Cap height is the real engraved height."
              : "Resulting capital-letter height (physical)"
          }
        >
          ≈{capMm.toFixed(1)} mm cap{widthLimited ? " · fits width" : ""}
        </span>
      </div>

      <Segmented
        label="Align"
        value={node.align || "left"}
        onChange={(v) => onUpdate({ align: v })}
        options={[
          { value: "left", label: "L", title: "Align left" },
          { value: "center", label: "C", title: "Align center" },
          { value: "right", label: "R", title: "Align right" },
        ]}
      />

      <Segmented
        label="Engrave style"
        value={node.renderMode || "fill"}
        onChange={(v) => onUpdate({ renderMode: v })}
        options={[
          { value: "fill", label: "Fill", title: "Fill-engrave — solid letters" },
          { value: "outline", label: "Outline", title: "Outline-engrave — stroked contour" },
        ]}
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-soft">Color</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-ink-soft font-mono uppercase">{node.color}</span>
          <ColorPicker color={node.color} onChange={(c) => onUpdate({ color: c })} />
        </div>
      </div>

      {warnings.map((w) => (
        <div
          key={w.code}
          role="alert"
          className="flex gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/5 p-2 text-[10px] leading-snug text-amber-600"
        >
          <span aria-hidden className="shrink-0">⚠</span>
          <span>{w.message}</span>
        </div>
      ))}
    </div>
  );
}
