import { useEffect, useMemo, useState } from 'react';
import { listMyOrgs } from '../../lib/org/membershipService';
import {
  buildSubmissionSvg,
  partitionSubmittableLayers,
} from '../../lib/svg/buildSubmissionSvg';
import SubmitToOrg from './SubmitToOrg.jsx';

// StudioSubmitModal — the in-app "Submit to org" entry point (the deferred seam).
// It owns the org-selection chrome around <SubmitToOrg>:
//   • loads the user's orgs (membership-based — any member may submit)
//   • 0 orgs  → tells the user there's nowhere to submit
//   • 1 org   → goes straight in
//   • >1 orgs → a small picker first
// and it pre-checks that the design actually has cut/score/engrave layers,
// warning about any pen/unassigned layers that will be left out of the cut.
export default function StudioSubmitModal({
  userId,
  layers,
  // A getter (not a value): the studio holds pattern instances in a ref, which
  // must not be read during render. SubmitToOrg snapshots the SVG on open, so we
  // resolve the instances then, at event time.
  getPatternInstances,
  canvasW,
  canvasH,
  operations,
  designId = null,
  onClose,
  onSubmitted,
}) {
  const [orgs, setOrgs] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [selectedOrg, setSelectedOrg] = useState(null);

  // What will (and won't) ship — computed once from the snapshot on open.
  const { submit, dropped } = useMemo(
    () => partitionSubmittableLayers(layers, operations),
    [layers, operations],
  );

  // Name step. Prefilled from the design's top submittable layer (the studio has
  // no human design name), required non-empty, and confirmed BEFORE SubmitToOrg
  // mounts — SubmitToOrg snapshots its draft (incl. name) once on open, so the
  // name must be final by then. Still re-editable later in the review card.
  const [name, setName] = useState(
    () => submit[0]?.name?.trim() || 'Untitled design',
  );
  const [nameConfirmed, setNameConfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    listMyOrgs(userId)
      .then((rows) => {
        if (!active) return;
        const list = rows || [];
        setOrgs(list);
        if (list.length === 1) setSelectedOrg(list[0]);
      })
      .catch((e) => {
        if (active) setError(e?.message || 'Could not load your organizations.');
      });
    return () => {
      active = false;
    };
  }, [userId]);

  // Snapshot the design SVG on demand (SubmitToOrg calls this once on open).
  const exportSvg = () =>
    buildSubmissionSvg(layers, getPatternInstances(), canvasW, canvasH, operations);

  function body() {
    if (error) {
      return (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      );
    }
    if (orgs === null) {
      return <p className="text-sm text-gray-500">Loading…</p>;
    }
    if (orgs.length === 0) {
      return (
        <p className="text-sm text-gray-600">
          You’re not a member of any organization yet. Ask a workshop admin to
          add you by email, then you can submit designs here.
        </p>
      );
    }
    if (submit.length === 0) {
      return (
        <p className="text-sm text-gray-600">
          This design has no cut, score, or engrave layers to submit. Assign a
          cut/score/engrave operation to at least one layer first.
        </p>
      );
    }
    if (!selectedOrg) {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-gray-700">Submit to which organization?</p>
          <ul className="flex flex-col gap-1">
            {orgs.map((org) => (
              <li key={org.id}>
                <button
                  type="button"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => setSelectedOrg(org)}
                >
                  {org.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    const droppedNotice = dropped.length > 0 && (
      <p
        role="status"
        className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
      >
        {`${dropped.length} layer(s) won’t be included (no cut/score/engrave operation): `}
        {dropped.map((l) => l.name || l.id).join(', ')}
      </p>
    );

    if (!nameConfirmed) {
      const trimmed = name.trim();
      return (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed) setNameConfirmed(true);
          }}
        >
          {droppedNotice}
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            Name this submission
            <input
              aria-label="Submission name"
              className="rounded border border-gray-300 px-2 py-1 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-40"
              disabled={!trimmed}
            >
              Continue
            </button>
          </div>
        </form>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {droppedNotice}
        <SubmitToOrg
          orgId={selectedOrg.id}
          userId={userId}
          name={name.trim()}
          designId={designId}
          exportSvg={exportSvg}
          onSubmitted={onSubmitted}
          onCancel={onClose}
        />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Submit to organization"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Submit to org</h2>
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {body()}
      </div>
    </div>
  );
}
