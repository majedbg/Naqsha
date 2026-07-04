// Central registry of STATIC (built-in) pattern classes, keyed by pattern id.
//
// Extracted from useCanvas.js so non-canvas consumers (e.g. the pattern-picker
// thumbnail renderer) can resolve a pattern class without pulling in the p5
// render hook. useCanvas imports PATTERN_CLASSES from here.
//
// Dynamically-registered patterns (AI-generated, and any self-registering
// built-in extras) are NOT in this map — resolve those via the registry. Use
// getPatternClass(id) to look up either source in one call.

import { getDynamicPatternClass } from '../patternRegistry';

import Spirograph from './Spirograph';
import FlowField from './FlowField';
import Phyllotaxis from './Phyllotaxis';
import WaveInterference from './WaveInterference';
import VoronoiCells from './VoronoiCells';
import RecursiveGeometry from './RecursiveGeometry';
import PhyllotaxisDash from './PhyllotaxisDash';
import GrainField from './GrainField';
import FlowHatch from './FlowHatch';
import Feather from './Feather';
import TuringDash from './TuringDash';
import Duality from './Duality';
import RadialEtch from './RadialEtch';
import Grid from './Grid';
import Spiral from './Spiral';
import ModuleGrid from './ModuleGrid';
import TopographicContours from './TopographicContours';
import DifferentialGrowth from './DifferentialGrowth';
import IslamicStar from './IslamicStar';
import Moire from './Moire';
import CirclePacking from './CirclePacking';
import Dendrite from './Dendrite';
import MotifPattern from '../motif/MotifPattern';

export const PATTERN_CLASSES = {
  spirograph: Spirograph,
  flowfield: FlowField,
  phyllotaxis: Phyllotaxis,
  wave: WaveInterference,
  voronoi: VoronoiCells,
  recursive: RecursiveGeometry,
  phyllodash: PhyllotaxisDash,
  grainfield: GrainField,
  flowhatch: FlowHatch,
  feather: Feather,
  turing: TuringDash,
  duality: Duality,
  radialetch: RadialEtch,
  grid: Grid,
  spiral: Spiral,
  modulegrid: ModuleGrid,
  topographic: TopographicContours,
  diffgrowth: DifferentialGrowth,
  girih: IslamicStar,
  moire: Moire,
  circlepacking: CirclePacking,
  dendrite: Dendrite,
  motif: MotifPattern,
};

/** Resolve a pattern class by id: static built-ins first, then the dynamic registry. */
export function getPatternClass(id) {
  return PATTERN_CLASSES[id] || getDynamicPatternClass(id) || null;
}

// Patterns whose generate() is a PURE function of its params and ignores the seed
// entirely — verified against each source: they call ctx.randomSeed(seed) at most,
// but never mulberry32(seed), rng(), ctx.random(), ctx.noise() or randomGaussian(),
// so the seed is dead. Reseeding one produces NO visible change, so the "randomize
// seed" affordance (die / Rand Seeds) falls back to randomizing the layer's checked
// params instead (see useLayers.randomizeLayer). Dynamic / AI patterns are absent
// here and so default to seed-using.
//
// NOTE: this is NOT the same as PATTERN_TAXONOMY's `det: 'deterministic'` flag —
// that is a *visual* classification (symmetric / non-noisy look), and several
// 'deterministic' patterns (grid, duality, phyllotaxis, spiral…) DO consume the
// seed via rng for micro-jitter. Determine seed-usage from code, not the taxonomy.
export const SEEDLESS_PATTERN_IDS = new Set([
  'spirograph',
  'recursive',
  'feather',
  'moire',
]);

/** True when the pattern's output responds to its seed (the common case). */
export function patternUsesSeed(patternType) {
  return !SEEDLESS_PATTERN_IDS.has(patternType);
}
