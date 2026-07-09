// SheetInspector (#75) — the Inspector's empty-selection state, promoted from
// a "No selection" dead end to the Sheet inspector: the work piece (glossary:
// Sheet — the physical material the machine works on) becomes a first-class,
// always-reachable surface. Borrowed mechanic (Figma: empty selection = document
// properties), no new chrome.
//
// Presentational + controlled, like DocumentSetupDialog: Studio owns the live
// size; dims display in the ACTIVE unit and commit OUT through onApplySize as
// canonical px (96 PPI, Math.round at the boundary). Studio routes commits
// through the same handleDocumentSetupApply path the dialog uses, so one code
// path mutates the work piece and every commit is a single undo entry.
//
// Commit model is live-edit + global-undo (no Apply button, no dialog ceremony):
// typing holds a local draft; Enter or blur converts to px and reports out.
// Prop changes re-seed the drafts, so the panel always reflects the live
// document (never stale on deselect → reselect → deselect).

import { useEffect, useState } from "react";
import { PPI, pxToUnit, unitToPx } from "../../lib/units";
import { PRESET_SIZES } from "../../constants";
import { presetIndexForSize, roundForUnit } from "../../lib/workPieceSize";

// One dimension input: draft-in-unit, committed to px on Enter/blur. A commit
// only fires when the parsed value is a positive number that actually changes
// the canonical px (so tab-through / unedited blur is a no-op).
function DimInput({ label, unit, px, onCommitPx }) {
  const display = roundForUnit(pxToUnit(px, unit), unit);
  const [draft, setDraft] = useState(String(display));

  // Re-seed the draft whenever the live document (or unit) changes.
  useEffect(() => {
    setDraft(String(display));
  }, [display]);

  const commit = () => {
    const parsed = parseFloat(draft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraft(String(display)); // revert bad input to the live value
      return;
    }
    const nextPx = Math.round(unitToPx(parsed, unit));
    if (nextPx !== Math.round(px)) onCommitPx(nextPx);
  };

  return (
    <label className="block">
      <span className="block text-[10px] text-ink-soft/70 mb-1">{label}</span>
      <input
        type="number"
        aria-label={`${label} (${unit})`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        onBlur={commit}
        className="w-full rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs text-ink outline-none focus:border-violet"
      />
    </label>
  );
}

export default function SheetInspector({
  // Work-piece size, canonical px @96 PPI (Studio's canvasW/canvasH).
  canvasW,
  canvasH,
  // Active display unit ('mm' | 'in' | 'px').
  unit = "mm",
  // Machine bed, canonical mm — read-only reference here (View-menu-owned).
  bedSize,
  // Reports a committed size change OUT as { canvasW, canvasH } in px.
  onApplySize,
}) {
  return (
    <div data-testid="inspector-sheet" className="flex h-full flex-col gap-3 p-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
        Sheet
      </span>

      <label className="block">
        <span className="block text-[10px] text-ink-soft/70 mb-1">Preset</span>
        <select
          aria-label="Sheet preset"
          value={String(presetIndexForSize(canvasW, canvasH))}
          onChange={(e) => {
            const preset = PRESET_SIZES[Number(e.target.value)];
            if (!preset || preset.width === null) return; // Custom = dims stay
            onApplySize?.({
              canvasW: Math.round(preset.width * PPI),
              canvasH: Math.round(preset.height * PPI),
            });
          }}
          className="w-full rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs text-ink outline-none focus:border-violet"
        >
          {PRESET_SIZES.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <DimInput
        label="Width"
        unit={unit}
        px={canvasW}
        onCommitPx={(nextW) => onApplySize?.({ canvasW: nextW, canvasH })}
      />
      <DimInput
        label="Height"
        unit={unit}
        px={canvasH}
        onCommitPx={(nextH) => onApplySize?.({ canvasW, canvasH: nextH })}
      />

      {/* Bed = the machine's reachable area — View-menu-owned (per the #14
          reframe); shown read-only here purely for the fits-on-material
          judgment, mirroring the status bar's line. */}
      {bedSize ? (
        <p className="text-[11px] text-ink-soft/70">
          {`Bed ${Math.round(bedSize.width)} × ${Math.round(bedSize.height)} mm`}
        </p>
      ) : null}

      <p className="mt-auto text-[11px] text-ink-soft/70">
        Select a layer to edit its parameters.
      </p>
    </div>
  );
}
