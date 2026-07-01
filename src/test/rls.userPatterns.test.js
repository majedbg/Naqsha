// Live-RLS behavior tests for the unified user_patterns table + the private
// pattern-photos storage bucket (migration 009, issue #49 S0).
//
// ⚠️ Migration 009 is HUMAN-GATED and has not been applied to any database
// yet. These tests are written against its contract and run ONLY under the
// dedicated `npm run test:rls` script (RLS_LIVE=1 + local Docker stack, whose
// `db reset` applies all migrations to the ephemeral local DB). Under plain
// `npm test` — or with the stack down — every test self-skips, exactly like
// the org/admin prior art (src/test/rls.org.test.js).
//
// Identity model mirrors rls.org.test.js: service-role client for seeding and
// readback; per-user JWTs minted by rlsHarness with sub === profiles.id.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  isLiveRlsAvailable,
  setupLiveRls,
  teardownLiveRls,
} from './rlsHarness.js';

const live = isLiveRlsAvailable() ? describe : describe.skip;

let h;
let service;

beforeAll(async () => {
  h = await setupLiveRls();
  if (h.skipped) return;
  const serviceUrl = h.env.API_URL || h.env.SUPABASE_URL;
  service = createClient(serviceUrl, h.env.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}, 720_000);

afterAll(() => {
  teardownLiveRls();
});

let counter = 0;
function uniqueEmail(tag = 'u') {
  counter += 1;
  return `${tag}-${Date.now()}-${counter}@example.test`;
}

async function createUser(email) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password: 'password123!',
  });
  if (error) throw error;
  return data.user.id;
}

function clientFor(id, email) {
  return h.withUser({ sub: id, email, email_verified: true });
}

const extractedRow = (userId, patternId) => ({
  user_id: userId,
  pattern_id: patternId,
  name: 'RLS tile',
  source: 'extracted',
  tile_svg:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10" data-source="extracted">\n' +
    '  <path d="M1 1 L9 1 L9 9 L1 9 Z" data-kind="fill" data-role="engrave" fill="#000" fill-rule="evenodd" stroke="none"/>\n' +
    '</svg>',
  fabrication_tags: { fills: ['engrave'], strokes: [] },
  visibility: 'private',
});

live('user_patterns RLS (migration 009)', () => {
  it('lets an owner insert and read back their extracted pattern', async () => {
    const email = uniqueEmail('owner');
    const uid = await createUser(email);
    const client = clientFor(uid, email);

    const { error: insErr } = await client
      .from('user_patterns')
      .insert(extractedRow(uid, `extracted-rls-${counter}`));
    expect(insErr).toBeNull();

    const { data, error } = await client
      .from('user_patterns')
      .select('*')
      .eq('user_id', uid);
    expect(error).toBeNull();
    expect(data.length).toBe(1);
    expect(data[0].source).toBe('extracted');
  });

  it("hides another user's extracted patterns entirely", async () => {
    const emailA = uniqueEmail('a');
    const emailB = uniqueEmail('b');
    const uidA = await createUser(emailA);
    const uidB = await createUser(emailB);
    const { error: seedErr } = await service
      .from('user_patterns')
      .insert(extractedRow(uidA, `extracted-rls-hidden-${counter}`));
    expect(seedErr).toBeNull();

    const clientB = clientFor(uidB, emailB);
    const { data, error } = await clientB
      .from('user_patterns')
      .select('*')
      .eq('user_id', uidA);
    expect(error).toBeNull();
    expect(data).toEqual([]); // RLS filters, never errors
  });

  it("rejects inserting a row owned by someone else", async () => {
    const emailA = uniqueEmail('a2');
    const emailB = uniqueEmail('b2');
    const uidA = await createUser(emailA);
    const uidB = await createUser(emailB);

    const clientB = clientFor(uidB, emailB);
    const { error } = await clientB
      .from('user_patterns')
      .insert(extractedRow(uidA, `extracted-rls-forge-${counter}`));
    expect(error).not.toBeNull();
  });

  it('enforces the payload check: extracted rows need tile_svg', async () => {
    const email = uniqueEmail('payload');
    const uid = await createUser(email);
    const client = clientFor(uid, email);
    const bad = { ...extractedRow(uid, `extracted-rls-bad-${counter}`), tile_svg: null };
    const { error } = await client.from('user_patterns').insert(bad);
    expect(error).not.toBeNull();
    expect(String(error.message)).toMatch(/payload|check/i);
  });

  it('keeps the ai_patterns compatibility view working for AI rows', async () => {
    const email = uniqueEmail('compat');
    const uid = await createUser(email);
    const client = clientFor(uid, email);

    const { error: insErr } = await client.from('ai_patterns').insert({
      user_id: uid,
      pattern_id: `ai-rls-${counter}`,
      name: 'AI compat',
      source_code: 'class PatternClass {}',
      param_defs: [],
      default_params: {},
    });
    expect(insErr).toBeNull();

    // Visible through the view…
    const { data: viaView, error: viewErr } = await client
      .from('ai_patterns')
      .select('*')
      .eq('user_id', uid);
    expect(viewErr).toBeNull();
    expect(viaView.length).toBe(1);

    // …and stored in the unified table with source='ai'.
    const { data: viaTable } = await service
      .from('user_patterns')
      .select('*')
      .eq('user_id', uid);
    expect(viaTable.length).toBe(1);
    expect(viaTable[0].source).toBe('ai');

    // The view stays RLS-locked for other users (security_invoker).
    const emailOther = uniqueEmail('compat-other');
    const uidOther = await createUser(emailOther);
    const other = clientFor(uidOther, emailOther);
    const { data: leaked } = await other
      .from('ai_patterns')
      .select('*')
      .eq('user_id', uid);
    expect(leaked).toEqual([]);
  });
});

live('pattern-photos bucket RLS (migration 009)', () => {
  const png = () =>
    new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });

  it('lets an owner upload into and read from their own folder', async () => {
    const email = uniqueEmail('photo');
    const uid = await createUser(email);
    const client = clientFor(uid, email);

    const path = `${uid}/extracted-photo-${counter}.png`;
    const { error: upErr } = await client.storage
      .from('pattern-photos')
      .upload(path, png(), { contentType: 'image/png' });
    expect(upErr).toBeNull();

    const { data, error: dlErr } = await client.storage
      .from('pattern-photos')
      .download(path);
    expect(dlErr).toBeNull();
    expect(data).toBeTruthy();
  });

  it("blocks uploading into another user's folder", async () => {
    const emailA = uniqueEmail('pa');
    const emailB = uniqueEmail('pb');
    const uidA = await createUser(emailA);
    const uidB = await createUser(emailB);

    const clientB = clientFor(uidB, emailB);
    const { error } = await clientB.storage
      .from('pattern-photos')
      .upload(`${uidA}/forged-${counter}.png`, png(), { contentType: 'image/png' });
    expect(error).not.toBeNull();
  });

  it("blocks reading another user's photo", async () => {
    const emailA = uniqueEmail('ra');
    const emailB = uniqueEmail('rb');
    const uidA = await createUser(emailA);
    const uidB = await createUser(emailB);

    const clientA = clientFor(uidA, emailA);
    const path = `${uidA}/private-${counter}.png`;
    const { error: upErr } = await clientA.storage
      .from('pattern-photos')
      .upload(path, png(), { contentType: 'image/png' });
    expect(upErr).toBeNull();

    const clientB = clientFor(uidB, emailB);
    const { data, error } = await clientB.storage
      .from('pattern-photos')
      .download(path);
    expect(data ?? null).toBeNull();
    expect(error).not.toBeNull();
  });
});
