// DocumentSetupDialog — the pro shell's Document Setup dialog (Lane C / C6,
// GitHub issue #14). UX reframe: this dialog is now CONTROLLED on the WORK
// PIECE (design canvas) size — canvasW/canvasH in px @96 PPI — as the PRIMARY
// editable control. The machine BED is no longer configured here; the bed now
// lives in the View menu (handled elsewhere). The machine PROFILE selector
// stays, since Studio still routes profile changes through the same
// `handleProfileChange` the LayerTree selector uses.
//
// Presentational + controlled. The live profile + canvas size live in Studio;
// this dialog reads them in (`profileId`, `canvasW`, `canvasH`, `unit`) and
// reports an Apply OUT through `onApply({ profileId, canvasW, canvasH, unit })`.
//
// Work-piece math: canvasW/canvasH are canonical px (96 PPI) everywhere. The
// Width/Height inputs are shown + entered in the ACTIVE display unit; on Apply
// we convert back to px at the boundary via units.js, so what we report out is
// always px (Math.round).
//
// Reopening shows current settings: a draft (profile + preset + dims-in-unit)
// is seeded from the live props each time `open` flips true, so the controls
// reflect the live document, never stale defaults.
//
// Match the in-repo dialog pattern (ui/ConfirmDialog): paper ground, hairline
// edge, one load-bearing saffron action, Esc cancels. NOT shadcn/native dialogs.

import { useEffect, useRef, useState } from "react";
import { PROFILE_IDS, getProfile } from "../../lib/machineProfiles";
import { PRESET_SIZES, PPI } from "../../constants";
import { pxToUnit, unitToPx } from "../../lib/units";
// Display rounding + preset matching are single-sourced with the
// SheetInspector (#75) so the two Sheet-editing surfaces can't drift.
import {
  CUSTOM_PRESET_INDEX,
  presetIndexForSize,
  roundForUnit,
} from "../../lib/workPieceSize";

export default function DocumentSetupDialog({
  open,
  profileId = "laser",
  unit = "mm",
  // Work-piece (design canvas) size in px (canvasW/canvasH from Studio's
  // useCanvasSize) — the PRIMARY control this dialog edits.
  canvasW,
  canvasH,
  onApply,
  onClose,
}) {
  // Draft state — seeded from the live props on each open transition so reopening
  // shows the CURRENT document settings (not stale defaults).
  const [draftProfile, setDraftProfile] = useState(profileId);
  const [draftW, setDraftW] = useState("");
  const [draftH, setDraftH] = useState("");
  const [presetIndex, setPresetIndex] = useState(CUSTOM_PRESET_INDEX);
  // Display unit for the work-piece dims — the mm/in toggle. Seeded from the
  // live `unit` (px falls back to mm, since the toggle only offers mm/in). The
  // W/H inputs show + accept values in THIS unit; Apply converts back to
  // canonical px and also reports the chosen unit OUT so the document's global
  // unit can follow.
  const [draftUnit, setDraftUnit] = useState(unit === "in" ? "in" : "mm");
  const applyRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const seedUnit = unit === "in" ? "in" : "mm";
    const w = typeof canvasW === "number" ? canvasW : 0;
    const h = typeof canvasH === "number" ? canvasH : 0;
    setDraftProfile(profileId);
    setDraftUnit(seedUnit);
    setDraftW(String(roundForUnit(pxToUnit(w, seedUnit), seedUnit)));
    setDraftH(String(roundForUnit(pxToUnit(h, seedUnit), seedUnit)));
    setPresetIndex(presetIndexForSize(w, h));
    // Focus the primary action, mirroring ConfirmDialog.
    applyRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Choosing a named preset fills the W/H dims (preset dims are inches → px →
  // unit). Selecting "Custom" leaves the current dims untouched.
  const handlePresetChange = (indexStr) => {
    const idx = Number(indexStr);
    setPresetIndex(idx);
    const preset = PRESET_SIZES[idx];
    if (!preset || preset.width === null) return;
    const wPx = preset.width * PPI;
    const hPx = preset.height * PPI;
    setDraftW(String(roundForUnit(pxToUnit(wPx, draftUnit), draftUnit)));
    setDraftH(String(roundForUnit(pxToUnit(hPx, draftUnit), draftUnit)));
  };

  // mm/in toggle. Switching converts the CURRENT W/H entries in place so the
  // displayed numbers describe the same physical size (the dims round-trip
  // through px). Selecting a unit never touches the named-preset selection.
  const handleUnitToggle = (nextUnit) => {
    if (nextUnit === draftUnit) return;
    const wPx = unitToPx(Number(draftW) || 0, draftUnit);
    const hPx = unitToPx(Number(draftH) || 0, draftUnit);
    setDraftUnit(nextUnit);
    setDraftW(String(roundForUnit(pxToUnit(wPx, nextUnit), nextUnit)));
    setDraftH(String(roundForUnit(pxToUnit(hPx, nextUnit), nextUnit)));
  };

  const handleApply = () => {
    const w = Number(draftW);
    const h = Number(draftH);
    // Convert the active-unit entry back to canonical px at the boundary.
    const wPx = unitToPx(Number.isFinite(w) ? w : 0, draftUnit);
    const hPx = unitToPx(Number.isFinite(h) ? h : 0, draftUnit);
    const payload = {
      profileId: draftProfile,
      canvasW: Math.round(wPx),
      canvasH: Math.round(hPx),
      unit: draftUnit,
    };
    onApply?.(payload);
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-md bg-ink/40 anim-fade"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-setup-title"
        className="w-full max-w-[360px] bg-paper border border-hairline rounded-md p-lg shadow-[0_12px_48px_-16px_oklch(0.24_0.05_270_/_0.35)] anim-rise space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="document-setup-title"
          className="display text-md text-ink leading-tight"
        >
          Document Setup
        </h2>

        {/* Machine profile — same vocabulary as the LayerTree selector. */}
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-soft mb-1">
            Machine profile
          </span>
          <select
            aria-label="Machine profile"
            value={draftProfile}
            onChange={(e) => setDraftProfile(e.target.value)}
            className="w-full rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs text-ink outline-none focus:border-violet"
          >
            {PROFILE_IDS.map((id) => (
              <option key={id} value={id}>
                {getProfile(id).label}
              </option>
            ))}
          </select>
        </label>

        {/* Work piece size — the PRIMARY control. The design canvas dims used
            for pattern generation + export (canvasW/canvasH, px @96 PPI). */}
        <div className="border-t border-hairline pt-3">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-soft mb-1">
            Work piece size
          </span>

          <label className="block mb-3">
            <span className="block text-[10px] text-ink-soft/70 mb-1">
              Preset
            </span>
            <select
              aria-label="Work piece preset"
              value={String(presetIndex)}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs text-ink outline-none focus:border-violet"
            >
              {PRESET_SIZES.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          {/* Unit toggle — mm / in. Drives the W/H display below; Apply
              converts back to canonical px and reports the chosen unit out. */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
              Units
            </span>
            <div
              role="group"
              aria-label="Units"
              className="inline-flex rounded-xs border border-hairline overflow-hidden"
            >
              {["mm", "in"].map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={draftUnit === u}
                  onClick={() => handleUnitToggle(u)}
                  className={`px-2.5 py-1 text-xs transition-colors duration-fast ease-out-quart ${
                    draftUnit === u
                      ? "bg-saffron text-ink font-medium"
                      : "bg-paper-warm text-ink-soft hover:text-ink"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Custom work-piece dimensions — in the active display unit,
              converted to px on Apply. */}
          <div className="flex items-end gap-3">
            <label className="flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-soft mb-1">
                Width ({draftUnit})
              </span>
              <input
                type="number"
                aria-label="Width"
                value={draftW}
                min={0}
                onChange={(e) => {
                  setDraftW(e.target.value);
                  setPresetIndex(CUSTOM_PRESET_INDEX);
                }}
                className="w-full rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs text-ink outline-none focus:border-violet num"
              />
            </label>
            <span className="pb-1.5 text-xs text-ink-soft/60">×</span>
            <label className="flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-soft mb-1">
                Height ({draftUnit})
              </span>
              <input
                type="number"
                aria-label="Height"
                value={draftH}
                min={0}
                onChange={(e) => {
                  setDraftH(e.target.value);
                  setPresetIndex(CUSTOM_PRESET_INDEX);
                }}
                className="w-full rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs text-ink outline-none focus:border-violet num"
              />
            </label>
          </div>
        </div>

        <div className="mt-lg flex items-center justify-end gap-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-sm py-2xs rounded-xs text-sm text-ink-soft hover:text-ink transition-colors duration-fast ease-out-quart"
          >
            Cancel
          </button>
          <button
            ref={applyRef}
            type="button"
            onClick={handleApply}
            className="px-md py-2xs rounded-xs text-sm font-medium text-ink bg-saffron hover:bg-saffron-hover transition-colors duration-fast ease-out-quart"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
