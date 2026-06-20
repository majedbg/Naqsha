import { useParams, Outlet } from "react-router-dom";
import { OrgProvider, useOrg } from "./OrgContext";

function OrgShell({ children }) {
  const { org, loading, notFound } = useOrg();
  if (loading) {
    return <div data-testid="org-loading">Loading…</div>;
  }
  if (notFound) {
    return <div data-testid="org-not-found">Organization not found.</div>;
  }
  return (
    <div
      data-testid="org-shell"
      style={{
        "--org-accent": org?.accent_color,
        "--org-logo": org?.logo_url ? `url(${org.logo_url})` : undefined,
      }}
    >
      <header>
        {org?.logo_url && <img src={org.logo_url} alt="" />}
        <span>{org?.name}</span>
      </header>
      {children ?? <Outlet />}
    </div>
  );
}

export default function OrgRoute({ children }) {
  const { slug } = useParams();
  return (
    <OrgProvider slug={slug}>
      <OrgShell>{children}</OrgShell>
    </OrgProvider>
  );
}
