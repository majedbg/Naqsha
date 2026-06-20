// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AdminQueue from './AdminQueue.jsx';
import { listForOrg } from '../../../lib/org/submissionService';

vi.mock('../../../lib/org/submissionService');
vi.mock('../../../lib/org/membershipService');

beforeEach(() => {
  vi.clearAllMocks();
  listForOrg.mockResolvedValue([]);
});

describe('AdminQueue', () => {
  it('TRACER: a non-admin sees access-denied, not the queue', () => {
    render(<AdminQueue orgId="org1" userId="u1" isAdmin={false} />);

    expect(screen.getByText(/access denied|not authorized|admin/i)).toBeTruthy();
    expect(listForOrg).not.toHaveBeenCalled();
  });

  it('an admin sees the org PENDING submissions; non-pending are excluded', async () => {
    listForOrg.mockResolvedValue([
      {
        id: 's1',
        name: 'Lattice Panel',
        status: 'pending',
        org_material_id: 'm1',
        material_label: '3mm Birch Ply',
        width_mm: 100,
        height_mm: 50,
        submitted_by: 'u2',
        created_at: '2026-06-19T00:00:00Z',
      },
      {
        id: 's2',
        name: 'Already Cut',
        status: 'cut',
        org_material_id: 'm1',
        material_label: '3mm Birch Ply',
        width_mm: 200,
        height_mm: 80,
        submitted_by: 'u3',
        created_at: '2026-06-18T00:00:00Z',
      },
    ]);

    render(<AdminQueue orgId="org1" userId="u1" isAdmin />);

    expect(await screen.findByText('Lattice Panel')).toBeTruthy();
    expect(screen.queryByText('Already Cut')).toBeNull();
    expect(listForOrg).toHaveBeenCalledWith('org1');
  });

  it('filtering by a specific org_material narrows the list', async () => {
    listForOrg.mockResolvedValue([
      {
        id: 's1',
        name: 'Birch Piece',
        status: 'pending',
        org_material_id: 'm1',
        material_label: '3mm Birch Ply',
        width_mm: 100,
        height_mm: 50,
        submitted_by: 'u2',
        created_at: '2026-06-19T00:00:00Z',
      },
      {
        id: 's2',
        name: 'Acrylic Piece',
        status: 'pending',
        org_material_id: 'm2',
        material_label: '3mm Acrylic',
        width_mm: 120,
        height_mm: 60,
        submitted_by: 'u3',
        created_at: '2026-06-18T00:00:00Z',
      },
    ]);

    render(<AdminQueue orgId="org1" userId="u1" isAdmin />);

    expect(await screen.findByText('Birch Piece')).toBeTruthy();
    expect(screen.getByText('Acrylic Piece')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/material/i), {
      target: { value: 'm2' },
    });

    expect(screen.queryByText('Birch Piece')).toBeNull();
    expect(screen.getByText('Acrylic Piece')).toBeTruthy();
  });

  it('selecting rows fires onSelectionChange with the selected submission objects', async () => {
    const row1 = {
      id: 's1',
      name: 'Birch Piece',
      status: 'pending',
      org_material_id: 'm1',
      material_label: '3mm Birch Ply',
      width_mm: 100,
      height_mm: 50,
      submitted_by: 'u2',
      created_at: '2026-06-19T00:00:00Z',
    };
    const row2 = {
      id: 's2',
      name: 'Acrylic Piece',
      status: 'pending',
      org_material_id: 'm2',
      material_label: '3mm Acrylic',
      width_mm: 120,
      height_mm: 60,
      submitted_by: 'u3',
      created_at: '2026-06-18T00:00:00Z',
    };
    listForOrg.mockResolvedValue([row1, row2]);
    const onSelectionChange = vi.fn();

    render(
      <AdminQueue
        orgId="org1"
        userId="u1"
        isAdmin
        onSelectionChange={onSelectionChange}
      />,
    );

    await screen.findByText('Birch Piece');

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(onSelectionChange).toHaveBeenLastCalledWith([row1]);

    fireEvent.click(checkboxes[1]);
    expect(onSelectionChange).toHaveBeenLastCalledWith([row1, row2]);

    fireEvent.click(checkboxes[0]);
    expect(onSelectionChange).toHaveBeenLastCalledWith([row2]);
  });
});
