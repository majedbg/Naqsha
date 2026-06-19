// Live-RLS behavior tests for the org/admin/job-submission schema (migration
// 004). Exercises real Postgres RLS via supabase-js clients with per-user JWTs
// minted by rlsHarness. If the local Supabase stack is down, every test marks
// itself skipped (never fails) so the build never stalls.
//
// Identity model: setup/readback uses a SERVICE-ROLE client (bypasses RLS).
// Real profile ids come from auth.admin.createUser (the handle_new_user trigger
// makes the matching profiles row); the per-user token's `sub` must equal that
// id so auth.uid() matches.

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createRlsHarness } from './rlsHarness.js';

const h = createRlsHarness();
const live = h.skipped ? describe.skip : describe;

let service;
let serviceUrl;
let anonKey;

beforeAll(() => {
  if (h.skipped) return;
  serviceUrl = h.env.API_URL || h.env.SUPABASE_URL;
  anonKey = h.env.ANON_KEY || h.env.SUPABASE_ANON_KEY;
  service = createClient(serviceUrl, h.env.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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
