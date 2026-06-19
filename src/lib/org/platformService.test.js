// platformService.test.js — Worker 2e
// Unit tests (mocked supabase) + ONE live-RLS smoke (skips if Docker down).

import { vi, describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createSupabaseMock } from '../../test/supabaseMock';
import {
  isLiveRlsAvailable,
  setupLiveRls,
  teardownLiveRls,
} from '../../test/rlsHarness';

// Mutable-ref getter pattern (mirrors sibling org services). The file lives in
// src/lib/org/, so it imports '../supabase'.
const _ref = { client: null };
vi.mock('../supabase', () => ({
  get supabase() { return _ref.client; },
}));

import {
  createOrg,
  listOrgs,
  assignOrgAdmin,
  isPlatformAdmin,
} from './platformService';

beforeEach(() => {
  vi.clearAllMocks();
  _ref.client = null;
});

// ─── Behavior 1: TRACER ──────────────────────────────────────────────────────
describe('createOrg — tracer', () => {
  it('inserts an org and maps accent→accent_color, logo→logo_url', async () => {
    const seed = { orgs: [] };
    _ref.client = createSupabaseMock(seed);
    const row = await createOrg({
      name: 'ITP Camp',
      slug: 'itp-camp',
      accent: '#ff0066',
      logo: 'https://cdn/x.png',
    });
    // Returns the created row.
    expect(row).toMatchObject({
      name: 'ITP Camp',
      slug: 'itp-camp',
      accent_color: '#ff0066',
      logo_url: 'https://cdn/x.png',
    });
    // Insert payload carries the mapped column names, not the input aliases.
    expect(seed.orgs[0]).toMatchObject({
      name: 'ITP Camp',
      slug: 'itp-camp',
      accent_color: '#ff0066',
      logo_url: 'https://cdn/x.png',
    });
    expect(seed.orgs[0]).not.toHaveProperty('accent');
    expect(seed.orgs[0]).not.toHaveProperty('logo');
  });

  // ─── Behavior 2: duplicate slug → unique violation surfaces ────────────────
  it('throws when the slug unique constraint is violated (23505)', async () => {
    _ref.client = createSupabaseMock({ orgs: [] }).injectError('orgs', 'insert', {
      code: '23505',
      message: 'duplicate key value violates unique constraint "orgs_slug_key"',
    });
    await expect(
      createOrg({ name: 'Dup', slug: 'itp-camp', accent: null, logo: null }),
    ).rejects.toMatchObject({ code: '23505' });
  });
});

// ─── Behavior 3: assignOrgAdmin ──────────────────────────────────────────────
describe('assignOrgAdmin', () => {
  it('inserts an email-first org_members row with is_admin=true, status=invited', async () => {
    const seed = { org_members: [] };
    _ref.client = createSupabaseMock(seed);
    const row = await assignOrgAdmin('org-1', 'admin@example.com');
    expect(row).toMatchObject({
      org_id: 'org-1',
      email: 'admin@example.com',
      is_admin: true,
      status: 'invited',
    });
    // user_id is left null — claim-on-login links it later.
    expect(seed.org_members[0]).toMatchObject({
      org_id: 'org-1',
      email: 'admin@example.com',
      is_admin: true,
      status: 'invited',
    });
  });
});

// ─── Behavior 4: listOrgs ────────────────────────────────────────────────────
describe('listOrgs', () => {
  it('returns all orgs the caller can read', async () => {
    const seed = {
      orgs: [
        { id: 'o1', slug: 'itp-camp', name: 'ITP Camp' },
        { id: 'o2', slug: 'acme', name: 'Acme' },
      ],
    };
    _ref.client = createSupabaseMock(seed);
    const orgs = await listOrgs();
    expect(orgs).toHaveLength(2);
    // listOrgs has no .order() clause, so assert membership, not order.
    expect(orgs.map((o) => o.slug)).toEqual(
      expect.arrayContaining(['itp-camp', 'acme']),
    );
  });

  it('returns [] when supabase is null', async () => {
    _ref.client = null;
    expect(await listOrgs()).toEqual([]);
  });
});

// ─── Behavior 5: isPlatformAdmin ─────────────────────────────────────────────
describe('isPlatformAdmin', () => {
  it('returns true when the current user has a platform_admins row', async () => {
    const seed = { platform_admins: [{ email: 'majed.bg@gmail.com' }] };
    _ref.client = createSupabaseMock(seed, { user: { email: 'majed.bg@gmail.com' } });
    expect(await isPlatformAdmin()).toBe(true);
  });

  it('returns false when the current user is not an allow-listed admin', async () => {
    const seed = { platform_admins: [{ email: 'majed.bg@gmail.com' }] };
    _ref.client = createSupabaseMock(seed, { user: { email: 'nobody@example.com' } });
    expect(await isPlatformAdmin()).toBe(false);
  });

  it('returns false when there is no signed-in user', async () => {
    const seed = { platform_admins: [{ email: 'majed.bg@gmail.com' }] };
    _ref.client = createSupabaseMock(seed, { user: null });
    expect(await isPlatformAdmin()).toBe(false);
  });

  it('returns false when supabase is null', async () => {
    _ref.client = null;
    expect(await isPlatformAdmin()).toBe(false);
  });
});

// ─── Behavior 6: LIVE-RLS SMOKE (skips if Docker down) ───────────────────────
// beforeAll/afterAll live INSIDE this describe so the DB lock is held only for
// the live smoke, not during the mocked unit tests above.
(isLiveRlsAvailable() ? describe : describe.skip)('platformService — live RLS smoke', () => {
  let h;
  beforeAll(async () => {
    h = await setupLiveRls();
  }, 720_000); // > lock-acquire timeout (600s) + one reset (~90s)
  afterAll(() => {
    teardownLiveRls();
  });

  it(
    'verified platform-admin can insert an org; a normal user is denied',
    async (ctx) => {
      if (h.skipped) {
        ctx.skip();
        return;
      }

      const { withUser } = h;
      const stamp = Date.now();
      const newSlug = `live-${stamp}`;

      // Seeded by `db reset`: platform admin majed.bg@gmail.com + itp-camp org.
      // The admin JWT must carry the VERIFIED email — is_platform_admin() ANDs
      // jwt_email_verified() (top-level email_verified claim).
      _ref.client = withUser({
        sub: '00000000-0000-0000-0000-000000000001',
        email: 'majed.bg@gmail.com',
        email_verified: true,
      });
      const created = await createOrg({
        name: 'Live Org',
        slug: newSlug,
        accent: '#123456',
        logo: null,
      });
      expect(created.id).toBeTruthy();
      expect(created.slug).toBe(newSlug);
      expect(created.accent_color).toBe('#123456');

      // listOrgs for the platform admin includes the pre-seeded itp-camp AND
      // the just-created org.
      const adminView = await listOrgs();
      const slugs = adminView.map((o) => o.slug);
      expect(slugs).toContain('itp-camp');
      expect(slugs).toContain(newSlug);

      // A normal (verified) non-admin user is DENIED the orgs insert.
      _ref.client = withUser({
        sub: '00000000-0000-0000-0000-000000000002',
        email: `normal-${stamp}@example.com`,
        email_verified: true,
      });
      await expect(
        createOrg({ name: 'Nope', slug: `denied-${stamp}`, accent: null, logo: null }),
      ).rejects.toBeTruthy();
    },
    120_000,
  );
});
