// EtchStackRack — the Inspector rack for an Etch layer's Etch Stack (Raster Etch
// S2, #81). Renders the ordered, reorderable, bypassable stack of Stages an
// Etch's luma field flows through before the tail screening cut, plus the first
// real Stage's controls (Tone). Vocabulary is LAW (ADR-0007): this is an Etch
// **Stack** of **Stages** — a DISTINCT raster subsystem. It shares NONE of the
// motif Chain/Block code or words; it only mirrors the Ableton-style rack *feel*
// (drag to reorder, per-unit bypass).
//
// All document mutation goes through the pure etchStackEditor ops and the single
// canonical write `onUpdateLayer(id, { params: { ...params, stack } })`, so the
// canvas re-resolves the single-source bitmap live (useCanvas keys its Etch
// signature on the stack). Drag-reorder uses native HTML5 DnD (verified in the
// browser; the pure reorder math is unit-tested in etchStackEditor). The Levels
// histogram is a DISPLAY-ONLY handle-placement aid decoded from a small
// thumbnail of the source — never the bits path (those come from the worker).

import { useEffect, useMemo, useRef, useState } from 'react';
import { isEtchLayer } from '../../lib/etch/etchLayer';
import {
  createToneStage,
  createDitherStage,
  createHalftoneStage,
  createPaperStage,
  STAGE_TONE,
  STAGE_DITHER,
  STAGE_HALFTONE,
  STAGE_PAPER,
  isScreeningStage,
  activeScreeningIndex,
} from '../../lib/etch/etchStage';
import { DITHER_MODES } from '../../lib/etch/etchDither';
import { HALFTONE_SHAPES } from '../../lib/etch/etchHalftone';
import { lumaHistogram } from '../../lib/etch/etchTone';
import {
  addStage,
  removeStage,
  reorderStage,
  setBypass,
  patchStageParams,
} from '../../lib/etch/etchStackEditor';

const STAGE_LABEL = { [STAGE_TONE]: 'Tone', [STAGE_DITHER]: 'Dither', [STAGE_HALFTONE]: 'Halftone', [STAGE_PAPER]: 'Paper' };

// The device-pixels-per-dither-cell range for the size slider (matches the
// reference "size" control): 1 = full-resolution dots, up to a coarse ceiling.
const DITHER_SIZE_MIN = 1;
const DITHER_SIZE_MAX = 8;

// Halftone screen ranges: frequency in LINES/INCH (coarse verifiable dots → fine),
// and angle in DEGREES (a full turn; the lattice repeats every 90°, but exposing
// 0–90 keeps the control obvious).
const HALFTONE_FREQ_MIN = 10;
const HALFTONE_FREQ_MAX = 120;
const HALFTONE_ANGLE_MIN = 0;
const HALFTONE_ANGLE_MAX = 90;

// Paper grain ranges: grain AMOUNT 0..100 (0 = neutral/no tooth → strong tooth),
// and grain SCALE = feature size in device px (1 = fine per-pixel speckle → coarse
// fibre). Scale ceiling kept modest so the grain stays paper-tooth, not blotches.
const PAPER_GRAIN_MIN = 0;
const PAPER_GRAIN_MAX_CTRL = 100;
const PAPER_SCALE_MIN = 1;
const PAPER_SCALE_MAX = 16;

// Shared gamma range for BOTH the Tone gamma slider and the Levels midtone
// handle (both bound to the one levels.gamma). Kept in sync so a handle-set
// value never pins the slider at a mismatched max. >1 lightens midtones (the
// "linearize exponential darkness" direction); 4 is a strong practical ceiling.
const GAMMA_MIN = 0.1;
const GAMMA_MAX = 4;

// A compact labelled slider bound to a single Tone param.
function ToneSlider({ label, value, min, max, step = 1, onChange, testid }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-ink-soft">
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testid}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 accent-violet"
      />
      <span className="w-10 shrink-0 text-right tabular-nums text-ink num">{value}</span>
    </label>
  );
}

// Live luma histogram with draggable black / white / gamma (midtone) handles.
// The three handles remap luma in the Tone Stage's Levels; the histogram behind
// them shows the source distribution the user is placing them against.
function LevelsControl({ source, levels, onChange }) {
  const trackRef = useRef(null);
  const [hist, setHist] = useState(null);
  const dragRef = useRef(null); // 'black' | 'white' | 'gamma' | null

  // Decode a small thumbnail of the source ONCE per source and bin its luma.
  // Light main-thread work (≤128px); the exported bits stay the worker's job.
  useEffect(() => {
    if (!source || typeof document === 'undefined') return undefined;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
      const scale = Math.min(1, 128 / longest);
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const gray = new Float64Array(w * h);
      for (let j = 0; j < gray.length; j++) {
        const i = j * 4;
        gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      if (!cancelled) setHist(lumaHistogram({ gray }));
    };
    img.src = source;
    return () => {
      cancelled = true;
    };
  }, [source]);

  const bars = useMemo(() => {
    if (!hist || !source) return null; // gate on source so a cleared Etch shows no stale bars
    let peak = 1;
    for (let i = 0; i < hist.length; i++) if (hist[i] > peak) peak = hist[i];
    // Log-scale so a spiky distribution still shows its tails.
    return Array.from(hist, (v) => Math.log1p(v) / Math.log1p(peak));
  }, [hist, source]);

  const black = levels.blackPoint ?? 0;
  const white = levels.whitePoint ?? 255;
  const gamma = levels.gamma ?? 1;
  const toPct = (v) => `${(v / 255) * 100}%`;
  // The gamma handle sits between black and white; its position is the inverse
  // of the drag→gamma mapping below: rel = log10(gamma)/2 + 0.5, x = black + rel·span.
  const gammaRel = clamp01(Math.log10(Math.max(0.1, gamma)) / 2 + 0.5);
  const gammaX = black + (white - black) * gammaRel;

  const onPointerDown = (which) => (e) => {
    e.preventDefault();
    dragRef.current = which;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const which = dragRef.current;
    if (!which || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (!rect.width) return;
    const t = clamp01((e.clientX - rect.left) / rect.width);
    if (which === 'black') {
      onChange({ blackPoint: Math.min(Math.round(t * 255), white - 1) });
    } else if (which === 'white') {
      onChange({ whitePoint: Math.max(Math.round(t * 255), black + 1) });
    } else if (which === 'gamma') {
      // Map handle position within [black,white] to a gamma in the log domain,
      // CLAMPED to the same [GAMMA_MIN, GAMMA_MAX] the slider spans so the two
      // controls (both bound to levels.gamma) always agree on the readout.
      const span = white - black || 1;
      const rel = clamp01((t * 255 - black) / span);
      const g = Math.pow(10, (rel - 0.5) * 2); // rel .5→1, 0→0.1, 1→10 pre-clamp
      onChange({ gamma: clampRange(Math.round(g * 100) / 100, GAMMA_MIN, GAMMA_MAX) });
    }
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="space-y-1" data-testid="etch-levels">
      <div className="flex items-center justify-between text-[11px] text-ink-soft">
        <span>Levels</span>
        <span className="tabular-nums num">
          {black} · γ{gamma} · {white}
        </span>
      </div>
      <div
        ref={trackRef}
        className="relative h-16 rounded-xs border border-hairline bg-paper-warm"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        data-testid="etch-levels-track"
      >
        {/* Histogram bars (display-only). */}
        {bars && (
          <div className="absolute inset-0 flex items-end gap-px px-px" aria-hidden="true">
            {bars.map((hgt, i) => (
              <div
                key={i}
                className="flex-1 bg-ink-soft/40"
                style={{ height: `${Math.max(1, hgt * 100)}%` }}
              />
            ))}
          </div>
        )}
        {/* Black-point handle. */}
        <button
          type="button"
          data-testid="levels-black"
          aria-label="Black point"
          onPointerDown={onPointerDown('black')}
          className="absolute top-0 bottom-0 w-2 -translate-x-1/2 cursor-ew-resize border-l-2 border-ink"
          style={{ left: toPct(black) }}
        />
        {/* Gamma (midtone) handle. */}
        <button
          type="button"
          data-testid="levels-gamma"
          aria-label="Gamma midtone"
          onPointerDown={onPointerDown('gamma')}
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border border-ink bg-violet"
          style={{ left: toPct(clampRange(gammaX, black, white)) }}
        />
        {/* White-point handle. */}
        <button
          type="button"
          data-testid="levels-white"
          aria-label="White point"
          onPointerDown={onPointerDown('white')}
          className="absolute top-0 bottom-0 w-2 -translate-x-1/2 cursor-ew-resize border-r-2 border-ink"
          style={{ left: toPct(white) }}
        />
      </div>
    </div>
  );
}

// The Tone Stage body: exposure / brightness / contrast quick sliders + Levels.
function ToneStageBody({ stage, source, onPatch }) {
  const p = stage.params;
  return (
    <div className="space-y-1.5 pt-1" data-testid="etch-tone-body">
      <ToneSlider label="Exposure" testid="tone-exposure" value={p.exposure} min={-100} max={100} onChange={(v) => onPatch({ exposure: v })} />
      <ToneSlider label="Brightness" testid="tone-brightness" value={p.brightness} min={-100} max={100} onChange={(v) => onPatch({ brightness: v })} />
      <ToneSlider label="Contrast" testid="tone-contrast" value={p.contrast} min={-100} max={100} onChange={(v) => onPatch({ contrast: v })} />
      <ToneSlider label="Gamma" testid="tone-gamma" value={p.levels?.gamma ?? 1} min={GAMMA_MIN} max={GAMMA_MAX} step={0.05} onChange={(v) => onPatch({ levels: { gamma: v } })} />
      <LevelsControl source={source} levels={p.levels || {}} onChange={(patch) => onPatch({ levels: patch })} />
      {/* EXTENSION SEAM: a future Curves control renders here (deferred, #81). */}
    </div>
  );
}

// The Dither Stage body: the screen MODE (Floyd–Steinberg or ordered Bayer
// 2/4/8) and the SIZE (device-pixels per dither cell). A Dither Stage is the
// screening producer — it maps the toned field to 1-bit dots, so its controls
// choose HOW the tonal gradient becomes dot density (FS = smoothest diffusion;
// Bayer = mechanical matrix), not how the field is toned.
function DitherStageBody({ stage, onPatch }) {
  const mode = stage.params?.mode ?? DITHER_MODES[0].value;
  const size = stage.params?.size ?? 1;
  return (
    <div className="space-y-1.5 pt-1" data-testid="etch-dither-body">
      <label className="flex items-center gap-2 text-[11px] text-ink-soft">
        <span className="w-16 shrink-0">Mode</span>
        <select
          data-testid="dither-mode"
          value={mode}
          onChange={(e) => onPatch({ mode: e.target.value })}
          className="flex-1 rounded-xs border border-hairline bg-paper-warm px-1 py-0.5 text-[11px] text-ink"
        >
          {DITHER_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-[11px] text-ink-soft">
        <span className="w-16 shrink-0">Size</span>
        <input
          type="range"
          min={DITHER_SIZE_MIN}
          max={DITHER_SIZE_MAX}
          step={1}
          value={size}
          data-testid="dither-size"
          onChange={(e) => onPatch({ size: Number(e.target.value) })}
          className="h-1 flex-1 accent-violet"
        />
        <span className="w-10 shrink-0 text-right tabular-nums text-ink num">{size}</span>
      </label>
    </div>
  );
}

// The Halftone Stage body: the AM screen's FREQUENCY (lines/inch → cell size via
// the Etch DPI), ANGLE (degrees), and dot SHAPE (round / diamond). A Halftone
// Stage is the screening producer — an alternative to Dither — so its controls
// choose HOW the tonal gradient becomes a regular lattice of radius-modulated dots.
function HalftoneStageBody({ stage, onPatch }) {
  const p = stage.params || {};
  const frequency = p.frequency ?? HALFTONE_FREQ_MIN;
  const angle = p.angle ?? 0;
  const shape = p.shape ?? HALFTONE_SHAPES[0].value;
  return (
    <div className="space-y-1.5 pt-1" data-testid="etch-halftone-body">
      <label className="flex items-center gap-2 text-[11px] text-ink-soft">
        <span className="w-16 shrink-0">Frequency</span>
        <input
          type="range"
          min={HALFTONE_FREQ_MIN}
          max={HALFTONE_FREQ_MAX}
          step={1}
          value={frequency}
          data-testid="halftone-frequency"
          onChange={(e) => onPatch({ frequency: Number(e.target.value) })}
          className="h-1 flex-1 accent-violet"
        />
        <span className="w-12 shrink-0 text-right tabular-nums text-ink num">{frequency} lpi</span>
      </label>
      <label className="flex items-center gap-2 text-[11px] text-ink-soft">
        <span className="w-16 shrink-0">Angle</span>
        <input
          type="range"
          min={HALFTONE_ANGLE_MIN}
          max={HALFTONE_ANGLE_MAX}
          step={1}
          value={angle}
          data-testid="halftone-angle"
          onChange={(e) => onPatch({ angle: Number(e.target.value) })}
          className="h-1 flex-1 accent-violet"
        />
        <span className="w-12 shrink-0 text-right tabular-nums text-ink num">{angle}°</span>
      </label>
      <label className="flex items-center gap-2 text-[11px] text-ink-soft">
        <span className="w-16 shrink-0">Shape</span>
        <select
          data-testid="halftone-shape"
          value={shape}
          onChange={(e) => onPatch({ shape: e.target.value })}
          className="flex-1 rounded-xs border border-hairline bg-paper-warm px-1 py-0.5 text-[11px] text-ink"
        >
          {HALFTONE_SHAPES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

// The Paper Stage body: grain AMOUNT (how much tooth) and grain SCALE (feature
// size). A Paper Stage is a FIELD Stage — it textures the luma field with seeded
// grain BEFORE screening, giving the etch tooth — so its controls choose HOW MUCH
// and HOW COARSE the grain is, not how the field screens. The seed is per-layer
// document state (set at creation), so it is deliberately NOT a control here: the
// grain stays stable across reloads.
function PaperStageBody({ stage, onPatch }) {
  const p = stage.params || {};
  const grain = p.grain ?? 0;
  const scale = p.scale ?? PAPER_SCALE_MIN;
  return (
    <div className="space-y-1.5 pt-1" data-testid="etch-paper-body">
      <ToneSlider label="Grain" testid="paper-grain" value={grain} min={PAPER_GRAIN_MIN} max={PAPER_GRAIN_MAX_CTRL} onChange={(v) => onPatch({ grain: v })} />
      <ToneSlider label="Scale" testid="paper-scale" value={scale} min={PAPER_SCALE_MIN} max={PAPER_SCALE_MAX} onChange={(v) => onPatch({ scale: v })} />
    </div>
  );
}

/**
 * The Etch Stack rack. Self-hides for non-Etch layers so the Inspector can drop
 * it in unconditionally.
 */
export default function EtchStackRack({ layer, onUpdateLayer }) {
  const [open, setOpen] = useState(true);
  const [dragIndex, setDragIndex] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  if (!isEtchLayer(layer)) return null;

  const params = layer.params || {};
  const stack = Array.isArray(params.stack) ? params.stack : [];
  const source = params.source || null;

  const writeStack = (next) => onUpdateLayer(layer.id, { params: { ...params, stack: next } });

  // The ONE active screen (first non-bypassed screening Stage) — every OTHER
  // screening Stage is inactive and gets badged, reflecting the exactly-one rule.
  const screenIdx = activeScreeningIndex(stack);

  const onAdd = () => {
    const stage = createToneStage();
    writeStack(addStage(stack, stage));
    setExpanded((s) => new Set(s).add(stage.id));
  };
  const onAddDither = () => {
    const stage = createDitherStage();
    writeStack(addStage(stack, stage));
    setExpanded((s) => new Set(s).add(stage.id));
  };
  const onAddHalftone = () => {
    const stage = createHalftoneStage();
    writeStack(addStage(stack, stage));
    setExpanded((s) => new Set(s).add(stage.id));
  };
  const onAddPaper = () => {
    const stage = createPaperStage();
    writeStack(addStage(stack, stage));
    setExpanded((s) => new Set(s).add(stage.id));
  };
  const onRemove = (id) => writeStack(removeStage(stack, id));
  const onToggleBypass = (id, bypassed) => writeStack(setBypass(stack, id, bypassed));
  const onPatch = (id, patch) => writeStack(patchStageParams(stack, id, patch));
  const toggleExpanded = (id) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const onDrop = (toIndex) => {
    if (dragIndex === null || dragIndex === toIndex) return;
    writeStack(reorderStage(stack, dragIndex, toIndex));
    setDragIndex(null);
  };

  return (
    <div className="space-y-2 border-t border-hairline pt-3" data-testid="etch-stack-rack">
      <button
        type="button"
        data-testid="etch-stack-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left text-xs font-semibold text-ink-soft uppercase tracking-wider outline-none hover:text-ink focus:text-ink"
      >
        <span aria-hidden="true" className="text-[10px] leading-none">{open ? '▾' : '▸'}</span>
        <span>Etch Stack</span>
        {!open && stack.length > 0 && (
          <span className="font-normal normal-case tracking-normal text-ink-soft/70">· {stack.length}</span>
        )}
      </button>

      {open && (
        <>
          {stack.length === 0 && (
            <p className="text-[11px] text-ink-soft/70">No Stages. Add one to shape the tone before screening.</p>
          )}

          <ul className="space-y-1.5" data-testid="etch-stack-list">
            {stack.map((stage, index) => {
              const isOpen = expanded.has(stage.id);
              return (
                <li
                  key={stage.id}
                  data-testid="etch-stage-row"
                  data-stage-id={stage.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(index)}
                  className={`rounded-cell border border-hairline bg-paper-warm p-2 ${stage.bypassed ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-1.5">
                    {/* ONLY the grip is the drag source — the Levels handles live
                        inside the row and set their own pointer capture, so making
                        the whole <li> draggable would let a handle drag start the
                        row's native DnD instead. */}
                    <span
                      data-testid="etch-stage-grip"
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      className="cursor-grab select-none text-ink-soft/60"
                      title="Drag to reorder"
                    >
                      ⠿
                    </span>
                    <button
                      type="button"
                      data-testid="etch-stage-expand"
                      onClick={() => toggleExpanded(stage.id)}
                      className="flex-1 text-left text-[11px] font-medium text-ink"
                    >
                      {STAGE_LABEL[stage.type] || stage.type}
                    </button>
                    {screenIdx >= 0 && index > screenIdx && (
                      <span
                        data-testid="stage-inactive"
                        title={
                          isScreeningStage(stage)
                            ? 'A screening Stage above this one already screens — only one screens at a time'
                            : 'This Stage is below the active screen (post-screen) — it does not run yet'
                        }
                        className="rounded-xs border border-hairline px-1.5 py-0.5 text-[10px] font-medium text-ink-soft/60"
                      >
                        Inactive
                      </span>
                    )}
                    <button
                      type="button"
                      data-testid="etch-stage-bypass"
                      aria-pressed={stage.bypassed}
                      onClick={() => onToggleBypass(stage.id, !stage.bypassed)}
                      title={stage.bypassed ? 'Bypassed — click to enable' : 'Enabled — click to bypass'}
                      className={`rounded-xs border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                        stage.bypassed
                          ? 'border-hairline text-ink-soft/60'
                          : 'border-violet/50 bg-violet/10 text-violet'
                      }`}
                    >
                      {stage.bypassed ? 'Bypassed' : 'On'}
                    </button>
                    <button
                      type="button"
                      data-testid="etch-stage-remove"
                      onClick={() => onRemove(stage.id)}
                      aria-label="Remove Stage"
                      className="rounded-xs px-1 text-xs text-ink-soft hover:text-ink"
                    >
                      ✕
                    </button>
                  </div>
                  {isOpen && stage.type === STAGE_TONE && (
                    <ToneStageBody stage={stage} source={source} onPatch={(patch) => onPatch(stage.id, patch)} />
                  )}
                  {isOpen && stage.type === STAGE_DITHER && (
                    <DitherStageBody stage={stage} onPatch={(patch) => onPatch(stage.id, patch)} />
                  )}
                  {isOpen && stage.type === STAGE_HALFTONE && (
                    <HalftoneStageBody stage={stage} onPatch={(patch) => onPatch(stage.id, patch)} />
                  )}
                  {isOpen && stage.type === STAGE_PAPER && (
                    <PaperStageBody stage={stage} onPatch={(patch) => onPatch(stage.id, patch)} />
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex gap-1.5">
            <button
              type="button"
              data-testid="etch-stack-add"
              onClick={onAdd}
              className="flex-1 rounded-xs border border-hairline bg-paper-warm px-2 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:border-violet hover:text-ink"
            >
              + Tone Stage
            </button>
            <button
              type="button"
              data-testid="etch-stack-add-dither"
              onClick={onAddDither}
              className="flex-1 rounded-xs border border-hairline bg-paper-warm px-2 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:border-violet hover:text-ink"
            >
              + Dither Stage
            </button>
            <button
              type="button"
              data-testid="etch-stack-add-halftone"
              onClick={onAddHalftone}
              className="flex-1 rounded-xs border border-hairline bg-paper-warm px-2 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:border-violet hover:text-ink"
            >
              + Halftone Stage
            </button>
            <button
              type="button"
              data-testid="etch-stack-add-paper"
              onClick={onAddPaper}
              className="flex-1 rounded-xs border border-hairline bg-paper-warm px-2 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:border-violet hover:text-ink"
            >
              + Paper Stage
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
function clampRange(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
