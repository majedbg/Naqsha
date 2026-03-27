import { useState, useCallback, useEffect, useRef } from 'react';
import { DEFAULT_PARAMS, DEFAULT_COLORS, MAX_LAYERS, PATTERN_PARAM_DEFS } from '../constants';
import { UNIVERSAL_PARAM_KEYS } from './tierLimits';

let nextId = 1;
function genId() {
  return `layer-${nextId++}-${Math.random().toString(36).slice(2, 8)}`;
}

function randomSeed() {
  return Math.floor(Math.random() * 100000);
}

function createLayer(index) {
  const types = ['spirograph', 'flowfield', 'phyllotaxis', 'wave', 'voronoi', 'recursive', 'phyllodash', 'grainfield', 'flowhatch', 'feather', 'turing', 'duality', 'radialetch', 'grid', 'spiral'];
  const patternType = types[index % types.length];
  return {
    id: genId(),
    name: `Layer ${index + 1}`,
    color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    opacity: 100,
    visible: true,
    bgColor: '#ffffff',
    bgOpacity: 0,
    patternType,
    params: { ...DEFAULT_PARAMS[patternType] },
    seed: randomSeed(),
    randomizeKeys: (PATTERN_PARAM_DEFS[patternType] || [])
      .filter((d) => !UNIVERSAL_PARAM_KEYS.includes(d.key))
      .map((d) => d.key),
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
    }
    nextId = maxNum + 1;
    return parsed;
  } catch {
    return null;
  }
}

// Generate a random value for a param definition
function randomValueForDef(def) {
  if (def.type === 'select') {
    const opts = def.options;
    return opts[Math.floor(Math.random() * opts.length)].value;
  }
  // Numeric: random within [min, max], snapped to step
  const range = def.max - def.min;
  const raw = def.min + Math.random() * range;
  const snapped = Math.round(raw / def.step) * def.step;
  // Clamp and fix floating point
  const decimals = String(def.step).split('.')[1]?.length || 0;
  return parseFloat(Math.max(def.min, Math.min(def.max, snapped)).toFixed(decimals));
}

export default function useLayers({ persistToLocal = true } = {}) {
  const [layers, setLayers] = useState(() => {
    if (persistToLocal) {
      return loadLayers() ?? [createLayer(0), createLayer(1)];
    }
    return [createLayer(0)];
  });

  // Debounced save to localStorage (500ms — sliders fire at 60Hz)
  const saveTimer = useRef(null);
  useEffect(() => {
    if (!persistToLocal) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(layers));
      } catch { /* storage full or unavailable */ }
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [layers]);

  const addLayer = useCallback(() => {
    setLayers((prev) => {
      if (prev.length >= MAX_LAYERS) return prev;
      return [...prev, createLayer(prev.length)];
    });
  }, []);

  const duplicateLayer = useCallback((id) => {
    setLayers((prev) => {
      if (prev.length >= MAX_LAYERS) return prev;
      const idx = prev.findIndex((l) => l.id === id);
      if (idx === -1) return prev;
      const source = prev[idx];
      const copy = {
        ...source,
        id: genId(),
        name: `${source.name} copy`,
        params: { ...source.params },
        randomizeKeys: [...(source.randomizeKeys || [])],
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }, []);

  const removeLayer = useCallback((id) => {
    setLayers((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((l) => l.id !== id);
    });
  }, []);

  const updateLayer = useCallback((id, patch) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );
  }, []);

  const reorderLayers = useCallback((fromIndex, toIndex) => {
    setLayers((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
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
            newParams[key] = randomValueForDef(def);
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
            newParams[key] = randomValueForDef(def);
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
    randomizeLayer, randomizeAll, randomizeLayerParams, randomizeAllParams,
    loadLayerSet,
  };
}
