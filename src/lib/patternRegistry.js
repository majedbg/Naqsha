// Dynamic pattern registry for AI-generated patterns.
// Static patterns are registered at import time.
// AI patterns are added at runtime via registerPattern().

const dynamicPatterns = {};      // { patternId: PatternClass }
const dynamicTypes = [];         // [{ id, label }]
const dynamicDefaults = {};      // { patternId: { ...params } }
const dynamicParamDefs = {};     // { patternId: [...paramDefs] }
let listeners = [];

export function registerPattern(id, PatternClass, label, defaults, paramDefs) {
  dynamicPatterns[id] = PatternClass;
  if (!dynamicTypes.find((t) => t.id === id)) {
    dynamicTypes.push({ id, label, isAI: true });
  }
  dynamicDefaults[id] = defaults;
  dynamicParamDefs[id] = paramDefs;
  listeners.forEach((fn) => fn());
}

export function unregisterPattern(id) {
  delete dynamicPatterns[id];
  const idx = dynamicTypes.findIndex((t) => t.id === id);
  if (idx >= 0) dynamicTypes.splice(idx, 1);
  delete dynamicDefaults[id];
  delete dynamicParamDefs[id];
  listeners.forEach((fn) => fn());
}

export function getDynamicPatternClass(id) {
  return dynamicPatterns[id] || null;
}

export function getDynamicTypes() {
  return dynamicTypes;
}

export function getDynamicDefaults(id) {
  return dynamicDefaults[id] || null;
}

export function getDynamicParamDefs(id) {
  return dynamicParamDefs[id] || null;
}

export function onRegistryChange(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((l) => l !== fn); };
}
