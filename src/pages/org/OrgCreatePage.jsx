import { useOrg } from './OrgContext';
import AppShell from '../../components/shell/AppShell';
import Studio from '../Studio';
import { useAuth } from '../../lib/AuthContext';

// OrgCreatePage (#27) — the org-context studio at /o/:slug/create.
//
// Mounted INSIDE OrgRoute (so OrgProvider is above it and useOrg() is safe), it
// reads the resolved org and hands the existing Studio that org as `submitOrg`.
// Studio itself never calls useOrg() — the org is threaded as an optional prop so
// the studio at "/" (no provider) keeps working unchanged. With submitOrg set,
// the in-studio "Submit to {org}" opens the GUEST submission modal, letting an
// unauthenticated visitor design and submit in the org's context.
//
// AppShell wraps Studio so the pro-shell MenuBar slot (which hosts the
// "Submit to org" action) is present — without it the submit trigger never
// renders and the guest flow has no entry point.
//
// Auth-loading gate (mirrors StudioRoute.jsx): hold Studio's mount until auth
// has resolved. Without this, Studio (and useLayers' one-shot guest-seed
// init, S1) can mount while `user`/`tier` are still transiently unresolved —
// during that flash a signed-in org member reads as `!user && tier ===
// 'guest'`, which both flashes the guest starter chooser and risks
// permanently capturing the phyllotaxis seed for a signed-in user.
export default function OrgCreatePage() {
  const { org } = useOrg();
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen bg-paper flex items-center justify-center">
        <p className="text-sm text-ink-soft">Loading…</p>
      </div>
    );
  }

  return (
    <AppShell>
      <Studio submitOrg={org} />
    </AppShell>
  );
}
