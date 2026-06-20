import { useEffect, useMemo, useState } from 'react';
import { useOrg } from './OrgContext';
import { useAuth } from '../../lib/AuthContext';
import { isOrgAdmin } from '../../lib/org/membershipService';
import { listActiveOrgMaterials } from '../../lib/org/materialService';
import { loadSubmissionSvg } from '../../lib/org/submissionStorage';
import AdminQueue from '../../components/org/admin/AdminQueue.jsx';
import AggregatePanel from '../../components/org/admin/AggregatePanel.jsx';

// Gap between placed pieces on a sheet. No per-material source in the data, so
// it's a fixed default (matches the value the AggregatePanel tests exercise).
const DEFAULT_GAP_MM = 5;

// OrgAdminPage — the admin queue + aggregate flow at /o/:slug/admin.
// Admin status is resolved against membership (isOrgAdmin) for the current
// org+user. The queue surfaces pending submissions; selecting rows derives a
// single sheet config from the selection's shared org_material and mounts the
// AggregatePanel. A selection spanning >1 material can't yield one sheet, so we
// show a pick-one-material prompt instead (single-material guard).
export default function OrgAdminPage() {
  const { org } = useOrg();
  const { user } = useAuth();
  const orgId = org?.id;
  const userId = user?.id;

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);
  const [materials, setMaterials] = useState([]);
  const [selected, setSelected] = useState([]);

  // Resolve admin status for this org+user. State is only ever set from the
  // async resolution (or the missing-creds microtask), never synchronously in
  // the effect body, so this never triggers a cascading render.
  useEffect(() => {
    let active = true;
    if (!orgId || !userId) {
      Promise.resolve().then(() => {
        if (!active) return;
        setIsAdmin(false);
        setAdminLoading(false);
      });
      return () => {
        active = false;
      };
    }
    isOrgAdmin(orgId, userId)
      .then((ok) => {
        if (active) {
          setIsAdmin(!!ok);
          setAdminLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setIsAdmin(false);
          setAdminLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [orgId, userId]);

  // Active org_materials supply the per-material sheet dimensions; the queue's
  // submissions only carry org_material_id, so we join here to derive sheets.
  useEffect(() => {
    let active = true;
    if (!isAdmin || !orgId) return undefined;
    listActiveOrgMaterials(orgId)
      .then((rows) => {
        if (active) setMaterials(rows || []);
      })
      .catch(() => {
        if (active) setMaterials([]);
      });
    return () => {
      active = false;
    };
  }, [isAdmin, orgId]);

  // Single-material guard: how many distinct org_materials the selection spans.
  const selectedMaterialIds = useMemo(() => {
    const ids = new Set();
    for (const row of selected) ids.add(row.org_material_id);
    return [...ids];
  }, [selected]);

  const sheet = useMemo(() => {
    if (selectedMaterialIds.length !== 1) return null;
    const material = materials.find((m) => m.id === selectedMaterialIds[0]);
    if (!material) return null;
    return {
      sheetWMm: material.sheet_w_mm,
      sheetHMm: material.sheet_h_mm,
      gapMm: DEFAULT_GAP_MM,
    };
  }, [selectedMaterialIds, materials]);

  if (adminLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold text-gray-900">Cut queue</h1>
      <AdminQueue
        orgId={orgId}
        userId={userId}
        isAdmin={isAdmin}
        onSelectionChange={setSelected}
      />

      {isAdmin && selected.length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          {selectedMaterialIds.length > 1 ? (
            <p className="text-sm text-amber-600" role="alert">
              Pick submissions of a single material to aggregate a sheet.
            </p>
          ) : sheet ? (
            <AggregatePanel
              selected={selected}
              sheet={sheet}
              loadSvg={loadSubmissionSvg}
              onCut={() => setSelected([])}
            />
          ) : (
            <p className="text-sm text-gray-500">
              Material details unavailable for this selection.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
