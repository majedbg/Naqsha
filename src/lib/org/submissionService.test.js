// submissionService.test.js — Worker 2c
// Unit tests (mocked supabase) + ONE live-RLS smoke (skips if Docker down).

import { vi, describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseMock } from '../../test/supabaseMock';
import {
  isLiveRlsAvailable,
  setupLiveRls,
  teardownLiveRls,
} from '../../test/rlsHarness';

// Mutable-ref getter pattern (mirrors designService.test.js). The file lives in
// src/lib/org/, so it imports '../supabase'.
const _ref = { client: null };
vi.mock('../supabase', () => ({
  get supabase() { return _ref.client; },
}));

import {
  createSubmission,
  createGuestSubmission,
  listMine,
  listForOrg,
  markStatus,
} from './submissionService';

beforeEach(() => {
  vi.clearAllMocks();
  _ref.client = null;
});

// ─── Behavior 1: TRACER ──────────────────────────────────────────────────────
describe('createSubmission — tracer', () => {
  it('inserts a pending row carrying the snapshot fields', async () => {
    const seed = {};
    _ref.client = createSupabaseMock(seed);

    const args = {
      orgId: 'org-1',
      submittedBy: 'user-1',
      orgMaterialId: 'om-1',
      materialLabel: '1/8in clear acrylic',
      source: 'upload',
      designId: null,
      svgPath: 'org-1/sub-1.svg',
      widthMm: 120,
      heightMm: 80,
      ops: { cut: ['layer-1'] },
      name: 'My Job',
      notes: 'handle with care',
    };

    const row = await createSubmission(args);

    const inserted = seed.submissions[0];
    expect(inserted.status).toBe('pending');
    expect(inserted.width_mm).toBe(120);
    expect(inserted.height_mm).toBe(80);
    expect(inserted.ops).toEqual({ cut: ['layer-1'] });
    expect(inserted.material_label).toBe('1/8in clear acrylic');
    expect(inserted.svg_path).toBe('org-1/sub-1.svg');
    expect(inserted.org_id).toBe('org-1');
    expect(inserted.submitted_by).toBe('user-1');
    expect(inserted.org_material_id).toBe('om-1');
    expect(inserted.source).toBe('upload');
    expect(inserted.name).toBe('My Job');
    expect(inserted.notes).toBe('handle with care');

    // returns the created row
    expect(row.status).toBe('pending');
  });
});

// ─── Guest submission (anon, INSERT-only) ────────────────────────────────────
// Guest helper for B-lane. The anon role has no SELECT policy, so the impl must
// NOT chain `.select()` after insert — these tests use a custom mock whose
// `.select` is an observable spy to prove no read-back is attempted.
function makeGuestArgs(overrides = {}) {
  return {
    orgId: 'org-1',
    guestName: 'Jane Guest',
    guestEmail: 'jane@example.com',
    guestPhone: '555-0100',
    orgMaterialId: 'om-1',
    materialLabel: '1/8in clear acrylic',
    source: 'upload',
    designId: null,
    svgPath: 'org-1/guest-1.svg',
    widthMm: 120,
    heightMm: 80,
    ops: { cut: ['layer-1'] },
    name: 'Guest Job',
    notes: 'handle with care',
    ...overrides,
  };
}

describe('createGuestSubmission — tracer', () => {
  it('inserts with submitted_by null + guest_name and never chains .select()', async () => {
    const selectSpy = vi.fn();
    const insertSpy = vi.fn(() => ({
      select: selectSpy,
      then: (resolve) => resolve({ error: null }),
    }));
    _ref.client = { from: vi.fn(() => ({ insert: insertSpy })) };

    const result = await createGuestSubmission(makeGuestArgs());

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const payload = insertSpy.mock.calls[0][0];
    expect(payload.submitted_by).toBeNull();
    expect(payload.guest_name).toBe('Jane Guest');
    // anon has no SELECT policy — read-back would throw, so it must be absent.
    expect(selectSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });
});

describe('createGuestSubmission — optional contact fields', () => {
  it('stores guest_email/guest_phone as null when omitted', async () => {
    const seed = {};
    _ref.client = createSupabaseMock(seed);

    const args = makeGuestArgs();
    delete args.guestEmail;
    delete args.guestPhone;
    await createGuestSubmission(args);

    const inserted = seed.submissions[0];
    expect(inserted.guest_email).toBeNull();
    expect(inserted.guest_phone).toBeNull();
  });
});

describe('createGuestSubmission — error + no-client', () => {
  it('throws when supabase returns an error', async () => {
    const err = new Error('rls denied');
    _ref.client = createSupabaseMock({}).injectError('submissions', 'insert', err);

    await expect(createGuestSubmission(makeGuestArgs())).rejects.toThrow('rls denied');
  });

  it('returns null when there is no supabase client', async () => {
    _ref.client = null;
    expect(await createGuestSubmission(makeGuestArgs())).toBeNull();
  });
});

// ─── Behavior 2: listMine filters submitted_by + org_id ──────────────────────
describe('listMine', () => {
  it('returns only the calling user rows in the org', async () => {
    const seed = {
      submissions: [
        { id: 's1', org_id: 'org-1', submitted_by: 'user-1', name: 'Mine A' },
        { id: 's2', org_id: 'org-1', submitted_by: 'user-2', name: 'Theirs' },
        { id: 's3', org_id: 'org-2', submitted_by: 'user-1', name: 'Other org' },
      ],
    };
    _ref.client = createSupabaseMock(seed);

    const rows = await listMine('org-1', 'user-1');
    expect(rows.map((r) => r.id)).toEqual(['s1']);
  });
});

// ─── Behavior 3: markStatus sets cut_at only for 'cut' ───────────────────────
describe('markStatus', () => {
  it("sets status='cut' and cut_at when cutting", async () => {
    const seed = {
      submissions: [{ id: 's1', status: 'pending', cut_at: null }],
    };
    _ref.client = createSupabaseMock(seed);

    const row = await markStatus('s1', 'cut');
    expect(row.status).toBe('cut');
    expect(row.cut_at).toBeTruthy();
    expect(seed.submissions[0].cut_at).toBeTruthy();
  });

  it('does not set cut_at for non-cut statuses', async () => {
    const seed = {
      submissions: [{ id: 's1', status: 'pending', cut_at: null }],
    };
    _ref.client = createSupabaseMock(seed);

    const row = await markStatus('s1', 'rejected');
    expect(row.status).toBe('rejected');
    expect(seed.submissions[0].cut_at).toBeNull();
  });
});

// ─── Behavior 4: listForOrg returns all members' submissions ─────────────────
describe('listForOrg', () => {
  it('returns every org submission regardless of submitter', async () => {
    const seed = {
      submissions: [
        { id: 's1', org_id: 'org-1', submitted_by: 'user-1' },
        { id: 's2', org_id: 'org-1', submitted_by: 'user-2' },
        { id: 's3', org_id: 'org-2', submitted_by: 'user-1' },
      ],
    };
    _ref.client = createSupabaseMock(seed);

    const rows = await listForOrg('org-1');
    expect(rows.map((r) => r.id).sort()).toEqual(['s1', 's2']);
  });
});

// ─── Behavior 5: LIVE-RLS SMOKE (skips if Docker down) ───────────────────────
// A member creates a submission; the org admin sees it through real RLS, while
// a different member cannot. ONE focused test.
// beforeAll/afterAll live INSIDE this describe so the DB lock is held only for
// the live smoke, not during the mocked unit tests above. The sync probe gates
// describe.skip; the destructive reset + lock acquire happen in beforeAll.
(isLiveRlsAvailable() ? describe : describe.skip)('submissionService — live RLS smoke', () => {
  let h;
  beforeAll(async () => {
    h = await setupLiveRls();
  }, 720_000); // > lock-acquire timeout (600s) + one reset (~90s)
  afterAll(() => {
    teardownLiveRls();
  });

  it(
    'member creates, admin sees, peer member cannot',
    async (ctx) => {
      if (h.skipped) {
        ctx.skip();
        return;
      }

      const { env, withUser } = h;
      const admin = createClient(
        env.API_URL || env.SUPABASE_URL,
        env.SERVICE_ROLE_KEY,
        { auth: { persistSession: false } },
      );

      // Seeded by `db reset`: itp-camp org + one org_material.
      const { data: org } = await admin
        .from('orgs')
        .select('id')
        .eq('slug', 'itp-camp')
        .single();
      const orgId = org.id;
      const { data: om } = await admin
        .from('org_materials')
        .select('id')
        .eq('org_id', orgId)
        .single();
      const orgMaterialId = om.id;

      // Create three auth users (trigger auto-creates their profiles).
      const mkUser = async (email) => {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
        });
        if (error) throw error;
        return data.user.id;
      };
      const stamp = Date.now();
      const memberId = await mkUser(`member-${stamp}@example.com`);
      const adminId = await mkUser(`admin-${stamp}@example.com`);
      const peerId = await mkUser(`peer-${stamp}@example.com`);

      // Roster: member + admin + peer all active in the org.
      const { error: rosterErr } = await admin.from('org_members').insert([
        { org_id: orgId, email: `member-${stamp}@example.com`, user_id: memberId, is_admin: false, status: 'active' },
        { org_id: orgId, email: `admin-${stamp}@example.com`, user_id: adminId, is_admin: true, status: 'active' },
        { org_id: orgId, email: `peer-${stamp}@example.com`, user_id: peerId, is_admin: false, status: 'active' },
      ]);
      if (rosterErr) throw rosterErr;

      // Member creates a submission through real RLS (svg_path prefix must
      // equal org_id or the insert policy denies it).
      _ref.client = withUser({ sub: memberId, email: `member-${stamp}@example.com` });
      const created = await createSubmission({
        orgId,
        submittedBy: memberId,
        orgMaterialId,
        materialLabel: '1/8in clear acrylic',
        source: 'upload',
        designId: null,
        svgPath: `${orgId}/live-${stamp}.svg`,
        widthMm: 100,
        heightMm: 50,
        ops: { cut: ['l1'] },
        name: 'Live Job',
        notes: null,
      });
      expect(created.id).toBeTruthy();
      expect(created.status).toBe('pending');

      // Admin sees it via listForOrg (admin read-org policy).
      _ref.client = withUser({ sub: adminId, email: `admin-${stamp}@example.com` });
      const adminView = await listForOrg(orgId);
      expect(adminView.some((r) => r.id === created.id)).toBe(true);

      // Peer member cannot: even listForOrg (no submitted_by filter) returns []
      // for them because the member-own select policy scopes to auth.uid().
      _ref.client = withUser({ sub: peerId, email: `peer-${stamp}@example.com` });
      const peerView = await listForOrg(orgId);
      expect(peerView.some((r) => r.id === created.id)).toBe(false);
    },
    120_000,
  );
});
