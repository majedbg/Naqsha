import { useRef, useState } from "react";
import Select from "./ui/Select";
import NumberInput from "./ui/NumberInput";
import ColorPicker from "./ui/ColorPicker";
import {
  useFontCatalog,
  groupFontOptions,
  getFontMeta,
  registerUploadedFont,
} from "../lib/text/fontRegistry";
import { capHeightPx, effectiveFontSize } from "../lib/text/fitText";
import { textEngraveWarnings } from "../lib/text/engraveCheck";
import { pxToUnit, unitToPx } from "../lib/units";

// Properties panel for the selected text node (plan P3-4). Lives in the Design
// tab. Each control calls `onUpdate(patch)` — the parent (Studio) applies the
// patch live and coalesces the history commit, so a property edit is one
// undoable action and re-layout happens automatically (TextNode.layout reads
// these fields). Engrave-only per workshop model: color = engrave paint,
// fill/outline = the two engrave sub-modes (no cut/score role selector).

// Minimum authored size in px — keeps the glyphs visible/selectable if a user
// types 0 into the mm field.
const MIN_FONT_PX = 1;

// Single-select segmented control. `role="radiogroup"` + `aria-checked` so
// assistive tech announces it as a group and reports which option is active
// (the active state is otherwise conveyed by color alone).
function Segmented({ label, value, options, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-ink-soft">{label}</span>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
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
  // Reactive font catalog (re-renders when a font is uploaded), grouped into
  // category optgroups for the picker. Hooks run before the early return.
  const catalog = useFontCatalog();
  const fontGroups = groupFontOptions(catalog);
  const fileRef = useRef(null);
  const [uploadErr, setUploadErr] = useState(null);

  // Upload a .ttf/.otf/.woff, parse + register it (session-only), then select it
  // on the current node. WOFF2 / unreadable files surface an inline message.
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking the same file re-fires change
    if (!file) return;
    setUploadErr(null);
    try {
      const { id } = await registerUploadedFont(file);
      onUpdate({ fontId: id });
    } catch (err) {
      setUploadErr(err?.message || "Could not read this font file.");
    }
  }

  if (!node) return null;

  // The field shows the AUTHORED size; the cap readout shows the ACTUAL engraved
  // cap height at the EFFECTIVE size — for a single-line area box wide enough to
  // trip the width-fit cap (§5) these diverge, and the cap (the fabrication
  // number) must reflect what truly engraves, matching the glyphs + SVG export.
  const effSize = effectiveFontSize(node, font);
  const sizeMm = pxToUnit(node.fontSize || 0, "mm");
  const capMm = pxToUnit(capHeightPx(font, effSize), "mm");
  const widthLimited = effSize < (node.fontSize || 0) - 1e-3;
  // The font's kind gates the double-line engrave caution (outline fonts only).
  const fontKind = getFontMeta(node.fontId)?.kind;
  const warnings = textEngraveWarnings(node, font, { fontKind });

  return (
    <div className="space-y-4 rounded-md border border-hairline bg-paper-warm p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
          Text
        </h3>
        <span className="text-[10px] text-ink-soft font-mono truncate max-w-[55%]" title={node.text}>
          {node.text ? `“${node.text}”` : "empty"}
        </span>
      </div>

      {/* Type group — font + physical size */}
      <div className="space-y-2.5">
        <Select
          label="Font"
          value={node.fontId}
          options={fontGroups}
          onChange={(v) => onUpdate({ fontId: v })}
        />

        {/* Upload your own font (session-only). The embedded note explains the
            double-line behaviour uploaded (outline) fonts have in engrave mode —
            per the ask — so it's understood before the file is even chosen. */}
        <div className="flex flex-col gap-1">
          <input
            ref={fileRef}
            type="file"
            accept=".ttf,.otf,.woff,font/ttf,font/otf,font/woff"
            className="hidden"
            aria-label="Upload font file"
            onChange={handleUpload}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded border border-dashed border-hairline bg-muted px-2 py-1.5 text-xs text-ink-soft hover:text-ink hover:border-ink-soft transition-colors"
          >
            ↑ Upload font (.ttf, .otf, .woff)
          </button>
          <p className="text-[10px] leading-snug text-ink-soft">
            Uploaded fonts stay in this session. They’re <b>outline</b> fonts, so
            in <b>Outline</b> engrave mode every stroke is traced on both edges and
            comes out as a <b>double line</b> — use <b>Fill</b>, or an{" "}
            <b>Engraving (single-line)</b> font, for a single stroke.
          </p>
          {uploadErr && (
            <p role="alert" className="text-[10px] leading-snug text-tone-strong">
              {uploadErr}
            </p>
          )}
        </div>

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
                ? "This line is auto-fit to the box width, so it engraves smaller than the set size. This is the real engraved capital-letter height."
                : "Resulting capital-letter height (physical)"
            }
          >
            ≈{capMm.toFixed(1)} mm cap-height{widthLimited ? " · fits width" : ""}
          </span>
        </div>
      </div>

      {/* Appearance group — alignment, engrave style, paint */}
      <div className="space-y-2.5">
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

        <div className="flex flex-col gap-1">
          <span className="text-xs text-ink-soft">Color</span>
          <div className="flex items-center gap-2">
            <ColorPicker color={node.color} onChange={(c) => onUpdate({ color: c })} />
            <span className="text-[10px] text-ink-soft font-mono uppercase">{node.color}</span>
          </div>
        </div>
      </div>

      {warnings.map((w) => (
        // Engrave-ability caution. `role="status"` (polite) — same severity tone
        // as the OverlapWarnings fabrication-check baseline (tone-mild), so it
        // theme-flips and doesn't interrupt the screen reader on every keystroke.
        <div
          key={w.code}
          role="status"
          className="flex gap-1.5 rounded-md border border-tone-mild/30 bg-tone-mild/5 p-2 text-[10px] leading-snug text-tone-mild"
        >
          <span aria-hidden className="shrink-0">⚠</span>
          <span>{w.message}</span>
        </div>
      ))}
    </div>
  );
}
