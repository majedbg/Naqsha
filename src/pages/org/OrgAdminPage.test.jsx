// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OrgAdminPage from './OrgAdminPage';
import { isOrgAdmin } from '../../lib/org/membershipService';
import { listActiveOrgMaterials, listMaterials } from '../../lib/org/materialService';

vi.mock('../../lib/org/membershipService');
vi.mock('../../lib/org/materialService');
vi.mock('../../lib/org/submissionStorage', () => ({
  loadSubmissionSvg: vi.fn(),
}));

vi.mock('./OrgContext', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'ITP' }, loading: false, notFound: false }),
}));
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

// Stub the real AdminQueue: render an Access-denied marker when !isAdmin, else a
// "select" button that drives onSelectionChange with the provided rows. Keeps
// the page test about wiring + the single-material guard, not queue internals.
let queueRows = [];
vi.mock('../../components/org/admin/AdminQueue.jsx', () => ({
  default: ({ isAdmin, onSelectionChange }) => {
    if (!isAdmin) return <div>Access denied — admins only.</div>;
    return (
      <button type="button" onClick={() => onSelectionChange(queueRows)}>
        mock-select
      </button>
    );
  },
}));
vi.mock('../../components/org/admin/AggregatePanel.jsx', () => ({
  default: ({ sheet, selected }) => (
    <div data-testid="aggregate-panel">
      {`sheet:${sheet.sheetWMm}x${sheet.sheetHMm}|n:${selected.length}`}
    </div>
  ),
}));
// Stub MaterialAdmin: surface the orgId + catalog size it was mounted with, so
// the page test stays about wiring (admin-gating + catalog hand-off), not the
// material-admin internals (covered by MaterialAdmin.test.jsx).
vi.mock('../../components/org/admin/MaterialAdmin.jsx', () => ({
  default: ({ orgId, catalog }) => (
    <div data-testid="material-admin">{`org:${orgId}|catalog:${catalog.length}`}</div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  queueRows = [];
  listActiveOrgMaterials.mockResolvedValue([
    { id: 'm1', sheet_w_mm: 300, sheet_h_mm: 200 },
    { id: 'm2', sheet_w_mm: 600, sheet_h_mm: 400 },
  ]);
  listMaterials.mockResolvedValue([
    { id: 'cat-1', name: 'acrylic' },
    { id: 'cat-2', name: 'plywood' },
    { id: 'cat-3', name: 'mdf' },
  ]);
});

describe('OrgAdminPage', () => {
  it('TRACER: a non-admin sees access-denied, never the aggregate panel', async () => {
    isOrgAdmin.mockResolvedValue(false);

    render(<OrgAdminPage />);

    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByTestId('aggregate-panel')).toBeNull();
  });

  it('a non-admin never sees the Materials admin section or loads the catalog', async () => {
    isOrgAdmin.mockResolvedValue(false);

    render(<OrgAdminPage />);

    await screen.findByText(/access denied/i);
    expect(screen.queryByTestId('material-admin')).toBeNull();
    expect(listMaterials).not.toHaveBeenCalled();
  });

  it('an admin sees the Materials section with MaterialAdmin fed the global catalog', async () => {
    isOrgAdmin.mockResolvedValue(true);

    render(<OrgAdminPage />);

    // The stub mounts immediately at catalog:0, then the listMaterials effect
    // resolves and re-renders at catalog:3 — wait for the loaded state.
    await waitFor(() =>
      expect(screen.getByTestId('material-admin')).toHaveTextContent('org:org-1|catalog:3'),
    );
    expect(listMaterials).toHaveBeenCalledTimes(1);
  });

  it('an admin sees the queue; selecting single-material rows mounts the aggregate panel with derived sheet dims', async () => {
    isOrgAdmin.mockResolvedValue(true);
    queueRows = [
      { id: 's1', org_material_id: 'm1', width_mm: 50, height_mm: 50, ops: [], svg_path: 'p/s1.svg' },
      { id: 's2', org_material_id: 'm1', width_mm: 40, height_mm: 40, ops: [], svg_path: 'p/s2.svg' },
    ];

    render(<OrgAdminPage />);

    // Wait for the admin gate + materials to resolve, queue to render.
    const selectBtn = await screen.findByText('mock-select');
    fireEvent.click(selectBtn);

    const panel = await screen.findByTestId('aggregate-panel');
    // Sheet dims derived from m1 (300x200), 2 pieces selected.
    expect(panel).toHaveTextContent('sheet:300x200|n:2');
  });

  it('selecting rows across multiple materials shows the single-material guard, not the panel', async () => {
    isOrgAdmin.mockResolvedValue(true);
    queueRows = [
      { id: 's1', org_material_id: 'm1', width_mm: 50, height_mm: 50, ops: [], svg_path: 'p/s1.svg' },
      { id: 's2', org_material_id: 'm2', width_mm: 40, height_mm: 40, ops: [], svg_path: 'p/s2.svg' },
    ];

    render(<OrgAdminPage />);

    const selectBtn = await screen.findByText('mock-select');
    fireEvent.click(selectBtn);

    expect(await screen.findByText(/single material/i)).toBeInTheDocument();
    expect(screen.queryByTestId('aggregate-panel')).toBeNull();
  });

  it('resolves admin status against the current org+user', async () => {
    isOrgAdmin.mockResolvedValue(true);

    render(<OrgAdminPage />);

    await waitFor(() =>
      expect(isOrgAdmin).toHaveBeenCalledWith('org-1', 'user-1'),
    );
  });
});
