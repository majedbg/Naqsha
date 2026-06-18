// DocumentSetupDialog — the pro shell's Document Setup dialog (Lane C / C6,
// GitHub issue #14). The dissolved Prepare tab's home for document/machine
// config: pick the MACHINE PROFILE and the BED SIZE (bed = artboard).
//
// Presentational + controlled. The live machine profile + bed size live in
// Studio; this dialog reads them in (`profileId`, `bedSize`) and reports an
// Apply OUT through `onApply({ profileId, bedSize })`. Studio routes the profile
// half through the SAME `handleProfileChange` the LayerTree selector uses (so the
// remap stays single-sourced) and stores the bed as overridable document state
// the CanvasChrome + StatusBar read.
//
// Bed math: the document bed is canonical mm everywhere (machineProfiles'
// defaultBed, CanvasChrome's bedWidthMm, StatusBar's {width,height,unit}). The
// width/height inputs are shown + entered in the ACTIVE display unit; on Apply we
// convert back to mm at the boundary via units.js, so what we store is always mm.
//
// Reopening shows current settings: a draft (profile + dims-in-unit) is seeded
// from the live props each time `open` flips true, so the controls reflect the
// live document, never stale defaults.
//
// Match the in-repo dialog pattern (ui/ConfirmDialog): paper ground, hairline
// edge, one load-bearing saffron action, Esc cancels. NOT shadcn/native dialogs.

import { useEffect, useRef, useState } from "react";
import {
  PROFILE_IDS,
  getProfile,
  defaultBedSize,
  bedPresetsFor,
} from "../../lib/machineProfiles";
import { pxToUnit, unitToPx } from "../../lib/units";

// mm <-> active display unit, routed through the px base (96 PPI) like the rest
// of the app. A bed dim stored in mm shows in `unit`; an entry in `unit` stores
// back to mm.
function mmToUnit(mm, unit) {
  return pxToUnit(unitToPx(mm, "mm"), unit);
}
function unitToMm(value, unit) {
  return pxToUnit(unitToPx(value, unit), "mm");
}

// Round a unit value for display: integers for mm/px, 2dp for inches.
function roundForUnit(v, unit) {
  if (unit === "in") return Math.round(v * 100) / 100;
  return Math.round(v);
}

export default function DocumentSetupDialog({
  open,
  profileId = "laser",
  bedSize,
  unit = "mm",
  // Export document size in px (canvasW/canvasH from Studio's useCanvasSize). This
  // is the size the EXPORT manifest + SVG dimensions use — distinct from the bed
  // (display/artboard) above. Optional: the document-size control only renders
  // when both are supplied AND an onApply consumer exists, so existing callers
  // (and DocumentSetupDialog.test.jsx) that omit them are unaffected.
  canvasW,
  canvasH,
  // Extra bed presets to surface ALONGSIDE the active profile's presets (#18).
  // The ITP Camp kit feeds its 2 laser beds here while the kit mode is active;
  // they appear under the laser machine's preset list. mm dims, like bedPresets.
  extraBedPresets = [],
  onApply,
  onClose,
}) {
  // Draft state — seeded from the live props on each open transition so reopening
  // shows the CURRENT document settings (not stale defaults).
  const [draftProfile, setDraftProfile] = useState(profileId);
  const [draftW, setDraftW] = useState("");
  const [draftH, setDraftH] = useState("");
  const [presetId, setPresetId] = useState("custom");
  // Export document size draft (px). Kept separate from the bed dims above.
  const [draftDocW, setDraftDocW] = useState("");
  const [draftDocH, setDraftDocH] = useState("");
  const hasCanvasSize =
    typeof canvasW === "number" && typeof canvasH === "number";
  const applyRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const bed = bedSize ?? defaultBedSize(profileId);
    setDraftProfile(profileId);
    setDraftW(String(roundForUnit(mmToUnit(bed.width, unit), unit)));
    setDraftH(String(roundForUnit(mmToUnit(bed.height, unit), unit)));
    setPresetId("custom");
    if (hasCanvasSize) {
      setDraftDocW(String(Math.round(canvasW)));
      setDraftDocH(String(Math.round(canvasH)));
    }
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

  // The active profile's presets, plus any kit-supplied extras (#18). Extras are
  // only meaningful for the profile they target (the kit is laser-gated), so they
  // ride alongside whatever profile is currently drafted.
  const presets = [...bedPresetsFor(draftProfile), ...extraBedPresets];

  // Switching the machine in the dialog reseeds the bed to that profile's
  // default (in the active unit) and resets the preset selector — mirrors how
  // applying a profile change resets the default bed in Studio.
  const handleMachineChange = (nextProfile) => {
    setDraftProfile(nextProfile);
    const def = defaultBedSize(nextProfile);
    setDraftW(String(roundForUnit(mmToUnit(def.width, unit), unit)));
    setDraftH(String(roundForUnit(mmToUnit(def.height, unit), unit)));
    setPresetId("custom");
  };

  // Choosing a named preset fills the custom dims (preset dims are mm → unit).
  const handlePresetChange = (id) => {
    setPresetId(id);
    if (id === "custom") return;
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    setDraftW(String(roundForUnit(mmToUnit(preset.width, unit), unit)));
    setDraftH(String(roundForUnit(mmToUnit(preset.height, unit), unit)));
  };

  const handleApply = () => {
    const w = Number(draftW);
    const h = Number(draftH);
    // Convert the active-unit entry back to canonical mm at the boundary.
    const bed = {
      width: unitToMm(Number.isFinite(w) ? w : 0, unit),
      height: unitToMm(Number.isFinite(h) ? h : 0, unit),
      unit: "mm",
    };
    const payload = { profileId: draftProfile, bedSize: bed };
    // Export document size (px) — only included when the control is present, so
    // callers that don't pass canvasW/H see an unchanged payload shape.
    if (hasCanvasSize) {
      const docW = Math.round(Number(draftDocW));
      const docH = Math.round(Number(draftDocH));
      if (Number.isFinite(docW) && docW > 0) payload.canvasW = docW;
      if (Number.isFinite(docH) && docH > 0) payload.canvasH = docH;
    }
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
            onChange={(e) => handleMachineChange(e.target.value)}
            className="w-full rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs text-ink outline-none focus:border-violet"
          >
            {PROFILE_IDS.map((id) => (
              <option key={id} value={id}>
                {getProfile(id).label}
              </option>
            ))}
          </select>
        </label>

        {/* Bed presets — filtered to the active machine by construction. */}
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-soft mb-1">
            Bed preset
          </span>
          <select
            aria-label="Bed preset"
            value={presetId}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="w-full rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs text-ink outline-none focus:border-violet"
          >
            <option value="custom">Custom…</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {/* Custom bed dimensions — in the active display unit, converted to mm
            on Apply. */}
        <div className="flex items-end gap-3">
          <label className="flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-soft mb-1">
              Width ({unit})
            </span>
            <input
              type="number"
              aria-label="Width"
              value={draftW}
              min={0}
              onChange={(e) => {
                setDraftW(e.target.value);
                setPresetId("custom");
              }}
              className="w-full rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs text-ink outline-none focus:border-violet num"
            />
          </label>
          <span className="pb-1.5 text-xs text-ink-soft/60">×</span>
          <label className="flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-soft mb-1">
              Height ({unit})
            </span>
            <input
              type="number"
              aria-label="Height"
              value={draftH}
              min={0}
              onChange={(e) => {
                setDraftH(e.target.value);
                setPresetId("custom");
              }}
              className="w-full rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs text-ink outline-none focus:border-violet num"
            />
          </label>
        </div>

        {/* Export document size (#16 AC2 re-home). The size the exported SVG +
            manifest use (canvasW/canvasH, px) — distinct from the bed/artboard
            above. Labelled "Document W/H" so it never collides with the bed
            Width/Height inputs. Only shown when Studio supplies canvasW/H. */}
        {hasCanvasSize && (
          <div className="border-t border-hairline pt-3">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-soft mb-1">
              Export document size (px)
            </span>
            <div className="flex items-end gap-3">
              <label className="flex-1">
                <span className="block text-[10px] text-ink-soft/70 mb-1">
                  Document W
                </span>
                <input
                  type="number"
                  aria-label="Document W"
                  value={draftDocW}
                  min={1}
                  onChange={(e) => setDraftDocW(e.target.value)}
                  className="w-full rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs text-ink outline-none focus:border-violet num"
                />
              </label>
              <span className="pb-1.5 text-xs text-ink-soft/60">×</span>
              <label className="flex-1">
                <span className="block text-[10px] text-ink-soft/70 mb-1">
                  Document H
                </span>
                <input
                  type="number"
                  aria-label="Document H"
                  value={draftDocH}
                  min={1}
                  onChange={(e) => setDraftDocH(e.target.value)}
                  className="w-full rounded-xs border border-hairline bg-paper-warm px-1.5 py-1 text-xs text-ink outline-none focus:border-violet num"
                />
              </label>
            </div>
          </div>
        )}

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
