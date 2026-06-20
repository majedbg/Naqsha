// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MaterialAdmin from './MaterialAdmin.jsx';
import {
  listActiveOrgMaterials,
  addOrgMaterial,
  toggleOrgMaterial,
} from '../../../lib/org/materialService';

vi.mock('../../../lib/org/materialService');

beforeEach(() => {
  vi.clearAllMocks();
});

const CATALOG = [
  { id: 'mat-acrylic', name: '1/8in clear acrylic', type: 'acrylic', thickness_mm: 3.0, color: 'clear' },
  { id: 'mat-ply', name: '3mm plywood', type: 'plywood', thickness_mm: 3.0, color: 'natural' },
];

describe('MaterialAdmin', () => {
  it('renders the org current materials with name, thickness, sheet size and active state', async () => {
    listActiveOrgMaterials.mockResolvedValue([
      {
        id: 'om-1',
        material_id: 'mat-acrylic',
        name: '1/8in clear acrylic',
        thickness_mm: 3.0,
        sheet_w_mm: 600,
        sheet_h_mm: 400,
        price: 25,
        is_active: true,
      },
    ]);

    render(<MaterialAdmin orgId="org-1" catalog={CATALOG} />);

    expect(await screen.findByText('1/8in clear acrylic')).toBeInTheDocument();
    expect(listActiveOrgMaterials).toHaveBeenCalledWith('org-1');
    expect(screen.getByText(/3 mm thick/i)).toBeInTheDocument(); // thickness
    expect(screen.getByText(/600 × 400 mm/i)).toBeInTheDocument(); // sheet size
    expect(screen.getByText(/active/i)).toBeInTheDocument(); // active state
  });

  it('adds a catalog material to the org with sheet dims + price, then reflects it', async () => {
    listActiveOrgMaterials.mockResolvedValue([]);
    addOrgMaterial.mockResolvedValue({ id: 'om-new' });

    render(<MaterialAdmin orgId="org-1" catalog={CATALOG} />);

    await waitFor(() => expect(listActiveOrgMaterials).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/material/i), {
      target: { value: 'mat-ply' },
    });
    fireEvent.change(screen.getByLabelText(/sheet width/i), { target: { value: '600' } });
    fireEvent.change(screen.getByLabelText(/sheet height/i), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '30' } });

    // After add, the list re-fetches and shows the new offering.
    listActiveOrgMaterials.mockResolvedValue([
      {
        id: 'om-new',
        material_id: 'mat-ply',
        name: '3mm plywood',
        thickness_mm: 3.0,
        sheet_w_mm: 600,
        sheet_h_mm: 400,
        price: 30,
        is_active: true,
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() =>
      expect(addOrgMaterial).toHaveBeenCalledWith('org-1', 'mat-ply', {
        sheet_w_mm: 600,
        sheet_h_mm: 400,
        price: 30,
      }),
    );

    // The new offering row renders its sheet size (not present in catalog <option>s).
    expect(await screen.findByText(/600 × 400 mm/i)).toBeInTheDocument();
  });

  it('toggles a material active->inactive via toggleOrgMaterial(id, !wasActive)', async () => {
    listActiveOrgMaterials.mockResolvedValue([
      {
        id: 'om-1',
        material_id: 'mat-acrylic',
        name: '1/8in clear acrylic',
        thickness_mm: 3.0,
        sheet_w_mm: 600,
        sheet_h_mm: 400,
        price: 25,
        is_active: true,
      },
    ]);
    toggleOrgMaterial.mockResolvedValue({});

    render(<MaterialAdmin orgId="org-1" catalog={CATALOG} />);

    const btn = await screen.findByRole('button', { name: /deactivate/i });
    fireEvent.click(btn);

    await waitFor(() =>
      expect(toggleOrgMaterial).toHaveBeenCalledWith('om-1', false),
    );
  });

  it('surfaces a role="alert" when add fails (no silent failure)', async () => {
    listActiveOrgMaterials.mockResolvedValue([]);
    addOrgMaterial.mockRejectedValue(new Error('insert denied'));

    render(<MaterialAdmin orgId="org-1" catalog={CATALOG} />);

    await waitFor(() => expect(listActiveOrgMaterials).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/material/i), {
      target: { value: 'mat-ply' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('surfaces a role="alert" when toggle fails (no silent failure)', async () => {
    listActiveOrgMaterials.mockResolvedValue([
      {
        id: 'om-1',
        material_id: 'mat-acrylic',
        name: '1/8in clear acrylic',
        thickness_mm: 3.0,
        sheet_w_mm: 600,
        sheet_h_mm: 400,
        price: 25,
        is_active: true,
      },
    ]);
    toggleOrgMaterial.mockRejectedValue(new Error('update denied'));

    render(<MaterialAdmin orgId="org-1" catalog={CATALOG} />);

    fireEvent.click(await screen.findByRole('button', { name: /deactivate/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
