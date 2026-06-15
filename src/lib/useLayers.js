import { useState, useCallback, useEffect, useRef } from 'react';
import { DEFAULT_PARAMS, DEFAULT_COLORS, MAX_LAYERS, PATTERN_PARAM_DEFS, RANDOMIZE_EXCLUDED_KEYS } from '../constants';
import { randomPatchForDef } from './params/paramOps';
import { getDynamicDefaults, getDynamicParamDefs } from './patternRegistry';
import { isMoireMember, findMoirePartnerA, findMoirePartnerB } from './moirePair';

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
    name: `Layer ${index + 1}`,
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
    role: 'cut',          // 'cut' | 'score' | 'engrave' — used in laser output mode
    penSlot: (index % 4) + 1, // 1..4 — used in plotter output mode
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
    return parsed;
  } catch {
    return null;
  }
}

// randomPatchForDef is imported from ./params/paramOps (canonical single source
// of truth). The old inline copies had a bug: randomValueForDef branched on
// `def.type === 'select'` which missed `iconselect` defs (e.g. shape, fillMode)
// and produced NaN. paramOps branches on `def.options` presence instead.

export default function useLayers({ persistToLocal = true, maxLayers = MAX_LAYERS } = {}) {
  // Effective capacity = the tier cap (Guest 3, Free/Pro/Studio 6), never above
  // the hard MAX_LAYERS. Existing call sites that don't pass maxLayers keep the
  // old MAX_LAYERS behavior.
  const cap = Math.min(maxLayers ?? MAX_LAYERS, MAX_LAYERS);
  const [layers, setLayers] = useState(() => {
    if (persistToLocal) {
      return loadLayers() ?? [createLayer(0), createLayer(1)];
    }
    return [createLayer(0)];
  });

  // Global background color behind all layers
  const [bgColor, setBgColor] = useState(() => {
    if (persistToLocal) {
      try { return localStorage.getItem(BG_STORAGE_KEY) || DEFAULT_BG_COLOR; } catch { return DEFAULT_BG_COLOR; }
    }
    return DEFAULT_BG_COLOR;
  });

  // Debounced save to localStorage (500ms — sliders fire at 60Hz)
  const saveTimer = useRef(null);
  useEffect(() => {
    if (!persistToLocal) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(layers));
        localStorage.setItem(BG_STORAGE_KEY, bgColor);
      } catch { /* storage full or unavailable */ }
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [layers, bgColor]);

  // `patternType` optional (from the pattern picker). The `typeof === 'string'`
  // guard means a bare `onClick={addLayer}` (which would pass an event) still
  // creates a default-cycled layer, unchanged.
  const addLayer = useCallback((patternType) => {
    const requested = typeof patternType === 'string' ? patternType : undefined;
    setLayers((prev) => {
      if (prev.length >= cap) return prev;
      return [...prev, createLayer(prev.length, requested)];
    });
  }, [cap]);

  const duplicateLayer = useCallback((id) => {
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      if (idx === -1) return prev;
      const source = prev[idx];

      const cloneLayer = (src) => ({
        ...src,
        id: genId(),
        name: `${src.name} copy`,
        params: { ...src.params },
        randomizeKeys: [...(src.randomizeKeys || [])],
        paramsCache: JSON.parse(JSON.stringify(src.paramsCache || {})),
      });

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
  }, [cap]);

  const removeLayer = useCallback((id) => {
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
  }, []);

  const updateLayer = useCallback((id, patch) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );
  }, []);

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
          penSlot: ((idx + 1) % 4) + 1,
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
            // Apply the patch and strip the moiré role fields.
            const { moireRole: _r, moireGroupId: _g, ...rest } = l;
            return { ...rest, ...patch };
          });
      });
      return { ok: true, blocked: false };
    }

    // Default: ordinary pattern switch (non-moiré → non-moiré).
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );
    return { ok: true, blocked: false };
  }, [layers, cap]);

  const reorderLayers = useCallback((fromIndex, toIndex) => {
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
  }, []);

  const randomizeLayer = useCallback((id) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, seed: randomSeed() } : l))
    );
  }, []);

  const randomizeAll = useCallback(() => {
    setLayers((prev) =>
      prev.map((l) => ({ ...l, seed: randomSeed() }))
    );
  }, []);

  // Randomize checked params for a single layer
  const randomizeLayerParams = useCallback((id) => {
    setLayers((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
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
  }, []);

  // Randomize checked params for ALL layers
  const randomizeAllParams = useCallback(() => {
    setLayers((prev) =>
      prev.map((l) => {
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
  }, []);

  const loadLayerSet = useCallback((newLayers) => {
    // Sync nextId to avoid collisions
    let maxNum = 0;
    for (const l of newLayers) {
      const match = l.id.match(/^layer-(\d+)-/);
      if (match) maxNum = Math.max(maxNum, Number(match[1]));
    }
    nextId = maxNum + 1;
    setLayers(newLayers);
  }, []);

  return {
    layers, addLayer, duplicateLayer, removeLayer, updateLayer, reorderLayers,
    changeLayerPattern,
    randomizeLayer, randomizeAll, randomizeLayerParams, randomizeAllParams,
    loadLayerSet, bgColor, setBgColor,
  };
}
