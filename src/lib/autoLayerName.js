import { PATTERN_SYMBOLS } from '../constants';
import { getDynamicLabel } from './patternRegistry';

// Centralized auto-naming for layers (WI-1, §8). When a pattern type has a
// symbol in PATTERN_SYMBOLS it names the layer `Pattern (<symbol>)` (e.g.
// `Pattern (Sg)`). Symbol-less types that are dynamically registered (photo-
// extracted library patterns, AI customs) carry no static symbol but DO have a
// human label in the registry — use it verbatim so an extracted layer reads
// its entry title instead of a meaningless `Layer N` (issue #49 D6). Anything
// still unresolved (e.g. `import`) falls back to the legacy `Layer N` scheme.
// NO auto-indexing — two `Pattern (Sg)` layers may coexist. `index` is only
// consulted for the fallback.
export function autoLayerName(patternType, index = 0) {
  const symbol = PATTERN_SYMBOLS[patternType];
  if (symbol) return `Pattern (${symbol})`;
  const label = getDynamicLabel(patternType);
  if (label) return label;
  return `Layer ${index + 1}`;
}
