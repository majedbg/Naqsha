// Live-RLS behavior tests for the org/admin/job-submission schema (migration
// 004). Exercises real Postgres RLS via supabase-js clients with per-user JWTs
// minted by rlsHarness. If the local Supabase stack is down, every test marks
// itself skipped (never fails) so the build never stalls.
//
// Identity model: setup/readback uses a SERVICE-ROLE client (bypasses RLS).
// Real profile ids come from auth.admin.createUser (the handle_new_user trigger
// makes the matching profiles row); the per-user token's `sub` must equal that
// id so auth.uid() matches.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  isLiveRlsAvailable,
  setupLiveRls,
  teardownLiveRls,
} from './rlsHarness.js';

// SYNC, lock-free Docker probe picks describe vs describe.skip at eval time.
// The destructive `db reset` happens later in beforeAll, under the DB lock, so
// parallel worker processes never reset the schema out from under each other.
const live = isLiveRlsAvailable() ? describe : describe.skip;

let h;
let service;
let serviceUrl;
let anonKey;

beforeAll(async () => {
  h = await setupLiveRls();
  if (h.skipped) return;
  serviceUrl = h.env.API_URL || h.env.SUPABASE_URL;
  anonKey = h.env.ANON_KEY || h.env.SUPABASE_ANON_KEY;
  service = createClient(serviceUrl, h.env.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // hookTimeout must exceed LOCK_ACQUIRE_TIMEOUT_MS (600s) + one reset (~90s):
  // the last suite to acquire waits for all others' resets, then runs its own.
}, 720_000);

// Release the DB lock once this suite's DB tests are done. Runs even if a test
// threw, so the lock is always freed for the next suite.
afterAll(() => {
  teardownLiveRls();
});

let counter = 0;
function uniqueEmail(tag = 'u') {
  counter += 1;
  return `${tag}-${Date.now()}-${counter}@example.test`;
}

// Create a real auth user (=> profiles row via trigger) and return its id.
async function createUser(email, { verified = true } = {}) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    email_confirm: verified,
    password: 'password123!',
  });
  if (error) throw error;
  return data.user.id;
}

// Verified-email user client: token sub === created profile id.
function clientFor(id, email, { verified = true } = {}) {
  return h.withUser({ sub: id, email, email_verified: verified });
}

// Seed an org + an active org_material; returns ids.
async function seedOrg(slug) {
  const { data: org, error: oErr } = await service
    .from('orgs')
    .insert({ slug, name: slug })
    .select()
    .single();
  if (oErr) throw oErr;
  const { data: mat, error: mErr } = await service
    .from('materials')
    .insert({ name: `mat-${slug}`, type: 'acrylic', thickness_mm: 3 })
    .select()
    .single();
  if (mErr) throw mErr;
  const { data: om, error: omErr } = await service
    .from('org_materials')
    .insert({ org_id: org.id, material_id: mat.id, is_active: true })
    .select()
    .single();
  if (omErr) throw omErr;
  return { orgId: org.id, materialId: mat.id, orgMaterialId: om.id };
}

// Add an ACTIVE member (claimed). is_admin optional.
async function addMember(orgId, email, userId, { isAdmin = false } = {}) {
  const { error } = await service.from('org_members').insert({
    org_id: orgId,
    email,
    user_id: userId,
    is_admin: isAdmin,
    status: 'active',
  });
  if (error) throw error;
}

// Insert a submission as a given member (service-role bypass for setup).
async function seedSubmission(orgId, orgMaterialId, submittedBy, extra = {}) {
  const { data, error } = await service
    .from('submissions')
    .insert({
      org_id: orgId,
      submitted_by: submittedBy,
      org_material_id: orgMaterialId,
      source: 'upload',
      svg_path: `${orgId}/x.svg`,
      width_mm: 100,
      height_mm: 100,
      ...extra,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

live('org/admin RLS', () => {
  // 1. TRACER: a member reads their OWN submission through RLS.
  it('lets a member read their own submission', async () => {
    const slug = `org-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug);
    const email = uniqueEmail('member');
    const uid = await createUser(email);
    await addMember(orgId, email, uid);
    const sub = await seedSubmission(orgId, orgMaterialId, uid);

    const client = clientFor(uid, email);
    const { data, error } = await client
      .from('submissions')
      .select('*')
      .eq('id', sub.id);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(sub.id);
  });

  // 2. A member CANNOT read another member's submission.
  it('hides another member submission from a member', async () => {
    const slug = `org-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug);
    const emailA = uniqueEmail('a');
    const emailB = uniqueEmail('b');
    const uidA = await createUser(emailA);
    const uidB = await createUser(emailB);
    await addMember(orgId, emailA, uidA);
    await addMember(orgId, emailB, uidB);
    const subA = await seedSubmission(orgId, orgMaterialId, uidA);

    const clientB = clientFor(uidB, emailB);
    const { data, error } = await clientB
      .from('submissions')
      .select('*')
      .eq('id', subA.id);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  // 3. An org admin reads ALL submissions in their org.
  it('lets an org admin read all submissions in the org', async () => {
    const slug = `org-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug);
    const memberEmail = uniqueEmail('m');
    const adminEmail = uniqueEmail('adm');
    const memberUid = await createUser(memberEmail);
    const adminUid = await createUser(adminEmail);
    await addMember(orgId, memberEmail, memberUid);
    await addMember(orgId, adminEmail, adminUid, { isAdmin: true });
    const sub = await seedSubmission(orgId, orgMaterialId, memberUid);

    const adminClient = clientFor(adminUid, adminEmail);
    const { data, error } = await adminClient
      .from('submissions')
      .select('*')
      .eq('org_id', orgId);

    expect(error).toBeNull();
    expect(data.map((r) => r.id)).toContain(sub.id);
  });

  // 4. A cross-org admin is denied.
  it('denies a cross-org admin', async () => {
    const slugA = `orgA-${Date.now()}-${counter++}`;
    const slugB = `orgB-${Date.now()}-${counter++}`;
    const a = await seedOrg(slugA);
    const b = await seedOrg(slugB);
    const memberEmail = uniqueEmail('m');
    const adminBEmail = uniqueEmail('admB');
    const memberUid = await createUser(memberEmail);
    const adminBUid = await createUser(adminBEmail);
    await addMember(a.orgId, memberEmail, memberUid);
    await addMember(b.orgId, adminBEmail, adminBUid, { isAdmin: true });
    const subA = await seedSubmission(a.orgId, a.orgMaterialId, memberUid);

    const adminBClient = clientFor(adminBUid, adminBEmail);
    const { data, error } = await adminBClient
      .from('submissions')
      .select('*')
      .eq('id', subA.id);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  // 5. Anon is denied everything.
  it('denies anon access to submissions and orgs', async () => {
    const slug = `org-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug);
    const email = uniqueEmail('m');
    const uid = await createUser(email);
    await addMember(orgId, email, uid);
    const sub = await seedSubmission(orgId, orgMaterialId, uid);

    const anon = createClient(serviceUrl, anonKey);
    const subs = await anon.from('submissions').select('*').eq('id', sub.id);
    const orgs = await anon.from('orgs').select('*').eq('id', orgId);

    expect(subs.data).toHaveLength(0);
    expect(orgs.data).toHaveLength(0);
  });

  // 6. claim-on-login: a matching VERIFIED email flips user_id + status.
  it('claims a pending membership for a matching verified email', async () => {
    const slug = `org-${Date.now()}-${counter++}`;
    const { orgId } = await seedOrg(slug);
    const email = uniqueEmail('pending');
    // Pending invite: email-first, no user_id yet.
    const { error: insErr } = await service.from('org_members').insert({
      org_id: orgId,
      email,
      status: 'invited',
    });
    expect(insErr).toBeNull();

    const uid = await createUser(email, { verified: true });
    const client = clientFor(uid, email, { verified: true });
    const { error } = await client.rpc('claim_memberships');
    expect(error).toBeNull();

    const { data } = await service
      .from('org_members')
      .select('user_id,status')
      .eq('org_id', orgId)
      .eq('email', email)
      .single();
    expect(data.user_id).toBe(uid);
    expect(data.status).toBe('active');
  });

  // Security boundary: an UNVERIFIED matching email does NOT claim (invite-hijack).
  it('does not claim a membership for an unverified email', async () => {
    const slug = `org-${Date.now()}-${counter++}`;
    const { orgId } = await seedOrg(slug);
    const email = uniqueEmail('pending');
    await service
      .from('org_members')
      .insert({ org_id: orgId, email, status: 'invited' });

    const uid = await createUser(email, { verified: false });
    const client = clientFor(uid, email, { verified: false });
    await client.rpc('claim_memberships');

    const { data } = await service
      .from('org_members')
      .select('user_id,status')
      .eq('org_id', orgId)
      .eq('email', email)
      .single();
    expect(data.user_id).toBeNull();
    expect(data.status).toBe('invited');
  });

  // 11. claim-on-login also fills platform_admins.user_id.
  it('claims a platform_admins row for a matching verified email', async () => {
    const email = uniqueEmail('padmin');
    await service.from('platform_admins').insert({ email });

    const uid = await createUser(email, { verified: true });
    const client = clientFor(uid, email, { verified: true });
    const { error } = await client.rpc('claim_memberships');
    expect(error).toBeNull();

    const { data } = await service
      .from('platform_admins')
      .select('user_id')
      .eq('email', email)
      .single();
    expect(data.user_id).toBe(uid);
  });

  // 7. Deleting a design SET NULLs submission.design_id; the row survives.
  it('set-nulls design_id and keeps the submission when a design is deleted', async () => {
    const slug = `org-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug);
    const email = uniqueEmail('member');
    const uid = await createUser(email);
    await addMember(orgId, email, uid);
    const { data: design, error: dErr } = await service
      .from('designs')
      .insert({ user_id: uid, name: 'd', config: {} })
      .select()
      .single();
    expect(dErr).toBeNull();
    const sub = await seedSubmission(orgId, orgMaterialId, uid, {
      design_id: design.id,
      source: 'design',
    });

    const { error: delErr } = await service
      .from('designs')
      .delete()
      .eq('id', design.id);
    expect(delErr).toBeNull();

    const { data } = await service
      .from('submissions')
      .select('id,design_id')
      .eq('id', sub.id)
      .single();
    expect(data.id).toBe(sub.id);
    expect(data.design_id).toBeNull();
  });

  // 8. Removing an org_members row leaves that member's submissions intact.
  it('keeps submissions after the member roster row is removed', async () => {
    const slug = `org-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug);
    const email = uniqueEmail('member');
    const uid = await createUser(email);
    await addMember(orgId, email, uid);
    const sub = await seedSubmission(orgId, orgMaterialId, uid);

    const { error: delErr } = await service
      .from('org_members')
      .delete()
      .eq('org_id', orgId)
      .eq('email', email);
    expect(delErr).toBeNull();

    const { data } = await service
      .from('submissions')
      .select('id')
      .eq('id', sub.id)
      .single();
    expect(data.id).toBe(sub.id);
  });

  // 9. The platform-admin email can INSERT an org.
  it('lets a platform admin insert an org', async () => {
    const email = uniqueEmail('padmin');
    await service.from('platform_admins').insert({ email });
    const uid = await createUser(email, { verified: true });

    const client = clientFor(uid, email, { verified: true });
    const slug = `padmin-org-${Date.now()}-${counter++}`;
    const { data, error } = await client
      .from('orgs')
      .insert({ slug, name: slug })
      .select();

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].slug).toBe(slug);
  });

  // R1 MEDIUM: a submission's svg_path folder must be bound to its org_id. A
  // member of orgs A and B cannot file a row under org B whose SVG lives under
  // A's path prefix (path/row org divergence). Inserts go through the member's
  // RLS client (not the service-role seed) so WITH CHECK is exercised.
  it('binds submission svg_path folder to its org_id', async () => {
    const a = await seedOrg(`orgA-${Date.now()}-${counter++}`);
    const b = await seedOrg(`orgB-${Date.now()}-${counter++}`);
    const email = uniqueEmail('multi');
    const uid = await createUser(email);
    await addMember(a.orgId, email, uid);
    await addMember(b.orgId, email, uid);

    const client = clientFor(uid, email);

    // Diverging: row org = B, path folder = A. Must be denied.
    const bad = await client
      .from('submissions')
      .insert({
        org_id: b.orgId,
        submitted_by: uid,
        org_material_id: b.orgMaterialId,
        source: 'upload',
        svg_path: `${a.orgId}/x.svg`,
        width_mm: 100,
        height_mm: 100,
      })
      .select();
    expect(bad.error).not.toBeNull();

    const { data: leaked } = await service
      .from('submissions')
      .select('id')
      .eq('org_id', b.orgId)
      .eq('svg_path', `${a.orgId}/x.svg`);
    expect(leaked ?? []).toHaveLength(0);

    // Positive control: matching folder = row org B. Must be allowed.
    const good = await client
      .from('submissions')
      .insert({
        org_id: b.orgId,
        submitted_by: uid,
        org_material_id: b.orgMaterialId,
        source: 'upload',
        svg_path: `${b.orgId}/ok.svg`,
        width_mm: 100,
        height_mm: 100,
      })
      .select();
    expect(good.error).toBeNull();
    expect(good.data).toHaveLength(1);

    // UPDATE must not re-create the divergence (immutable-snapshot intent):
    // rebinding svg_path to A's prefix on a B-org row is denied.
    const rebind = await client
      .from('submissions')
      .update({ svg_path: `${a.orgId}/x.svg` })
      .eq('id', good.data[0].id)
      .select();
    expect(rebind.data ?? []).toHaveLength(0); // WITH CHECK blocks the rebind
    const { data: stillBound } = await service
      .from('submissions')
      .select('svg_path')
      .eq('id', good.data[0].id)
      .single();
    expect(stillBound.svg_path).toBe(`${b.orgId}/ok.svg`);
  });

  // R1 BLOCKER: an UNVERIFIED platform-admin email is DENIED platform privileges
  // (org INSERT + materials write); a VERIFIED platform-admin email stays allowed.
  it('denies an unverified platform-admin email and allows a verified one', async () => {
    // Two distinct allowlisted emails (auth users are unique by email).
    const unverifiedEmail = uniqueEmail('padmin-unv');
    const verifiedEmail = uniqueEmail('padmin-ver');
    await service
      .from('platform_admins')
      .insert([{ email: unverifiedEmail }, { email: verifiedEmail }]);

    const unverifiedUid = await createUser(unverifiedEmail, { verified: false });
    const unverified = clientFor(unverifiedUid, unverifiedEmail, {
      verified: false,
    });
    const slugDenied = `unverified-org-${Date.now()}-${counter++}`;
    const insOrg = await unverified
      .from('orgs')
      .insert({ slug: slugDenied, name: slugDenied })
      .select();
    expect(insOrg.error).not.toBeNull(); // org INSERT denied

    const insMat = await unverified
      .from('materials')
      .insert({ name: `unverified-mat-${Date.now()}-${counter++}` })
      .select();
    expect(insMat.error).not.toBeNull(); // materials write denied

    // No org / material leaked through.
    const { data: orgsAfter } = await service
      .from('orgs')
      .select('id')
      .eq('slug', slugDenied);
    expect(orgsAfter ?? []).toHaveLength(0);

    // A verified allowlisted email keeps full privilege.
    const verifiedUid = await createUser(verifiedEmail, { verified: true });
    const verified = clientFor(verifiedUid, verifiedEmail, { verified: true });
    const slugAllowed = `verified-org-${Date.now()}-${counter++}`;
    const okOrg = await verified
      .from('orgs')
      .insert({ slug: slugAllowed, name: slugAllowed })
      .select();
    expect(okOrg.error).toBeNull();
    expect(okOrg.data).toHaveLength(1);
  });

  // R2 #2: a plain (non-admin) member CANNOT self-set status='cut'. 'cut' is an
  // operator (admin-only) decision; a member self-setting it would inject a
  // falsely-completed job into the admin queue. The member update policy's
  // WITH CHECK confines status to ('pending','canceled'), so this update fails
  // WITH CHECK (non-null error) and the row's status is unchanged.
  it('denies a plain member self-setting status=cut', async () => {
    const slug = `org-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug);
    const email = uniqueEmail('member');
    const uid = await createUser(email);
    await addMember(orgId, email, uid);
    const sub = await seedSubmission(orgId, orgMaterialId, uid);

    const client = clientFor(uid, email);
    const bad = await client
      .from('submissions')
      .update({ status: 'cut', cut_at: new Date().toISOString() })
      .eq('id', sub.id)
      .select();
    // WITH CHECK violation surfaces as an error and rebinds nothing.
    expect(bad.error).not.toBeNull();

    // Ground truth: status stays 'pending', cut_at stays null.
    const { data: after } = await service
      .from('submissions')
      .select('status,cut_at')
      .eq('id', sub.id)
      .single();
    expect(after.status).toBe('pending');
    expect(after.cut_at).toBeNull();
  });

  // R2 #2: a plain member CAN cancel their own pending job (status='canceled'
  // is in the allowed member set).
  it('lets a plain member cancel their own submission', async () => {
    const slug = `org-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug);
    const email = uniqueEmail('member');
    const uid = await createUser(email);
    await addMember(orgId, email, uid);
    const sub = await seedSubmission(orgId, orgMaterialId, uid);

    const client = clientFor(uid, email);
    const ok = await client
      .from('submissions')
      .update({ status: 'canceled' })
      .eq('id', sub.id)
      .select();
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);

    const { data: after } = await service
      .from('submissions')
      .select('status')
      .eq('id', sub.id)
      .single();
    expect(after.status).toBe('canceled');
  });

  // R2 #2 (spine): an ADMIN can still mark a member's job status='cut' + cut_at.
  // The admin update policy is permissive and unrestricted by the member-side
  // status set (RLS is OR-of-permissive), so the cut spine stays open.
  it('lets an admin mark a member submission cut with cut_at', async () => {
    const slug = `org-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug);
    const memberEmail = uniqueEmail('m');
    const adminEmail = uniqueEmail('adm');
    const memberUid = await createUser(memberEmail);
    const adminUid = await createUser(adminEmail);
    await addMember(orgId, memberEmail, memberUid);
    await addMember(orgId, adminEmail, adminUid, { isAdmin: true });
    const sub = await seedSubmission(orgId, orgMaterialId, memberUid);

    const adminClient = clientFor(adminUid, adminEmail);
    const cutAt = new Date().toISOString();
    const ok = await adminClient
      .from('submissions')
      .update({ status: 'cut', cut_at: cutAt })
      .eq('id', sub.id)
      .select();
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);

    const { data: after } = await service
      .from('submissions')
      .select('status,cut_at')
      .eq('id', sub.id)
      .single();
    expect(after.status).toBe('cut');
    expect(after.cut_at).not.toBeNull();
  });

  // Branding bridge (spec §2 #9): the seeded itp-camp org must carry the SAME
  // accent as the in-code ITP kit (`--itp-lime: #B5E33C` in kitRegistry.js), so
  // OrgContext's `--org-accent` injection renders the same identity as the
  // studio's `[data-theme="itp-camp"]` kit. The migration seed sets this; a
  // fresh `db reset` (run by the harness in beforeAll) must produce the value.
  // logo_url stays null: the kit logo is an inline `?raw` SVG string, not a
  // hosted URL, so there is no URL to bridge.
  it('seeds the itp-camp org with the ITP kit accent color', async () => {
    const { data, error } = await service
      .from('orgs')
      .select('accent_color,logo_url')
      .eq('slug', 'itp-camp')
      .single();
    expect(error).toBeNull();
    expect(data.accent_color).toBe('#B5E33C');
    expect(data.logo_url).toBeNull();
  });

  // 10. A non-platform user CANNOT insert or update an org.
  it('denies a non-platform user inserting or updating an org', async () => {
    const email = uniqueEmail('nobody');
    const uid = await createUser(email, { verified: true });
    const client = clientFor(uid, email, { verified: true });

    const slug = `nope-org-${Date.now()}-${counter++}`;
    const ins = await client.from('orgs').insert({ slug, name: slug }).select();
    expect(ins.error).not.toBeNull();

    // Seed an org via service, then try to update it as the non-platform user.
    const { data: org } = await service
      .from('orgs')
      .insert({ slug: `${slug}-x`, name: slug })
      .select()
      .single();
    const upd = await client
      .from('orgs')
      .update({ name: 'hijacked' })
      .eq('id', org.id)
      .select();
    // RLS update matches no rows -> empty data, name unchanged.
    expect(upd.data ?? []).toHaveLength(0);
    const { data: after } = await service
      .from('orgs')
      .select('name')
      .eq('id', org.id)
      .single();
    expect(after.name).toBe(slug);
  });
});

// ─── Guest (anon) submission spine — issue #26 (migration 005) ───────────────
// Anonymous guests may INSERT a submission into an org whose `submissions_open`
// gate is true, with a guest identity (no submitted_by). They get NO read/
// update/delete. Anon insert binds the storage path's org folder to the row's
// org_id, mirroring the member policy. Mutual checks: identity XOR, org gate,
// path/row binding.
live('guest (anon) submission RLS', () => {
  // Open the org's guest gate via service-role (anon can't read/write orgs).
  async function openOrg(orgId) {
    const { error } = await service
      .from('orgs')
      .update({ submissions_open: true })
      .eq('id', orgId);
    if (error) throw error;
  }

  // A fresh anon client (no Authorization header).
  function anonClient() {
    return createClient(serviceUrl, anonKey);
  }

  // 1. TRACER: anon insert SUCCEEDS when the org gate is open, submitted_by is
  // null, guest_name is present, and the svg_path folder == org_id.
  it('lets an anon guest insert into an open org', async () => {
    const slug = `guest-org-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug);
    await openOrg(orgId);

    // No `.select()`: anon has NO read-back policy, so a RETURNING clause would
    // fail the SELECT side of the insert. Insert, assert no error, then verify
    // the persisted row via service-role.
    const anon = anonClient();
    const { error } = await anon.from('submissions').insert({
      org_id: orgId,
      org_material_id: orgMaterialId,
      source: 'upload',
      svg_path: `${orgId}/guest.svg`,
      width_mm: 100,
      height_mm: 100,
      guest_name: 'Ada Lovelace',
      guest_email: 'ada@example.test',
    });

    expect(error).toBeNull();

    const { data: persisted } = await service
      .from('submissions')
      .select('submitted_by,guest_name')
      .eq('org_id', orgId);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].submitted_by).toBeNull();
    expect(persisted[0].guest_name).toBe('Ada Lovelace');
  });

  // 2. Anon insert FAILS when the org gate is closed (seedOrg defaults closed).
  it('denies an anon guest insert when submissions are closed', async () => {
    const slug = `guest-closed-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug); // submissions_open=false

    // No `.select()`: a RETURNING clause would mask a WITH-CHECK deny behind the
    // anon read-deny. Persistence is verified by the service-role readback.
    const anon = anonClient();
    const { error } = await anon.from('submissions').insert({
      org_id: orgId,
      org_material_id: orgMaterialId,
      source: 'upload',
      svg_path: `${orgId}/guest.svg`,
      width_mm: 100,
      height_mm: 100,
      guest_name: 'Grace Hopper',
    });

    expect(error).not.toBeNull();

    const { data: leaked } = await service
      .from('submissions')
      .select('id')
      .eq('org_id', orgId);
    expect(leaked ?? []).toHaveLength(0);
  });

  // 3. Anon insert FAILS when submitted_by is non-null (anon may not claim a
  // member identity). The anon policy WITH CHECK requires submitted_by IS NULL.
  it('denies an anon guest insert with a non-null submitted_by', async () => {
    const slug = `guest-imposter-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug);
    await openOrg(orgId);
    // A real profile id to attach — proves the deny is the policy, not an FK.
    const victimUid = await createUser(uniqueEmail('victim'));

    const anon = anonClient();
    const { error } = await anon.from('submissions').insert({
      org_id: orgId,
      submitted_by: victimUid,
      org_material_id: orgMaterialId,
      source: 'upload',
      svg_path: `${orgId}/guest.svg`,
      width_mm: 100,
      height_mm: 100,
      guest_name: 'Imposter',
    });

    expect(error).not.toBeNull();
    const { data: leaked } = await service
      .from('submissions')
      .select('id')
      .eq('org_id', orgId);
    expect(leaked ?? []).toHaveLength(0);
  });

  // 4. Anon insert FAILS when guest_name is missing/null (no identity). The XOR
  // constraint + the anon policy both require a guest identity.
  it('denies an anon guest insert with a missing guest_name', async () => {
    const slug = `guest-noname-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug);
    await openOrg(orgId);

    const anon = anonClient();
    const { error } = await anon.from('submissions').insert({
      org_id: orgId,
      org_material_id: orgMaterialId,
      source: 'upload',
      svg_path: `${orgId}/guest.svg`,
      width_mm: 100,
      height_mm: 100,
      // no guest_name, no submitted_by
    });

    expect(error).not.toBeNull();

    const { data: leaked } = await service
      .from('submissions')
      .select('id')
      .eq('org_id', orgId);
    expect(leaked ?? []).toHaveLength(0);
  });

  // 5. Anon insert FAILS when the svg_path org-prefix != org_id (path/row
  // divergence). Mirrors the member-side binding (R1 MEDIUM).
  it('denies an anon guest insert whose svg_path folder diverges from org_id', async () => {
    const a = await seedOrg(`guestA-${Date.now()}-${counter++}`);
    const b = await seedOrg(`guestB-${Date.now()}-${counter++}`);
    await openOrg(b.orgId);

    const anon = anonClient();
    // Row org = B (open), path folder = A. Must be denied.
    const { error } = await anon.from('submissions').insert({
      org_id: b.orgId,
      org_material_id: b.orgMaterialId,
      source: 'upload',
      svg_path: `${a.orgId}/x.svg`,
      width_mm: 100,
      height_mm: 100,
      guest_name: 'Path Mismatch',
    });

    expect(error).not.toBeNull();
    const { data: leaked } = await service
      .from('submissions')
      .select('id')
      .eq('org_id', b.orgId)
      .eq('svg_path', `${a.orgId}/x.svg`);
    expect(leaked ?? []).toHaveLength(0);
  });

  // 6. Anon gets NO read/update/delete on submissions. A denied SELECT/UPDATE/
  // DELETE under RLS matches zero rows (empty data, no error) — not an error.
  it('denies anon select, update, and delete on submissions', async () => {
    const slug = `guest-ro-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug);
    await openOrg(orgId);
    // Seed a guest row via service-role so there's a target to probe.
    const { data: row, error: seedErr } = await service
      .from('submissions')
      .insert({
        org_id: orgId,
        org_material_id: orgMaterialId,
        source: 'upload',
        svg_path: `${orgId}/seed.svg`,
        width_mm: 100,
        height_mm: 100,
        guest_name: 'Seeded Guest',
      })
      .select()
      .single();
    expect(seedErr).toBeNull();

    const anon = anonClient();

    const sel = await anon.from('submissions').select('*').eq('id', row.id);
    expect(sel.data ?? []).toHaveLength(0);

    const upd = await anon
      .from('submissions')
      .update({ name: 'hijacked' })
      .eq('id', row.id)
      .select();
    expect(upd.data ?? []).toHaveLength(0);

    const del = await anon
      .from('submissions')
      .delete()
      .eq('id', row.id)
      .select();
    expect(del.data ?? []).toHaveLength(0);

    // Ground truth: the row is untouched.
    const { data: after } = await service
      .from('submissions')
      .select('name')
      .eq('id', row.id)
      .single();
    expect(after.name).toBe('Untitled');
  });

  // 7. XOR identity check rejects BOTH-identity and NEITHER-identity rows.
  // Tested via SERVICE-ROLE insert (bypasses RLS) so the constraint — not a
  // policy — is what fails. All other NOT-NULL columns are populated so the
  // error is the named XOR check, not an incidental NOT-NULL violation.
  it('rejects both-identity and neither-identity rows via the XOR check', async () => {
    const slug = `guest-xor-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug);
    const uid = await createUser(uniqueEmail('xor'));

    const base = {
      org_id: orgId,
      org_material_id: orgMaterialId,
      source: 'upload',
      svg_path: `${orgId}/xor.svg`,
      width_mm: 100,
      height_mm: 100,
    };

    // BOTH: submitted_by AND guest_name present.
    const both = await service
      .from('submissions')
      .insert({ ...base, submitted_by: uid, guest_name: 'Both' })
      .select();
    expect(both.error).not.toBeNull();
    expect(both.error.message).toContain('submissions_identity_xor');

    // NEITHER: both null.
    const neither = await service
      .from('submissions')
      .insert({ ...base })
      .select();
    expect(neither.error).not.toBeNull();
    expect(neither.error.message).toContain('submissions_identity_xor');
  });

  // 8. Anon storage insert into the submissions bucket is allowed for the org
  // path while open; blocked when closed or wrong-path. Goes through the
  // storage client (storage.objects is not a PostgREST table).
  it('allows anon storage upload to an open org path, blocks closed/wrong-path', async () => {
    const open = await seedOrg(`guest-stor-open-${Date.now()}-${counter++}`);
    const closed = await seedOrg(`guest-stor-closed-${Date.now()}-${counter++}`);
    await openOrg(open.orgId);

    const blob = new Blob(['<svg/>'], { type: 'image/svg+xml' });

    const anon = anonClient();

    // Allowed: open org, path folder == org_id.
    const ok = await anon.storage
      .from('submissions')
      .upload(`${open.orgId}/guest-${counter++}.svg`, blob);
    expect(ok.error).toBeNull();

    // Blocked: closed org.
    const closedRes = await anon.storage
      .from('submissions')
      .upload(`${closed.orgId}/guest-${counter++}.svg`, blob);
    expect(closedRes.error).not.toBeNull();

    // Blocked: open org id in the row sense, but path folder is the closed org.
    const wrongPath = await anon.storage
      .from('submissions')
      .upload(`${closed.orgId}/sneaky-${counter++}.svg`, blob);
    expect(wrongPath.error).not.toBeNull();
  });
});

// ─── Guest (anon) READS — issue #27 (migration 007) ──────────────────────────
// The guest Studio entry must resolve, with NO auth, the org branding row and
// its ACTIVE material offerings (incl. the embedded `materials(*)` join). All
// three anon SELECT policies are gated on `is_org_accepting_guests`, so closed
// orgs, inactive offerings, rosters, and submissions stay hidden from anon.
live('guest (anon) reads RLS', () => {
  // Open an org's guest gate via service-role (anon can't write orgs).
  async function openOrg(orgId) {
    const { error } = await service
      .from('orgs')
      .update({ submissions_open: true })
      .eq('id', orgId);
    if (error) throw error;
  }

  // 1. TRACER: anon reads an OPEN org's branding row, and its ACTIVE offering
  // WITH the embedded `materials(*)` (name/thickness) populated.
  it('lets anon read an open org and its active offering with embedded material', async () => {
    const slug = `anonread-${Date.now()}-${counter++}`;
    const { orgId, materialId } = await seedOrg(slug);
    await openOrg(orgId);

    const orgRes = await h.anon.from('orgs').select('*').eq('slug', slug);
    expect(orgRes.error).toBeNull();
    expect(orgRes.data).toHaveLength(1);
    expect(orgRes.data[0].id).toBe(orgId);

    const omRes = await h.anon
      .from('org_materials')
      .select('*, materials(*)')
      .eq('org_id', orgId)
      .eq('is_active', true);
    expect(omRes.error).toBeNull();
    expect(omRes.data).toHaveLength(1);
    expect(omRes.data[0].material_id).toBe(materialId);
    // The crux: the embedded materials row must be populated (the embed is
    // filtered by materials' own anon SELECT policy).
    expect(omRes.data[0].materials).not.toBeNull();
    expect(omRes.data[0].materials.name).toBe(`mat-${slug}`);
    expect(omRes.data[0].materials.thickness_mm).toBe(3);
  });

  // 2. A CLOSED org (submissions_open=false, seedOrg default) is hidden: anon
  // reads nothing — branding stays private until the gate is opened.
  it('hides a closed org from anon', async () => {
    const slug = `anonclosed-${Date.now()}-${counter++}`;
    const { orgId } = await seedOrg(slug); // submissions_open=false

    const res = await h.anon.from('orgs').select('*').eq('id', orgId);
    expect(res.error).toBeNull();
    expect(res.data ?? []).toHaveLength(0);
  });

  // 3. Anon org_materials reads are gated: a closed org's offering is hidden,
  // and an INACTIVE offering of an OPEN org is hidden.
  it('hides org_materials of a closed org and inactive offerings of an open org', async () => {
    // Closed org: active offering, but gate closed -> hidden.
    const closed = await seedOrg(`anonom-closed-${Date.now()}-${counter++}`);
    const closedRes = await h.anon
      .from('org_materials')
      .select('*')
      .eq('org_id', closed.orgId);
    expect(closedRes.error).toBeNull();
    expect(closedRes.data ?? []).toHaveLength(0);

    // Open org, but flip its only offering to inactive -> hidden.
    const open = await seedOrg(`anonom-open-${Date.now()}-${counter++}`);
    await openOrg(open.orgId);
    const { error: deErr } = await service
      .from('org_materials')
      .update({ is_active: false })
      .eq('id', open.orgMaterialId);
    expect(deErr).toBeNull();

    const inactiveRes = await h.anon
      .from('org_materials')
      .select('*')
      .eq('org_id', open.orgId);
    expect(inactiveRes.error).toBeNull();
    expect(inactiveRes.data ?? []).toHaveLength(0);
  });

  // 4. The materials EXISTS gate: a material referenced only by an inactive
  // offering OR by a closed org is hidden; a material referenced by an active
  // offering of an open org IS readable.
  it('gates anon material reads on an active offering of an open org', async () => {
    // (a) Material referenced only by a CLOSED org's active offering -> hidden.
    const closed = await seedOrg(`anonmat-closed-${Date.now()}-${counter++}`);
    const closedMat = await h.anon
      .from('materials')
      .select('*')
      .eq('id', closed.materialId);
    expect(closedMat.error).toBeNull();
    expect(closedMat.data ?? []).toHaveLength(0);

    // (b) Material referenced only by an INACTIVE offering of an OPEN org -> hidden.
    const open = await seedOrg(`anonmat-open-${Date.now()}-${counter++}`);
    await openOrg(open.orgId);
    await service
      .from('org_materials')
      .update({ is_active: false })
      .eq('id', open.orgMaterialId);
    const inactiveMat = await h.anon
      .from('materials')
      .select('*')
      .eq('id', open.materialId);
    expect(inactiveMat.error).toBeNull();
    expect(inactiveMat.data ?? []).toHaveLength(0);

    // (c) Positive control: active offering of an open org -> readable.
    const live2 = await seedOrg(`anonmat-live-${Date.now()}-${counter++}`);
    await openOrg(live2.orgId);
    const liveMat = await h.anon
      .from('materials')
      .select('*')
      .eq('id', live2.materialId);
    expect(liveMat.error).toBeNull();
    expect(liveMat.data).toHaveLength(1);
    expect(liveMat.data[0].id).toBe(live2.materialId);
  });

  // 5. Anon cannot ENUMERATE all orgs: with one open + one closed org seeded,
  // an unfiltered select returns the open one but NOT the closed one.
  it('does not let anon enumerate closed orgs', async () => {
    const open = await seedOrg(`anonenum-open-${Date.now()}-${counter++}`);
    const closed = await seedOrg(`anonenum-closed-${Date.now()}-${counter++}`);
    await openOrg(open.orgId);

    const res = await h.anon.from('orgs').select('id');
    expect(res.error).toBeNull();
    const ids = (res.data ?? []).map((r) => r.id);
    expect(ids).toContain(open.orgId);
    expect(ids).not.toContain(closed.orgId);
  });

  // 6. REGRESSION: anon still reads NOTHING on org_members, platform_admins,
  // and submissions — these remain fully closed to anon (no new exposure).
  it('keeps org_members, platform_admins, and submissions closed to anon', async () => {
    const slug = `anonclosedtbls-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug);
    await openOrg(orgId); // open the gate; closed tables must still be hidden
    const email = uniqueEmail('member');
    const uid = await createUser(email);
    await addMember(orgId, email, uid);
    const padminEmail = uniqueEmail('padmin');
    await service.from('platform_admins').insert({ email: padminEmail });
    const sub = await seedSubmission(orgId, orgMaterialId, uid);

    const members = await h.anon.from('org_members').select('*').eq('org_id', orgId);
    expect(members.data ?? []).toHaveLength(0);

    const padmins = await h.anon
      .from('platform_admins')
      .select('*')
      .eq('email', padminEmail);
    expect(padmins.data ?? []).toHaveLength(0);

    const subs = await h.anon.from('submissions').select('*').eq('id', sub.id);
    expect(subs.data ?? []).toHaveLength(0);
  });

  // 7. REGRESSION: an authenticated MEMBER still reads their org + org_materials
  // exactly as before — the anon policies are additive (`to anon`), so the
  // member's `to authenticated`/member-gated reads are unaffected even when the
  // org gate is CLOSED (members do not depend on submissions_open).
  it('still lets an authenticated member read their org and org_materials', async () => {
    const slug = `anonregress-member-${Date.now()}-${counter++}`;
    const { orgId, orgMaterialId } = await seedOrg(slug); // gate stays CLOSED
    const email = uniqueEmail('member');
    const uid = await createUser(email);
    await addMember(orgId, email, uid);

    const client = clientFor(uid, email);

    const orgRes = await client.from('orgs').select('*').eq('id', orgId);
    expect(orgRes.error).toBeNull();
    expect(orgRes.data).toHaveLength(1);
    expect(orgRes.data[0].id).toBe(orgId);

    const omRes = await client
      .from('org_materials')
      .select('*')
      .eq('id', orgMaterialId);
    expect(omRes.error).toBeNull();
    expect(omRes.data).toHaveLength(1);
    expect(omRes.data[0].id).toBe(orgMaterialId);
  });
});
