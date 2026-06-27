// ColorViewControl — the bottom-left "Color View" lens switch (spec:
// docs/material-preview-plan.md).
//
// Two lenses, the Naqsha metaphor made literal: OPERATION is the painted
// grid-sheet (strokes colored by what they MEAN — cut / score / engrave), and
// MATERIAL is the woven result (the design as it looks cut on a real sheet).
// Like Maps' Map/Satellite — same geometry, two readings.
//
// Presentational: lens + material selection flow OUT through props (mode + chosen
// material live in Studio's useColorView, which persists them). When Material is
// chosen with no material yet, the picker auto-opens — the "what material should
// we preview?" moment.

import { useEffect, useRef, useState } from "react";
import { materialSheetHex } from "../../lib/materialPreview";
import { MATERIAL_SWATCHES } from "../../lib/materialSwatches";

// Map swatch PHOTOS by id (same ids as the default acrylics) so a material
// previews with its real sheet photo where we have one; everything else falls
// back to a flat hex swatch.
const PHOTO_BY_ID = Object.fromEntries(MATERIAL_SWATCHES.map((m) => [m.id, m.image]));

const TYPE_LABEL = { acrylic: "Acrylic", plywood: "Plywood" };
const typeLabel = (t) => TYPE_LABEL[t] || (t ? t[0].toUpperCase() + t.slice(1) : "Other");

// Group materials by type, preserving first-seen order of both types and items.
function groupByType(materials) {
  const order = [];
  const groups = new Map();
  for (const m of materials) {
    const key = m.type || "other";
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(m);
  }
  return order.map((key) => ({ key, label: typeLabel(key), items: groups.get(key) }));
}

// A single material swatch (photo if we have one, else its sheet hex).
function Swatch({ material, className = "" }) {
  const photo = PHOTO_BY_ID[material.id];
  const hex = materialSheetHex(material);
  return photo ? (
    <span
      className={`bg-cover bg-center ${className}`}
      style={{ backgroundImage: `url(${photo})` }}
      aria-hidden
    />
  ) : (
    <span className={className} style={{ backgroundColor: hex }} aria-hidden />
  );
}

function MaterialRow({ material, selected, onSelect }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(material.id)}
      className={`group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors duration-fast ease-out-quart ${
        selected ? "bg-accent/15" : "hover:bg-muted"
      }`}
    >
      <Swatch
        material={material}
        className={`h-5 w-5 shrink-0 rounded-[3px] border ${
          selected ? "border-violet/60 ring-1 ring-violet/40" : "border-hairline"
        }`}
      />
      <span className={`truncate text-[11px] ${selected ? "text-ink" : "text-ink-soft group-hover:text-ink"}`}>
        {material.name}
      </span>
    </button>
  );
}

function MaterialPopover({ materials, selectedId, onSelect, onClose }) {
  const ref = useRef(null);

  // Click-away + Escape. Capture-phase pointerdown so a click anywhere outside
  // the popover (including the toggle card) dismisses it.
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const groups = groupByType(materials);

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label="Preview material"
      data-testid="material-popover"
      className="absolute bottom-full left-0 mb-2 w-60 origin-bottom-left rounded-md border border-hairline bg-paper p-2 shadow-pop"
    >
      <p className="px-1 pb-2 text-[11px] font-medium leading-snug text-ink">
        What material should we preview?
      </p>
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="px-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-soft/70">
              {g.label}
            </p>
            <div className="space-y-0.5">
              {g.items.map((m) => (
                <MaterialRow
                  key={m.id}
                  material={m}
                  selected={m.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LensButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors duration-fast ease-out-quart ${
        active
          ? "bg-accent/20 text-accent"
          : "text-ink-soft hover:bg-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export default function ColorViewControl({
  mode = "operation",
  material = null,
  materials = [],
  needsMaterialChoice = false,
  onSetMode = () => {},
  onSelectMaterial = () => {},
  // 3D preview lens (S3, PRD D1/D2). The always-on Surface A peer of
  // Operation/Material. `threeDActive` is the DERIVED active-lens flag; while it
  // is on, neither 2D lens is "checked" (the toggle stays a single-selection
  // radio) and the material chip/picker are suppressed. Clicking the 3D radio
  // enters (onEnter3D) when off and exits (onExit3D — restores the prior 2D/lens
  // state, D14) when on. "↻ Rebuild" re-snapshots the design into the scene.
  threeDActive = false,
  onEnter3D = () => {},
  onExit3D = () => {},
  onRebuild = () => {},
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  // Single-selection radio: in 3D, the 2D lenses read as unchecked.
  const operationActive = !threeDActive && mode === "operation";
  const materialActive = !threeDActive && mode === "material";

  // Switching to Material with nothing chosen pops the picker — the prompt moment.
  useEffect(() => {
    if (needsMaterialChoice) setPickerOpen(true);
  }, [needsMaterialChoice]);

  const handleMaterialLens = () => {
    onSetMode("material");
    // Already in material with a chosen sheet → the lens button re-opens the
    // picker so it doubles as "change material".
    if (mode === "material" && material) setPickerOpen(true);
  };

  const handleSelect = (id) => {
    onSelectMaterial(id);
    setPickerOpen(false);
  };

  return (
    <div className="absolute bottom-4 left-4 z-20 select-none" data-testid="color-view-control">
      {pickerOpen && (
        <MaterialPopover
          materials={materials}
          selectedId={material?.id ?? null}
          onSelect={handleSelect}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className="flex items-center gap-1 rounded-md border border-hairline bg-paper/95 p-1 shadow-pop backdrop-blur-[2px]">
        <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Color view">
          <LensButton active={operationActive} onClick={() => onSetMode("operation")}>
            Operation
          </LensButton>
          <LensButton active={materialActive} onClick={handleMaterialLens}>
            Material
          </LensButton>
          {/* Surface A — always-on 3D lens peer (D2). Toggles 3D on/off; exiting
              restores the prior 2D/lens state (D14). */}
          <LensButton active={threeDActive} onClick={() => (threeDActive ? onExit3D() : onEnter3D())}>
            3D
          </LensButton>
        </div>

        {/* "↻ Rebuild" — re-snapshots the live design into the (non-reactive) 3D
            scene (D14). Only meaningful while 3D is up. */}
        {threeDActive && (
          <button
            type="button"
            aria-label="Rebuild 3D preview"
            onClick={onRebuild}
            className="flex items-center gap-1 rounded border border-hairline bg-paper-warm px-1.5 py-0.5 text-[11px] text-ink-soft transition-colors hover:border-ink-soft hover:text-ink"
          >
            <span aria-hidden>↻</span>
            Rebuild
          </button>
        )}

        {/* Current-sheet chip — only while the Material lens is active (and not in
            3D). Doubles as the "change material" trigger. */}
        {materialActive && (
          <button
            type="button"
            aria-label={material ? `Previewing ${material.name} — change material` : "Choose preview material"}
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded border border-hairline bg-paper-warm py-0.5 pl-1 pr-1.5 text-[11px] text-ink transition-colors hover:border-ink-soft"
          >
            {material ? (
              <Swatch material={material} className="h-4 w-4 shrink-0 rounded-[2px] border border-hairline" />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-[2px] border border-dashed border-ink-soft/50" aria-hidden />
            )}
            <span className="max-w-[10rem] truncate">{material ? material.name : "Choose…"}</span>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-ink-soft/70" aria-hidden>
              <polyline points="6 15 12 9 18 15" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
