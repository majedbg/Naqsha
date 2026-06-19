// membershipService.test.js — Phase 2 data service (TDD).
// Mutable-ref vi.mock pattern (per designService.test.js) pointed at the shared
// chainable mock factory (src/test/supabaseMock.js: createSupabaseMock).

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createSupabaseMock } from '../../test/supabaseMock';

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

// ─── Behavior 3: claimOnLogin flips invited → active w/ user_id ───────────────
describe('membershipService.claimOnLogin', () => {
  it('sets user_id and status="active" on the matching invited row', async () => {
    const seed = {
      org_members: [
        { id: 'm1', org_id: 'org-1', email: 'pending@example.com', user_id: null, status: 'invited' },
      ],
    };
    _ref.client = createSupabaseMock(seed);

    await claimOnLogin('pending@example.com', 'user-42');

    expect(seed.org_members[0]).toMatchObject({
      user_id: 'user-42',
      status: 'active',
    });
  });

  it('returns undefined/early when supabase is null', async () => {
    _ref.client = null;
    await expect(claimOnLogin('x@example.com', 'u1')).resolves.toBeUndefined();
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
