// ExtractStepper — full-screen guided Photo → Pattern flow (S0 spine, issue
// #49; locked decision 7): Upload → Flatten → Select → Review → Save.
//
//   Upload  : pick/capture a photo (file input; camera arrives via `capture`
//             on mobile for free).
//   Flatten : SKIP-ONLY stub in S0 — the stage exists so auto plane detection
//             + manual quad drop in behind it later (locked decision 2).
//   Select  : manual region crop — drag a rectangle over the photo (locked
//             decision 3: one pattern per extraction, manual select).
//   Review  : the traced proposal as EDITABLE per-shape rows (S6, issue #55):
//             each motif carries both representations from the pipeline
//             (contour + centerline when non-degenerate), so the user can
//             toggle centerline↔contour and flip the engrave/cut/score role
//             per shape (locked decision 9). The preview colors by role.
//   Save    : title + save → registers into the picker's custom family AND
//             persists via LibraryRepository (one entity, two surfaces).
//
// The extraction itself runs through the WorkerBridge (off-main-thread where
// Workers exist). All DOM/canvas work lives in lib/extraction/imageIO so this
// component stays jsdom-testable with that seam mocked.

import { useCallback, useEffect, useRef, useState } from 'react';
import { fileToDataURL, loadImage, cropToImageData } from '../../lib/extraction/imageIO';
import { createExtractionBridge } from '../../lib/extraction/workerBridge';
import { makeExtractedPattern } from '../../lib/extraction/extractedPattern';
import { FABRICATION_ROLES } from '../../lib/extraction/vectorizer';
import { registerExtractedPattern } from '../../lib/patterns/ExtractedPatternGenerator';
import { saveExtractedPattern } from '../../lib/libraryRepository';

const STEPS = ['Upload', 'Flatten', 'Select', 'Review', 'Save'];

// Preview color per fabrication role — a visible distinction between what the
// laser engraves (dark), cuts (red), and scores (blue). Preview-only; export
// colors stay the layer color.
const ROLE_COLORS = { engrave: '#1a1a1a', cut: '#dc2626', score: '#2563eb' };

// --- Review model (S6, issue #55) -------------------------------------------
// The pipeline's components[] carries BOTH representations per motif. Results
// without components (older worker payloads) degrade to single-representation
// shapes whose toggle is disabled — same rows, no dead end.

function shapesFromResult(result) {
  if (result.components?.length) {
    return result.components.map((c) => ({
      contour: c.contour ?? null,
      centerline: c.centerline ?? null,
      kind: c.kind,
      role: c.role,
    }));
  }
  return [
    ...result.tile.fills.map((f) => ({
      contour: { d: f.d },
      centerline: null,
      kind: 'fill',
      role: f.role,
    })),
    ...result.tile.strokes.map((s) => ({
      contour: null,
      centerline: { d: s.d },
      kind: 'stroke',
      role: s.role,
    })),
  ];
}

// Apply the user's Review edits: each shape lands in fills or strokes under
// its chosen representation + role. Kinds are only ever toggled toward a
// representation the shape HAS, so the picked d always exists.
function buildTile(result, shapes, edits) {
  const fills = [];
  const strokes = [];
  shapes.forEach((shape, i) => {
    const { kind, role } = edits[i] ?? shape;
    if (kind === 'stroke') strokes.push({ d: shape.centerline.d, role });
    else fills.push({ d: shape.contour.d, role });
  });
  return { width: result.tile.width, height: result.tile.height, fills, strokes };
}

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
  const [stageMsg, setStageMsg] = useState('');
  const [result, setResult] = useState(null);
  // Per-shape Review edits ({kind, role} parallel to shapesFromResult(result));
  // reset whenever a new trace lands (S6, issue #55).
  const [shapeEdits, setShapeEdits] = useState([]);
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
        setStageMsg(`${p.stage}: ${p.status}`)
      );
      if (!res.tile.fills.length && !res.tile.strokes.length) {
        setError('No shapes found in that region — try a tighter or higher-contrast selection.');
        return;
      }
      setResult(res);
      setShapeEdits(shapesFromResult(res).map(({ kind, role }) => ({ kind, role })));
      setStep(3);
    } catch (err) {
      setError(err.message || 'Extraction failed.');
    } finally {
      setTracing(false);
      setStageMsg('');
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
        tile: buildTile(result, shapesFromResult(result), shapeEdits),
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
  }, [result, shapeEdits, title, defaultTitle, file, onSaved, onClose]);

  // --- Review edits (S6) --------------------------------------------------------

  const setShapeRole = (i, role) =>
    setShapeEdits((edits) => edits.map((e, j) => (j === i ? { ...e, role } : e)));

  // Toggling representation resets the role to the target kind's default —
  // centerline→score, contour→engrave (locked decision 9) — so the pairing
  // stays predictable; the user can re-pick after.
  const toggleShapeKind = (i) =>
    setShapeEdits((edits) =>
      edits.map((e, j) =>
        j === i
          ? e.kind === 'stroke'
            ? { kind: 'fill', role: 'engrave' }
            : { kind: 'stroke', role: 'score' }
          : e
      )
    );

  // --- render -------------------------------------------------------------------

  const shapes = result ? shapesFromResult(result) : [];
  const editedTile = result ? buildTile(result, shapes, shapeEdits) : null;
  const shapeCount = shapes.length;

  const preview = editedTile ? (
    <svg
      viewBox={`0 0 ${editedTile.width} ${editedTile.height}`}
      className="max-h-64 w-auto border border-hairline bg-white"
      role="img"
      aria-label="Traced pattern preview"
    >
      {editedTile.fills.map((f, i) => (
        <path
          key={`f${i}`}
          d={f.d}
          fill={ROLE_COLORS[f.role] || '#1a1a1a'}
          fillRule="evenodd"
          stroke="none"
        />
      ))}
      {editedTile.strokes.map((s, i) => (
        <path
          key={`s${i}`}
          d={s.d}
          fill="none"
          stroke={ROLE_COLORS[s.role] || '#1a1a1a'}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  ) : null;

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
              {tracing && <p className="text-xs text-ink-soft">Tracing… {stageMsg}</p>}
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
                {shapeCount} shape{shapeCount === 1 ? '' : 's'} traced — line-work as single
                centerline strokes, solid shapes as contours. Flip a shape's role or switch its
                representation below.
              </p>
              <p className="text-[10px] text-ink-faint flex items-center gap-3" aria-hidden>
                {FABRICATION_ROLES.map((role) => (
                  <span key={role} className="flex items-center gap-1">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: ROLE_COLORS[role] }}
                    />
                    {role}
                  </span>
                ))}
              </p>
              <ul aria-label="Traced shapes" className="w-full max-w-md flex flex-col gap-1">
                {shapes.map((shape, i) => {
                  const edit = shapeEdits[i] ?? shape;
                  const isStroke = edit.kind === 'stroke';
                  // Toggle needs the OTHER representation to exist (a blob with
                  // a degenerate skeleton has no centerline — contour floor).
                  const canToggle = isStroke ? !!shape.contour : !!shape.centerline;
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-2 bg-paper-warm rounded-xs px-2.5 py-1.5"
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: ROLE_COLORS[edit.role] || '#1a1a1a' }}
                        aria-hidden
                      />
                      <span className="text-xs text-ink flex-1">Shape {i + 1}</span>
                      <button
                        type="button"
                        className="px-2 py-0.5 text-[11px] font-medium rounded-xs bg-panel text-ink-soft border border-hairline hover:text-ink disabled:opacity-40 disabled:cursor-default transition-colors duration-fast ease-out-quart"
                        aria-label={`Representation for shape ${i + 1}: ${isStroke ? 'centerline' : 'contour'}`}
                        title={
                          canToggle
                            ? `Switch to ${isStroke ? 'contour' : 'centerline'}`
                            : 'Only one representation available for this shape'
                        }
                        disabled={!canToggle}
                        onClick={() => toggleShapeKind(i)}
                      >
                        {isStroke ? 'Centerline' : 'Contour'}
                      </button>
                      <select
                        aria-label={`Fabrication role for shape ${i + 1}`}
                        value={edit.role}
                        onChange={(e) => setShapeRole(i, e.target.value)}
                        className="bg-panel text-ink text-[11px] px-1.5 py-0.5 rounded-xs border border-hairline outline-none focus:border-violet"
                      >
                        {FABRICATION_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </li>
                  );
                })}
              </ul>
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
