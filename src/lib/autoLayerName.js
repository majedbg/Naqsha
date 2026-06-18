import { PATTERN_SYMBOLS } from '../constants';

// Centralized auto-naming for layers (WI-1, §8). When a pattern type has a
// symbol in PATTERN_SYMBOLS it names the layer `Pattern (<symbol>)` (e.g.
// `Pattern (Sg)`); otherwise it falls back to the legacy `Layer N` scheme
// (covers symbol-less types like `import` / `ai-*`). NO auto-indexing — two
// `Pattern (Sg)` layers may coexist. `index` is only consulted for the fallback.
export function autoLayerName(patternType, index = 0) {
  const symbol = PATTERN_SYMBOLS[patternType];
  if (symbol) return `Pattern (${symbol})`;
  return `Layer ${index + 1}`;
}
