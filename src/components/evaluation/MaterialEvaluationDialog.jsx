import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import useMaterialEvaluations from "../../lib/hooks/useMaterialEvaluations";
import { resolveAppearance } from "../../lib/three3d/resolveAppearance";
import {
  validateSubmission,
  ALLOWED_PHOTO_TYPES,
} from "../../lib/materialEvaluationService";

// MaterialEvaluationDialog — material-evaluation slice 1
// (docs/material-evaluation-VISION.md "The UX in one image")
//
// The keystone side-by-side: the maker's photo of their physical Sheet on one
// side, the just-captured render screenshot of the same Material Archetype on
// the other. Opened by Studio when Scene3D's "Evaluate material" button
// captures a frame (the same <SnapshotCapture> pathway as "Save image" — an
// ADR 0003 preview artifact, NEVER part of the fabrication path — routed to a
// submission instead of a download).
//
// LOGIN GATE (real, ships ON — mirrors the motif-library precedent): logged
// out → submit disabled + sign-in prompt. The premium scaffold
// (materialEvaluationEntitlement.canSubmitEvaluation) is a SEPARATE seam and
// ships OFF (everyone entitled), so it is not consulted here yet — flipping it
// on later adds one check without touching the login gate.
//
// Self-contained on purpose (owns useAuth + useMaterialEvaluations) so Studio
// only threads the capture: `{evaluationCapture && <MaterialEvaluationDialog …/>}`.

export default function MaterialEvaluationDialog({ material, renderDataUrl, onClose }) {
  const { user, signIn } = useAuth();
  const { submit, error } = useMaterialEvaluations(user);

  const [photoFile, setPhotoFile] = useState(null);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | submitting | done | failed
  const photoInputRef = useRef(null);

  // The archetype the render ACTUALLY used — resolved the same way the 3D
  // scene resolves it, denormalized into the submission at capture time.
  const archetype = useMemo(() => resolveAppearance(material).archetype, [material]);

  // Photo preview object-URL (guarded: jsdom lacks createObjectURL).
  const photoPreview = useMemo(
    () =>
      photoFile && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(photoFile)
        : null,
    [photoFile],
  );
  useEffect(
    () => () => {
      if (photoPreview && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(photoPreview);
      }
    },
    [photoPreview],
  );

  // Escape closes (PatternPickerModal precedent, without its drag guard) —
  // EXCEPT mid-submit: closing then would hide the success/failure outcome of
  // a write that completes anyway (review finding). The ✕ shares the guard.
  const closable = phase !== "submitting";
  useEffect(() => {
    if (!closable) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, closable]);

  const valid = validateSubmission({ material, photoFile, renderDataUrl });
  const canSubmit = !!user && valid.ok && phase !== "submitting" && phase !== "done";

  const handleSubmit = async () => {
    setPhase("submitting");
    const stored = await submit({
      material,
      archetype,
      photoFile,
      renderDataUrl,
      note: note || null,
    });
    setPhase(stored ? "done" : "failed");
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/70 flex items-start justify-center pt-10 px-4"
      data-testid="evaluation-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Evaluate material"
    >
      <div className="w-full max-w-3xl rounded-lg border border-white/10 bg-neutral-900 p-5 text-sm text-white/85 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">
              Evaluate material — {material?.name}
            </h2>
            <p className="mt-0.5 text-xs text-white/60">
              Does the render match your actual sheet? Your photo and this render
              are stored together as one evaluation.
            </p>
            <p className="mt-1 text-xs text-white/50">
              Material Archetype:{" "}
              <span data-testid="evaluation-archetype" className="font-mono">
                {archetype}
              </span>
            </p>
          </div>
          <button
            type="button"
            data-testid="evaluation-close"
            aria-label="Close"
            disabled={!closable}
            onClick={() => closable && onClose?.()}
            className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* The side-by-side: photo | render. */}
        <div className="grid grid-cols-2 gap-3">
          <figure className="flex flex-col gap-2">
            <figcaption className="text-xs font-medium text-white/70">
              Your sheet (photo)
            </figcaption>
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-dashed border-white/20 bg-black/30">
              {photoPreview ? (
                <img
                  data-testid="evaluation-photo-img"
                  src={photoPreview}
                  alt="Your sheet"
                  className="h-full w-full object-contain"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="px-4 py-8 text-xs text-white/50 hover:text-white/80"
                >
                  Add a photo of your physical sheet
                  <span className="mt-1 block text-white/35">PNG, JPEG, or WebP · max 10 MB</span>
                </button>
              )}
            </div>
            <input
              ref={photoInputRef}
              data-testid="evaluation-photo-input"
              type="file"
              accept={ALLOWED_PHOTO_TYPES.join(",")}
              className="text-xs text-white/60 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-white/80"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
          </figure>

          <figure className="flex flex-col gap-2">
            <figcaption className="text-xs font-medium text-white/70">
              Preview render
            </figcaption>
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-white/10 bg-black/30">
              <img
                data-testid="evaluation-render-img"
                src={renderDataUrl}
                alt={`3D preview render of ${material?.name ?? "material"}`}
                className="h-full w-full object-contain"
              />
            </div>
            <p className="text-xs text-white/40">
              Captured from the 3D preview just now.
            </p>
          </figure>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-white/70">Note (optional)</span>
          <textarea
            data-testid="evaluation-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Lighting, supplier, batch — anything that helps judge the match"
            className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white/85 placeholder:text-white/30"
          />
        </label>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="min-h-4 text-xs">
            {!user && (
              <span className="text-white/60">
                Sign in to submit —{" "}
                <button
                  type="button"
                  onClick={() => signIn?.()}
                  className="underline hover:text-white"
                >
                  Sign in
                </button>
              </span>
            )}
            {phase === "failed" && (
              <span data-testid="evaluation-error" className="text-red-400">
                Couldn&apos;t submit{error?.message ? ` — ${error.message}` : ""}. Try again.
              </span>
            )}
            {phase === "done" && (
              <span data-testid="evaluation-success" className="text-emerald-400">
                Submitted —{" "}
                <Link to="/evaluations" className="underline hover:text-emerald-300">
                  My evaluations
                </Link>
              </span>
            )}
          </div>
          <button
            type="button"
            data-testid="evaluation-submit"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition enabled:hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {phase === "submitting" ? "Submitting…" : "Submit evaluation"}
          </button>
        </div>
      </div>
    </div>
  );
}
