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
};

/** Resolve a pattern class by id: static built-ins first, then the dynamic registry. */
export function getPatternClass(id) {
  return PATTERN_CLASSES[id] || getDynamicPatternClass(id) || null;
}
