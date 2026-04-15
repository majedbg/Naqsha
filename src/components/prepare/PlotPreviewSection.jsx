import { useMemo, useState, useEffect, useRef } from 'react';
import { splitGroup, optimizeGroup, formatSeconds } from '../../lib/plotter/pipeline';
import { pxToMm } from '../../lib/plotter/pathOps';

// Pen speeds in mm/s — loosely match AxiDraw V3 factory tuning.
const DRAW_SPEED = 200;
const TRAVEL_SPEED = 500;

// Given a layers-array and pattern instances, build a flat ordered route:
//   [{ type: 'travel'|'draw', from: [x,y], to: [x,y], color }]
// The order mirrors the export order (bottom-up reverse + optimizations).
function buildRoute(layers, patternInstances, appliedOptimizations) {
  const route = [];
  if (!layers || !patternInstances) return route;
  const ordered = [...layers].reverse().filter((l) => l.visible);
  let cursor = [0, 0];
  for (const layer of ordered) {
    const instance = patternInstances[layer.id];
    if (!instance || typeof instance.toSVGGroup !== 'function') continue;
    let raw;
    try {
      raw = instance.toSVGGroup(layer.id, layer.color, layer.opacity);
    } catch {
      continue;
    }
    // Apply the same optimizations the export will run so the preview
    // matches what the machine actually receives.
    const groupSvg = appliedOptimizations
      ? optimizeGroup(raw, appliedOptimizations).svg
      : raw;
    const { paths } = splitGroup(groupSvg);
    for (const p of paths) {
      if (!p.points || p.points.length < 2) continue;
      // Travel to the first point (pen-up)
      route.push({ type: 'travel', from: cursor, to: p.points[0], color: layer.color });
      // Draw each segment (pen-down)
      for (let i = 1; i < p.points.length; i++) {
        route.push({
          type: 'draw',
          from: p.points[i - 1],
          to: p.points[i],
          color: layer.color,
        });
      }
      cursor = p.points[p.points.length - 1];
    }
  }
  return route;
}

function routeTiming(route) {
  let drawPx = 0;
  let travelPx = 0;
  const cumulative = new Float64Array(route.length + 1);
  for (let i = 0; i < route.length; i++) {
    const seg = route[i];
    const d = Math.hypot(seg.to[0] - seg.from[0], seg.to[1] - seg.from[1]);
    if (seg.type === 'draw') drawPx += d; else travelPx += d;
    cumulative[i + 1] = cumulative[i] + d;
  }
  const totalPx = cumulative[cumulative.length - 1];
  const seconds = pxToMm(drawPx) / DRAW_SPEED + pxToMm(travelPx) / TRAVEL_SPEED;
  return { cumulative, totalPx, drawMm: pxToMm(drawPx), travelMm: pxToMm(travelPx), seconds };
}

const SPEEDS = [
  { label: '1×',  value: 1 },
  { label: '4×',  value: 4 },
  { label: '16×', value: 16 },
  { label: '64×', value: 64 },
];

export default function PlotPreviewSection({
  layers,
  patternInstances,
  canvasW,
  canvasH,
  appliedOptimizations,
  unit = 'mm',
}) {
  const [expanded, setExpanded] = useState(false);
  const [progress, setProgress] = useState(0);  // 0..1 of cumulative distance
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(16);

  const route = useMemo(
    () => buildRoute(layers, patternInstances, appliedOptimizations),
    [layers, patternInstances, appliedOptimizations]
  );
  const timing = useMemo(() => routeTiming(route), [route]);

  // RAF animation loop — only runs while playing
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  useEffect(() => {
    if (!playing || timing.seconds <= 0) return;
    lastTsRef.current = performance.now();
    const tick = (now) => {
      const dt = (now - lastTsRef.current) / 1000;
      lastTsRef.current = now;
      setProgress((prev) => {
        const next = prev + (dt / timing.seconds) * speed;
        if (next >= 1) { setPlaying(false); return 1; }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed, timing.seconds]);

  // When the route identity changes (new design or new optimizations), rewind.
  // Adjusting state during render per React docs — cheaper than an effect.
  const [prevRoute, setPrevRoute] = useState(route);
  if (prevRoute !== route) {
    setPrevRoute(route);
    setProgress(0);
    setPlaying(false);
  }

  // Compute the current pen position from progress
  const currentPx = progress * timing.totalPx;
  const penPos = useMemo(() => {
    if (!route.length) return [0, 0];
    // Binary search for segment containing currentPx
    let lo = 0, hi = route.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (timing.cumulative[mid + 1] < currentPx) lo = mid + 1;
      else hi = mid;
    }
    const seg = route[lo];
    const segStart = timing.cumulative[lo];
    const segLen = timing.cumulative[lo + 1] - segStart;
    const t = segLen > 0 ? Math.min(1, (currentPx - segStart) / segLen) : 1;
    return [seg.from[0] + (seg.to[0] - seg.from[0]) * t, seg.from[1] + (seg.to[1] - seg.from[1]) * t];
  }, [currentPx, route, timing]);

  if (!layers?.length) return null;

  const elapsedSec = progress * timing.seconds;
  const remainingSec = timing.seconds - elapsedSec;

  // Display dims — cap to 360px wide
  const displayW = 360;
  const displayH = canvasW > 0 ? (displayW * canvasH) / canvasW : 360;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Plot preview
        </h3>
        <button
          onClick={() => setExpanded((x) => !x)}
          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          {expanded ? 'Hide' : 'Show'}
        </button>
      </div>

      {!expanded ? (
        <p className="text-[10px] text-gray-600 leading-snug">
          Estimated plot: <span className="text-gray-400 font-mono">{formatSeconds(timing.seconds)}</span>
          {' '} · {Math.round(timing.drawMm)} mm draw + {Math.round(timing.travelMm)} mm travel.
          Expand to watch the pen route.
        </p>
      ) : (
        <div className="space-y-2">
          <div
            className="relative rounded-md overflow-hidden bg-[#0a0a0a] border border-[#252525] mx-auto"
            style={{ width: displayW, maxWidth: '100%' }}
          >
            <svg
              viewBox={`0 0 ${canvasW} ${canvasH}`}
              width={displayW}
              height={displayH}
              style={{ display: 'block', width: '100%', height: 'auto' }}
              aria-label="Plot route preview"
            >
              {/* Background: full route dimmed */}
              {route.map((seg, i) => seg.type === 'draw' && (
                <line
                  key={`bg-${i}`}
                  x1={seg.from[0]} y1={seg.from[1]}
                  x2={seg.to[0]}   y2={seg.to[1]}
                  stroke={seg.color}
                  strokeOpacity={0.14}
                  strokeWidth={Math.max(canvasW, canvasH) * 0.0015}
                  strokeLinecap="round"
                />
              ))}
              {/* Revealed portion up to currentPx */}
              {route.map((seg, i) => {
                const segStart = timing.cumulative[i];
                const segEnd = timing.cumulative[i + 1];
                if (currentPx <= segStart) return null;
                const t = Math.min(1, (currentPx - segStart) / Math.max(1e-6, segEnd - segStart));
                const x2 = seg.from[0] + (seg.to[0] - seg.from[0]) * t;
                const y2 = seg.from[1] + (seg.to[1] - seg.from[1]) * t;
                if (seg.type === 'travel') {
                  return (
                    <line
                      key={`fg-${i}`}
                      x1={seg.from[0]} y1={seg.from[1]}
                      x2={x2} y2={y2}
                      stroke="#9aa0a6"
                      strokeOpacity={0.55}
                      strokeWidth={Math.max(canvasW, canvasH) * 0.001}
                      strokeDasharray={Math.max(canvasW, canvasH) * 0.006}
                    />
                  );
                }
                return (
                  <line
                    key={`fg-${i}`}
                    x1={seg.from[0]} y1={seg.from[1]}
                    x2={x2} y2={y2}
                    stroke={seg.color}
                    strokeOpacity={1}
                    strokeWidth={Math.max(canvasW, canvasH) * 0.0018}
                    strokeLinecap="round"
                  />
                );
              })}
              {/* Pen head */}
              <circle
                cx={penPos[0]} cy={penPos[1]}
                r={Math.max(canvasW, canvasH) * 0.006}
                fill="#00c9b1"
                stroke="#0a0a0a"
                strokeWidth={Math.max(canvasW, canvasH) * 0.0015}
              />
            </svg>
          </div>

          {/* Transport controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (progress >= 1) setProgress(0);
                setPlaying((p) => !p);
              }}
              className="w-8 h-7 flex items-center justify-center rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-[11px] font-medium"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={progress}
              onChange={(e) => { setPlaying(false); setProgress(parseFloat(e.target.value)); }}
              className="flex-1 accent-accent"
              aria-label="Scrub plot progress"
            />
            <div role="radiogroup" aria-label="Playback speed" className="flex items-center bg-[#161616] border border-[#2a2a2a] rounded p-0.5">
              {SPEEDS.map((s) => (
                <button
                  key={s.value}
                  role="radio"
                  aria-checked={speed === s.value}
                  onClick={() => setSpeed(s.value)}
                  className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors ${
                    speed === s.value
                      ? 'bg-[#2a2a2a] text-gray-100'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between text-[10px] font-mono text-gray-500">
            <span>{formatSeconds(elapsedSec)} / {formatSeconds(timing.seconds)}</span>
            <span>
              {Math.round(currentPx ? pxToMm(currentPx) : 0)} / {Math.round(pxToMm(timing.totalPx))} mm
            </span>
            <span>ETA {formatSeconds(remainingSec)}</span>
          </div>

          <p className="text-[9px] text-gray-600 leading-snug">
            Timing uses AxiDraw V3 defaults ({DRAW_SPEED}&nbsp;mm/s draw, {TRAVEL_SPEED}&nbsp;mm/s travel).
            Real speeds vary by hardware and pen choice.
          </p>
          {/* referenced to silence unused warning on unit */}
          <span className="hidden" aria-hidden="true">{unit}</span>
        </div>
      )}
    </section>
  );
}
