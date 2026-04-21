import { useMemo } from 'react';
import { previewOne, formatSeconds } from '../../lib/plotter/pipeline';
import CommitSlider from '../ui/CommitSlider';

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
    original:   'text-ink-soft border-paper-warm bg-paper-warm',
    previewing: 'text-tone-ok border-tone-ok/40 bg-tone-ok/10',
    applied:    'text-tone-ok border-tone-ok/40 bg-tone-ok/10',
    stale:      'text-tone-mild border-tone-mild/40 bg-tone-mild/10',
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
  const color = after === before ? 'text-ink-soft' : decrease ? 'text-tone-ok' : 'text-tone-mild';
  return (
    <div className="flex items-baseline gap-1 text-[10px] font-mono">
      <span className="text-ink-soft">{formatStatValue(before)}{unitBefore}</span>
      <span className={color}>{arrow}</span>
      <span className="text-ink">{formatStatValue(after)}{unitAfter}</span>
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
    <div className="space-y-2 p-3 rounded-md bg-paper border border-paper-warm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-ink">{title}</span>
          <StateChip state={state} />
        </div>
        <div className="flex items-center gap-1.5">
          {opt.enabled && (
            <button
              onClick={onRevert}
              className="text-[10px] text-ink-soft hover:text-tone-strong transition-colors"
            >
              Revert
            </button>
          )}
          <button
            onClick={onApply}
            disabled={state === 'applied'}
            className={`text-[10px] px-2 py-1 rounded-xs font-medium transition-colors duration-fast ease-out-quart ${
              state === 'applied'
                ? 'bg-tone-ok/10 text-tone-ok cursor-default'
                : state === 'stale'
                  ? 'bg-tone-mild/10 text-tone-mild hover:bg-tone-mild/20'
                  : 'bg-saffron text-ink hover:bg-saffron-hover'
            }`}
          >
            {state === 'applied' ? 'Applied' : state === 'stale' ? 'Re-apply' : 'Apply'}
          </button>
        </div>
      </div>

      <p className="text-[10px] text-ink-soft leading-snug">{description}</p>

      {sliderProps && (
        <CommitSlider
          label={`${title} tolerance (mm)`}
          value={opt.previewTolerance}
          committedValue={opt.appliedTolerance}
          min={sliderProps.min}
          max={sliderProps.max}
          step={sliderProps.step}
          onChange={(v) => onChange({ previewTolerance: v })}
        />
      )}

      {before && after && statRenderer && (
        <div className="pt-1 border-t border-paper-warm">
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
        <h3 className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
          Optimize
        </h3>
        <p className="text-[10px] text-ink-soft leading-snug mt-0.5">
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
              <span className="text-[10px] text-ink-soft">Points</span>
              <StatRow before={b.points} after={a.points} />
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-ink-soft">Draw length</span>
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
              <span className="text-[10px] text-ink-soft">Paths</span>
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
              <span className="text-[10px] text-ink-soft">Travel</span>
              <StatRow before={Math.round(b.travelMm)} after={Math.round(a.travelMm)} unitBefore="mm" unitAfter="mm" />
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-ink-soft">Plot time</span>
              <StatRow
                before={Math.round(b.seconds)}
                after={Math.round(a.seconds)}
                unitBefore="s"
                unitAfter="s"
              />
            </div>
            <div className="text-[9px] text-ink-soft text-right">
              Est: {formatSeconds(b.seconds)} → {formatSeconds(a.seconds)}
              {' '} (AxiDraw V3 defaults)
            </div>
          </div>
        )}
      />
    </section>
  );
}
