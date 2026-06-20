// Live-RLS test helper.
//
// Guarantee: this helper must NEVER stall an autonomous build. If the local
// Supabase stack is not running (Docker down, `supabase start` not run), it
// returns `{ skipped: true, reason }` instead of throwing — the orchestrator
// runs the heavy live-RLS suites later behind a runtime check.
//
// Everything that touches the outside world (status, db reset, client
// construction) is injectable so unit tests stay deterministic and offline.

import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient as supabaseCreateClient } from '@supabase/supabase-js';

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Mint an HS256 JWT signed with the LOCAL Supabase JWT secret. The secret is
// parsed from `npx supabase status -o env` at runtime by the caller — never
// hardcode it. Supabase local auth verifies HS256, so a hand-rolled HMAC token
// (no external dependency) is accepted as a valid user JWT.
export function signJwt(claims, secret, { expiresInSeconds = 3600 } = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + expiresInSeconds,
    ...claims,
  };

  const encodedHeader = b64url(JSON.stringify(header));
  const encodedPayload = b64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Default status runner: `npx supabase status`. Returns { running, output }.
// A stopped stack exits non-zero, so any throw is treated as "not running" —
// never propagated — which is what keeps the build from stalling.
function realStatusRunner() {
  try {
    const output = execFileSync('npx', ['supabase', 'status'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { running: true, output };
  } catch (err) {
    return {
      running: false,
      output: (err && (err.stderr || err.message)) || 'supabase status failed',
    };
  }
}

// Default env runner: `npx supabase status -o env` emits KEY=value lines
// (API_URL, ANON_KEY, SERVICE_ROLE_KEY, JWT_SECRET, ...). Parsed at runtime so
// no key is ever hardcoded.
function realEnvRunner() {
  const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return parseEnv(output);
}

export function parseEnv(output) {
  const env = {};
  for (const line of String(output).split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

// Default reset runner: `npx supabase db reset` rebuilds the DB from
// migrations/ + seed. May fail if migrations aren't normalized yet — callers
// must treat a throw as skip, never stall.
function realResetRunner() {
  execFileSync('npx', ['supabase', 'db', 'reset'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function createRlsHarness({
  statusRunner,
  envRunner,
  resetRunner,
  // supabase-js createClient is lazy (no network on construction), so the live
  // path works out of the box; tests inject a fake to stay fully offline.
  createClient = supabaseCreateClient,
} = {}) {
  const runStatus = statusRunner || realStatusRunner;
  const status = runStatus();

  if (!status || !status.running) {
    return {
      skipped: true,
      reason:
        (status && status.output) ||
        'Supabase local stack is not running (npx supabase status reported stopped).',
    };
  }

  // Stack is running. Rebuild the DB from migrations/seed BEFORE handing back
  // clients. A reset failure (e.g. un-normalized migrations) degrades to skip —
  // it must never throw and stall the build.
  const runReset = resetRunner || realResetRunner;
  try {
    runReset();
  } catch (err) {
    return {
      skipped: true,
      reason: `Supabase db reset failed: ${(err && err.message) || err}`,
    };
  }

  // Parse keys/secret from `status -o env` (never hardcoded), then provide an
  // anon client and a per-user `withUser()`.
  const runEnv = envRunner || realEnvRunner;
  const env = runEnv();
  const url = env.API_URL || env.SUPABASE_URL;
  const anonKey = env.ANON_KEY || env.SUPABASE_ANON_KEY;
  const jwtSecret = env.JWT_SECRET;

  const anon = createClient(url, anonKey);

  const withUser = (jwtClaims) => {
    const token = signJwt(jwtClaims, jwtSecret);
    return createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  };

  return { skipped: false, status, env, anon, withUser };
}

// ─── Inter-process DB mutex ───────────────────────────────────────────────────
//
// Vitest runs test FILES in separate worker PROCESSES (parallel). Every live-RLS
// suite calls `npx supabase db reset`, which DROPS + rebuilds the local `public`
// schema. Run in parallel, one suite's reset wipes another suite's freshly
// seeded rows mid-test → flaky failures.
//
// An in-memory flag can't serialize across processes, so we use a filesystem
// lockfile in os.tmpdir() with a fixed name. Only one live-RLS suite holds the
// DB at a time. The lock is held from BEFORE `db reset` until the suite's
// DB-using tests are DONE (acquire in beforeAll, release in afterAll) — not just
// across the reset call — so no other suite can reset mid-test.

const LOCK_PATH = path.join(os.tmpdir(), 'naqsha-rls-db.lock');
// Total time we'll wait to acquire before giving up. Must exceed the worst case
// of N-1 suites each doing (reset + their DB tests) ahead of us. The full serial
// run of all 4 suites is ~400s, so the last suite to acquire waits roughly that
// minus its own hold. 600s gives comfortable headroom. The callers' beforeAll
// hookTimeout is set ABOVE this (timeout + one reset).
const LOCK_ACQUIRE_TIMEOUT_MS = 600 * 1000;
// Steal threshold (cross-host backstop only). PID-liveness is the PRIMARY stale
// signal — a dead holder is stolen instantly. The timestamp must NOT undercut a
// live holder that legitimately holds the DB for a long suite, so it is kept
// >= the acquire timeout: a waiter would give up before ever timestamp-stealing
// from a still-running holder.
const STALE_LOCK_MS = 15 * 60 * 1000; // 15 minutes (>= LOCK_ACQUIRE_TIMEOUT_MS)
const LOCK_POLL_MS = 150;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    // Signal 0 doesn't kill — it only probes existence/permission. ESRCH ⇒ dead.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === 'EPERM'; // alive but not ours ⇒ treat as alive
  }
}

// A held lock is "stale" (safe to steal) if its writer PID is dead, or it's so
// old that a crashed cross-host holder is the only explanation.
function lockIsStale() {
  let raw;
  try {
    raw = fs.readFileSync(LOCK_PATH, 'utf8');
  } catch {
    return false; // gone already; let the caller's create attempt race normally
  }
  let info;
  try {
    info = JSON.parse(raw);
  } catch {
    return true; // unparseable/garbage lock ⇒ steal
  }
  if (typeof info.pid === 'number' && !isPidAlive(info.pid)) return true;
  if (typeof info.time === 'number' && Date.now() - info.time > STALE_LOCK_MS) {
    return true;
  }
  return false;
}

// Acquire the cross-process lock by exclusively creating the lockfile ('wx').
// Retries with backoff; breaks a provably-stale lock. Throws on timeout.
async function acquireDbLock() {
  const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;
  for (;;) {
    try {
      const fd = fs.openSync(LOCK_PATH, 'wx');
      fs.writeSync(
        fd,
        JSON.stringify({ pid: process.pid, time: Date.now() }),
      );
      fs.closeSync(fd);
      return; // held
    } catch (err) {
      if (!err || err.code !== 'EEXIST') throw err; // unexpected fs error
      // Someone holds it. Steal if stale, else wait.
      if (lockIsStale()) {
        try {
          fs.unlinkSync(LOCK_PATH);
        } catch {
          // lost the unlink race; loop and retry the create
        }
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `rlsHarness: timed out after ${LOCK_ACQUIRE_TIMEOUT_MS}ms waiting for ${LOCK_PATH}`,
        );
      }
      await sleep(LOCK_POLL_MS);
    }
  }
}

function releaseDbLock() {
  // Only delete a lock we still own, so we never clobber a holder that stole
  // ours after a stale-break (shouldn't happen within timeout, but be safe).
  try {
    const info = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
    if (info && info.pid === process.pid) fs.unlinkSync(LOCK_PATH);
  } catch {
    // already gone / unreadable — nothing to release
  }
}

// Cheap, SYNC, lock-free Docker probe. Suites call this at module-eval time to
// choose `describe` vs `describe.skip` WITHOUT touching the lock or stalling.
//
// OPT-IN GATE: the live-RLS suites are DESTRUCTIVE (each does `db reset`) and
// CPU-heavy, so they must never run inside the default parallel `npm test`. They
// run ONLY when explicitly opted in via `RLS_LIVE=1` (set by the dedicated
// serial `npm run test:rls` script). The env check is FIRST and short-circuits
// BEFORE spawning any `npx supabase status` subprocess — so the default run
// spawns zero probes and never CPU-starves unrelated suites.
//
// Even with RLS_LIVE=1, if Docker is down this still returns false (the suites
// SKIP, never fail/stall) because the status probe reports the stack stopped.
export function isLiveRlsAvailable({ statusRunner } = {}) {
  if (process.env.RLS_LIVE !== '1') return false;
  const runStatus = statusRunner || realStatusRunner;
  const status = runStatus();
  return Boolean(status && status.running);
}

// Acquire the DB lock, then run `db reset` and build clients via the existing
// createRlsHarness(). Returns the same shape createRlsHarness() does, plus the
// lock is HELD on the happy path until teardownLiveRls() is called.
//
// Skip path (req 4): if Docker is down, returns { skipped: true } having NEVER
// acquired the lock. If reset fails AFTER acquiring, the lock is released before
// returning the skip — a failed reset must not wedge the other suites.
export async function setupLiveRls(opts = {}) {
  // 1. Status probe FIRST, lock-free. Down ⇒ skip, no lock.
  if (!isLiveRlsAvailable(opts)) {
    const runStatus = opts.statusRunner || realStatusRunner;
    const status = runStatus();
    return {
      skipped: true,
      reason:
        (status && status.output) ||
        'Supabase local stack is not running (npx supabase status reported stopped).',
    };
  }

  // 2. Acquire the cross-process lock BEFORE reset.
  await acquireDbLock();

  // 3. Reset + build clients. Any non-happy outcome releases the lock.
  let harness;
  try {
    harness = createRlsHarness(opts);
  } catch (err) {
    releaseDbLock();
    throw err;
  }
  if (harness.skipped) {
    releaseDbLock(); // reset failed after acquire — don't leak the lock
    return harness;
  }
  return harness;
}

// Release the DB lock. Idempotent and safe to call when setup skipped (no lock
// held) — releaseDbLock() only unlinks a lockfile this PID owns. Call from
// afterAll in a way that always runs (vitest runs afterAll even on test throw).
export function teardownLiveRls() {
  releaseDbLock();
}
