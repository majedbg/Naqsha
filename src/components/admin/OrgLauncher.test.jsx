// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OrgLauncher from './OrgLauncher';
import { listMyAdminOrgs } from '../../lib/org/membershipService';

vi.mock('../../lib/org/membershipService');
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'auth-user' } }),
}));

function renderLauncher(props) {
  return render(
    <MemoryRouter>
      <OrgLauncher {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OrgLauncher', () => {
  it('TRACER: lists the user\'s admin orgs, each a link to /o/<slug>/admin showing the org name', async () => {
    listMyAdminOrgs.mockResolvedValue([
      { id: 'org-1', slug: 'itp', name: 'ITP', logo_url: null, accent_color: '#123456' },
      { id: 'org-2', slug: 'acme', name: 'Acme Labs', logo_url: null, accent_color: '#abcdef' },
    ]);

    renderLauncher({ userId: 'user-1' });

    const itp = await screen.findByRole('link', { name: /ITP/ });
    expect(itp).toHaveAttribute('href', '/o/itp/admin');
    const acme = screen.getByRole('link', { name: /Acme Labs/ });
    expect(acme).toHaveAttribute('href', '/o/acme/admin');
    expect(listMyAdminOrgs).toHaveBeenCalledWith('user-1');
  });

  it('shows an empty state when the user administers no organizations', async () => {
    listMyAdminOrgs.mockResolvedValue([]);

    renderLauncher({ userId: 'user-1' });

    expect(
      await screen.findByText(/don't administer any organizations/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows a loading state while fetching', async () => {
    let resolveFn;
    listMyAdminOrgs.mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
    );

    renderLauncher({ userId: 'user-1' });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    resolveFn([{ id: 'org-1', slug: 'itp', name: 'ITP' }]);
    expect(await screen.findByRole('link', { name: /ITP/ })).toBeInTheDocument();
  });

  it('shows a graceful message when the fetch fails', async () => {
    listMyAdminOrgs.mockRejectedValue(new Error('boom'));

    renderLauncher({ userId: 'user-1' });

    expect(
      await screen.findByText(/couldn't load your organizations/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('announces the fetch-failure message via role="alert"', async () => {
    listMyAdminOrgs.mockRejectedValue(new Error('boom'));

    renderLauncher({ userId: 'user-1' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn't load your organizations/i);
  });

  it('falls back to the authenticated user id when no userId prop is given', async () => {
    listMyAdminOrgs.mockResolvedValue([]);

    renderLauncher({});

    await screen.findByText(/don't administer any organizations/i);
    expect(listMyAdminOrgs).toHaveBeenCalledWith('auth-user');
  });
});
