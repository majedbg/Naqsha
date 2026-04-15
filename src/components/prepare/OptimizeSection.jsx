import { useMemo } from 'react';
import { previewOne, formatSeconds } from '../../lib/plotter/pipeline';

// State chip shown per optimization control.
// - Original: never applied
// - Previewing: user has moved slider but hasn't committed
// - Applied: committed; export will use this
// - Stale: applied, then user moved the slider — export still uses old value
function chipState(opt) {
  if (!opt.enabled) {
    // Either untouched or mid-preview before any apply
    const sliderMoved = opt.previewTolerance !== opt.defaultTolerance;
    return sliderMoved ? 'previewing' : 'original';
  }
  if (opt.previewTolerance != null && opt.previewTolerance !== opt.appliedTolerance) {
    return 'stale';
  }
  return 'applied';
}

function StateChip({ state }) {
  const styles = {
    original:   'text-gray-500 border-[#2a2a2a] bg-[#161616]',
    previewing: 'text-blue-400 border-blue-400/40 bg-blue-400/10',
    applied:    'text-green-400 border-green-400/40 bg-green-400/10',
    stale:      'text-yellow-400 border-yellow-400/40 bg-yellow-400/10',
  };
  const label = { original: 'Original', previewing: 'Preview', applied: 'Applied', stale: 'Re-apply' }[state];
  return (
    <span className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${styles[state]}`}>
      {label}
    </span>
  );
}

// Aggregates stats by iterating visible layers and calling previewOne per layer.
// Uses useMemo so it only recomputes when its inputs change.
function usePreviewStats(layers, patternInstances, only, opts) {
  return useMemo(() => {
    if (!layers || !patternInstances) return null;
    let before = { paths: 0, points: 0, drawMm: 0, travelMm: 0, seconds: 0 };
    let after = before;
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
      const { stats } = previewOne(group, only, opts);
      before = addStats(before, stats.before);
      after = addStats(after, stats.after);
    }
    return { before, after };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, patternInstances, only, opts.simplify?.tolerance, opts.simplify?.enabled, opts.merge?.tolerance, opts.merge?.enabled, opts.reorder?.enabled]);
}

function addStats(a, b) {
  return {
    paths:    a.paths    + b.paths,
    points:   a.points   + b.points,
    drawMm:   a.drawMm   + b.drawMm,
    travelMm: a.travelMm + b.travelMm,
    seconds:  a.seconds  + b.seconds,
  };
}

function StatRow({ before, after, unitBefore = '', unitAfter = '' }) {
  const decrease = after < before;
  const arrow = after === before ? '=' : decrease ? '↓' : '↑';
  const pct = before === 0 ? 0 : Math.round(((after - before) / before) * 100);
  const color = after === before ? 'text-gray-500' : decrease ? 'text-green-400' : 'text-yellow-400';
  return (
    <div className="flex items-baseline gap-1 text-[10px] font-mono">
      <span className="text-gray-500">{formatStatValue(before)}{unitBefore}</span>
      <span className={color}>{arrow}</span>
      <span className="text-gray-200">{formatStatValue(after)}{unitAfter}</span>
      {pct !== 0 && (
        <span className={`ml-1 ${color}`}>
          ({pct > 0 ? '+' : ''}{pct}%)
        </span>
      )}
    </div>
  );
}

function formatStatValue(v) {
  if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 1000)  return `${(v / 1000).toFixed(2)}k`;
  return String(Math.round(v));
}

function OptimizationRow({
  title,
  description,
  opt,
  sliderProps,  // null for reorder
  patternInstances,
  layers,
  onChange,
  onApply,
  onRevert,
  statRenderer,  // (before, after) => JSX
}) {
  const state = chipState(opt);
  const stats = usePreviewStats(
    layers,
    patternInstances,
    opt.key,
    {
      simplify: opt.key === 'simplify' ? { enabled: true, tolerance: opt.previewTolerance } : { enabled: false },
      merge:    opt.key === 'merge'    ? { enabled: true, tolerance: opt.previewTolerance } : { enabled: false },
      reorder:  opt.key === 'reorder'  ? { enabled: true } : { enabled: false },
    }
  );

  const before = stats?.before;
  const after  = stats?.after;

  return (
    <div className="space-y-2 p-3 rounded-md bg-[#141414] border border-[#252525]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-gray-200">{title}</span>
          <StateChip state={state} />
        </div>
        <div className="flex items-center gap-1.5">
          {opt.enabled && (
            <button
              onClick={onRevert}
              className="text-[10px] text-gray-500 hover:text-red-400 transition-colors"
            >
              Revert
            </button>
          )}
          <button
            onClick={onApply}
            disabled={state === 'applied'}
            className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${
              state === 'applied'
                ? 'bg-green-400/10 text-green-400 cursor-default'
                : state === 'stale'
                  ? 'bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20'
                  : 'bg-accent/10 text-accent hover:bg-accent/20'
            }`}
          >
            {state === 'applied' ? '✓ Applied' : state === 'stale' ? 'Re-apply' : 'Apply'}
          </button>
        </div>
      </div>

      <p className="text-[10px] text-gray-500 leading-snug">{description}</p>

      {sliderProps && (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={sliderProps.min}
            max={sliderProps.max}
            step={sliderProps.step}
            value={opt.previewTolerance}
            onChange={(e) => onChange({ previewTolerance: parseFloat(e.target.value) })}
            className="flex-1 accent-accent"
            aria-label={`${title} tolerance`}
          />
          <span className="text-[10px] font-mono text-gray-400 w-14 text-right">
            {opt.previewTolerance.toFixed(2)} mm
          </span>
        </div>
      )}

      {before && after && statRenderer && (
        <div className="pt-1 border-t border-[#222]">
          {statRenderer(before, after)}
        </div>
      )}
    </div>
  );
}

export default function OptimizeSection({
  optimizations,
  patternInstances,
  layers,
  onChange,
  onApply,
  onRevert,
}) {
  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Optimize
        </h3>
        <p className="text-[10px] text-gray-600 leading-snug mt-0.5">
          Each optimization previews before applying. Values only reach your
          export after you click&nbsp;Apply.
        </p>
      </header>

      <OptimizationRow
        title="Simplify paths"
        description="Reduces point count using RDP. Typical: 0.2–0.5 mm. High tolerance can straighten intentional curves."
        opt={{
          key: 'simplify',
          enabled: optimizations.simplify.enabled,
          previewTolerance: optimizations.simplify.tolerance,
          appliedTolerance: optimizations.simplify.appliedTolerance,
          defaultTolerance: optimizations.simplify.defaultTolerance ?? 0.3,
        }}
        sliderProps={{ min: 0, max: 2, step: 0.05 }}
        patternInstances={patternInstances}
        layers={layers}
        onChange={(patch) => onChange('simplify', { tolerance: patch.previewTolerance })}
        onApply={() => onApply('simplify')}
        onRevert={() => onRevert('simplify')}
        statRenderer={(b, a) => (
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span className="text-[10px] text-gray-500">Points</span>
              <StatRow before={b.points} after={a.points} />
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-gray-500">Draw length</span>
              <StatRow before={Math.round(b.drawMm)} after={Math.round(a.drawMm)} unitBefore="mm" unitAfter="mm" />
            </div>
          </div>
        )}
      />

      <OptimizationRow
        title="Merge lines"
        description="Joins paths whose endpoints are within tolerance — one fewer pen-up per merged pair."
        opt={{
          key: 'merge',
          enabled: optimizations.merge.enabled,
          previewTolerance: optimizations.merge.tolerance,
          appliedTolerance: optimizations.merge.appliedTolerance,
          defaultTolerance: optimizations.merge.defaultTolerance ?? 0.5,
        }}
        sliderProps={{ min: 0, max: 5, step: 0.1 }}
        patternInstances={patternInstances}
        layers={layers}
        onChange={(patch) => onChange('merge', { tolerance: patch.previewTolerance })}
        onApply={() => onApply('merge')}
        onRevert={() => onRevert('merge')}
        statRenderer={(b, a) => (
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span className="text-[10px] text-gray-500">Paths</span>
              <StatRow before={b.paths} after={a.paths} />
            </div>
          </div>
        )}
      />

      <OptimizationRow
        title="Reorder for min travel"
        description="Greedy nearest-neighbor — draws in an order that minimizes pen-up distance. No geometry changes."
        opt={{
          key: 'reorder',
          enabled: optimizations.reorder.enabled,
          previewTolerance: 1, // sentinel — reorder has no slider
          appliedTolerance: optimizations.reorder.enabled ? 1 : null,
          defaultTolerance: 1,
        }}
        sliderProps={null}
        patternInstances={patternInstances}
        layers={layers}
        onChange={() => {}}
        onApply={() => onApply('reorder')}
        onRevert={() => onRevert('reorder')}
        statRenderer={(b, a) => (
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span className="text-[10px] text-gray-500">Travel</span>
              <StatRow before={Math.round(b.travelMm)} after={Math.round(a.travelMm)} unitBefore="mm" unitAfter="mm" />
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-gray-500">Plot time</span>
              <StatRow
                before={Math.round(b.seconds)}
                after={Math.round(a.seconds)}
                unitBefore="s"
                unitAfter="s"
              />
            </div>
            <div className="text-[9px] text-gray-600 text-right">
              Est: {formatSeconds(b.seconds)} → {formatSeconds(a.seconds)}
              {' '} (AxiDraw V3 defaults)
            </div>
          </div>
        )}
      />
    </section>
  );
}
