// ExtractStepper — full-screen guided Photo → Pattern flow (S0 spine, issue
// #49; locked decision 7): Upload → Flatten → Select → Review → Save.
//
//   Upload  : pick/capture a photo (file input; camera arrives via `capture`
//             on mobile for free).
//   Flatten : SKIP-ONLY stub in S0 — the stage exists so auto plane detection
//             + manual quad drop in behind it later (locked decision 2).
//   Select  : manual region crop — drag a rectangle over the photo (locked
//             decision 3: one pattern per extraction, manual select).
//   Review  : the traced proposal (shape count + preview). Crude S0 review;
//             editable proposals/confidence badges deepen in later slices.
//   Save    : title + save → registers into the picker's custom family AND
//             persists via LibraryRepository (one entity, two surfaces).
//
// The extraction itself runs through the WorkerBridge (off-main-thread where
// Workers exist). All DOM/canvas work lives in lib/extraction/imageIO so this
// component stays jsdom-testable with that seam mocked.

import { useCallback, useEffect, useRef, useState } from 'react';
import { fileToDataURL, loadImage, cropToImageData } from '../../lib/extraction/imageIO';
import { createExtractionBridge } from '../../lib/extraction/workerBridge';
import { listStages } from '../../lib/extraction/pipeline';
import { makeExtractedPattern } from '../../lib/extraction/extractedPattern';
import { registerExtractedPattern } from '../../lib/patterns/ExtractedPatternGenerator';
import { saveExtractedPattern } from '../../lib/libraryRepository';

const STEPS = ['Upload', 'Flatten', 'Select', 'Review', 'Save'];

function StepRail({ current }) {
  return (
    <ol className="flex items-center gap-1" aria-label="Extraction steps">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-1">
          {i > 0 && <span className="text-ink-faint text-[10px]">→</span>}
          <span
            aria-current={i === current ? 'step' : undefined}
            className={`px-2 py-0.5 rounded-xs text-[11px] font-medium ${
              i === current
                ? 'bg-saffron text-ink'
                : i < current
                  ? 'text-ink-soft'
                  : 'text-ink-faint'
            }`}
          >
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

// Human-readable labels for saveExtractedPattern's persisted:false reasons;
// unknown reasons (e.g. "save failed: <db message>") surface verbatim.
const REASON_LABELS = {
  guest: 'sign in to keep patterns in your library',
  'no-supabase': 'cloud storage is not configured',
};

// The extraction stages, in order, for the progress rail (serializable
// descriptors — importing them pulls no heavy stage deps, which stay lazy).
const EXTRACTION_STAGES = listStages();

// Human-readable status for a stage's latest pipeline progress event.
const STAGE_STATUS_TEXT = {
  pending: 'waiting',
  loading: 'loading…',
  running: 'running…',
  done: 'done',
  skipped: 'skipped',
  failed: 'failed',
};

// Per-stage progress rail shown while the pipeline runs (issue #51: staged
// progress in the stepper). `events` maps stage id → latest progress event.
function StageProgress({ events }) {
  return (
    <ol aria-label="Extraction progress" className="flex items-center gap-3 text-xs">
      {EXTRACTION_STAGES.map(({ id, label }) => {
        const ev = events[id];
        const status = ev?.status ?? 'pending';
        const pct =
          typeof ev?.progress === 'number' ? ` ${Math.round(ev.progress * 100)}%` : '';
        return (
          <li key={id} className="flex items-center gap-1">
            <span
              className={
                status === 'running' || status === 'loading'
                  ? 'text-ink font-medium'
                  : status === 'pending'
                    ? 'text-ink-faint'
                    : 'text-ink-soft'
              }
            >
              {label}
            </span>
            <span className={status === 'failed' ? 'text-red-500' : 'text-ink-faint'}>
              {STAGE_STATUS_TEXT[status] ?? status}
              {pct}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const PRIMARY_BTN =
  'px-4 py-1.5 text-sm font-medium rounded-xs bg-saffron text-ink hover:bg-saffron-hover disabled:opacity-40 disabled:cursor-default transition-colors duration-fast ease-out-quart';
const GHOST_BTN =
  'px-4 py-1.5 text-sm font-medium rounded-xs bg-paper-warm text-ink-soft hover:bg-muted hover:text-ink transition-colors duration-fast ease-out-quart';

export default function ExtractStepper({ onClose, onSaved }) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [imageURL, setImageURL] = useState(null);
  const [natural, setNatural] = useState(null); // { w, h }
  const [crop, setCrop] = useState(null); // fractional {x,y,w,h}, null = full image
  const [drag, setDrag] = useState(null); // in-flight drag {x0,y0,x1,y1}
  const [tracing, setTracing] = useState(false);
  const [stageEvents, setStageEvents] = useState({}); // stage id → latest progress event
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  // Non-null after a save that could NOT be persisted (guest / no supabase /
  // migration not applied): the pattern is registered for the session, but the
  // user must learn it won't survive a reload (review finding 2). Holds the
  // short human-readable reason.
  const [sessionOnlyReason, setSessionOnlyReason] = useState(null);

  const imgElRef = useRef(null); // decoded HTMLImageElement (natural size)
  const cropBoxRef = useRef(null);
  const bridgeRef = useRef(null);

  useEffect(() => () => bridgeRef.current?.dispose(), []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // --- Upload ---------------------------------------------------------------

  const handleFile = useCallback(async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    try {
      const url = await fileToDataURL(f);
      const img = await loadImage(url);
      imgElRef.current = img;
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setFile(f);
      setImageURL(url);
      setCrop(null);
      setResult(null);
      setStep(1);
    } catch (err) {
      setError(err.message || 'Could not read that image.');
    }
  }, []);

  // --- Select (manual crop) ---------------------------------------------------

  const fractionPoint = (e) => {
    const box = cropBoxRef.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    };
  };

  const onCropPointerDown = (e) => {
    const p = fractionPoint(e);
    if (!p) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const onCropPointerMove = (e) => {
    if (!drag) return;
    const p = fractionPoint(e);
    if (p) setDrag((d) => ({ ...d, x1: p.x, y1: p.y }));
  };
  const onCropPointerUp = () => {
    if (!drag) return;
    const x = Math.min(drag.x0, drag.x1);
    const y = Math.min(drag.y0, drag.y1);
    const w = Math.abs(drag.x1 - drag.x0);
    const h = Math.abs(drag.y1 - drag.y0);
    // Ignore accidental clicks; keep whatever crop was there before.
    if (w > 0.02 && h > 0.02) setCrop({ x, y, w, h });
    setDrag(null);
  };

  const activeRect = drag
    ? {
        x: Math.min(drag.x0, drag.x1),
        y: Math.min(drag.y0, drag.y1),
        w: Math.abs(drag.x1 - drag.x0),
        h: Math.abs(drag.y1 - drag.y0),
      }
    : crop;

  const handleTrace = useCallback(async () => {
    if (!imgElRef.current || !natural) return;
    setError('');
    setTracing(true);
    setStageEvents({});
    try {
      const f = crop || { x: 0, y: 0, w: 1, h: 1 };
      const rect = {
        x: Math.round(f.x * natural.w),
        y: Math.round(f.y * natural.h),
        w: Math.max(1, Math.round(f.w * natural.w)),
        h: Math.max(1, Math.round(f.h * natural.h)),
      };
      const imageData = cropToImageData(imgElRef.current, rect);
      if (!bridgeRef.current) bridgeRef.current = createExtractionBridge();
      const res = await bridgeRef.current.extract(imageData, {}, (p) =>
        setStageEvents((m) => ({ ...m, [p.stage]: p }))
      );
      if (!res.tile.fills.length && !res.tile.strokes.length) {
        setError('No shapes found in that region — try a tighter or higher-contrast selection.');
        return;
      }
      setResult(res);
      setStep(3);
    } catch (err) {
      setError(err.message || 'Extraction failed.');
    } finally {
      setTracing(false);
      setStageEvents({});
    }
  }, [crop, natural]);

  // --- Save -------------------------------------------------------------------

  const defaultTitle = `Extracted pattern — ${new Date().toLocaleDateString()}`;

  const handleSave = useCallback(async () => {
    if (!result) return;
    setSaving(true);
    setError('');
    try {
      const entity = makeExtractedPattern({
        title: title.trim() || defaultTitle,
        tile: result.tile,
        lattice: result.lattice,
      });
      // Register FIRST (one entity, two surfaces): the pattern is usable this
      // session even when persistence is unavailable (guest / migration not
      // yet applied) — never a dead end.
      registerExtractedPattern(entity);
      const photoExt = (file?.name?.split('.').pop() || 'png').toLowerCase();
      const res = await saveExtractedPattern(entity, { photoBlob: file, photoExt });
      onSaved?.(res);
      if (res.persisted) {
        onClose?.();
      } else {
        // Success flow continues (the pattern IS usable this session), but the
        // stepper stays up until the session-only notice is acknowledged.
        setSessionOnlyReason(REASON_LABELS[res.reason] || res.reason || 'cloud save unavailable');
      }
    } catch (err) {
      setError(err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }, [result, title, defaultTitle, file, onSaved, onClose]);

  // --- render -------------------------------------------------------------------

  const preview = result ? (
    <svg
      viewBox={`0 0 ${result.tile.width} ${result.tile.height}`}
      className="max-h-64 w-auto border border-hairline bg-white"
      role="img"
      aria-label="Traced pattern preview"
    >
      {result.tile.fills.map((f, i) => (
        <path key={`f${i}`} d={f.d} fill="#1a1a1a" fillRule="evenodd" stroke="none" />
      ))}
      {result.tile.strokes.map((s, i) => (
        <path key={`s${i}`} d={s.d} fill="none" stroke="#1a1a1a" strokeWidth="1" />
      ))}
    </svg>
  ) : null;

  const shapeCount = result ? result.tile.fills.length + result.tile.strokes.length : 0;

  return (
    <div className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center px-4">
      <div className="bg-panel border border-card-border rounded-lg w-full max-w-3xl max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-semibold text-ink">Extract Pattern from Photo</h2>
            <StepRail current={step} />
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-ink-soft hover:text-ink text-lg leading-none px-1"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 flex flex-col items-center gap-4">
          {error && (
            <p role="alert" className="text-xs text-red-500 bg-red-500/10 rounded-xs px-3 py-2 self-stretch">
              {error}
            </p>
          )}

          {step === 0 && (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-sm text-ink-soft">
                Photograph an ornament — tilework, tracery, a carved door — and turn it into a
                pattern you can place, tile, and cut.
              </p>
              <label className="cursor-pointer">
                <span className={PRIMARY_BTN + ' inline-block'}>Choose a photo…</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                  className="sr-only"
                  aria-label="Choose a photo"
                />
              </label>
            </div>
          )}

          {step === 1 && (
            <>
              {imageURL && (
                <img src={imageURL} alt="Uploaded ornament" className="max-h-72 w-auto rounded-xs border border-hairline" />
              )}
              <p className="text-xs text-ink-soft max-w-md text-center">
                Auto-flatten (perspective correction) arrives in a later update. For now the photo
                is used as-is — best results come from a straight-on shot.
              </p>
              <div className="flex gap-2">
                <button type="button" className={GHOST_BTN} onClick={() => setStep(0)}>
                  Back
                </button>
                <button type="button" className={PRIMARY_BTN} onClick={() => setStep(2)}>
                  Skip flatten →
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-xs text-ink-soft">
                Drag to select ONE pattern region — or trace the whole photo.
              </p>
              <div
                ref={cropBoxRef}
                className="relative inline-block select-none touch-none cursor-crosshair"
                onPointerDown={onCropPointerDown}
                onPointerMove={onCropPointerMove}
                onPointerUp={onCropPointerUp}
                data-testid="crop-area"
              >
                {imageURL && (
                  <img src={imageURL} alt="Select a region" draggable={false} className="max-h-80 w-auto rounded-xs border border-hairline" />
                )}
                {activeRect && (
                  <div
                    className="absolute border-2 border-saffron bg-saffron/10 pointer-events-none"
                    style={{
                      left: `${activeRect.x * 100}%`,
                      top: `${activeRect.y * 100}%`,
                      width: `${activeRect.w * 100}%`,
                      height: `${activeRect.h * 100}%`,
                    }}
                  />
                )}
              </div>
              {tracing && <StageProgress events={stageEvents} />}
              <div className="flex gap-2">
                <button type="button" className={GHOST_BTN} onClick={() => setStep(1)}>
                  Back
                </button>
                {crop && (
                  <button type="button" className={GHOST_BTN} onClick={() => setCrop(null)}>
                    Clear selection
                  </button>
                )}
                <button type="button" className={PRIMARY_BTN} onClick={handleTrace} disabled={tracing}>
                  {tracing ? 'Tracing…' : 'Trace region →'}
                </button>
              </div>
            </>
          )}

          {step === 3 && result && (
            <>
              {preview}
              <p className="text-xs text-ink-soft">
                {shapeCount} shape{shapeCount === 1 ? '' : 's'} traced · engrave by default —
                per-shape cut/score roles arrive with the Review editor.
              </p>
              <div className="flex gap-2">
                <button type="button" className={GHOST_BTN} onClick={() => setStep(2)}>
                  Back
                </button>
                <button type="button" className={PRIMARY_BTN} onClick={() => setStep(4)}>
                  Continue →
                </button>
              </div>
            </>
          )}

          {step === 4 && result && sessionOnlyReason && (
            <>
              {preview}
              {/* Session-only save notice (review finding 2). Same inline
                  role="status" banner pattern as TextPropertiesPanel — the app
                  has no toast system. */}
              <div
                role="status"
                className="flex gap-1.5 rounded-md border border-tone-mild/30 bg-tone-mild/5 p-2 text-[11px] leading-snug text-tone-mild max-w-md"
              >
                <span aria-hidden className="shrink-0">⚠</span>
                <span>
                  Saved for this session — cloud save unavailable ({sessionOnlyReason}). It will
                  disappear on reload.
                </span>
              </div>
              <button type="button" className={PRIMARY_BTN} onClick={onClose}>
                Continue
              </button>
            </>
          )}

          {step === 4 && result && !sessionOnlyReason && (
            <>
              {preview}
              <label className="flex flex-col gap-1 w-full max-w-sm">
                <span className="text-xs text-ink-soft">Title</span>
                <input
                  type="text"
                  value={title}
                  placeholder={defaultTitle}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-paper-warm text-ink text-sm px-2.5 py-1.5 rounded-xs border border-hairline outline-none focus:border-violet transition-colors duration-fast ease-out-quart"
                />
              </label>
              <div className="flex gap-2">
                <button type="button" className={GHOST_BTN} onClick={() => setStep(3)}>
                  Back
                </button>
                <button type="button" className={PRIMARY_BTN} onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save to library'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
