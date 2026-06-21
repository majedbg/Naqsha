// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';

// Auth is inert in the smoke: AuthProvider passes children through and useAuth
// returns a stable shape so TopNav (and any page) can mount without a backend.
vi.mock('./lib/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({ loading: false, user: { id: 'u1' } }),
}));

// TopNav's admin gate hits these services on mount; resolve them so the nav
// renders deterministically without touching Supabase.
vi.mock('./lib/org/platformService', () => ({
  isPlatformAdmin: vi.fn().mockResolvedValue(false),
  listOrgs: vi.fn().mockResolvedValue([]),
  createOrg: vi.fn(),
  assignOrgAdmin: vi.fn(),
}));
vi.mock('./lib/org/membershipService', () => ({
  listMyAdminOrgs: vi.fn().mockResolvedValue([]),
}));

// Stub the heavy route pages down to identifiable markers. App still wires the
// real <Routes>/<Route> table and the real <TopNav>; this only keeps the smoke
// fast and free of canvas/Supabase machinery.
vi.mock('./pages/StudioRoute', () => ({
  default: () => <div data-testid="studio-route">studio</div>,
}));
vi.mock('./pages/AuthCallback', () => ({
  default: () => <div data-testid="auth-callback">callback</div>,
}));
vi.mock('./pages/ShareView', () => ({
  default: () => <div data-testid="share-view">share</div>,
}));
vi.mock('./pages/AdminPage', () => ({
  default: () => <div data-testid="admin-page">admin</div>,
}));
vi.mock('./pages/org/OrgRoute', () => ({
  default: () => <div data-testid="org-route">org</div>,
}));
vi.mock('./pages/org/OrgSubmitPage', () => ({
  default: () => <div data-testid="org-submit">submit</div>,
}));
vi.mock('./pages/org/OrgAdminPage', () => ({
  default: () => <div data-testid="org-admin">org-admin</div>,
}));

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('App integration — TopNav + routes', () => {
  it('does NOT render the standalone TopNav on the studio route (/)', () => {
    renderAt('/');
    // The studio reclaims that row: its own chrome (MenuBar brand / MobileStudio
    // header) carries the Naqsha label + Admin, so TopNav opts out of "/".
    expect(screen.queryByRole('navigation', { name: /primary/i })).not.toBeInTheDocument();
  });

  it('renders the persistent TopNav on non-studio routes', () => {
    renderAt('/admin');
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /naqsha/i })).toBeInTheDocument();
  });

  it('routes /admin to AdminPage', () => {
    renderAt('/admin');
    expect(screen.getByTestId('admin-page')).toBeInTheDocument();
  });

  it('keeps the TopNav persistent on non-home routes (e.g. /admin)', () => {
    renderAt('/admin');
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
  });

  it('still resolves the existing home (/) route to StudioRoute', () => {
    renderAt('/');
    expect(screen.getByTestId('studio-route')).toBeInTheDocument();
  });

  it('still resolves the existing /auth/callback route', () => {
    renderAt('/auth/callback');
    expect(screen.getByTestId('auth-callback')).toBeInTheDocument();
  });

  it('still resolves the existing /share/:token route', () => {
    renderAt('/share/abc123');
    expect(screen.getByTestId('share-view')).toBeInTheDocument();
  });

  it('still resolves the existing /o/:slug nested route', () => {
    renderAt('/o/acme');
    expect(screen.getByTestId('org-route')).toBeInTheDocument();
  });
});
