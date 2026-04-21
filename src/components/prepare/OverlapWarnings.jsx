import { useMemo } from 'react';
import { extractRenderedPaths } from '../../lib/plotter/pipeline';
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
      // Use transformed paths so overlap counts reflect what the plotter
      // will actually draw — including radial-symmetry copies.
      const paths = extractRenderedPaths(group);
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
  ok:      'border-tone-ok/30 bg-tone-ok/5   text-tone-ok',
  mild:    'border-tone-mild/30 bg-tone-mild/5 text-tone-mild',
  strong:  'border-tone-strong/40  bg-tone-strong/5     text-tone-strong',
  neutral: 'border-paper-warm   bg-paper     text-ink-soft',
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
      <h3 className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
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
