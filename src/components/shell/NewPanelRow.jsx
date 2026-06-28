// NewPanelRow — the "New panel" creation row at the foot of the sidebar (P4,
// panel-row redesign spec §7). Always rendered (it creates the first panel too).
// Mirrors PanelHeader's row chrome — a panel-row look (rounded-xs border /
// bg-paper-warm / px-1.5 py-1 / gap-1.5, a '+' glyph in the chevron slot, a
// semibold "New panel" name) — NOT the old dashed CTA.
//
// Interaction model (Model A): the "Create panel" button is the SOLE trigger.
// The material-preset <select> only sets local state; the button reads it —
// a chosen preset → onCreatePanel(substrate), the neutral option →
// onCreatePanel() (no arg). At the panel cap (canAdd=false) the select and the
// button are disabled and carry the cap tooltip; no callbacks fire.

import { useState } from "react";
import { SUBSTRATE_PRESETS, presetLabel } from "../../lib/panels";

// Shown when the document is at the MAX_PANELS cap.
const CAP_TOOLTIP = "Max 3 panels per document";

export default function NewPanelRow({ onCreatePanel, canAdd }) {
  // The chosen preset index as a string ("" = neutral / no preset). The select
  // only sets this; the "Create panel" button reads it.
  const [presetIdx, setPresetIdx] = useState("");

  const create = () => {
    if (!canAdd) return;
    if (presetIdx === "") {
      onCreatePanel?.();
    } else {
      onCreatePanel?.(SUBSTRATE_PRESETS[Number(presetIdx)]);
    }
  };

  return (
    <div
      aria-label="New panel"
      className="rounded-xs border border-hairline bg-paper-warm"
    >
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        {/* '+' glyph — occupies the chevron slot of a panel row. */}
        <span className="shrink-0 text-ink-soft">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </span>
        <span className="flex-1 min-w-0 truncate text-xs font-semibold text-ink">New panel</span>

        {/* Material-preset dropdown. Index is the option value so the two
            'acrylic' presets (3mm / 5mm) stay distinguishable. */}
        <select
          aria-label="Material preset"
          value={presetIdx}
          onChange={(e) => setPresetIdx(e.target.value)}
          disabled={!canAdd}
          title={!canAdd ? CAP_TOOLTIP : undefined}
          className="shrink-0 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-[10px] text-ink-soft outline-none disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <option value="">No preset</option>
          {SUBSTRATE_PRESETS.map((preset, i) => (
            <option key={i} value={i}>
              {presetLabel(preset)}
            </option>
          ))}
        </select>

        {/* The sole create trigger. Reads the select's local state: a chosen
            preset → onCreatePanel(substrate), neutral → onCreatePanel(). */}
        <button
          type="button"
          onClick={create}
          disabled={!canAdd}
          title={!canAdd ? CAP_TOOLTIP : undefined}
          className="shrink-0 rounded-xs border border-hairline bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Create panel
        </button>
      </div>
    </div>
  );
}
