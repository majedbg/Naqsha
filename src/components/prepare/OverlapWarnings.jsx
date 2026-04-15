import { useMemo } from 'react';
import { splitGroup } from '../../lib/plotter/pipeline';
import { countOverlaps } from '../../lib/plotter/overlapCheck';

// Collects paths from all visible layers (post-applied-optimizations) and
// reports how tangled the plot is. Intersections are summed across layers —
// real plotter / laser output traverses each layer sequentially, so
// within-layer overlaps are the ones worth flagging.
function useOverlapSummary(layers, patternInstances) {
  return useMemo(() => {
    if (!layers || !patternInstances) return null;
    let totalCount = 0;
    let totalSegments = 0;
    let truncated = false;
    const samples = [];
    for (const layer of layers) {
      if (!layer.visible) continue;
      const instance = patternInstances[layer.id];
      if (!instance || typeof instance.toSVGGroup !== 'function') continue;
      let group;
      try {
        group = instance.toSVGGroup(layer.id, layer.color, layer.opacity);
      } catch {
        continue;
      }
      const { paths } = splitGroup(group);
      const res = countOverlaps(paths);
      totalCount += res.count;
      totalSegments += res.segmentCount;
      if (res.truncated) truncated = true;
      for (const s of res.samples) if (samples.length < 24) samples.push(s);
    }
    return { count: totalCount, truncated, samples, segmentCount: totalSegments };
  }, [layers, patternInstances]);
}

function tone(count, truncated) {
  if (truncated) return 'neutral';
  if (count === 0) return 'ok';
  if (count < 20) return 'mild';
  return 'strong';
}

const TONE_STYLES = {
  ok:      'border-green-400/30 bg-green-400/5   text-green-400',
  mild:    'border-yellow-400/30 bg-yellow-400/5 text-yellow-400',
  strong:  'border-red-400/40  bg-red-400/5     text-red-400',
  neutral: 'border-[#2a2a2a]   bg-[#141414]     text-gray-400',
};

export default function OverlapWarnings({ layers, patternInstances }) {
  const summary = useOverlapSummary(layers, patternInstances);
  if (!summary) return null;

  const { count, truncated, segmentCount } = summary;
  const t = tone(count, truncated);

  const message = truncated
    ? `Too complex to check (${segmentCount.toLocaleString()}+ segments)`
    : count === 0
      ? 'No path crossings detected'
      : `${count.toLocaleString()} path crossing${count === 1 ? '' : 's'}`;

  const hint = truncated
    ? 'Above ~3000 segments the check is skipped to keep the UI responsive.'
    : count === 0
      ? 'Clean plot — no strokes cross themselves.'
      : count < 20
        ? 'Some crossings — usually fine for plotters, can cause double-burns on lasers.'
        : 'Many crossings — laser will trace the same area multiple times; plotter will stutter.';

  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
        Overlap check
      </h3>
      <div className={`rounded-md border p-2.5 ${TONE_STYLES[t]}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] font-medium">{message}</span>
          {!truncated && (
            <span className="text-[10px] opacity-70">
              {segmentCount.toLocaleString()} segments
            </span>
          )}
        </div>
        <p className="text-[10px] opacity-80 mt-1 leading-snug">{hint}</p>
      </div>
    </section>
  );
}
