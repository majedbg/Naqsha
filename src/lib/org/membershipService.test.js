// membershipService.test.js — Phase 2 data service (TDD).
// Mutable-ref vi.mock pattern (per designService.test.js) pointed at the shared
// chainable mock factory (src/test/supabaseMock.js: createSupabaseMock).

import { vi, describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseMock } from '../../test/supabaseMock';
import {
  isLiveRlsAvailable,
  setupLiveRls,
  teardownLiveRls,
} from '../../test/rlsHarness';

const _ref = { client: null };

vi.mock('../supabase', () => ({
  get supabase() { return _ref.client; },
}));

import {
  addMemberByEmail,
  claimOnLogin,
  removeMember,
  listRoster,
  editMember,
  isOrgAdmin,
  listMyAdminOrgs,
} from './membershipService';

beforeEach(() => {
  vi.clearAllMocks();
  _ref.client = null;
});

// ─── Behavior 1 (TRACER) ─────────────────────────────────────────────────────
describe('membershipService.addMemberByEmail — tracer', () => {
  it('creates a row with status="invited" and is_admin=false by default', async () => {
    const seed = { org_members: [] };
    _ref.client = createSupabaseMock(seed);

    const row = await addMemberByEmail('org-1', 'new@example.com', {});

    expect(seed.org_members).toHaveLength(1);
    expect(seed.org_members[0]).toMatchObject({
      org_id: 'org-1',
      email: 'new@example.com',
      status: 'invited',
      is_admin: false,
    });
    expect(row).toMatchObject({ email: 'new@example.com', status: 'invited' });
  });

  it('honors isAdmin option', async () => {
    const seed = { org_members: [] };
    _ref.client = createSupabaseMock(seed);
    await addMemberByEmail('org-1', 'admin@example.com', { isAdmin: true });
    expect(seed.org_members[0]).toMatchObject({ is_admin: true });
  });

  it('returns null when supabase is null', async () => {
    _ref.client = null;
    const result = await addMemberByEmail('org-1', 'x@example.com', {});
    expect(result).toBeNull();
  });
});

// ─── Behavior 2: duplicate email surfaces the unique violation ────────────────
describe('membershipService.addMemberByEmail — duplicate', () => {
  it('throws when the unique(org_id,email) constraint is violated', async () => {
    const seed = { org_members: [] };
    _ref.client = createSupabaseMock(seed).injectError('org_members', 'insert', {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    });
    await expect(
      addMemberByEmail('org-1', 'dupe@example.com', {})
    ).rejects.toMatchObject({ code: '23505' });
  });
});

// ─── Behavior 3: claimOnLogin calls the email-verified claim_memberships RPC ──
// The claim path is the SECURITY DEFINER RPC `claim_memberships()` (derives
// identity from auth.uid()/auth.email(), enforces jwt_email_verified()). A
// plain client UPDATE is denied by RLS (no member-self-UPDATE policy), so
// claimOnLogin() takes NO args and just invokes the RPC. The shared mock has
// no `.rpc()`, so this uses a local vi.fn rpc stub.
describe('membershipService.claimOnLogin', () => {
  it('invokes the claim_memberships RPC (no args — identity from auth context)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    _ref.client = { rpc };

    await claimOnLogin();

    expect(rpc).toHaveBeenCalledWith('claim_memberships');
  });

  it('surfaces an error when the RPC fails', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'rpc denied' } });
    _ref.client = { rpc };

    await expect(claimOnLogin()).rejects.toMatchObject({ message: 'rpc denied' });
  });

  it('returns undefined/early when supabase is null', async () => {
    _ref.client = null;
    await expect(claimOnLogin()).resolves.toBeUndefined();
  });
});

// ─── Behavior 4: removeMember deletes only org_members (never submissions) ────
describe('membershipService.removeMember', () => {
  it('deletes the membership row and never targets submissions', async () => {
    const seed = {
      org_members: [{ id: 'm1', org_id: 'org-1', email: 'a@example.com' }],
      submissions: [{ id: 's1', submitted_by: 'm1' }],
    };
    _ref.client = createSupabaseMock(seed);
    const fromSpy = vi.spyOn(_ref.client, 'from');

    await removeMember('m1');

    expect(seed.org_members).toHaveLength(0);
    expect(fromSpy).toHaveBeenCalledWith('org_members');
    expect(fromSpy).not.toHaveBeenCalledWith('submissions');
    expect(seed.submissions).toHaveLength(1);
  });

  it('returns early when supabase is null', async () => {
    _ref.client = null;
    await expect(removeMember('m1')).resolves.toBeUndefined();
  });
});

// ─── listRoster ──────────────────────────────────────────────────────────────
describe('membershipService.listRoster', () => {
  it('returns the org_members rows scoped to the org', async () => {
    const seed = {
      org_members: [
        { id: 'm1', org_id: 'org-1', email: 'a@example.com' },
        { id: 'm2', org_id: 'org-2', email: 'b@example.com' },
      ],
    };
    _ref.client = createSupabaseMock(seed);
    const roster = await listRoster('org-1');
    expect(roster).toEqual([{ id: 'm1', org_id: 'org-1', email: 'a@example.com' }]);
  });

  it('returns [] when supabase is null', async () => {
    _ref.client = null;
    expect(await listRoster('org-1')).toEqual([]);
  });
});

// ─── editMember ──────────────────────────────────────────────────────────────
describe('membershipService.editMember', () => {
  it('applies the patch to the matching member row', async () => {
    const seed = {
      org_members: [{ id: 'm1', org_id: 'org-1', email: 'a@example.com', is_admin: false }],
    };
    _ref.client = createSupabaseMock(seed);
    const row = await editMember('m1', { is_admin: true });
    expect(seed.org_members[0]).toMatchObject({ is_admin: true });
    expect(row).toMatchObject({ id: 'm1', is_admin: true });
  });

  it('returns null when supabase is null', async () => {
    _ref.client = null;
    expect(await editMember('m1', { is_admin: true })).toBeNull();
  });
});

// ─── Behavior 6: isOrgAdmin guard ────────────────────────────────────────────
describe('membershipService.isOrgAdmin', () => {
  it('true for an active admin membership', async () => {
    const seed = {
      org_members: [
        { id: 'm1', org_id: 'org-1', user_id: 'u1', is_admin: true, status: 'active' },
      ],
    };
    _ref.client = createSupabaseMock(seed);
    expect(await isOrgAdmin('org-1', 'u1')).toBe(true);
  });

  it('false for a non-admin member', async () => {
    const seed = {
      org_members: [
        { id: 'm1', org_id: 'org-1', user_id: 'u1', is_admin: false, status: 'active' },
      ],
    };
    _ref.client = createSupabaseMock(seed);
    expect(await isOrgAdmin('org-1', 'u1')).toBe(false);
  });

  it('false for an inactive (invited) admin', async () => {
    const seed = {
      org_members: [
        { id: 'm1', org_id: 'org-1', user_id: 'u1', is_admin: true, status: 'invited' },
      ],
    };
    _ref.client = createSupabaseMock(seed);
    expect(await isOrgAdmin('org-1', 'u1')).toBe(false);
  });

  it('false when no matching row and when supabase is null', async () => {
    _ref.client = createSupabaseMock({ org_members: [] });
    expect(await isOrgAdmin('org-1', 'u1')).toBe(false);
    _ref.client = null;
    expect(await isOrgAdmin('org-1', 'u1')).toBe(false);
  });
});

// ─── listMyAdminOrgs: orgs where the user is an active admin ──────────────────
// TopNav (Admin tab when admin of ≥1 org) + OrgLauncher (lists admin orgs) both
// consume this. Query joins org_members → orgs filtered by user_id + is_admin +
// status='active'; the shared mock returns the matched org_members rows verbatim
// (the `orgs(*)` select string is ignored), so we seed rows with a nested `orgs`
// object and the code flattens `r.orgs`.
describe('membershipService.listMyAdminOrgs', () => {
  it('returns the flattened orgs for a user with an active admin membership (tracer)', async () => {
    const seed = {
      org_members: [
        {
          id: 'm1',
          user_id: 'u1',
          is_admin: true,
          status: 'active',
          orgs: { id: 'org-1', slug: 'acme', name: 'Acme', logo_url: null, accent_color: '#abc' },
        },
      ],
    };
    _ref.client = createSupabaseMock(seed);

    const orgs = await listMyAdminOrgs('u1');

    expect(orgs).toEqual([
      { id: 'org-1', slug: 'acme', name: 'Acme', logo_url: null, accent_color: '#abc' },
    ]);
  });

  it('excludes non-admin and non-active memberships (filters applied)', async () => {
    const seed = {
      org_members: [
        {
          id: 'm1',
          user_id: 'u1',
          is_admin: true,
          status: 'active',
          orgs: { id: 'org-1', slug: 'acme', name: 'Acme' },
        },
        {
          id: 'm2',
          user_id: 'u1',
          is_admin: false,
          status: 'active',
          orgs: { id: 'org-2', slug: 'beta', name: 'Beta' },
        },
        {
          id: 'm3',
          user_id: 'u1',
          is_admin: true,
          status: 'invited',
          orgs: { id: 'org-3', slug: 'gamma', name: 'Gamma' },
        },
      ],
    };
    _ref.client = createSupabaseMock(seed);

    const orgs = await listMyAdminOrgs('u1');

    expect(orgs).toEqual([{ id: 'org-1', slug: 'acme', name: 'Acme' }]);
  });

  it('returns [] when the user admins no org', async () => {
    _ref.client = createSupabaseMock({ org_members: [] });
    expect(await listMyAdminOrgs('u1')).toEqual([]);
  });

  it('returns [] when supabase is null', async () => {
    _ref.client = null;
    expect(await listMyAdminOrgs('u1')).toEqual([]);
  });

  it('throws when the query errors', async () => {
    _ref.client = createSupabaseMock({ org_members: [] }).injectError(
      'org_members',
      'select',
      { message: 'rls denied' },
    );
    await expect(listMyAdminOrgs('u1')).rejects.toMatchObject({ message: 'rls denied' });
  });
});

// ─── LIVE-RLS SMOKE: claimOnLogin routes through claim_memberships RPC ────────
// Proves the real claim path end-to-end against Postgres RLS. A VERIFIED email
// flips its pending org_members row to active+user_id; an UNVERIFIED email is
// denied (the jwt_email_verified() invite-hijack gate). Skips (never fails) if
// the local Supabase stack is down.
// beforeAll/afterAll live INSIDE this describe so the DB lock is held only for
// the live smoke, not during the mocked unit tests above.
(isLiveRlsAvailable() ? describe : describe.skip)('membershipService.claimOnLogin — live RLS smoke', () => {
  let h;
  beforeAll(async () => {
    h = await setupLiveRls();
  }, 720_000); // > lock-acquire timeout (600s) + one reset (~90s)
  afterAll(() => {
    teardownLiveRls();
  });

  it(
    'verified email claims its pending membership; unverified email is denied',
    async (ctx) => {
      if (h.skipped) {
        ctx.skip();
        return;
      }

      const serviceUrl = h.env.API_URL || h.env.SUPABASE_URL;
      // Service-role client: bypasses RLS for setup + readback (an invited row
      // with user_id IS NULL is unreadable by the claiming user under RLS).
      const service = createClient(serviceUrl, h.env.SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Real auth user => profiles row via handle_new_user trigger, so the
      // RPC's `set user_id = auth.uid()` satisfies the org_members FK.
      const makeUser = async (email, verified) => {
        const { data, error } = await service.auth.admin.createUser({
          email,
          email_confirm: verified,
          password: 'password123!',
        });
        if (error) throw error;
        return data.user.id;
      };

      const stamp = Date.now();
      const { data: org, error: oErr } = await service
        .from('orgs')
        .insert({ slug: `claim-${stamp}`, name: `claim-${stamp}` })
        .select()
        .single();
      expect(oErr).toBeNull();

      // ── Verified email: claim succeeds ──
      const okEmail = `claim-ok-${stamp}@example.test`;
      await service
        .from('org_members')
        .insert({ org_id: org.id, email: okEmail, status: 'invited' });
      const okUid = await makeUser(okEmail, true);

      _ref.client = h.withUser({ sub: okUid, email: okEmail, email_verified: true });
      await claimOnLogin();

      const { data: claimed } = await service
        .from('org_members')
        .select('user_id,status')
        .eq('org_id', org.id)
        .eq('email', okEmail)
        .single();
      expect(claimed.user_id).toBe(okUid);
      expect(claimed.status).toBe('active');

      // ── Unverified email: claim is denied by jwt_email_verified() gate ──
      const badEmail = `claim-bad-${stamp}@example.test`;
      await service
        .from('org_members')
        .insert({ org_id: org.id, email: badEmail, status: 'invited' });
      const badUid = await makeUser(badEmail, false);

      _ref.client = h.withUser({ sub: badUid, email: badEmail, email_verified: false });
      await claimOnLogin();

      const { data: unclaimed } = await service
        .from('org_members')
        .select('user_id,status')
        .eq('org_id', org.id)
        .eq('email', badEmail)
        .single();
      expect(unclaimed.user_id).toBeNull();
      expect(unclaimed.status).toBe('invited');
    },
    120_000,
  );
});
