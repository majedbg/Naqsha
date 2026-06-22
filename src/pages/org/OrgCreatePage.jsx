import { useOrg } from './OrgContext';
import AppShell from '../../components/shell/AppShell';
import Studio from '../Studio';

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
export default function OrgCreatePage() {
  const { org } = useOrg();
  return (
    <AppShell>
      <Studio submitOrg={org} />
    </AppShell>
  );
}
