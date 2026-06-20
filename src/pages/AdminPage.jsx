import { useState, useEffect } from "react";
import {
  isPlatformAdmin,
  listOrgs,
  createOrg,
  assignOrgAdmin,
} from "../lib/org/platformService";
import { listMyAdminOrgs } from "../lib/org/membershipService";
import { supabase } from "../lib/supabase";
import OrgLauncher from "../components/admin/OrgLauncher";

function OrgRow({ org }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);

  async function handleAssign(e) {
    e.preventDefault();
    setError(null);
    try {
      await assignOrgAdmin(org.id, email);
      setEmail("");
    } catch (err) {
      // Surface the failure (RLS denial / duplicate / network) instead of
      // silently doing nothing; keep `email` so the control stays retryable.
      setError(err?.message || "Failed to assign admin.");
    }
  }

  return (
    <li>
      <span>{org.name}</span>
      <form onSubmit={handleAssign}>
        <label>
          Admin email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button type="submit">Assign admin</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </li>
  );
}

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(null); // null = still resolving
  const [hasAdminOrgs, setHasAdminOrgs] = useState(false);
  const [orgs, setOrgs] = useState([]);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    accent: "",
    logo: "",
  });
  const [error, setError] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    try {
      const created = await createOrg({ ...form });
      if (created) setOrgs((prev) => [...prev, created]);
      setForm({ name: "", slug: "", accent: "", logo: "" });
    } catch (err) {
      setError(err?.message || "Failed to create organization.");
    }
  }

  function field(key) {
    return {
      value: form[key],
      onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  useEffect(() => {
    let active = true;
    isPlatformAdmin()
      .then(async (admin) => {
        if (!active) return;
        if (admin) {
          setIsAdmin(true);
          const rows = await listOrgs();
          if (active) setOrgs(rows || []);
          return;
        }
        // Not a platform admin: the access-denied state is reserved for users
        // who administer no orgs. If they admin >= 1 org, show OrgLauncher.
        // Resolve the org check BEFORE flipping isAdmin so both updates batch
        // into one render — otherwise an org admin would flash "Access denied"
        // (isAdmin=false) for a frame before hasAdminOrgs resolves.
        const userId = (await supabase?.auth.getUser())?.data?.user?.id;
        const adminOrgs = await listMyAdminOrgs(userId);
        if (!active) return;
        setHasAdminOrgs((adminOrgs?.length || 0) > 0);
        setIsAdmin(false);
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (isAdmin === null) {
    return null;
  }

  if (!isAdmin) {
    // P3's thin org-admin launcher (OrgLauncher) slots in here for users who
    // admin >= 1 org. MVP renders access-denied for everyone else.
    if (hasAdminOrgs) {
      return <OrgLauncher />;
    }
    return (
      <div>
        <p role="alert">Access denied</p>
      </div>
    );
  }

  return (
    <div>
      <section aria-label="Organizations">
        <h1>Organizations</h1>
        <ul>
          {orgs.map((org) => (
            <OrgRow key={org.id} org={org} />
          ))}
        </ul>
        <form onSubmit={handleCreate}>
          <label>
            Name
            <input name="name" {...field("name")} />
          </label>
          <label>
            Slug
            <input name="slug" {...field("slug")} />
          </label>
          <label>
            Accent
            <input name="accent" {...field("accent")} />
          </label>
          <label>
            Logo
            <input name="logo" {...field("logo")} />
          </label>
          <button type="submit">Create organization</button>
          {error && <p role="alert">{error}</p>}
        </form>
      </section>
    </div>
  );
}
