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
import { canProduceLattice } from "../../lib/fields/latticeForLayer";
import { resolveModulationForTarget } from "../../lib/fields/resolveModulationForTarget";
import { ANCHOR_POS, ANCHOR_MID, ANCHOR_NEG } from "../../lib/fields/colormap";
import { isMotifLayer, motifHostId, deepMergeBinding } from "../../lib/motif/motifLayer";
import { MOTIF_GLYPHS, getGlyph } from "../../lib/motif/glyphs";
import EtchStackRack from "./EtchStackRack";
import EtchHighlightHold from "./EtchHighlightHold";
import EtchPreviewHero from "./EtchPreviewHero";

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

      {/* Device controls — offset / shape / steps, shared across all maps. */}
      <div className="space-y-2">
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

// Hosts that expose semantic anchors today. Grid/recursive/spiral derive anchors
// from params (formula); voronoi derives them from its DRAWN cells, captured at
// render time and threaded through useCanvas → resolveMotifHostParams → the
// MotifPattern semantic path (see src/lib/motif/semanticAnchors.js). Edge-on-
// arbitrary hosts still need a generic drawn-geometry seam and remain excluded.
// The anchor-ghost overlay does NOT yet support voronoi (it can't reach the
// per-frame hostGeometry) — deferred follow-on.
const MOTIF_HOSTS = new Set(["grid", "recursive", "spiral", "voronoi"]);

const MOTIF_ROLES = [
  { key: "crossing", label: "Crossings" },
  { key: "edge", label: "Edges" },
  { key: "tip", label: "Tips" },
  { key: "cell", label: "Cells" },
];

// Motif device panel — add/edit/remove motifs that ADORN this host layer.
// Shown ONLY for an eligible HOST (a grid/recursive/spiral pattern layer, never
// a motif layer itself). Each motif is a sibling layer whose params.hostLayerId
// points back here (motifHostId); we list those, editing their selection +
// placement binding. Every write re-spreads the whole params.binding via
// deepMergeBinding so a partial patch never clobbers another branch — same
// re-spread invariant as ModulatorDevice, extended to a nested schema.
function MotifDevice({ layer, layers, onUpdateLayer, onAddMotif, onRemoveLayer, customGlyphs, onEditGlyph, onNewMotif, onImportFile, libraryMotifs, onCopyLibraryGlyph, onUseLibraryGlyph }) {
  // Collapsed by default (mobile discoverability: the device sits at the TOP of
  // the Inspector for a host layer but stays folded until the user opens it).
  // Declared BEFORE the self-hide early return — the component renders
  // unconditionally and hides itself, so the hook must run every render
  // (Rules of Hooks).
  const [open, setOpen] = useState(false);

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

  // Imported motif glyphs (WI-5) — listed in the picker under a "Custom"
  // optgroup, alongside the read-only built-ins. Optional/undefined-safe so the
  // device still renders standalone (legacy callers / tests without a store).
  //
  // P4: a third "My library" optgroup lists the user's GLOBAL library motifs.
  // A placed library motif is COPIED into customGlyphs keyed by its uuid, so it
  // would otherwise appear in BOTH groups — dedupe it out of "Custom" so each id
  // shows exactly once (under "My library" if it's a library motif).
  const library = libraryMotifs || [];
  const libraryIds = new Set(library.map((m) => m.id));
  const customList = Object.values(customGlyphs || {}).filter(
    (g) => !libraryIds.has(g.id)
  );

  // Rebuild params.binding whole on every write (deep-merge the patch), then
  // re-spread params (onUpdateLayer shallow-merges the top level).
  const patchMotif = (m, bindingPatch) =>
    onUpdateLayer(m.id, {
      params: {
        ...m.params,
        binding: deepMergeBinding(m.params?.binding, bindingPatch),
      },
    });

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

  const addMotif = () =>
    onAddMotif?.(layer.id, {
      glyphRef: "leaf",
      anchorMode: "semantic",
      binding: {
        selection: { roles: ["crossing"], rate: { n: 1 } },
        placement: {
          sizing: { mode: "proportional", size: 18, min: 3, margin: 0.85 },
          orientation: { policy: "path", useNormal: true },
          flip: false,
        },
      },
    });

  return (
    <div
      className="space-y-3 border-t border-hairline pt-3"
      data-testid="motif-device"
    >
      <button
        type="button"
        data-testid="motif-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
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
          {motifs.length === 0 && (
            <p className="text-[11px] text-ink-soft/70">
              No motifs on this host.
            </p>
          )}

          {motifs.map((m) => {
        const glyphRef = m.params?.glyphRef;
        const glyph = getGlyph(glyphRef, customGlyphs);
        // Custom glyphs edit in place; built-ins are read-only → "Duplicate to
        // edit" (the Edit button forks a copy first). WI-P2-2.
        const isCustomGlyph =
          !!glyphRef && !MOTIF_GLYPHS[glyphRef] && !!customGlyphs?.[glyphRef];
        const roles = Array.isArray(m.params?.binding?.selection?.roles)
          ? m.params.binding.selection.roles
          : [];
        const n = m.params?.binding?.selection?.rate?.n ?? 1;
        const size = m.params?.binding?.placement?.sizing?.size ?? 18;
        const flip = m.params?.binding?.placement?.flip === true;

        const toggleRole = (roleKey) => {
          const next = roles.includes(roleKey)
            ? roles.filter((r) => r !== roleKey)
            : [...roles, roleKey];
          patchMotif(m, { selection: { roles: next } });
        };

        return (
          <div
            key={m.id}
            data-testid="motif-row"
            className="space-y-2 rounded-cell border border-hairline bg-paper-warm p-2"
          >
            {/* Glyph select + swatch + remove */}
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-ink-soft" aria-hidden="true">
                <svg width="18" height="18" viewBox="-12 -12 24 24">
                  {glyph?.paths?.[0]?.d && (
                    <path
                      d={glyph.paths[0].d}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  )}
                </svg>
              </span>
              <select
                data-testid="motif-glyph"
                aria-label="Glyph"
                value={glyphRef ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  // COPY-on-use (P4): selecting a global-library motif copies its
                  // glyph into the document's customGlyphs keyed by uuid (unless
                  // already present — idempotent), THEN rebinds the row. The doc
                  // stays self-contained (share links carry the copy).
                  const lib = library.find((x) => x.id === val);
                  const params = { ...m.params, glyphRef: val };
                  // P5-2: a library select is copy + rebind = TWO document
                  // mutations. Route them through the single `onUseLibraryGlyph`
                  // seam so Studio folds them into ONE undo entry (recordBatch) —
                  // a single ⌘Z reverts the whole placement. Fall back to the
                  // legacy two-call path only when Studio hasn't wired the seam.
                  if (lib && onUseLibraryGlyph) {
                    onUseLibraryGlyph(lib.glyph, m.id, params);
                    return;
                  }
                  if (lib && !customGlyphs?.[val]) {
                    onCopyLibraryGlyph?.(lib.glyph);
                  }
                  onUpdateLayer(m.id, { params });
                }}
                className="flex-1 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-[11px] text-ink outline-none focus:border-violet"
              >
                <optgroup label="Built-in">
                  {Object.values(MOTIF_GLYPHS).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </optgroup>
                {library.length > 0 && (
                  <optgroup label="My library">
                    {library.map((lm) => (
                      <option key={lm.id} value={lm.id}>
                        {lm.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {customList.length > 0 && (
                  <optgroup label="Custom">
                    {customList.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
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

            {/* Roles — which anchor kinds this motif adorns */}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {MOTIF_ROLES.map((r) => (
                <label
                  key={r.key}
                  className="flex items-center gap-1 text-[11px] text-ink-soft"
                >
                  <input
                    type="checkbox"
                    data-testid={`motif-role-${r.key}`}
                    aria-label={r.label}
                    checked={roles.includes(r.key)}
                    onChange={() => toggleRole(r.key)}
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>

            {/* Every-Nth + Size */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                <span className="whitespace-nowrap">Every</span>
                <input
                  type="number"
                  data-testid="motif-rate-n"
                  aria-label="Every Nth"
                  min={1}
                  step={1}
                  value={n}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    const next =
                      Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : 1;
                    patchMotif(m, { selection: { rate: { n: next } } });
                  }}
                  className="w-12 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-[11px] text-ink outline-none focus:border-violet num"
                />
              </label>
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
            </div>

            {/* Flip */}
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
function SelectedLayerInspector({ layer, layers, panels, colorView, etchBitmap, unit, profileId, onUpdateLayer, onChangeLayerPattern, onVariableWeightChange, onPreviewField, onClosePreview, threeDSubMode, threeDFocusLayerId, onAddMotif, onRemoveLayer, customGlyphs, onEditGlyph, onNewMotif, onImportFile, libraryMotifs, onCopyLibraryGlyph, onUseLibraryGlyph }) {
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
      {/* Pattern type + swap control, pinned at the top. */}
      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
          Pattern
        </h3>
        <PatternSelect active={layer.patternType} onChange={handlePatternChange} />
      </div>

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
    />
  );
}
