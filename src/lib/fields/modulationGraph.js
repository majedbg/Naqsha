/**
 * modulationGraph — pure relationship edge model for the git-graph rail (WI-8)
 * and connection badges (WI-9).
 *
 * Given the layer list, derive every modulation edge guide→target: one edge per
 * modulator map whose `targetLayerId` resolves to an existing layer, emitted
 * only for guides that `canProduceField`. Self-maps and dangling targets are
 * skipped. `active` marks, among all edges INTO a target, the first in `layers`
 * array order as `active:true`, the rest `active:false`.
 *
 * NOTE (Phase 2b, PRD §5): the 2D COMPUTE path no longer respects this flag —
 * `resolveModulationsForTarget` now returns EVERY source and consumers stack
 * them (warp: vector-sum; density: multiply), so all incoming edges compute.
 * `active` is retained purely as a RELATIONSHIP/DISPLAY marker for one remaining
 * COMPUTE consumer plus rail emphasis: Surface-B 3D drape (`three3d/drape.js`,
 * which still drapes only the active target) and the git-graph rail emphasis
 * (ModulationRail / LayerTree). The 2D badge now reads "N sources · N active"
 * (all stack on the canvas); the 3D-drape-still-first-source gap is the one open
 * follow-up. Leaving `active` unchanged keeps drape behaviorally frozen while 2D
 * stacking ships.
 *
 * Pure + deterministic: fresh Maps/arrays, never mutates the inputs.
 */
import { canProduceField } from "./fieldRegistry";
import { channelForTarget } from "./channelConsumers";

/**
 * @param {object[]} layers
 * @returns {{
 *   edges: { guideId: string, targetId: string, channel: string|null, polaritySign: number, active: boolean }[],
 *   byGuide: Map<string, object[]>,
 *   byTarget: Map<string, object[]>,
 * }}
 */
export function buildModulationGraph(layers) {
  const edges = [];
  const byGuide = new Map();
  const byTarget = new Map();
  if (!Array.isArray(layers)) return { edges, byGuide, byTarget };

  const byId = new Map();
  for (const layer of layers) {
    if (layer && layer.id != null) byId.set(layer.id, layer);
  }

  const seenTargets = new Set(); // first incoming edge per target is active

  for (const guide of layers) {
    if (!guide || !canProduceField(guide)) continue;
    const maps = guide.modulator?.maps;
    if (!Array.isArray(maps)) continue;

    const range = guide.modulator.range ?? { min: -1, max: 1 };
    const mid = (range.min + range.max) / 2;
    const polaritySign = mid > 0 ? 1 : mid < 0 ? -1 : 0;

    for (const m of maps) {
      const targetId = m?.targetLayerId;
      if (targetId == null || targetId === guide.id) continue; // skip self-maps
      const targetLayer = byId.get(targetId);
      if (!targetLayer) continue; // dangling target

      const active = !seenTargets.has(targetId);
      seenTargets.add(targetId);

      const edge = {
        guideId: guide.id,
        targetId,
        channel: m.channel ?? channelForTarget(targetLayer.patternType),
        polaritySign,
        active,
      };
      edges.push(edge);

      const out = byGuide.get(guide.id);
      if (out) out.push(edge);
      else byGuide.set(guide.id, [edge]);

      const inc = byTarget.get(targetId);
      if (inc) inc.push(edge);
      else byTarget.set(targetId, [edge]);
    }
  }

  return { edges, byGuide, byTarget };
}

export default buildModulationGraph;
