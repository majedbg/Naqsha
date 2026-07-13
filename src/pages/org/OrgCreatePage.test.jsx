// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import OrgCreatePage from './OrgCreatePage';

// OrgCreatePage hosts the existing Studio inside the org's branded shell. It must
// read the org from context (it is mounted under OrgProvider via OrgRoute) and
// thread it down to Studio as `submitOrg`, so the in-studio "Submit to {org}"
// opens the GUEST modal for unauthenticated visitors. We mock the heavy children:
// this is a wiring smoke, not a re-test of AppShell/Studio.
vi.mock('./OrgContext', () => ({
  useOrg: () => ({
    org: { id: 'org-7', name: 'Brooklyn Spark' },
    loading: false,
    notFound: false,
  }),
}));

// AppShell must still wrap Studio so the MenuBar slot (where "Submit to org"
// lives) is provided — otherwise the guest submit trigger never renders.
vi.mock('../../components/shell/AppShell', () => ({
  default: ({ children }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock('../Studio', () => ({
  default: ({ submitOrg }) => (
    <div data-testid="studio">{`submitOrg:${submitOrg ? submitOrg.id : ''}`}</div>
  ),
}));

// AUTH-LOADING GATE (Opus review of d460702, FIX 1): mirrors StudioRoute's
// `if (loading) return <Loading/>` gate. Without it, Studio (and useLayers'
// one-shot guest-seed init, S1) can mount while auth is still resolving —
// during that flash a signed-in org member transiently reads as
// `!user && tier === 'guest'`, flashing the guest chooser and risking a
// permanent phyllotaxis-seed capture for a signed-in user. Mocked via
// vi.hoisted so the mock factory (evaluated before imports) can see it.
const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));
vi.mock('../../lib/AuthContext', () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }) => children,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ loading: false, user: { id: 'u1' } });
});

describe('OrgCreatePage', () => {
  it('TRACER: mounts Studio inside AppShell and threads the context org as submitOrg', () => {
    render(<OrgCreatePage />);

    // Studio is hosted inside the branded app-shell (slot provider intact).
    const shell = screen.getByTestId('app-shell');
    const studio = screen.getByTestId('studio');
    expect(shell).toContainElement(studio);

    // the org from context is threaded down so the guest submit modal can open.
    expect(studio).toHaveTextContent('submitOrg:org-7');
  });

  it('does not mount Studio while auth is still loading (avoids the guest-chooser/seed flash for a signed-in org member)', () => {
    mockUseAuth.mockReturnValue({ loading: true, user: null });
    render(<OrgCreatePage />);
    expect(screen.queryByTestId('studio')).not.toBeInTheDocument();
  });

  it('mounts Studio once auth resolves', () => {
    mockUseAuth.mockReturnValue({ loading: false, user: { id: 'u1' } });
    render(<OrgCreatePage />);
    expect(screen.getByTestId('studio')).toBeInTheDocument();
  });
});
