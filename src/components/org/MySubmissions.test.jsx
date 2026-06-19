// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MySubmissions from './MySubmissions.jsx';
import { listMine } from '../../lib/org/submissionService';

vi.mock('../../lib/org/submissionService');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MySubmissions', () => {
  it('renders a pending submission with name, Pending status, material and size', async () => {
    listMine.mockResolvedValue([
      {
        id: 's1',
        name: 'Lattice Panel',
        status: 'pending',
        width_mm: 100,
        height_mm: 50,
        material_label: '3mm Birch Ply',
        created_at: '2026-06-19T00:00:00Z',
      },
    ]);

    render(<MySubmissions orgId="org1" userId="u1" />);

    expect(await screen.findByText('Lattice Panel')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('3mm Birch Ply')).toBeTruthy();
    expect(screen.getByText(/100\s*×\s*50\s*mm/)).toBeTruthy();
    expect(listMine).toHaveBeenCalledWith('org1', 'u1');
  });

  it('renders multiple submissions with distinct statuses', async () => {
    listMine.mockResolvedValue([
      {
        id: 's1',
        name: 'Panel A',
        status: 'pending',
        width_mm: 100,
        height_mm: 50,
        material_label: 'Birch',
        created_at: '2026-06-19T00:00:00Z',
      },
      {
        id: 's2',
        name: 'Panel B',
        status: 'cut',
        width_mm: 200,
        height_mm: 80,
        material_label: 'Acrylic',
        created_at: '2026-06-18T00:00:00Z',
      },
    ]);

    render(<MySubmissions orgId="org1" userId="u1" />);

    expect(await screen.findByText('Panel A')).toBeTruthy();
    expect(screen.getByText('Panel B')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('Cut')).toBeTruthy();
  });

  it('shows an empty state when there are no submissions', async () => {
    listMine.mockResolvedValue([]);

    render(<MySubmissions orgId="org1" userId="u1" />);

    expect(await screen.findByText(/no submissions yet/i)).toBeTruthy();
  });

  it('shows a loading state while the fetch is in flight', () => {
    listMine.mockReturnValue(new Promise(() => {}));

    render(<MySubmissions orgId="org1" userId="u1" />);

    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it('shows a graceful error state when the fetch fails', async () => {
    listMine.mockRejectedValue(new Error('boom'));

    render(<MySubmissions orgId="org1" userId="u1" />);

    expect(await screen.findByText(/couldn.t load|something went wrong|error/i)).toBeTruthy();
  });
});
