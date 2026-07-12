// EtchHighlightHold — the Inspector control for an Etch's Highlight Hold (Raster
// Etch S4, #83; CONTEXT.md → Highlight Hold, ADR-0006). Vocabulary is LAW: this
// is the **Highlight Hold**, its **cutoff**, and the **held region** — it is
// NOT a Stage and does NOT live in the Etch Stack. It renders as a FIXED terminal
// control, deliberately separate from EtchStackRack, so the user cannot drag it
// into the Stack, reorder it, or bypass it away like a Stage. The guarantee it
// exposes ("no dot above the cutoff") is a terminal clamp the pipeline always
// runs last — this UI only chooses the cutoff and whether it is on.
//
// The material-aware DEFAULT is resolved here from the layer's panel material
// (mirror → on, forgiving stock / unknown → off) via resolveHold. The toggle
// reflects that resolved state until the user makes an EXPLICIT choice, which
// writes a concrete boolean that overrides the material default thereafter. All
// writes go through the one canonical params path
// `onUpdateLayer(id, { params: { ...params, hold } })`, so the canvas re-resolves
// the single-source bitmap (and the shaded held band) live.

import { isEtchLayer } from '../../lib/etch/etchLayer';
import { resolveHold, createHoldParams, isMirrorMaterial } from '../../lib/etch/etchHold';
import { effectiveMaterialId } from '../../lib/materialPreview';

// SOURCE-luma range of the cutoff slider. 0..255; higher holds fewer (only the
// very brightest) pixels, lower holds more of the highlights.
const CUTOFF_MIN = 0;
const CUTOFF_MAX = 255;

/**
 * The Highlight Hold control. Self-hides for non-Etch layers so the Inspector
 * can drop it in unconditionally.
 */
export default function EtchHighlightHold({ layer, panels = [], colorView = null, onUpdateLayer }) {
  if (!isEtchLayer(layer)) return null;

  const params = layer.params || {};
  const hold = params.hold || createHoldParams();

  // The EFFECTIVE material id (panel material first, else the Material-lens
  // material) — the material-aware default's one input, resolved the SAME way the
  // canvas shades (review FIX A), so an Auto panel under a mirror lens defaults on
  // and the displayed default matches the applied one. Unknown → null → off.
  const materialId = effectiveMaterialId(layer, { panels, materials: colorView?.materials, colorView });
  const resolved = resolveHold(hold, materialId);
  const isAuto = hold.enabled == null;
  const mirror = isMirrorMaterial(materialId);

  const writeHold = (patch) =>
    onUpdateLayer(layer.id, { params: { ...params, hold: { ...hold, ...patch } } });

  // Toggling writes an EXPLICIT boolean = the opposite of the currently resolved
  // state (so the first click off AUTO does what the user sees flipping), which
  // then overrides the material default permanently.
  const onToggle = () => writeHold({ enabled: !resolved.enabled });
  const onCutoff = (v) => writeHold({ cutoff: v });

  return (
    <div className="space-y-2 border-t border-hairline pt-3" data-testid="etch-highlight-hold">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft uppercase tracking-wider">
          <input
            type="checkbox"
            data-testid="etch-hold-toggle"
            checked={resolved.enabled}
            onChange={onToggle}
            className="h-3 w-3 accent-violet"
          />
          <span>Highlight Hold</span>
        </label>
        <span className="text-[10px] font-normal normal-case tracking-normal text-ink-soft/70">
          {isAuto ? (mirror ? 'Auto · mirror' : 'Auto') : 'Manual'}
        </span>
      </div>

      <p className="text-[11px] text-ink-soft/70">
        Highlights at or above the cutoff etch NO dots — the shaded band is
        guaranteed safe. On by default for mirror stock.
      </p>

      <label className="flex items-center gap-2 text-[11px] text-ink-soft">
        <span className="w-16 shrink-0">Cutoff</span>
        <input
          type="range"
          min={CUTOFF_MIN}
          max={CUTOFF_MAX}
          step={1}
          value={resolved.cutoff}
          data-testid="etch-hold-cutoff"
          onChange={(e) => onCutoff(Number(e.target.value))}
          disabled={!resolved.enabled}
          className="h-1 flex-1 accent-violet disabled:opacity-40"
        />
        <span className="w-10 shrink-0 text-right tabular-nums text-ink num">{resolved.cutoff}</span>
      </label>
    </div>
  );
}
