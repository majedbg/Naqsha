// Inspector — selection-driven parameter editor for the pro shell's right column
// (Lane B / B3, GitHub issue #6).
//
// This is the strangler slice that RELOCATES the existing parameter editor into
// the shell's Inspector region and makes it context-sensitive on the current
// single selection. It does NOT rebuild any controls: it composes the exact same
// primitives LayerCard composes for its param body —
//   • PatternTabs              → the pattern-type swap control (pinned at top)
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

import PatternTabs from "../PatternTabs";
import PatternParams from "../PatternParams";
import DockToggle from "./DockToggle";
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
import FieldOverlay from "../FieldOverlay";
import ShapeCurve from "../ui/ShapeCurve";
import { channelForTarget } from "../../lib/fields/channelConsumers";

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
//   • device controls (offset / shape / steps) shared by all maps,
//   • a Targets list — one row per map (name, amount, polarity, unmap) plus an
//     "+ Add target" control.
//
// Stored schema (on the GUIDE layer):
//   layer.modulator = {
//     offset, shape, steps,
//     maps: [ { targetLayerId, channel:'density', amount, polarity } ]
//   }
//
// Every edit commits through the SAME onUpdateLayer path the rest of the
// inspector uses (shallow top-level merge), so it's live-previewed, undoable and
// autosaved — no separate apply button (human-in-the-loop: preview/apply/revert).
// Because the merge is shallow, every write spreads the WHOLE current modulator
// (a partial { modulator: { offset } } would drop maps).
function ModulatorDevice({ layer, layers, onUpdateLayer }) {
  if (!canProduceField(layer)) return null;

  // Current device, with defaults filled in (layer.modulator is undefined until
  // the first edit). Computed inline — no useMemo narrowing (React Compiler).
  const current = layer.modulator || {};
  const offset = current.offset ?? 0;
  const shape = current.shape ?? 0;
  const steps = current.steps ?? 0;
  const maps = Array.isArray(current.maps) ? current.maps : [];

  // Rebuild the whole modulator from the current one on every write.
  const patchModulator = (patch) => {
    onUpdateLayer(layer.id, {
      modulator: { offset, shape, steps, maps, ...patch },
    });
  };
  const setMaps = (nextMaps) => patchModulator({ maps: nextMaps });

  // Candidate targets: any layer that consumes a modulation channel —
  // channelForTarget is the single source of truth (grainfield→density;
  // chladni/topographic/flowfield→warp). Excludes the guide itself and any
  // already-mapped target.
  const mapped = new Set(maps.map((m) => m.targetLayerId));
  const candidates = (layers || []).filter(
    (l) =>
      l.id !== layer.id &&
      channelForTarget(l.patternType) !== null &&
      !mapped.has(l.id)
  );

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
    setMaps([
      ...maps,
      { targetLayerId, channel, amount: 1, polarity: "bipolar" },
    ]);
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
        />
      </div>

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

            <div
              className="flex items-center gap-1 text-[11px]"
              role="group"
              aria-label="Polarity"
            >
              <span className="w-12 whitespace-nowrap text-ink-soft">Polarity</span>
              {["bipolar", "unipolar"].map((pol) => {
                const active = (m.polarity ?? "bipolar") === pol;
                return (
                  <button
                    key={pol}
                    type="button"
                    data-testid={`modulator-polarity-${pol}`}
                    aria-pressed={active}
                    onClick={() => patchMap(m.targetLayerId, { polarity: pol })}
                    className={[
                      "flex-1 rounded-xs border px-1 py-0.5 capitalize",
                      active
                        ? "border-violet bg-violet/10 text-ink"
                        : "border-hairline text-ink-soft hover:text-ink",
                    ].join(" ")}
                  >
                    {pol}
                  </button>
                );
              })}
            </div>
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

// The param-editing body for one selected layer. Split into its own component so
// usePatternCache (a hook) is only called when a layer is actually selected —
// hooks can't be called conditionally inside Inspector itself.
function SelectedLayerInspector({ layer, layers, unit, profileId, onUpdateLayer, onChangeLayerPattern, onVariableWeightChange }) {
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
        <PatternTabs active={layer.patternType} onChange={handlePatternChange} />
      </div>

      {/* Collapsible, grouped param controls (Structure / Scale / Variation /
          Stroke / Transform — the existing PARAM_GROUPS). */}
      {layerParamsValue && (
        <LayerParamsProvider value={layerParamsValue}>
          <PatternParams />
        </LayerParamsProvider>
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
      />
    </div>
  );
}

export default function Inspector({
  layers = [],
  selectedLayerId,
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
      unit={unit}
      profileId={profileId}
      onUpdateLayer={onUpdateLayer}
      onChangeLayerPattern={onChangeLayerPattern}
      onVariableWeightChange={onVariableWeightChange}
    />
  );
}
