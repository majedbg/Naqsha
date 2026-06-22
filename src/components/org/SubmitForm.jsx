import { useEffect, useMemo, useState } from 'react';
import { listActiveOrgMaterials } from '../../lib/org/materialService';
import { uploadSubmissionSvg, removeSubmissionSvg } from '../../lib/org/uploadService';
import {
  createSubmission,
  createGuestSubmission,
} from '../../lib/org/submissionService';
import HoldToSubmitButton from './HoldToSubmitButton.jsx';

const OP_LABELS = { cut: 'Cut', score: 'Score', engrave: 'Engrave' };
const OP_ORDER = ['cut', 'score', 'engrave'];
const OP_OPTIONS = ['cut', 'score', 'engrave'];

function groupByOp(layers) {
  const groups = new Map();
  for (const layer of layers) {
    const op = layer.op || '__untagged__';
    if (!groups.has(op)) groups.set(op, []);
    groups.get(op).push(layer);
  }
  const ordered = [];
  for (const op of OP_ORDER) {
    if (groups.has(op)) ordered.push([op, groups.get(op)]);
  }
  for (const [op, items] of groups) {
    if (!OP_ORDER.includes(op)) ordered.push([op, items]);
  }
  return ordered;
}

// Client-generates the submission id so the SVG can be uploaded to
// `${orgId}/${id}.svg` before the DB row exists (createSubmission takes no id).
function newSubmissionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sub-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function SubmitForm({
  draft,
  orgId,
  userId,
  // Guest mode (#27): when present (and no userId), submit as an anonymous guest
  // via createGuestSubmission instead of the member createSubmission. Carries the
  // guest's identity { name, email?, phone? } captured upstream in the modal.
  guest = null,
  // Guest done-state "Make another" affordance. Defaults to onCancel so the host
  // (the studio modal) can return the guest to a fresh submit. Members never see
  // this — their done-state is the plain success acknowledgement, unchanged.
  onAnother,
  onSubmitted,
  onCancel,
}) {
  const isGuest = !userId && !!guest;
  const [materials, setMaterials] = useState([]);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const [layers, setLayers] = useState(() =>
    (draft.ops || []).map((o) => ({
      key: o.key,
      label: o.label,
      op: o.defaultOp || null,
    })),
  );
  const [name, setName] = useState(draft.name || '');
  const [materialId, setMaterialId] = useState(null);
  // Size starts confirmed only when the upstream parse was unambiguous.
  const [sizeConfirmed, setSizeConfirmed] = useState(!draft.ambiguous);

  // Snapshot used to revert on "Cancel edit".
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    let active = true;
    listActiveOrgMaterials(orgId)
      .then((rows) => {
        if (!active) return;
        const list = rows || [];
        setMaterials(list);
        // Guest in-room flow (#27 AC8): with exactly one active material there is
        // no choice to make, so auto-select it and skip the picker step. Members
        // always pick explicitly — their path is unchanged.
        if (isGuest && list.length === 1) setMaterialId(list[0].id);
      })
      .catch(() => {
        if (active) setMaterials([]);
      });
    return () => {
      active = false;
    };
  }, [orgId, isGuest]);

  const opGroups = useMemo(() => groupByOp(layers), [layers]);
  const selectedMaterial = materials.find((m) => m.id === materialId) || null;

  function materialLabel(m) {
    if (!m) return '';
    const parts = [];
    if (m.thickness_mm != null) parts.push(`${m.thickness_mm}mm`);
    if (m.name) parts.push(m.name);
    return parts.join(' ');
  }

  // Every unmet gate reason surfaces inline so the member sees all outstanding
  // work at once (spec §7 two-stage gate).
  const gateReasons = useMemo(() => {
    // Hold-to-submit is hidden entirely while editing (the gate "read-only"
    // condition is enforced by hiding the button, not by a reason string).
    if (editing) return [];
    const reasons = [];
    if (!materialId) reasons.push('Pick a material');
    if (!sizeConfirmed) reasons.push('Confirm size');
    layers.forEach((l, i) => {
      if (!l.op) reasons.push(`Tag layer ${i + 1}`);
    });
    // Guard against an unresolved tenant/identity: without these the upload path
    // would be `undefined/<id>.svg` and RLS would reject the write. In guest mode
    // there is no userId — the identity is the (required) guest name instead.
    const identityReady = isGuest ? !!guest?.name?.trim() : !!userId;
    if (!orgId || !identityReady) reasons.push('Preparing your workspace…');
    return reasons;
  }, [editing, materialId, sizeConfirmed, layers, orgId, userId, isGuest, guest]);

  const ready = gateReasons.length === 0;

  function enterEdit() {
    setSnapshot({ layers: layers.map((l) => ({ ...l })), name, materialId, sizeConfirmed });
    setEditing(true);
  }

  function cancelEdit() {
    if (snapshot) {
      setLayers(snapshot.layers);
      setName(snapshot.name);
      setMaterialId(snapshot.materialId);
      setSizeConfirmed(snapshot.sizeConfirmed);
    }
    setSnapshot(null);
    setEditing(false);
  }

  function saveEdit() {
    setSnapshot(null);
    setEditing(false);
  }

  function setLayerOp(key, op) {
    setLayers((prev) =>
      prev.map((l) => (l.key === key ? { ...l, op } : l)),
    );
  }

  async function handleConfirmSubmit() {
    if (!ready || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    // Tracks a successful upload so its blob can be cleaned up if the
    // subsequent DB-row creation fails (otherwise the object is orphaned).
    let uploadedPath = null;
    try {
      const submissionId = newSubmissionId();
      uploadedPath = await uploadSubmissionSvg({
        orgId,
        submissionId,
        svgString: draft.svgClean,
      });
      const ops = layers.map((l) => ({ key: l.key, label: l.label, op: l.op }));
      const row = isGuest
        ? await createGuestSubmission({
            orgId,
            guestName: guest.name,
            guestEmail: guest.email || null,
            guestPhone: guest.phone || null,
            orgMaterialId: materialId,
            materialLabel: materialLabel(selectedMaterial),
            source: draft.source,
            designId: draft.designId || null,
            svgPath: uploadedPath,
            widthMm: draft.widthMm,
            heightMm: draft.heightMm,
            ops,
            name,
            notes: draft.notes || null,
          })
        : await createSubmission({
            orgId,
            submittedBy: userId,
            orgMaterialId: materialId,
            materialLabel: materialLabel(selectedMaterial),
            source: draft.source,
            designId: draft.designId || null,
            svgPath: uploadedPath,
            widthMm: draft.widthMm,
            heightMm: draft.heightMm,
            ops,
            name,
            notes: draft.notes || null,
          });
      setDone(true);
      onSubmitted?.(row);
    } catch (err) {
      // Surface the failure so a live RLS/network error is explained and
      // retryable, and log it for diagnosis.
      console.error(err);
      setSubmitError(
        'Submission failed. Please check your connection and try again.',
      );
      // Best-effort cleanup of the orphaned blob if the upload had succeeded
      // but the row creation threw. Do not let cleanup mask the original error.
      if (uploadedPath) {
        Promise.resolve(removeSubmissionSvg(uploadedPath)).catch(() => {});
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-gray-900">
        {editing ? (
          <input
            aria-label="Job name"
            className="rounded border border-gray-300 px-2 py-1 text-base"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        ) : (
          name
        )}
      </h2>

      {/* Preview: rendered (already-sanitized upstream) SVG thumbnail. */}
      <div
        data-testid="svg-preview"
        aria-label="Design preview"
        className="flex max-h-48 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-2 [&_svg]:max-h-44 [&_svg]:w-auto"
        dangerouslySetInnerHTML={{ __html: draft.svgClean || '' }}
      />

      <div className="text-sm text-gray-700">
        {`${draft.widthMm} × ${draft.heightMm} mm`}
      </div>

      {editing && !sizeConfirmed && (
        <button
          type="button"
          className="self-start rounded border border-gray-300 px-2 py-1 text-sm"
          onClick={() => setSizeConfirmed(true)}
        >
          Confirm size
        </button>
      )}

      <div className="text-sm">
        {editing ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase text-gray-500">Material</span>
            <select
              aria-label="Material"
              className="rounded border border-gray-300 px-2 py-1"
              value={materialId || ''}
              onChange={(e) => setMaterialId(e.target.value || null)}
            >
              <option value="">— Pick a material —</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {materialLabel(m)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="text-gray-700">
            {selectedMaterial ? (
              <span>
                {materialLabel(selectedMaterial)} ·{' '}
                {selectedMaterial.sheet_w_mm}×{selectedMaterial.sheet_h_mm} mm
              </span>
            ) : (
              <span className="text-gray-400">No material selected</span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {opGroups.map(([op, items]) => (
          <div key={op}>
            <h3 className="text-xs font-medium uppercase text-gray-500">
              {OP_LABELS[op] || 'Untagged'}
            </h3>
            <ul className="flex flex-col gap-1">
              {items.map((layer) => (
                <li
                  key={layer.key}
                  className="flex items-center justify-between text-sm text-gray-800"
                >
                  <span>{layer.label}</span>
                  {editing && (
                    <select
                      aria-label={`Op type for ${layer.label}`}
                      className="rounded border border-gray-300 px-1 py-0.5 text-xs"
                      value={layer.op || ''}
                      onChange={(e) =>
                        setLayerOp(layer.key, e.target.value || null)
                      }
                    >
                      <option value="">— op —</option>
                      {OP_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {OP_LABELS[o]}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {done ? (
        isGuest ? (
          <div className="flex items-center gap-3">
            <span
              role="status"
              className="text-sm font-medium text-emerald-600"
            >
              ✓ Submitted
            </span>
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              onClick={() => (onAnother || onCancel)?.()}
            >
              Make another
            </button>
          </div>
        ) : (
          <div role="status" className="text-sm font-medium text-emerald-600">
            ✓ Submitted
          </div>
        )
      ) : (
        <div className="flex items-center gap-3">
          {editing ? (
            <>
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                onClick={cancelEdit}
              >
                Cancel edit
              </button>
              <button
                type="button"
                className="rounded bg-gray-900 px-3 py-2 text-sm text-white"
                onClick={saveEdit}
              >
                Save
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                onClick={() => onCancel?.()}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                onClick={enterEdit}
              >
                Edit
              </button>
              <div className="flex flex-col items-start">
                <HoldToSubmitButton
                  disabled={!ready || submitting}
                  disabledReason={!ready ? gateReasons[0] : undefined}
                  onConfirm={handleConfirmSubmit}
                  holdMs={2000}
                  reducedMotion={prefersReducedMotion()}
                />
                {gateReasons.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs text-amber-600">
                    {gateReasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                {submitError && (
                  <p
                    role="alert"
                    className="mt-1 text-xs font-medium text-red-600"
                  >
                    {submitError}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
