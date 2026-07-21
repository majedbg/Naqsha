// Inspector — selection-driven parameter editor for the pro shell's right column
// (Lane B / B3, GitHub issue #6).
//
// This is the strangler slice that RELOCATES the existing parameter editor into
// the shell's Inspector region and makes it context-sensitive on the current
// single selection. It does NOT rebuild any controls: it composes the exact same
// primitives LayerCard composes for its param body —
//   • PatternSelect            → the pattern-type swap control (pinned at top):
//                                a compact trigger that opens the periodic-table
//                                grid picker (PatternPickerModal), same as add-layer
//   • LayerParamsProvider +    → the collapsible, grouped param controls
//     PatternParams              (PARAM_GROUPS / ParamGroup / ParamRow / Slider …)
//   • usePatternCache          → the param-caching pattern-switch machine
// so sliders keep numeric entry + live canvas preview through the unchanged
// edit → onUpdateLayer → setLayers → re-render path.
//
// LayerCard itself is deliberately NOT reused: its header carries move / delete /
// duplicate / rename / seed chrome that belongs to the object-tree column (#5),
// not the inspector. We compose only the param-editing half here.
//
// Selection is driven entirely by props. `selectedLayerId` names the single
// selected layer; when it resolves to a layer we show its controls, otherwise we
// show a neutral document/empty state. Multi-select is out of scope (#6).

import { useState, useRef } from "react";
import PatternSelect from "../PatternSelect";
import PatternParams from "../PatternParams";
import DockToggle from "./DockToggle";
import SheetInspector from "./SheetInspector";
import usePatternCache from "../../lib/usePatternCache";
import {
  buildLayerParamsValue,
  LayerParamsProvider,
} from "../../lib/useLayerParams";
import {
  DEFAULT_BAND_COUNT,
  hasVariableWeight,
  supportsVariableWeight,
} from "../../lib/variableWeight";
import { isTextLayer, textNodeFromLayer } from "../../lib/text/textLayer";
import { useFont } from "../../lib/text/fontRegistry";
import TextPropertiesPanel from "../TextPropertiesPanel";
import {
  canProduceField,
  fieldForLayer,
} from "../../lib/fields/fieldRegistry";
import { previewButtonState } from "../../lib/three3d/previewButtonState";
import FieldOverlay from "../FieldOverlay";
import ShapeCurve from "../ui/ShapeCurve";
import ModulationParamBox from "../ui/ModulationParamBox";
import { channelForTarget } from "../../lib/fields/channelConsumers";
import { offsetAffectsOutput } from "../../lib/fields/offsetVisibility";
import { canProduceLattice } from "../../lib/fields/latticeForLayer";
import { resolveModulationForTarget } from "../../lib/fields/resolveModulationForTarget";
import { ANCHOR_POS, ANCHOR_MID, ANCHOR_NEG } from "../../lib/fields/colormap";
import {
  isMotifLayer,
  motifHostId,
  deepMergeBinding,
  readChain,
  ensureChainForm,
} from "../../lib/motif/motifLayer";
import { MOTIF_GLYPHS } from "../../lib/motif/glyphs";
import EtchStackRack from "./EtchStackRack";
import EtchHighlightHold from "./EtchHighlightHold";
import EtchPreviewHero from "./EtchPreviewHero";
import {
  MOTIF_HOSTS,
  isSemanticHost,
} from "../../lib/motif/hostKinds";
import { defaultMotifAddOpts } from "../../lib/motif/defaultBinding";
import { STARTER_CHIPS } from "../../lib/motif/starterChips";
import MotifBlockRack from "./MotifBlockRack";
import GlyphPickerChip from "./GlyphPickerChip";

// Modulation-scoped param control: the Grid's `warpNodes` slider (2–24). Reuses
// the file's `accent-violet` range styling. Rendered INSIDE a <ModulationParamBox>
// at two sites (Grid panel + modulator map row); both write the SAME canonical
// grid param through the generic onUpdateLayer, so they never drift. `testidSuffix`
// keeps the two instances individually queryable.
function WarpNodesControl({ value, onChange, testidSuffix = "" }) {
  const v = value ?? 6;
  return (
    <label className="flex items-center gap-2 text-[11px] text-ink-soft">
      <span className="w-12 whitespace-nowrap">Nodes</span>
      <input
        type="range"
        data-testid={`warp-nodes-slider${testidSuffix}`}
        aria-label="Warp nodes"
        min={2}
        max={24}
        step={1}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-violet"
      />
      <span className="w-9 text-right tabular-nums text-ink num">{v}</span>
    </label>
  );
}

// Variable line-weight UI (issue #17, C8). A per-layer "advanced" toggle + bucket
// count (N) control, shown ONLY for weight-varying patterns on a profile that
// supports banding (laser/plotter — drag-cutter has no line weight, so the whole
// block is hidden). OFF by default; enabling surfaces the manual-setup warning
// and (via onVariableWeightChange) generates the N-row operation band (#10).
//
// State lives on `layer.variableWeight = { enabled, n }` (owned by Studio via
// updateLayer / the band sync), NOT in local component state — the Inspector
// remounts per selection, so deriving from props keeps it correct across layers.
function VariableWeightControls({ layer, profileId, onVariableWeightChange }) {
  // Capability gate: the PATTERN must emit weight variation AND the active
  // machine profile must support banding. Drag-cutter fails the second check.
  if (!hasVariableWeight(layer.patternType) || !supportsVariableWeight(profileId)) {
    return null;
  }
  const vw = layer.variableWeight || {};
  const enabled = vw.enabled === true;
  const n = vw.n ?? DEFAULT_BAND_COUNT;
  const emit = (next) => onVariableWeightChange?.(layer.id, next);

  return (
    <div className="space-y-1.5 border-t border-hairline pt-3">
      <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
        Variable line weight
      </h3>
      <label className="flex items-center gap-2 text-xs text-ink">
        <input
          type="checkbox"
          data-testid="variable-weight-toggle"
          checked={enabled}
          onChange={(e) =>
            emit({ enabled: e.target.checked, n })
          }
        />
        <span>Vary line weight by band</span>
      </label>

      {enabled && (
        <>
          <label className="flex items-center gap-2 text-[11px] text-ink-soft">
            <span className="whitespace-nowrap">Bands (N)</span>
            <input
              type="number"
              data-testid="variable-weight-n"
              aria-label="Bands (N)"
              min={1}
              max={12}
              step={1}
              value={n}
              onChange={(e) => {
                const raw = Number(e.target.value);
                const next = Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : 1;
                emit({ enabled: true, n: next });
              }}
              className="w-14 rounded-xs border border-hairline bg-paper-warm px-1 py-0.5 text-[11px] text-ink outline-none focus:border-violet num"
            />
          </label>
          <p
            data-testid="variable-weight-warning"
            className="rounded-xs border border-amber-400/50 bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
          >
            Advanced — manual machine setup required. Each band is a separate
            operation; step through them by hand while cutting (laser: read
            &quot;orange = speed&quot;; plotter: swap to the band&apos;s pen slot).
          </p>
        </>
      )}
    </div>
  );
}

// Modulator device panel (pattern modulation, modulator-centric / Ableton-LFO
// model). Shown ONLY for a layer that can PRODUCE a field (Chladni today, via
// canProduceField) — that layer is the GUIDE and owns a `modulator` device that
// maps OUT to target layers. Layout:
//   • a heatmap "waveform" readout (the guide's field) at top,
//   • a two-thumb range slider (device output range) beside the readout,
//   • device controls (offset / shape / steps) shared by all maps,
//   • a Targets list — one row per map (name, amount, unmap) plus an
//     "+ Add target" control.
//
// Stored schema (on the GUIDE layer):
//   layer.modulator = {
//     offset, shape, steps, range: { min, max },
//     maps: [ { targetLayerId, channel:'density', amount } ]
//   }
//
// Every edit commits through the SAME onUpdateLayer path the rest of the
// inspector uses (shallow top-level merge), so it's live-previewed, undoable and
// autosaved — no separate apply button (human-in-the-loop: preview/apply/revert).
// Because the merge is shallow, every write spreads the WHOLE current modulator
// (a partial { modulator: { offset } } would drop maps).
function ModulatorDevice({
  layer,
  layers,
  onUpdateLayer,
  onPreviewField,
  // 3D preview (Surface B) toggle state. When the height-surface preview is open
  // FOR THIS guide layer, the "Preview in 3D" button flips to "Close preview" and
  // its click closes the preview (onClosePreview) instead of opening it. Optional
  // so the Inspector still renders standalone / in legacy callers.
  threeDSubMode,
  threeDFocusLayerId,
  onClosePreview,
}) {
  if (!canProduceField(layer) && !canProduceLattice(layer)) return null;

  // A GRID guide produces a discrete placement LATTICE, not a continuous field:
  // it stamps a motif at each of its intersection nodes. Its device panel drops
  // the field-only controls (range/field-plot/3D-relief/offset/shape/steps) —
  // those only reshape a [-1,1] field — leaving just the target maps.
  const isLatticeGuide = !canProduceField(layer) && canProduceLattice(layer);

  // Current device, with defaults filled in (layer.modulator is undefined until
  // the first edit). Computed inline — no useMemo narrowing (React Compiler).
  const current = layer.modulator || {};
  const offset = current.offset ?? 0;
  const shape = current.shape ?? 0;
  const steps = current.steps ?? 0;
  const maps = Array.isArray(current.maps) ? current.maps : [];
  // Device-level output range (affine remap of the field's [-1,1] band), replaces
  // per-map polarity. Default {min:-1,max:1} = identity (attract + repel).
  const range = {
    min: current.range?.min ?? -1,
    max: current.range?.max ?? 1,
  };

  // Offset only biases output on maps whose channel consumes it (density /
  // distort); warp targets, lattice targets and an unmapped device ignore it.
  // When it does nothing we hide the knob (no dead control) AND pass 0 to the
  // readout so the heatmap never previews a bias the plot won't honor.
  const offsetActive = offsetAffectsOutput({ maps });

  // Rebuild the whole modulator from the current one on every write. `range` MUST
  // be included or writes that omit it would drop the device range.
  const patchModulator = (patch) => {
    onUpdateLayer(layer.id, {
      modulator: { offset, shape, steps, maps, range, ...patch },
    });
  };
  // Write the full {min,max}. The thumbs may cross: max below min is allowed and
  // flips polarity (applyRange remaps the field's [-1,1] band onto [min,max], so
  // an inverted range simply inverts the response). No clamping here.
  const setRangeMin = (v) =>
    patchModulator({ range: { min: v, max: range.max } });
  const setRangeMax = (v) =>
    patchModulator({ range: { min: range.min, max: v } });
  const setMaps = (nextMaps) => patchModulator({ maps: nextMaps });

  // Candidate targets: any layer that consumes a modulation channel —
  // channelForTarget is the single source of truth (grainfield→density;
  // chladni/topographic/flowfield→warp). Excludes the guide itself and any
  // already-mapped target.
  const mapped = new Set(maps.map((m) => m.targetLayerId));
  const candidates = (layers || []).filter((l) => {
    if (l.id === layer.id || mapped.has(l.id)) return false;
    const ch = channelForTarget(l.patternType);
    if (ch === null) return false;
    // Match the target's channel to what THIS guide can supply: a grid guide
    // only offers a lattice; a field guide only offers field channels. Prevents
    // offering a motif (lattice) target under a field guide, which would map a
    // channel that guide can't produce (→ no-op).
    return isLatticeGuide ? ch === "lattice" : ch !== "lattice";
  });

  const nameFor = (id) => {
    const l = (layers || []).find((x) => x.id === id);
    return l ? l.name || l.patternType : id;
  };

  const addTarget = (targetLayerId) => {
    if (!targetLayerId) return;
    // Channel is derived from the target's pattern type (single source of
    // truth): grainfield→'density', chladni/topographic/flowfield→'warp'.
    // NOTE: warp targets are AMOUNT-ONLY in v1 — the device-level Shape/Steps/
    // Offset controls do NOT affect them (the transfer chain is deferred for
    // warp). Per-map Amount is the only warp control.
    const target = (layers || []).find((l) => l.id === targetLayerId);
    const channel = channelForTarget(target?.patternType) ?? "density";
    setMaps([...maps, { targetLayerId, channel, amount: 1 }]);
  };
  const removeMap = (targetLayerId) => {
    setMaps(maps.filter((m) => m.targetLayerId !== targetLayerId));
  };
  const patchMap = (targetLayerId, patch) => {
    setMaps(
      maps.map((m) =>
        m.targetLayerId === targetLayerId ? { ...m, ...patch } : m
      )
    );
  };

  return (
    <div
      className="space-y-3 border-t border-hairline pt-3"
      data-testid="modulator-device"
    >
      <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
        Modulator
      </h3>

      {isLatticeGuide ? (
        <p className="text-[11px] text-ink-soft/80">
          Stamps the motif at every grid node — the grid's spacing, jitter, and
          symmetry place and duplicate the copies. Adjust those on the grid layer.
        </p>
      ) : (
        <>
      {/* Range slider (left) + field plot (right). The two-thumb vertical slider
          sets modulator.range = {min,max}; the field plot recolors live as the
          thumbs move (its values are remapped through the same range). */}
      <div className="flex items-stretch gap-2">
        {/* Two-thumb vertical range slider, spanning −1…1. Implemented as two
            native range inputs (testable via fireEvent.change) overlaid on a
            gradient track that matches the field plot's colormap anchors. */}
        <div
          className="flex shrink-0 flex-col items-center justify-between text-[9px] text-ink-soft"
          data-testid="modulator-range"
        >
          {/* Track ends are a fixed +1 / −1 axis — NOT "max"/"min" — because the
              thumbs can cross (max may sit below min). Thumb COLOR carries the
              min/max identity instead (garnet = max, sapphire = min). */}
          <span className="num">+1</span>
          <div
            className="relative my-1 w-2 flex-1 rounded-xs border border-hairline"
            style={{
              background: `linear-gradient(to top, ${ANCHOR_NEG}, ${ANCHOR_MID} 50%, ${ANCHOR_POS})`,
            }}
          >
            <span className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap text-[8px] text-gray-400">
              neutral
            </span>
            {/* Two vertical inputs stacked over the track. They are pointer-
                transparent (.mod-range) so only the triangle thumbs are grabbable
                — each can be dragged independently and past the other. min/max
                bounds let jsdom fireEvent.change drive them in tests. */}
            <input
              type="range"
              aria-label="Modulation range max"
              data-testid="modulator-range-max"
              min={-1}
              max={1}
              step={0.05}
              value={range.max}
              onChange={(e) => setRangeMax(Number(e.target.value))}
              className="mod-range mod-range-max absolute inset-0 h-full w-full"
              style={{ writingMode: "vertical-lr", direction: "rtl" }}
            />
            <input
              type="range"
              aria-label="Modulation range min"
              data-testid="modulator-range-min"
              min={-1}
              max={1}
              step={0.05}
              value={range.min}
              onChange={(e) => setRangeMin(Number(e.target.value))}
              className="mod-range mod-range-min absolute inset-0 h-full w-full"
              style={{ writingMode: "vertical-lr", direction: "rtl" }}
            />
          </div>
          <span className="num">−1</span>
        </div>

        {/* Field "waveform" readout — the guide's scalar field. The box is
            relatively-positioned so FieldOverlay (absolute inset-0) fills it. */}
        <div
          className="relative overflow-hidden rounded-cell border border-hairline bg-paper"
          style={{ width: 140, height: 140 }}
          data-testid="modulator-display"
        >
          <FieldOverlay
            field={fieldForLayer(layer)}
            canvasW={140}
            canvasH={140}
            opacity={1}
            range={range}
            offset={offsetActive ? offset : 0}
          />
        </div>
      </div>

      {/* Preview in 3D (S8, PRD D2/D5) — opens Surface B (the modulation
          height-surface) focused on THIS guide's field. The relief shows the RAW
          field (the cause); the device range above is a 2D-readout remap and is
          deliberately NOT applied to the relief (§3.4). Acts as a TOGGLE: while
          THIS guide's preview is open the button reads "Close preview" and closes
          it (so there's a way out of Surface B, which is launched here, not from
          the lens). previewButtonState is the pure (tested) decision. */}
      {(() => {
        const pv = previewButtonState({
          subMode: threeDSubMode,
          focusLayerId: threeDFocusLayerId,
          layerId: layer.id,
        });
        return (
          <button
            type="button"
            data-testid="modulator-preview-3d"
            aria-pressed={pv.previewingThis}
            onClick={() =>
              pv.action === "close"
                ? onClosePreview?.()
                : onPreviewField?.(layer.id)
            }
            className={`w-full rounded-xs border px-2 py-1 text-[11px] font-medium transition-colors ${
              pv.previewingThis
                ? "border-violet bg-violet/10 text-ink"
                : "border-hairline bg-paper-warm text-ink-soft hover:border-violet hover:text-ink"
            }`}
          >
            {pv.label}
          </button>
        );
      })()}

      {/* Device controls — offset / shape / steps, shared across all maps.
          Offset is shown only when at least one mapped target consumes it
          (density / distort); on warp/lattice/no-target it does nothing, so we
          hide the knob rather than leave a dead control. */}
      <div className="space-y-2">
        {offsetActive && (
        <label className="flex items-center gap-2 text-[11px] text-ink-soft">
          <span className="w-12 whitespace-nowrap">Offset</span>
          <input
            type="range"
            data-testid="modulator-offset"
            aria-label="Offset"
            min={-1}
            max={1}
            step={0.05}
            value={offset}
            onChange={(e) => patchModulator({ offset: Number(e.target.value) })}
            className="flex-1 accent-violet"
          />
          <span className="w-9 text-right tabular-nums text-ink num">
            {offset.toFixed(2)}
          </span>
        </label>
        )}

        <ShapeCurve
          label="Shape"
          value={shape}
          onChange={(v) => patchModulator({ shape: v })}
        />

        <label className="flex items-center gap-2 text-[11px] text-ink-soft">
          <span className="w-12 whitespace-nowrap">Steps</span>
          <input
            type="range"
            data-testid="modulator-steps"
            aria-label="Steps"
            min={0}
            max={24}
            step={1}
            value={steps}
            onChange={(e) => patchModulator({ steps: Number(e.target.value) })}
            className="flex-1 accent-violet"
          />
          <span className="w-9 text-right tabular-nums text-ink num">
            {steps}
          </span>
        </label>
      </div>
        </>
      )}

      {/* Targets list — one row per map. */}
      <div className="space-y-1.5">
        <h4 className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
          Targets
        </h4>

        {maps.length === 0 && (
          <p className="text-[11px] text-ink-soft/70">No targets mapped.</p>
        )}

        {maps.map((m) => (
          <div
            key={m.targetLayerId}
            data-testid="modulator-map"
            className="space-y-1 rounded-cell border border-hairline bg-paper-warm p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-ink" title={nameFor(m.targetLayerId)}>
                {nameFor(m.targetLayerId)}
              </span>
              <button
                type="button"
                data-testid="modulator-unmap"
                aria-label={`Unmap ${nameFor(m.targetLayerId)}`}
                onClick={() => removeMap(m.targetLayerId)}
                className="shrink-0 rounded-xs px-1 text-xs text-ink-soft hover:text-ink"
              >
                ×
              </button>
            </div>

            {m.channel === "lattice" ? (
              // Lattice is all-or-nothing placement — no continuous amount.
              <p className="text-[11px] text-ink-soft/70">
                Stamped at each grid node.
              </p>
            ) : (
              <label className="flex items-center gap-2 text-[11px] text-ink-soft">
                <span className="w-12 whitespace-nowrap">Amount</span>
                <input
                  type="range"
                  data-testid="modulator-amount"
                  aria-label="Amount"
                  min={0}
                  max={3}
                  step={0.1}
                  value={m.amount ?? 1}
                  onChange={(e) =>
                    patchMap(m.targetLayerId, { amount: Number(e.target.value) })
                  }
                  className="flex-1 accent-violet"
                />
                <span className="w-9 text-right tabular-nums text-ink num">
                  {(m.amount ?? 1).toFixed(1)}
                </span>
              </label>
            )}

            {/* Modulation-scoped param (§5) — the target Grid's `warpNodes`,
                surfaced here "for convenience" but OWNED by the grid layer (hence
                the "Grid layer" owner label). Shown only when this map warps a
                grid. Writes through the generic onUpdateLayer; the spread of
                `...targetLayer.params` is REQUIRED — onUpdateLayer shallow-merges
                the top level, so omitting siblings would clobber the grid's other
                params. */}
            {(() => {
              const targetLayer = (layers || []).find(
                (l) => l.id === m.targetLayerId
              );
              if (!(m.channel === "warp" && targetLayer?.patternType === "grid"))
                return null;
              return (
                <ModulationParamBox owner="Grid layer">
                  <WarpNodesControl
                    testidSuffix="-modulator"
                    value={targetLayer.params?.warpNodes ?? 6}
                    onChange={(v) =>
                      onUpdateLayer(m.targetLayerId, {
                        params: { ...targetLayer.params, warpNodes: Number(v) },
                      })
                    }
                  />
                </ModulationParamBox>
              );
            })()}
          </div>
        ))}

        {/* Add a target — selecting an option appends a map and resets. */}
        <select
          data-testid="modulator-add-target"
          aria-label="Add target"
          value=""
          onChange={(e) => addTarget(e.target.value)}
          disabled={candidates.length === 0}
          className="w-full rounded-xs border border-hairline bg-paper-warm px-1 py-0.5 text-[11px] text-ink outline-none focus:border-violet disabled:opacity-50"
        >
          <option value="">+ Add target</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || c.patternType}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// Legal motif hosts now come from the shared classifier (src/lib/motif/hostKinds):
// the SEMANTIC hosts (grid/recursive/spiral/voronoi) expose structural anchors,
// while B2's EDGE hosts (flowfield/wave/…) support generic edge-mode motifs via
// drawn-polyline capture. MOTIF_HOSTS below is the UNION — every type the device
// may attach a motif to. Whether a given host uses semantic or edge anchoring is
// resolved downstream (resolveMotifHostParams forces anchorMode:'edge' for edge
// hosts); the device only branches on isSemanticHost for its role defaults/UI.

// Motif device panel — add/edit/remove motifs that ADORN this host layer.
// Shown ONLY for an eligible HOST (a grid/recursive/spiral pattern layer, never
// a motif layer itself). Each motif is a sibling layer whose params.hostLayerId
// points back here (motifHostId); we list those, editing their selection +
// placement binding. Every write re-spreads the whole params.binding via
// deepMergeBinding so a partial patch never clobbers another branch — same
// re-spread invariant as ModulatorDevice, extended to a nested schema.
function MotifDevice({ layer, layers, onUpdateLayer, onAddMotif, onRemoveLayer, customGlyphs, onEditGlyph, onNewMotif, onImportFile, libraryMotifs, onCopyLibraryGlyph, onUseLibraryGlyph, motifPick, onMotifPick, onOpenLibrary, motifPlacementStats }) {
  // OPEN by default, and the state survives selection changes (motif-shell,
  // D). The audit's top discoverability finding: SelectedLayerInspector is
  // keyed by layer.id, so this component REMOUNTS on every selection — a
  // plain useState(false) re-collapsed the device every time and the feature
  // was effectively invisible. The disclosure stays (vertical space still
  // matters) but the default flips to open and the choice persists per
  // device via localStorage, surviving both remounts and sessions.
  // Declared BEFORE the self-hide early return (Rules of Hooks).
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("sonoform-motif-device-open") !== "0";
    } catch {
      return true;
    }
  });
  const setOpenPersistent = (next) => {
    setOpen(next);
    try {
      localStorage.setItem("sonoform-motif-device-open", next ? "1" : "0");
    } catch {
      /* private mode — session-only is fine */
    }
  };

  // Import-SVG-as-motif plumbing (WI-5). A single device-level hidden file input
  // is shared by every row's "Import" button; the row that opened it is tracked
  // in a ref (set synchronously on click, read in the async change handler) so
  // no re-render has to settle between the click and the file-chosen event.
  // Declared BEFORE the self-hide early return (rules-of-hooks).
  const importInputRef = useRef(null);
  const importTargetIdRef = useRef(null);

  // Self-hide: a motif layer isn't a host, and only anchor-capable pattern
  // types host motifs today.
  if (isMotifLayer(layer) || !MOTIF_HOSTS.has(layer.patternType)) return null;

  const motifs = (layers || []).filter(
    (l) => isMotifLayer(l) && motifHostId(l) === layer.id
  );

  // The user's GLOBAL library motifs (P4), threaded into every row's
  // GlyphPickerChip. Set grouping + the copied-library-motif dedupe now live
  // in buildGlyphEntries (shared with MotifLibraryPanel) rather than inline
  // optgroups here.
  const library = libraryMotifs || [];

  // Rebuild params.binding whole on every write (deep-merge the patch), then
  // re-spread params (onUpdateLayer shallow-merges the top level). Used ONLY for
  // PLACEMENT edits (Size / Flip) — placement is a fixed tail (ADR-0004), never a
  // chain block, so a placement edit on a legacy binding legitimately keeps it
  // legacy (the mutual-exclusivity trap is about CHAIN edits, not placement).
  const patchMotif = (m, bindingPatch) =>
    onUpdateLayer(m.id, {
      params: {
        ...m.params,
        binding: deepMergeBinding(m.params?.binding, bindingPatch),
      },
    });

  // The Block-chain edit path (C2) — the FIRST block edit on a legacy binding
  // must rewrite legacy→chain AND apply the edit as ONE undo entry (the C1
  // handoff trap): ensureChainForm FIRST (compiles + DROPS `selection`, so
  // deepMergeBinding can't resurrect it), then produce the new chain array, then a
  // SINGLE onUpdateLayer. `mutate` is a pure chainEditor op over the base chain;
  // when it returns the SAME array ref (a rejected drop / forbidden add) we skip
  // the write entirely — no legacy→chain migration, no phantom undo entry.
  const editChain = (m, mutate) => {
    const base = ensureChainForm(m.params?.binding);
    const nextChain = mutate(base.chain);
    if (nextChain === base.chain) return; // no-op → no churn
    onUpdateLayer(m.id, {
      params: {
        ...m.params,
        binding: deepMergeBinding(base, { chain: nextChain }),
      },
    });
  };

  // Arm the shared file input for a specific motif row, then open the picker.
  const openImportFor = (motifId) => {
    importTargetIdRef.current = motifId;
    importInputRef.current?.click();
  };

  // Edit / Duplicate-to-edit (Wave 3, #77). The fork decision (custom → edit
  // in place; built-in/unresolved → fork a Draft Glyph) now lives entirely in
  // the Motif Edit Session's `open(layerId, glyphRef)` (CONTEXT.md "Motifs" —
  // grilled decision 3). Inspector just names which layer + ref was clicked.
  const openEditorFor = (m) => {
    onEditGlyph?.(m.id, m.params?.glyphRef);
  };

  // Tap a Sequencer SLOT → open that slot's glyph in the Motif Edit Session with
  // SLOT CONTEXT (C3, #79). The session's fork/Save-as-copy paths rebind THIS
  // slot (binding.chain[seq].slots[slotIndex].glyphRef) instead of the layer's
  // base glyphRef; editing a custom slot in place needs no rebind (shared id).
  // `glyphRef` is the slot's effective ref (slot.glyphRef ?? base) resolved in
  // the card. seqIndex is unused by `open` (it derives the at-most-one sequence
  // from the binding) but kept in the signature for locality.
  const openSlotEditorFor = (m, seqIndex, slotIndex, glyphRef) => {
    onEditGlyph?.(m.id, glyphRef, { slotIndex });
  };

  // File-input mechanics only (Wave 3, #77): the read → parse → error → commit
  // flow that used to live here now lives in the session's `importFromFile`
  // (CONTEXT.md "Motifs" — grilled decision 4), including error reporting
  // through Studio's `onError` seam. This handler just resolves which row
  // armed the input and hands the raw file + target layer id through.
  const handleImportChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file
    const targetId = importTargetIdRef.current;
    importTargetIdRef.current = null;
    if (!file || !targetId) return;
    onImportFile?.(file, targetId);
  };

  // Anchor MODE splits on host kind: a SEMANTIC host (grid/voronoi/…) resolves
  // structural anchors, an EDGE host (flowfield/wave/…) has only generic edge
  // anchors (resolveMotifHostParams also forces edge mode there). The default
  // selection ROLE, though, must be a role the specific host actually PRODUCES
  // under default params — grid/recursive/voronoi emit `crossing`, but a default
  // spiral does NOT (its only crossing is a hub needing arms that share the
  // origin), so defaultRolesForHost gives spiral `edge` instead. A blanket
  // `crossing` here would empty the selection on spiral and nothing would render.
  const hostIsSemantic = isSemanticHost(layer.patternType);
  // Shared with the library panel's drag-apply (motif-shell, D) so the two
  // add paths can never drift on anchor mode / roles / placement defaults.
  const addMotif = () =>
    onAddMotif?.(layer.id, defaultMotifAddOpts(layer.patternType, "leaf"));

  // Role scoping (semantic hosts expose crossing/tip/cell; edge hosts only Edges)
  // now lives inside MotifBlockRack's Route card, driven by hostIsSemantic.

  return (
    <div
      className="space-y-3 border-t border-hairline pt-3"
      data-testid="motif-device"
    >
      <button
        type="button"
        data-testid="motif-toggle"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpenPersistent(next);
          // Disarm canvas-pick on card COLLAPSE (C4 disarm event): the arm button
          // lives inside {open && …}, so collapsing would otherwise strand the
          // ephemeral motifPick with the overlay still armed and no visible
          // off-switch. Only clear when THIS device owns the armed motif.
          if (!next && motifPick && motifs.some((m) => m.id === motifPick.layerId)) {
            onMotifPick?.(null);
          }
        }}
        className="flex w-full items-center gap-1.5 text-left text-xs font-semibold text-ink-soft uppercase tracking-wider outline-none hover:text-ink focus:text-ink"
      >
        <span aria-hidden="true" className="text-[10px] leading-none">
          {open ? "▾" : "▸"}
        </span>
        <span>Motif</span>
        {!open && motifs.length > 0 && (
          <span className="font-normal normal-case tracking-normal text-ink-soft/70">
            · {motifs.length}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Shared hidden file input backing every row's "Import SVG as motif…"
              button. The armed row is tracked in importTargetIdRef. Mirrors the
              File>Import idiom in Studio (hidden input + accept + reset value). */}
          <input
            ref={importInputRef}
            type="file"
            accept=".svg,image/svg+xml"
            data-testid="motif-import-input"
            className="hidden"
            onChange={handleImportChange}
          />

          {/* Starter chips (C5, #79) — curated one-tap chain presets, built-in
              glyphs only. Each tap creates a NEW motif via the SAME onAddMotif
              seam as "+ Add Motif" below, pre-populated with the chip's
              host-aware chain + slots (chip.build(patternType) already
              returns a chain-form binding — createMotifParams/normalizeBinding
              preserve `.chain` verbatim, C1 — so the rack renders its Blocks
              immediately, no first-edit rewrite needed). */}
          <div className="space-y-1" data-testid="motif-starter-chips">
            <p className="text-[10px] font-medium uppercase tracking-wide text-ink-soft/70">
              Quick start
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STARTER_CHIPS.map((chip) => {
                const built = chip.build(layer.patternType);
                const previewGlyph = MOTIF_GLYPHS[built.glyphRef];
                return (
                  <button
                    key={chip.id}
                    type="button"
                    data-testid={`motif-chip-${chip.id}`}
                    title={chip.label}
                    onClick={() => onAddMotif?.(layer.id, built)}
                    className="flex items-center gap-1 rounded-full border border-hairline bg-paper px-2 py-1 text-[10px] text-ink-soft outline-none transition-colors hover:border-violet hover:text-ink"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="-12 -12 24 24"
                      aria-hidden="true"
                      className="shrink-0"
                    >
                      {previewGlyph?.paths?.[0]?.d && (
                        <path
                          d={previewGlyph.paths[0].d}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                      )}
                    </svg>
                    <span className="whitespace-nowrap">{chip.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {motifs.length === 0 && (
            <p className="text-[11px] text-ink-soft/70">
              No motifs on this host.
            </p>
          )}

          {motifs.map((m) => {
        const glyphRef = m.params?.glyphRef;
        // Custom glyphs edit in place; built-ins are read-only → "Duplicate to
        // edit" (the Edit button forks a copy first). WI-P2-2.
        const isCustomGlyph =
          !!glyphRef && !MOTIF_GLYPHS[glyphRef] && !!customGlyphs?.[glyphRef];
        // The effective Block chain for DISPLAY — readChain lazy-compiles a legacy
        // binding on the fly so a not-yet-rewritten motif still shows its Blocks.
        // Edit indices line up because editChain applies to ensureChainForm(old),
        // which produces the same compiled chain.
        const chain = readChain(m.params?.binding);
        const size = m.params?.binding?.placement?.sizing?.size ?? 18;
        const flip = m.params?.binding?.placement?.flip === true;
        // Placement budget (2026-07-19, docs §6): present only when THIS motif's
        // placements were truncated by MAX_PLACEMENTS. No silent cap — surface it.
        const budget = motifPlacementStats?.[m.id];

        return (
          <div
            key={m.id}
            data-testid="motif-row"
            className="space-y-2 rounded-cell border border-hairline bg-paper-warm p-2"
          >
            {budget && (
              <p
                data-testid="motif-placement-warning"
                className="rounded-xs border border-amber-400/50 bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
              >
                Showing {budget.placed.toLocaleString()} of{" "}
                {budget.total.toLocaleString()} placements — reduce density or
                host complexity.
              </p>
            )}
            {/* Glyph picker chip + remove (motif-shell, D). The chip replaces
                the old native <select>: the applied glyph's THUMBNAIL is the
                value, and clicking it opens the flyout picker (search / recents
                / set tabs / thumbnail grid). Commit routing is unchanged:
                COPY-on-use (P4) for a library pick — copy + rebind fold into
                ONE undo entry via the onUseLibraryGlyph seam (P5-2), with the
                legacy two-call fallback when Studio hasn't wired it. */}
            <div className="flex items-center gap-2">
              <GlyphPickerChip
                glyphRef={glyphRef}
                customGlyphs={customGlyphs}
                libraryMotifs={library}
                onManageLibrary={onOpenLibrary}
                onPick={(picked) => {
                  const params = { ...m.params, glyphRef: picked.glyphId };
                  if (picked.kind === "library" && onUseLibraryGlyph) {
                    onUseLibraryGlyph(picked.glyph, m.id, params);
                    return;
                  }
                  if (picked.kind === "library" && !customGlyphs?.[picked.glyphId]) {
                    onCopyLibraryGlyph?.(picked.glyph);
                  }
                  onUpdateLayer(m.id, { params });
                }}
              />
              <button
                type="button"
                data-testid="motif-remove"
                aria-label="Remove motif"
                onClick={() => onRemoveLayer?.(m.id)}
                className="shrink-0 rounded-xs px-1 text-xs text-ink-soft hover:text-ink"
              >
                ×
              </button>
            </div>

            {/* Import SVG as motif — replaces THIS row's glyph with an imported
                one. Built-ins above stay read-only (P1); only the selection
                changes here, never the built-in geometry. Edit opens the pen
                editor (custom → in place; built-in → duplicate-to-edit). */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="motif-import"
                onClick={() => openImportFor(m.id)}
                className="flex-1 rounded-xs border border-hairline bg-paper px-2 py-0.5 text-[11px] text-ink-soft outline-none transition-colors hover:border-violet hover:text-ink"
              >
                Import SVG as motif…
              </button>
              <button
                type="button"
                data-testid="motif-new"
                aria-label="New motif"
                title="Draw a new motif from scratch"
                onClick={() => onNewMotif?.(m.id)}
                className="shrink-0 rounded-xs border border-hairline bg-paper px-2 py-0.5 text-[11px] text-ink-soft outline-none transition-colors hover:border-violet hover:text-ink"
              >
                New…
              </button>
              <button
                type="button"
                data-testid="motif-edit"
                aria-label={isCustomGlyph ? "Edit motif" : "Duplicate to edit"}
                title={isCustomGlyph ? "Edit motif" : "Duplicate to edit"}
                onClick={() => openEditorFor(m)}
                className="shrink-0 rounded-xs border border-hairline bg-paper px-2 py-0.5 text-[11px] text-ink-soft outline-none transition-colors hover:border-violet hover:text-ink"
              >
                <span aria-hidden="true">✎</span>
              </button>
            </div>

            {/* The Block stack (C2) — the selection CHAIN as reorderable Block
                cards (route/everyN/skip/density/field + the terminal Sequencer).
                Replaces the old flat role/Every-N controls; roles now live in the
                Route card. Every edit routes through editChain (first-edit rewrite
                as one undo entry + no-op guard). */}
            <MotifBlockRack
              chain={chain}
              hostIsSemantic={hostIsSemantic}
              onEditChain={(mutate) => editChain(m, mutate)}
              // Canvas-pick arm state (C4): this row is armed only when the
              // Studio-level pick target names THIS motif; onArmRoute reports the
              // route block index back up (ephemeral, one armed at a time).
              armedRouteIndex={
                motifPick?.layerId === m.id ? motifPick.blockIndex : null
              }
              onArmRoute={(idx) =>
                onMotifPick?.(
                  idx == null ? null : { layerId: m.id, blockIndex: idx }
                )
              }
              customGlyphs={customGlyphs}
              baseGlyphRef={glyphRef}
              onEditSlotGlyph={(seqIndex, slotIndex, slotGlyphRef) =>
                openSlotEditorFor(m, seqIndex, slotIndex, slotGlyphRef)
              }
            />

            {/* Placement (fixed tail, ADR-0004 — NOT a chain block): Size + Flip.
                Kept as fixed controls so authoring them never regresses. */}
            <div className="space-y-1.5 border-t border-hairline/60 pt-2">
              <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                <span className="whitespace-nowrap">Size</span>
                <input
                  type="number"
                  data-testid="motif-size"
                  aria-label="Size"
                  min={1}
                  step={1}
                  value={size}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    const next = Number.isFinite(raw) && raw >= 1 ? raw : 1;
                    patchMotif(m, {
                      placement: { sizing: { size: next } },
                    });
                  }}
                  className="w-14 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-[11px] text-ink outline-none focus:border-violet num"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                <input
                  type="checkbox"
                  data-testid="motif-flip"
                  aria-label="Flip"
                  checked={flip}
                  onChange={(e) =>
                    patchMotif(m, { placement: { flip: e.target.checked } })
                  }
                />
                <span>Flip</span>
              </label>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        data-testid="motif-add"
        onClick={addMotif}
        className="w-full rounded-xs border border-hairline bg-paper-warm px-2 py-1 text-[11px] font-medium text-ink-soft outline-none transition-colors hover:border-violet hover:text-ink"
      >
        + Add Motif
      </button>
        </>
      )}
    </div>
  );
}

// The param-editing body for one selected layer. Split into its own component so
// usePatternCache (a hook) is only called when a layer is actually selected —
// hooks can't be called conditionally inside Inspector itself.
function SelectedLayerInspector({ layer, layers, panels, colorView, etchBitmap, unit, profileId, onUpdateLayer, onChangeLayerPattern, onVariableWeightChange, onPreviewField, onClosePreview, threeDSubMode, threeDFocusLayerId, onAddMotif, onRemoveLayer, customGlyphs, onEditGlyph, onNewMotif, onImportFile, libraryMotifs, onCopyLibraryGlyph, onUseLibraryGlyph, motifPick, onMotifPick, onOpenLibrary, motifPlacementStats }) {
  // Pattern swap: route through the same cache machine LayerCard uses, applied via
  // the pair-aware onChangeLayerPattern when present (falls back to a plain param
  // update so the component works standalone / in tests without a router).
  const applyPatternPatch = onChangeLayerPattern
    ? (patch) => onChangeLayerPattern(layer.id, patch)
    : (patch) => onUpdateLayer(layer.id, patch);
  const { handlePatternChange } = usePatternCache(layer, applyPatternPatch);

  // Param context value — identical wiring to LayerCard's boundary, bound to the
  // selected layer's id so edits patch the right layer.
  const layerParamsValue = buildLayerParamsValue({
    patternType: layer.patternType,
    params: layer.params,
    // Active document unit so length-tagged params (#13) display/convert in it.
    unit,
    onChange: (params) => onUpdateLayer(layer.id, { params }),
    randomizeKeys: layer.randomizeKeys,
    onRandomizeKeysChange: (keys) =>
      onUpdateLayer(layer.id, { randomizeKeys: keys }),
  });

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="inspector-params">
      <DockToggle />
      {isMotifLayer(layer) ? (
        /* A motif layer is an adornment, not a pattern: no swap control
           (changeLayerPattern refuses motif layers — audit 2026-07 bug 1;
           the old live PatternSelect here silently corrupted the layer).
           Point at the owning host instead. */
        <div className="space-y-1.5" data-testid="motif-layer-info">
          <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
            Motif
          </h3>
          <p className="rounded-cell border border-hairline bg-paper-warm px-2 py-1.5 text-[11px] text-ink-soft">
            Adorns{" "}
            <span className="font-medium text-ink">
              {layers?.find((l) => l.id === motifHostId(layer))?.name ||
                "a deleted layer"}
            </span>
            . Select the host layer to edit this motif&apos;s glyph, blocks,
            and placement.
          </p>
        </div>
      ) : (
        /* Pattern type + swap control, pinned at the top. */
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
            Pattern
          </h3>
          <PatternSelect active={layer.patternType} onChange={handlePatternChange} />
        </div>
      )}

      {/* Motif device — add/edit/remove motifs adorning this host. Collapsed by
          default and pinned ABOVE the pattern params so it's the first thing a
          user sees for a host layer (mobile discoverability). Self-hides unless
          the selected layer is an eligible host (grid/recursive/spiral) → renders
          nothing, leaving no empty gap for non-host layers. */}
      <MotifDevice
        layer={layer}
        layers={layers}
        onUpdateLayer={onUpdateLayer}
        onAddMotif={onAddMotif}
        onRemoveLayer={onRemoveLayer}
        customGlyphs={customGlyphs}
        onEditGlyph={onEditGlyph}
        onNewMotif={onNewMotif}
        onImportFile={onImportFile}
        libraryMotifs={libraryMotifs}
        onCopyLibraryGlyph={onCopyLibraryGlyph}
        onUseLibraryGlyph={onUseLibraryGlyph}
        motifPick={motifPick}
        onMotifPick={onMotifPick}
        onOpenLibrary={onOpenLibrary}
        motifPlacementStats={motifPlacementStats}
      />

      {/* Etch Stack rack (Raster Etch S2, #81) — the ordered, reorderable,
          bypassable stack of Stages an Etch's luma field flows through before
          screening, with the Tone Stage controls. Self-hides for non-Etch
          layers, so it costs nothing for vector layers. */}
      <EtchStackRack layer={layer} onUpdateLayer={onUpdateLayer} />

      {/* Highlight Hold (Raster Etch S4, #83) — the FIXED TERMINAL clamp that
          guarantees no dot etches above the cutoff, rendered as its OWN control
          BELOW the Stack (never a Stage: it can't be dragged into the Stack,
          reordered, or bypassed). Material-aware default (mirror → on) resolved
          from the layer's panel material. Self-hides for non-Etch layers. */}
      <EtchHighlightHold layer={layer} panels={panels} colorView={colorView} onUpdateLayer={onUpdateLayer} />

      {/* 1:1 "what etches" preview hero (Raster Etch S9, #88) — a pixel-accurate
          verification view of the Etch's exported 1-bit output (the held band
          shaded), so the maker can inspect the true dot density before an
          irreversible mirror cut. Reads the SAME single-source `etchBitmap` the
          canvas draws + svgExport embeds (grilled decision 4) — never a second
          resolve. Self-hides for non-Etch layers / while the bitmap resolves. */}
      <EtchPreviewHero layer={layer} bitmap={etchBitmap} />

      {/* Collapsible, grouped param controls (Structure / Scale / Variation /
          Stroke / Transform — the existing PARAM_GROUPS). */}
      {layerParamsValue && (
        <LayerParamsProvider value={layerParamsValue}>
          <PatternParams />
        </LayerParamsProvider>
      )}

      {/* Modulation-scoped param (§5) — the Grid's `warpNodes`, shown in the grid
          panel ONLY while the grid is an active 'warp' target (a modulator maps a
          warp channel to it and can produce a field). Owner label "Modulation".
          Same canonical write as the modulator-row site; the `...layer.params`
          spread is REQUIRED (shallow top-level merge). */}
      {layer.patternType === "grid" &&
        resolveModulationForTarget(layer, layers) !== null && (
          <ModulationParamBox owner="Modulation">
            <WarpNodesControl
              testidSuffix="-panel"
              value={layer.params?.warpNodes ?? 6}
              onChange={(v) =>
                onUpdateLayer(layer.id, {
                  params: { ...layer.params, warpNodes: Number(v) },
                })
              }
            />
          </ModulationParamBox>
        )}

      {/* Variable line-weight UI (#17, C8) — capability-gated, OFF by default. */}
      <VariableWeightControls
        layer={layer}
        profileId={profileId}
        onVariableWeightChange={onVariableWeightChange}
      />

      {/* Modulator device (pattern modulation, modulator-centric) — shown only
          for a layer that can produce a field (the guide / Chladni). */}
      <ModulatorDevice
        layer={layer}
        layers={layers}
        onUpdateLayer={onUpdateLayer}
        onPreviewField={onPreviewField}
        onClosePreview={onClosePreview}
        threeDSubMode={threeDSubMode}
        threeDFocusLayerId={threeDFocusLayerId}
      />
    </div>
  );
}

export default function Inspector({
  layers = [],
  // WI-4 Naqsha Panels: the panel array. The Highlight Hold control (Raster Etch
  // S4, #83) reads the selected Etch's panel material (via layer.panelId) to
  // resolve the material-aware default. Optional — defaults to [] so standalone /
  // legacy callers keep rendering (Hold then reads as "no panel" → off).
  panels = [],
  // The Material-lens state (mode + selected material). The Highlight Hold control
  // (Raster Etch S4, #83) reads the EFFECTIVE material — panel material OR this
  // lens material — to resolve its material-aware default (review FIX A). Optional.
  colorView = null,
  selectedLayerId,
  // Resolved single-source Etch bitmap for the selected layer (Raster Etch S9,
  // #88), surfaced from useCanvas → RightPanel → Studio. The 1:1 "what etches"
  // preview hero reads it — the SAME buffer that exports, no second resolve. Null
  // while resolving / for non-Etch layers → the hero self-hides. Optional.
  etchBitmap = null,
  // Active document unit ('mm' | 'in' | 'px') from Studio. Threaded into the
  // param context so length-tagged params display/convert in it (#13). Undefined
  // = raw px display (back-compat with callers that don't pass it).
  unit,
  // Active machine profile id (#17, C8) — capability-gates the variable-weight
  // UI (drag-cutter hides it). Optional; undefined hides the feature.
  profileId,
  onUpdateLayer,
  onChangeLayerPattern,
  // Per-layer variable-weight change handler (#17, C8). Optional no-op default so
  // the Inspector renders standalone / in tests without a Studio router.
  onVariableWeightChange,
  // "Preview in 3D" launcher (S8, PRD D2) — opens Surface B focused on the guide
  // layer's field. Optional; undefined → the ModulatorDevice button no-ops.
  onPreviewField,
  // Close handler for the 3D preview (Surface B). Wired to the same exit path the
  // canvas "✕" / lens uses. Optional; undefined → the "Close preview" branch no-ops.
  onClosePreview,
  // Live 3D sub-mode + focused guide id, so the ModulatorDevice button can flip to
  // "Close preview" when THIS guide is being previewed. Optional (legacy/tests).
  threeDSubMode,
  threeDFocusLayerId,
  // Add a motif layer adorning a host (useLayers.addMotifLayer) and remove a
  // layer by id (reuses the same delete handler the object tree uses). Optional
  // so the Inspector still renders standalone / in legacy callers.
  onAddMotif,
  onRemoveLayer,
  // Custom-glyph store (WI-5) — `customGlyphs` lists imported motifs in the
  // picker (read-only prop; all writes route through the Motif Edit Session /
  // Glyph Commits below). Optional (standalone / legacy callers).
  customGlyphs,
  // Open the Motif Edit Session for a motif row's glyph (Wave 3, #77): a
  // direct pass-through to `useMotifEditorSession`'s `open(layerId, glyphRef)`
  // — the fork decision (custom edits in place, built-in forks a Draft Glyph)
  // lives entirely in the session now. Optional.
  onEditGlyph,
  // "New motif…" (draw-from-scratch): a direct pass-through to the session's
  // `openNew(layerId)` — a blank Draft Glyph, pen tool active. Optional.
  onNewMotif,
  // Import SVG as motif (Wave 3, #77): a direct pass-through to the session's
  // `importFromFile(file, layerId)` — the full read/parse/error/commit flow
  // lives entirely in the session now. Optional.
  onImportFile,
  // P4 global library: the signed-in user's promoted motifs (`{id,name,glyph}[]`)
  // listed in a "My library" optgroup, and the COPY-on-use seam that stamps a
  // chosen library glyph into the document's customGlyphs. Both optional.
  libraryMotifs,
  onCopyLibraryGlyph,
  // P5-2: the single batched copy-on-use seam. When present, a library select
  // goes through this (Studio wraps copy+rebind in recordBatch = ONE undo entry)
  // instead of the legacy two-call onCopyLibraryGlyph + onUpdateLayer. Optional.
  onUseLibraryGlyph,
  // Sheet inspector (#75): with nothing selected AND these provided, the empty
  // state becomes the Sheet inspector (work-piece dims + preset + bed line).
  // All optional — legacy callers / standalone tests keep the neutral
  // placeholder. Studio routes onApplySheetSize through the SAME
  // handleDocumentSetupApply path the Document Setup dialog uses (one code
  // path mutates the work piece; recordBatch = one undo entry per commit).
  canvasW,
  canvasH,
  bedSize,
  onApplySheetSize,
  // Canvas-pick (C4, #79): the ephemeral pick target `{layerId, blockIndex}` (or
  // null) shared with the canvas AnchorGhostOverlay, and the setter. Both
  // optional — a standalone Inspector renders the Route card without the
  // "Pick on canvas" affordance doing anything.
  motifPick,
  onMotifPick,
  // Motif-shell (D): "Manage library…" in the glyph-picker flyout switches
  // the left column to the Motifs surface. Optional — standalone Inspectors
  // simply hide the link.
  onOpenLibrary,
  // Placement-budget stats (layerId → {total, placed}) for the MotifDevice
  // "no silent cap" warning (2026-07-19 post-crash hardening, docs §6). Only
  // truncated motif layers appear; keyed by the MOTIF child's id (the device
  // renders on the host and lists its children). Optional → no warning.
  motifPlacementStats,
}) {
  // Resolved font for the text-properties readouts (cap-height / engrave
  // warnings). May be null on first paint before useFont resolves — the panel's
  // helpers all no-op on null, so it renders its controls regardless. Hook lives
  // at the top of the component (before any early return) per rules-of-hooks.
  const { font } = useFont();

  const layer =
    selectedLayerId != null
      ? layers.find((l) => l.id === selectedLayerId) || null
      : null;

  // Text layers get a dedicated properties panel instead of the pattern param
  // controls. Edits patch the LAYER's params (Option B): onUpdate receives a
  // patch of node fields, merged shallowly into layer.params via onUpdateLayer.
  if (layer && isTextLayer(layer)) {
    return (
      <div className="flex flex-col gap-3 p-3" data-testid="inspector-text">
        <DockToggle />
        <TextPropertiesPanel
          node={textNodeFromLayer(layer)}
          font={font}
          onUpdate={(patch) =>
            onUpdateLayer(layer.id, { params: { ...layer.params, ...patch } })
          }
        />
      </div>
    );
  }

  if (!layer) {
    // Sheet inspector (#75): empty selection = document properties (the Figma
    // mechanic), when Studio wires the Sheet props. DockToggle stays with the
    // branch, mirroring the placeholder below.
    if (typeof canvasW === "number" && typeof canvasH === "number") {
      return (
        <div className="flex h-full flex-col">
          <div className="flex justify-end p-1">
            <DockToggle />
          </div>
          <SheetInspector
            canvasW={canvasW}
            canvasH={canvasH}
            unit={unit}
            bedSize={bedSize}
            onApplySize={onApplySheetSize}
          />
        </div>
      );
    }
    // Neutral document / empty state — single-select drives the inspector, so
    // with nothing selected there is no per-object editor to show.
    return (
      <div
        data-testid="inspector-empty"
        className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center"
      >
        <DockToggle />
        <p className="text-xs font-medium text-ink-soft">No selection</p>
        <p className="text-[11px] text-ink-soft/70">
          Select a layer to edit its parameters.
        </p>
      </div>
    );
  }

  return (
    <SelectedLayerInspector
      // Remount on selection change so each selected layer gets a fresh editor
      // subtree (mirrors LayerCard's per-layer keying; avoids any cross-layer
      // state bleed in the param controls).
      key={layer.id}
      layer={layer}
      layers={layers}
      panels={panels}
      colorView={colorView}
      etchBitmap={etchBitmap}
      unit={unit}
      profileId={profileId}
      onUpdateLayer={onUpdateLayer}
      onChangeLayerPattern={onChangeLayerPattern}
      onVariableWeightChange={onVariableWeightChange}
      onPreviewField={onPreviewField}
      onClosePreview={onClosePreview}
      threeDSubMode={threeDSubMode}
      threeDFocusLayerId={threeDFocusLayerId}
      onAddMotif={onAddMotif}
      onRemoveLayer={onRemoveLayer}
      customGlyphs={customGlyphs}
      onEditGlyph={onEditGlyph}
      onNewMotif={onNewMotif}
      onImportFile={onImportFile}
      libraryMotifs={libraryMotifs}
      onCopyLibraryGlyph={onCopyLibraryGlyph}
      onUseLibraryGlyph={onUseLibraryGlyph}
      motifPick={motifPick}
      onMotifPick={onMotifPick}
      onOpenLibrary={onOpenLibrary}
      motifPlacementStats={motifPlacementStats}
    />
  );
}
