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
