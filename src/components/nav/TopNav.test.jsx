// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopNav from './TopNav.jsx';
import { isPlatformAdmin } from '../../lib/org/platformService';
import { listMyAdminOrgs } from '../../lib/org/membershipService';
import { useAuth } from '../../lib/AuthContext';

vi.mock('../../lib/org/platformService');
vi.mock('../../lib/org/membershipService');
vi.mock('../../lib/AuthContext');

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: 'u1' } });
  isPlatformAdmin.mockResolvedValue(false);
  listMyAdminOrgs.mockResolvedValue([]);
});

function renderNav() {
  return render(
    <MemoryRouter>
      <TopNav />
    </MemoryRouter>
  );
}

describe('TopNav', () => {
  it('TRACER: a platform admin sees the Admin tab linking to /admin', async () => {
    isPlatformAdmin.mockResolvedValue(true);
    listMyAdminOrgs.mockResolvedValue([]);

    renderNav();

    const adminLink = await screen.findByRole('link', { name: /admin/i });
    expect(adminLink.getAttribute('href')).toBe('/admin');
  });

  it('an org-admin (not platform admin, >=1 admin org) sees the Admin tab', async () => {
    isPlatformAdmin.mockResolvedValue(false);
    listMyAdminOrgs.mockResolvedValue([{ id: 'o1', name: 'Acme' }]);

    renderNav();

    const adminLink = await screen.findByRole('link', { name: /admin/i });
    expect(adminLink.getAttribute('href')).toBe('/admin');
  });

  it('a plain member / anon (not platform admin, zero admin orgs) does NOT see the Admin tab', async () => {
    useAuth.mockReturnValue({ user: null });
    isPlatformAdmin.mockResolvedValue(false);
    listMyAdminOrgs.mockResolvedValue([]);

    renderNav();

    // Wait for the nav to mount and the gate to actually run, so absence
    // reflects the gating logic — not an unresolved promise.
    await screen.findByRole('navigation');
    await waitFor(() => expect(isPlatformAdmin).toHaveBeenCalled());
    await waitFor(() => expect(listMyAdminOrgs).toHaveBeenCalled());

    expect(screen.queryByRole('link', { name: /admin/i })).toBeNull();
  });

  it('renders the persistent brand/home link for everyone, even non-admins', async () => {
    useAuth.mockReturnValue({ user: null });
    isPlatformAdmin.mockResolvedValue(false);
    listMyAdminOrgs.mockResolvedValue([]);

    renderNav();

    const nav = await screen.findByRole('navigation', { name: /primary/i });
    expect(nav).toBeTruthy();
    const home = screen.getByRole('link', { name: /sonoform/i });
    expect(home.getAttribute('href')).toBe('/');
  });
});
