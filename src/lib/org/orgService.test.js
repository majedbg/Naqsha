// orgService.test.js — Phase 2 data service (TDD).
// Mutable-ref vi.mock pattern pointed at the shared chainable mock factory.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createSupabaseMock } from '../../test/supabaseMock';

const _ref = { client: null };

vi.mock('../supabase', () => ({
  get supabase() { return _ref.client; },
}));

import { getOrgBySlug, setSubmissionsOpen } from './orgService';

beforeEach(() => {
  vi.clearAllMocks();
  _ref.client = null;
});

// ─── Behavior 5: getOrgBySlug ────────────────────────────────────────────────
describe('orgService.getOrgBySlug', () => {
  it('returns the org row for a known slug', async () => {
    const seed = {
      orgs: [{ id: 'org-1', slug: 'itp-camp', name: 'ITP Camp' }],
    };
    _ref.client = createSupabaseMock(seed);
    const org = await getOrgBySlug('itp-camp');
    expect(org).toMatchObject({ id: 'org-1', slug: 'itp-camp', name: 'ITP Camp' });
  });

  it('returns null for an unknown slug', async () => {
    _ref.client = createSupabaseMock({ orgs: [] });
    expect(await getOrgBySlug('nope')).toBeNull();
  });

  it('returns null when supabase is null', async () => {
    _ref.client = null;
    expect(await getOrgBySlug('itp-camp')).toBeNull();
  });
});

// ─── setSubmissionsOpen ──────────────────────────────────────────────────────
describe('orgService.setSubmissionsOpen', () => {
  it('updates submissions_open and returns the updated row', async () => {
    const seed = {
      orgs: [{ id: 'org-1', slug: 'itp-camp', submissions_open: false }],
    };
    _ref.client = createSupabaseMock(seed);
    const row = await setSubmissionsOpen('org-1', true);
    expect(row).toMatchObject({ id: 'org-1', submissions_open: true });
    expect(seed.orgs[0].submissions_open).toBe(true);
  });

  it('returns null when supabase is null', async () => {
    _ref.client = null;
    expect(await setSubmissionsOpen('org-1', true)).toBeNull();
  });
});
