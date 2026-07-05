import { useState, useCallback, useEffect, useRef } from 'react';
import { DEFAULT_PARAMS, DEFAULT_COLORS, MAX_LAYERS, PATTERN_PARAM_DEFS, RANDOMIZE_EXCLUDED_KEYS, PATTERN_SYMBOLS } from '../constants';
import { randomPatchForDef } from './params/paramOps';
import { getDynamicDefaults, getDynamicParamDefs } from './patternRegistry';
import { isMoireMember, findMoirePartnerA, findMoirePartnerB } from './moirePair';
import { migrateLayer } from './migration';
import { autoLayerName } from './autoLayerName';
import { operationIdForRole } from './operations';
import { parseSVGImport } from './svgImport';
import { defaultTextParams } from './text/textLayer';
import { MOTIF_TYPE, createMotifParams, motifAutoName } from './motif/motifLayer';
import { getGlyph } from './motif/glyphs';
import { normalizePanels, loadPanels, savePanels } from './panels';

// Distinct group id for a Moiré pair (links role A + role B).
let nextGroupNum = 1;
function genMoireGroupId() {
  return `moire-${nextGroupNum++}-${Math.random().toString(36).slice(2, 8)}`;
}

// Default field-param set for a Moiré layer (role A holds these; B reads A's).
function moireDefaults() {
  return { ...DEFAULT_PARAMS.moire };
}

function moireRandomizeKeys() {
  return (PATTERN_PARAM_DEFS.moire || [])
    .filter((d) => !RANDOMIZE_EXCLUDED_KEYS.includes(d.key))
    .map((d) => d.key);
}

// Both members of a Moiré member's group, as { a, b } (either may be null).
function moirePairOf(layer, allLayers) {
  return {
    a: findMoirePartnerA(layer, allLayers),
    b: findMoirePartnerB(layer, allLayers),
  };
}

const BG_STORAGE_KEY = 'sonoform-bg-color';
const DEFAULT_BG_COLOR = '#0a1628';

let nextId = 1;
function genId() {
  return `layer-${nextId++}-${Math.random().toString(36).slice(2, 8)}`;
}

function randomSeed() {
  return Math.floor(Math.random() * 100000);
}

// Pattern-switch name recompute (WI-1 §8). When a layer's name is auto
// (nameIsCustom === false) and the target type has a symbol, recompute the
// auto-name. Custom names stay frozen; symbol-less targets keep the old name
// (avoids a meaningless "Layer N" jump on switch). Returns a patch fragment.
function nameRecompute(layer, patch) {
  if (layer.nameIsCustom !== false) return {};
  if (!PATTERN_SYMBOLS[patch.patternType]) return {};
  return { name: autoLayerName(patch.patternType) };
}

// `requestedType` (optional) lets the pattern-picker create a layer of a chosen
// type. Moiré is NOT acceptable here — it's a two-surface pair spawned via
// changeLayerPattern; a lone moiré layer would be a broken orphan. Unknown/blank
// requests fall back to the index-cycled default. Defaults/param-defs resolve
// from the static tables first, then the dynamic registry (AI / built-in extras).
function createLayer(index, requestedType) {
  const types = ['spirograph', 'flowfield', 'phyllotaxis', 'wave', 'voronoi', 'recursive', 'phyllodash', 'grainfield', 'flowhatch', 'feather', 'turing', 'duality', 'radialetch', 'grid', 'spiral', 'modulegrid', 'topographic', 'diffgrowth', 'girih', 'circlepacking', 'dendrite'];
  const valid = typeof requestedType === 'string' && requestedType && requestedType !== 'moire';
  const patternType = valid ? requestedType : types[index % types.length];
  const defaults = DEFAULT_PARAMS[patternType] || getDynamicDefaults(patternType) || {};
  const defs = PATTERN_PARAM_DEFS[patternType] || getDynamicParamDefs(patternType) || [];
  return {
    id: genId(),
    name: autoLayerName(patternType, index),
    nameIsCustom: false,
    locked: false,
    color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    opacity: 100,
    visible: true,
    bgColor: '#ffffff',
    bgOpacity: 0,
    patternType,
    params: { ...defaults },
    seed: randomSeed(),
    randomizeKeys: defs
      .filter((d) => !RANDOMIZE_EXCLUDED_KEYS.includes(d.key))
      .map((d) => d.key),
    paramsCache: {},
    // Fabrication metadata — consumed only when Prepare's output mode
    // applies. Safe to exist in plotter/design modes; just ignored.
    role: 'cut',          // 'cut' | 'score' | 'engrave' — legacy assignment surface
    operationId: operationIdForRole('cut'), // operation-library reference (issue #1)
    penSlot: (index % 4) + 1, // 1..4 — used in plotter output mode
    // Panel membership (Naqsha Panels WI-1). Born null; the load-time normalizer
    // assigns it to the first panel. Runtime assignment to a selected panel is
    // WI-5/6, not here.
    panelId: null,
  };
}

const STORAGE_KEY = 'sonoform-layers';

function loadLayers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every((l) => typeof l.id === 'string')) return null;
    // Sync nextId to avoid ID collisions with restored layers
    let maxNum = 0;
    for (const l of parsed) {
      const match = l.id.match(/^layer-(\d+)-/);
      if (match) maxNum = Math.max(maxNum, Number(match[1]));
      // Sanitize randomizeKeys against current RANDOMIZE_EXCLUDED_KEYS
      if (l.randomizeKeys) {
        l.randomizeKeys = l.randomizeKeys.filter((k) => !RANDOMIZE_EXCLUDED_KEYS.includes(k));
      }
    }
    nextId = maxNum + 1;
    // Migration boundary (local): legacy layers carry `role` but no
    // `operationId`. Map them forward so export/canvas resolve through an
    // operation. Never reset-to-default.
    return parsed.map((l) => migrateLayer(l));
  } catch {
    return null;
  }
}

// randomPatchForDef is imported from ./params/paramOps (canonical single source
// of truth). The old inline copies had a bug: randomValueForDef branched on
// `def.type === 'select'` which missed `iconselect` defs (e.g. shape, fillMode)
// and produced NaN. paramOps branches on `def.options` presence instead.

// `recordEdit`/`recordStructural` are the unified-history injection seam
// (undo-history-plan §4). Each mutator calls the relevant one IMMEDIATELY BEFORE
// its setLayers (capture-before-change, §3.1) so the engine snapshots the
// pre-edit document. They default to no-ops, so call sites that don't wire
// history (tests, legacy harnesses) behave exactly as before.
//   - recordEdit(signature): coalescing param edit (slider/number burst → one
//     entry; the caller keys by `signature` to flush when the target changes).
//   - recordStructural(): a discrete, immediate entry (add/remove/reorder/etc).
// NOTE (accepted, §4 advisor note #3): record fires before the mutator runs, so
// a no-op mutation (e.g. add/remove blocked at the tier cap, randomize of a
// locked layer) still leaves a dead undo step that restores an identical doc —
// harmless (no corruption), refined later if it proves annoying.
export default function useLayers({ persistToLocal = true, maxLayers = MAX_LAYERS, getDefaultOperationId, recordEdit, recordStructural } = {}) {
  // Hold the injected recorders in refs (synced in an effect, not during render)
  // so the mutators below stay referentially stable — their existing deps are
  // unchanged and memoized consumers don't churn. The injected fns are already
  // stable in Studio; the refs just decouple them from the mutators' closures.
  const recordEditRef = useRef(recordEdit);
  const recordStructuralRef = useRef(recordStructural);
  useEffect(() => {
    recordEditRef.current = recordEdit;
    recordStructuralRef.current = recordStructural;
  });
  const recordEditFn = useCallback((signature) => {
    recordEditRef.current?.(signature);
  }, []);
  const recordStructuralFn = useCallback(() => {
    recordStructuralRef.current?.();
  }, []);
  // Effective capacity = the tier cap (Guest 3, Free/Pro/Studio 6), never above
  // the hard MAX_LAYERS. Existing call sites that don't pass maxLayers keep the
  // old MAX_LAYERS behavior.
  const cap = Math.min(maxLayers ?? MAX_LAYERS, MAX_LAYERS);

  // One-time mount init (Naqsha Panels WI-1). Compute the initial layers AND the
  // normalized panels together via a ref guard, then seed both useStates from
  // it. This applies the normalizer's CORRECTED layers (so seeded/loaded layers
  // actually carry a panelId) in the SAME render — no intermediate panelId:null
  // render and no StrictMode double-init hazard.
  const initRef = useRef(null);
  if (initRef.current === null) {
    const baseLayers = persistToLocal
      ? (loadLayers() ?? [createLayer(0), createLayer(1)])
      : [createLayer(0)];
    const storedPanels = persistToLocal ? loadPanels() : null;
    initRef.current = normalizePanels(storedPanels, baseLayers);
  }

  const [layers, setLayers] = useState(initRef.current.layers);
  const [panels, setPanels] = useState(initRef.current.panels);

  // Global background color behind all layers
  const [bgColor, setBgColor] = useState(() => {
    if (persistToLocal) {
      try { return localStorage.getItem(BG_STORAGE_KEY) || DEFAULT_BG_COLOR; } catch { return DEFAULT_BG_COLOR; }
    }
    return DEFAULT_BG_COLOR;
  });

  // Debounced save to localStorage. 3000ms (undo-history-plan §10/§12): the
  // unified-history Tier-1 writer rides this same cadence, and a longer window
  // coalesces undo/redo bursts. Trade-off: worst-case crash-loss grows from
  // ~0.5s to ~3s (accepted).
  const saveTimer = useRef(null);
  useEffect(() => {
    if (!persistToLocal) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(layers));
        localStorage.setItem(BG_STORAGE_KEY, bgColor);
        savePanels(panels); // sonoform-panels (WI-1) rides the same debounce
      } catch { /* storage full or unavailable */ }
    }, 3000);
    return () => clearTimeout(saveTimer.current);
  }, [layers, bgColor, panels]);

  // `patternType` optional (from the pattern picker). The `typeof === 'string'`
  // guard means a bare `onClick={addLayer}` (which would pass an event) still
  // creates a default-cycled layer, unchanged.
  // `getDefaultOperationId` (issue #11/C2) supplies the document DEFAULT operation
  // for newly added layers — set via the stroke/operation swatch with nothing
  // selected. Read at call time (a getter, not a value) so the latest default
  // applies without re-creating addLayer. When omitted or unresolved, the new
  // layer keeps createLayer's Cut default — byte-stable with the legacy path.
  const addLayer = useCallback((patternType, opts) => {
    const requested = typeof patternType === 'string' ? patternType : undefined;
    // Panel assignment (Naqsha Panels). Additive optional 2nd arg: when
    // `opts.panelId` is provided the new layer is born on that panel; otherwise
    // panelId stays as createLayer sets it (null) and the normalizer assigns it.
    const panelId = opts?.panelId;
    const defaultOpId = typeof getDefaultOperationId === 'function' ? getDefaultOperationId() : undefined;
    recordStructuralFn(); // history: discrete structural entry (capture-before)
    setLayers((prev) => {
      if (prev.length >= cap) return prev;
      const layer = createLayer(prev.length, requested);
      const withOp = defaultOpId ? { ...layer, operationId: defaultOpId } : layer;
      return [...prev, panelId !== undefined ? { ...withOp, panelId } : withOp];
    });
  }, [cap, getDefaultOperationId, recordStructuralFn]);

  // Import an SVG file's outline as ONE place-as-artwork layer (issue #12, C4).
  // Parses the SVG → imported-path layer carrying the verbatim `d` data in
  // `params.pathData`, marked `type:'import'`, defaulting to the document's Cut
  // operation. Additive: it never touches existing pattern layers. Returns
  // { ok, error? } so callers (File>Import, drag-drop, paste) can surface a
  // graceful message. Capacity-aware (respects the tier cap, like addLayer).
  // `opts.transform` (optional) seeds the layer's committed transform — used by
  // click-to-place so a kit/imported asset lands centred under the cursor instead
  // of at its native ~0,0. Returns the new layer `id` so callers can auto-select
  // it. File>Import / drag-drop / paste pass no transform (unchanged behaviour);
  // they have the same 0,0 landing and could adopt placement later — out of scope.
  const addImportedLayer = useCallback((svgString, opts = {}) => {
    const parsed = parseSVGImport(svgString);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    // Capacity decided synchronously off live `layers` (setLayers is async),
    // mirroring changeLayerPattern's pattern, so the returned outcome is exact.
    if (layers.length >= cap) return { ok: false, error: 'Layer limit reached.' };

    recordStructuralFn(); // history: past the cap guard, this will mutate
    // Generate the id once, outside the updater, so it survives StrictMode's
    // double-invoke and can be returned to the caller for selection.
    const id = genId();
    setLayers((prev) => {
      if (prev.length >= cap) return prev; // re-check against live state
      const index = prev.length;
      const layer = {
        id,
        name: `Imported ${index + 1}`,
        nameIsCustom: false,
        locked: false,
        type: 'import',
        color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        opacity: 100,
        visible: true,
        bgColor: '#ffffff',
        bgOpacity: 0,
        // `import` is not a generative pattern; patternType keeps the same name
        // so any consumer that reads it sees a stable, non-colliding value.
        patternType: 'import',
        params: { pathData: parsed.paths },
        seed: 0,
        randomizeKeys: [],
        paramsCache: {},
        role: 'cut',
        operationId: operationIdForRole('cut'), // default operation = Cut
        penSlot: (index % 4) + 1,
        panelId: null, // Panel membership (WI-1); normalizer assigns on load.
        ...(opts.transform ? { transform: opts.transform } : {}),
      };
      return [...prev, layer];
    });
    return { ok: true, id };
  }, [cap, layers, recordStructuralFn]);

  // Create a TEXT layer (Option B: text objects are layers, like `import`).
  // Mirrors addImportedLayer's structure exactly: id generated outside the
  // updater (survives StrictMode double-invoke, returned for selection),
  // capacity decided synchronously off live `layers`, returns { ok, id } or
  // { ok:false, error }. Text defaults to the ENGRAVE role (per the text-tool
  // plan) and a stable, non-colliding `patternType: 'text'`. `opts.text` seeds
  // the initial string; `opts.params` overrides persisted defaults; an optional
  // `opts.transform` seeds the committed transform (used by pointer-create).
  const addTextLayer = useCallback((opts = {}) => {
    if (layers.length >= cap) return { ok: false, error: 'Layer limit reached.' };

    recordStructuralFn(); // history: past the cap guard, this will mutate
    const id = genId();
    setLayers((prev) => {
      if (prev.length >= cap) return prev; // re-check against live state
      const index = prev.length;
      const layer = {
        id,
        name: `Text ${index + 1}`,
        nameIsCustom: false,
        locked: false,
        type: 'text',
        color: '#000000',
        opacity: 100,
        visible: true,
        bgColor: '#ffffff',
        bgOpacity: 0,
        patternType: 'text',          // stable, non-colliding (mirrors import)
        params: defaultTextParams({ text: opts.text ?? '', ...(opts.params || {}) }),
        seed: 0,
        randomizeKeys: [],
        paramsCache: {},
        role: 'engrave',              // text defaults to ENGRAVE
        operationId: operationIdForRole('engrave'),
        penSlot: (index % 4) + 1,
        panelId: null, // Panel membership (WI-1); normalizer assigns on load.
        ...(opts.transform ? { transform: opts.transform } : {}),
      };
      return [...prev, layer];
    });
    return { ok: true, id };
  }, [cap, layers, recordStructuralFn]);

  // Create a MOTIF layer that adorns an existing host layer (headless plumbing;
  // no UI this slice). Mirrors addTextLayer EXACTLY: id generated outside the
  // updater (survives StrictMode double-invoke, returned for selection), cap
  // decided synchronously off live `layers`, same structural-record fn, returns
  // { ok, id } or { ok:false, error }. Motifs default to the ENGRAVE role (like
  // text) and a stable, non-colliding `patternType: 'motif'`. The auto name is
  // read off live `layers` for the host (null-safe). `opts` selects the glyph,
  // anchor mode (default 'semantic'), and placement binding.
  const addMotifLayer = useCallback((hostLayerId, opts = {}) => {
    if (layers.length >= cap) return { ok: false, error: 'Layer limit reached.' };

    recordStructuralFn(); // history: past the cap guard, this will mutate
    const id = genId();
    const host = layers.find((l) => l.id === hostLayerId) || null;
    setLayers((prev) => {
      if (prev.length >= cap) return prev; // re-check against live state
      const index = prev.length;
      const layer = {
        id,
        name: motifAutoName(host, getGlyph(opts.glyphRef)),
        nameIsCustom: false,
        locked: false,
        type: MOTIF_TYPE,
        color: '#000000',
        opacity: 100,
        visible: true,
        bgColor: '#ffffff',
        bgOpacity: 0,
        patternType: MOTIF_TYPE,        // stable, non-colliding (mirrors text/import)
        params: createMotifParams({
          hostLayerId,
          glyphRef: opts.glyphRef,
          anchorMode: opts.anchorMode ?? 'semantic',
          binding: opts.binding,
        }),
        seed: 0,
        randomizeKeys: [],
        paramsCache: {},
        role: 'engrave',              // motif defaults to ENGRAVE (like text)
        operationId: operationIdForRole('engrave'),
        penSlot: (index % 4) + 1,
        panelId: null, // Panel membership (WI-1); normalizer assigns on load.
        ...(opts.transform ? { transform: opts.transform } : {}),
      };
      return [...prev, layer];
    });
    return { ok: true, id };
  }, [cap, layers, recordStructuralFn]);

  const duplicateLayer = useCallback((id) => {
    recordStructuralFn(); // history: discrete structural entry
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      if (idx === -1) return prev;
      const source = prev[idx];

      const cloneLayer = (src) => {
        // Naming rule (WI-1 §8): custom source → "<name> copy" (stays custom);
        // auto source → recompute the auto-name (stays auto, NO "copy" suffix).
        const naming = src.nameIsCustom
          ? { name: `${src.name} copy`, nameIsCustom: true }
          : {
              // Auto source: recompute the auto-name (NO "copy"). Guard symbol-less
              // types (e.g. `import`) so we keep their deliberate name (`Imported N`)
              // instead of degrading to `Layer N` — mirrors nameRecompute's guard.
              name: PATTERN_SYMBOLS[src.patternType] ? autoLayerName(src.patternType) : src.name,
              nameIsCustom: false,
            };
        return {
          ...src,
          id: genId(),
          ...naming,
          params: { ...src.params },
          randomizeKeys: [...(src.randomizeKeys || [])],
          paramsCache: JSON.parse(JSON.stringify(src.paramsCache || {})),
        };
      };

      // Moiré member → duplicate BOTH members as a NEW pair (new groupId),
      // needs 2 free slots; block gracefully if unavailable.
      if (isMoireMember(source)) {
        const { a, b } = moirePairOf(source, prev);
        if (!a || !b) {
          // Degenerate pair (orphan) — fall through to single-layer clone so we
          // never silently drop the duplicate; the clone clears its role below.
          if (prev.length >= cap) return prev;
          const copy = cloneLayer(source);
          delete copy.moireRole;
          delete copy.moireGroupId;
          const next = [...prev];
          next.splice(idx + 1, 0, copy);
          return next;
        }
        if (prev.length + 2 > cap) return prev; // need 2 free slots
        const newGroupId = genMoireGroupId();
        const copyA = { ...cloneLayer(a), moireRole: 'A', moireGroupId: newGroupId };
        const copyB = { ...cloneLayer(b), moireRole: 'B', moireGroupId: newGroupId };
        // Insert the new pair right after B (the lower of the two in the array).
        const bIdx = prev.findIndex((l) => l.id === b.id);
        const insertAt = Math.max(idx, bIdx);
        const next = [...prev];
        next.splice(insertAt + 1, 0, copyA, copyB);
        return next;
      }

      if (prev.length >= cap) return prev;
      const copy = cloneLayer(source);
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }, [cap, recordStructuralFn]);

  const removeLayer = useCallback((id) => {
    recordStructuralFn(); // history: discrete structural entry
    setLayers((prev) => {
      const target = prev.find((l) => l.id === id);
      if (!target) return prev;

      // Moiré member → remove BOTH members of the group as a unit.
      if (isMoireMember(target)) {
        const groupIds = new Set(
          prev
            .filter((l) => l.moireGroupId === target.moireGroupId)
            .map((l) => l.id)
        );
        // Respect the min-1 rule on the POST-removal count.
        if (prev.length - groupIds.size < 1) return prev;
        return prev.filter((l) => !groupIds.has(l.id));
      }

      if (prev.length <= 1) return prev;
      return prev.filter((l) => l.id !== id);
    });
  }, [recordStructuralFn]);

  const updateLayer = useCallback((id, patch) => {
    // The role toggle (OutputModeSection) is the temporary assignment surface
    // until the Operations panel ships. Export + plot-preview now resolve through
    // `operationId`, so keep it in sync whenever a `role` is assigned — otherwise
    // a role edit would silently no-op the export and diverge from the preview.
    const synced =
      patch && Object.prototype.hasOwnProperty.call(patch, 'role')
        ? { ...patch, operationId: operationIdForRole(patch.role) }
        : patch;
    // History: coalescing param edit. Keyed by layer + edited fields so a slider
    // burst on one field merges into one entry, while switching layer/field
    // flushes the prior burst (capture-before-change, §3.1/§4).
    recordEditFn(`${id}:${synced ? Object.keys(synced).sort().join(',') : ''}`);
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...synced } : l))
    );
  }, [recordEditFn]);

  // Pair-aware pattern-switch ROUTER. Consumes the patch already computed by
  // usePatternCache (`{patternType, params, randomizeKeys, paramsCache}`) and
  // applies it as ONE atomic setLayers, handling the three Moiré cases:
  //   1. patch→'moire' & active is ALREADY a moiré member  → no-op.
  //   2. patch→'moire' & active is NOT a member            → SPAWN a pair
  //      (active becomes Moiré A; a linked Moiré B is inserted right after).
  //      Requires 1 free slot under `cap`; if none, NO-OP and return blocked.
  //   3. active IS a moiré member & patch→NOT 'moire'      → DISSOLVE the pair
  //      (remove the partner; the switched layer becomes a normal layer of the
  //      new type with its role fields cleared).
  // Otherwise: a plain `{...l, ...patch}` update (identical to updateLayer),
  // so non-moiré pattern switches behave exactly as before.
  //
  // Returns { ok, blocked } so the caller can surface the capacity message.
  // Because setLayers is async, capacity is decided synchronously off `layers`.
  const changeLayerPattern = useCallback((id, patch) => {
    const active = layers.find((l) => l.id === id);
    if (!active) return { ok: false, blocked: false };
    const toMoire = patch.patternType === 'moire';
    const activeIsMember = isMoireMember(active);

    // Case 1: already a moiré member and staying moiré → no-op (no 3rd surface).
    if (toMoire && activeIsMember) {
      return { ok: true, blocked: false };
    }

    // Case 2: spawn a new pair. Need exactly ONE free slot under the cap.
    if (toMoire && !activeIsMember) {
      if (layers.length + 1 > cap) {
        return { ok: false, blocked: true };
      }
      recordStructuralFn(); // history: pair-spawn pattern switch
      const groupId = genMoireGroupId();
      setLayers((prev) => {
        const idx = prev.findIndex((l) => l.id === id);
        if (idx === -1) return prev;
        if (prev.length + 1 > cap) return prev; // re-check against live state
        const src = prev[idx];
        const layerA = {
          ...src,
          patternType: 'moire',
          name: 'Moiré A',
          // Explicit: `...src` may carry a custom nameIsCustom; moiré names are
          // deliberate, so reset so a later rename works.
          nameIsCustom: false,
          locked: false,
          params: moireDefaults(),
          randomizeKeys: moireRandomizeKeys(),
          paramsCache: patch.paramsCache ?? src.paramsCache ?? {},
          moireRole: 'A',
          moireGroupId: groupId,
        };
        // B is an INDEPENDENT surface: own id, color, role, penSlot. Its params
        // are defaults but unused at render (B reads A) — kept so the layer is
        // self-consistent if it's ever orphaned mid-edit.
        const layerB = {
          id: genId(),
          name: 'Moiré B',
          nameIsCustom: false,
          locked: false,
          color: DEFAULT_COLORS[(idx + 1) % DEFAULT_COLORS.length],
          opacity: 100,
          visible: true,
          bgColor: '#ffffff',
          bgOpacity: 0,
          patternType: 'moire',
          params: moireDefaults(),
          seed: randomSeed(),
          randomizeKeys: moireRandomizeKeys(),
          paramsCache: {},
          role: 'cut',
          operationId: operationIdForRole('cut'),
          penSlot: ((idx + 1) % 4) + 1,
          panelId: null, // Panel membership (WI-1); inherited by A via ...src.
          moireRole: 'B',
          moireGroupId: groupId,
        };
        const next = [...prev];
        next.splice(idx, 1, layerA, layerB);
        return next;
      });
      return { ok: true, blocked: false };
    }

    // Case 3: switch-away — active is a moiré member, new type is NOT moiré.
    // Dissolve: remove the partner, switched layer becomes a normal layer with
    // role fields cleared. Works whether active is role A or role B.
    if (!toMoire && activeIsMember) {
      recordStructuralFn(); // history: pair-dissolve pattern switch
      setLayers((prev) => {
        const partnerIds = new Set(
          prev
            .filter((l) => l.moireGroupId === active.moireGroupId && l.id !== id)
            .map((l) => l.id)
        );
        return prev
          .filter((l) => !partnerIds.has(l.id))
          .map((l) => {
            if (l.id !== id) return l;
            // Apply the patch and strip the moiré role fields. When the name is
            // auto (nameIsCustom === false), recompute it for the new type.
            const { moireRole: _r, moireGroupId: _g, ...rest } = l;
            return { ...rest, ...patch, ...nameRecompute(l, patch) };
          });
      });
      return { ok: true, blocked: false };
    }

    // Default: ordinary pattern switch (non-moiré → non-moiré). When the layer's
    // name is auto (nameIsCustom === false), recompute it for the new type.
    recordStructuralFn(); // history: ordinary pattern switch
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch, ...nameRecompute(l, patch) } : l))
    );
    return { ok: true, blocked: false };
  }, [layers, cap, recordStructuralFn]);

  const reorderLayers = useCallback((fromIndex, toIndex) => {
    recordStructuralFn(); // history: discrete structural entry
    setLayers((prev) => {
      const moved = prev[fromIndex];
      if (!moved) return prev;

      // Moiré pairs move as one ADJACENT block. The per-card up/down buttons
      // call this with toIndex = fromIndex ± 1; a naive single-element splice
      // would split the pair. So when the moved layer is a moiré member, treat
      // the whole [A,B] block as the unit and step it past the NEXT non-member
      // (or the next whole block).
      if (isMoireMember(moved)) {
        const groupId = moved.moireGroupId;
        // Block bounds: contiguous run of same-group members around fromIndex.
        let start = fromIndex;
        while (start > 0 && prev[start - 1].moireGroupId === groupId) start--;
        let end = fromIndex;
        while (end < prev.length - 1 && prev[end + 1].moireGroupId === groupId) end++;
        const blockSize = end - start + 1;
        const dir = toIndex > fromIndex ? 1 : -1;

        const next = [...prev];
        const block = next.splice(start, blockSize); // pull the pair out
        if (dir > 0) {
          // Moving down (toward back): step over the next single layer/block.
          // After removal, the element formerly after the block now sits at
          // `start`. If it's itself a moiré block, hop the whole thing.
          if (start >= next.length) {
            next.splice(start, 0, ...block); // already at the bottom — no-op
            return next;
          }
          let insertAt = start + 1;
          const neighbor = next[start];
          if (isMoireMember(neighbor)) {
            const ng = neighbor.moireGroupId;
            let nEnd = start;
            while (nEnd < next.length - 1 && next[nEnd + 1].moireGroupId === ng) nEnd++;
            insertAt = nEnd + 1;
          }
          next.splice(insertAt, 0, ...block);
          return next;
        } else {
          // Moving up (toward front): step over the previous single layer/block.
          if (start === 0) {
            next.splice(0, 0, ...block); // already at the top — no-op
            return next;
          }
          let insertAt = start - 1;
          const neighbor = next[start - 1];
          if (isMoireMember(neighbor)) {
            const ng = neighbor.moireGroupId;
            let nStart = start - 1;
            while (nStart > 0 && next[nStart - 1].moireGroupId === ng) nStart--;
            insertAt = nStart;
          }
          next.splice(insertAt, 0, ...block);
          return next;
        }
      }

      // Non-moiré move: if the destination lands INSIDE a moiré pair, nudge it
      // to the far side so we never split a pair. Otherwise the original splice.
      const next = [...prev];
      const [m] = next.splice(fromIndex, 1);
      let dest = toIndex;
      // After removal, check the neighbor we'd be splitting between.
      const before = next[dest - 1];
      const after = next[dest];
      if (
        before && after &&
        before.moireGroupId && before.moireGroupId === after.moireGroupId
      ) {
        // Landing between A and B of the same pair — push past the pair in the
        // direction of travel.
        dest = toIndex > fromIndex ? dest + 1 : dest - 1;
        dest = Math.max(0, Math.min(next.length, dest));
      }
      next.splice(dest, 0, m);
      return next;
    });
  }, [recordStructuralFn]);

  const randomizeLayer = useCallback((id) => {
    recordStructuralFn(); // history: re-seed is a discrete entry
    setLayers((prev) =>
      prev.map((l) =>
        // Locked layers never re-seed (spec §9 — defense in depth; the per-row
        // dice is already UI-disabled on locked layers).
        l.id === id && !l.locked ? { ...l, seed: randomSeed() } : l
      )
    );
  }, [recordStructuralFn]);

  const randomizeAll = useCallback(() => {
    recordStructuralFn(); // history: re-seed all is a discrete entry
    setLayers((prev) =>
      // Skip locked layers — their seed is preserved (spec §9).
      prev.map((l) => (l.locked ? l : { ...l, seed: randomSeed() }))
    );
  }, [recordStructuralFn]);

  // Randomize checked params for a single layer
  const randomizeLayerParams = useCallback((id) => {
    recordStructuralFn(); // history: randomize params is a discrete entry
    setLayers((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        // Locked layer → no-op, params unchanged (spec §9).
        if (l.locked) return l;
        const keys = l.randomizeKeys;
        if (!keys || keys.length === 0) return l;
        const defs = PATTERN_PARAM_DEFS[l.patternType];
        if (!defs) return l;
        const newParams = { ...l.params };
        for (const key of keys) {
          const def = defs.find((d) => d.key === key);
          if (def) {
            Object.assign(newParams, randomPatchForDef(def));
          }
        }
        return { ...l, params: newParams };
      })
    );
  }, [recordStructuralFn]);

  // Randomize checked params for ALL layers
  const randomizeAllParams = useCallback(() => {
    recordStructuralFn(); // history: randomize all params is a discrete entry
    setLayers((prev) =>
      prev.map((l) => {
        // Skip locked layers — their params are preserved (spec §9).
        if (l.locked) return l;
        const keys = l.randomizeKeys;
        if (!keys || keys.length === 0) return l;
        const defs = PATTERN_PARAM_DEFS[l.patternType];
        if (!defs) return l;
        const newParams = { ...l.params };
        for (const key of keys) {
          const def = defs.find((d) => d.key === key);
          if (def) {
            Object.assign(newParams, randomPatchForDef(def));
          }
        }
        return { ...l, params: newParams };
      })
    );
  }, [recordStructuralFn]);

  const loadLayerSet = useCallback((newLayers) => {
    // Sync nextId to avoid collisions
    let maxNum = 0;
    for (const l of newLayers) {
      const match = l.id.match(/^layer-(\d+)-/);
      if (match) maxNum = Math.max(maxNum, Number(match[1]));
    }
    nextId = maxNum + 1;
    // Migration funnel: every load boundary that applies a layer set (examples,
    // cloud, share, saved groups) flows through here, so each layer ends up with
    // a resolvable `operationId` (derived from legacy `role` when absent).
    setLayers(newLayers.map((l) => migrateLayer(l)));
  }, []);

  return {
    layers, addLayer, addImportedLayer, addTextLayer, addMotifLayer, duplicateLayer, removeLayer, updateLayer, reorderLayers,
    changeLayerPattern,
    randomizeLayer, randomizeAll, randomizeLayerParams, randomizeAllParams,
    loadLayerSet, bgColor, setBgColor,
    panels, setPanels,
    cap, // effective tier layer cap (downstream P6/P7 panel duplicate-cap gating)
  };
}
