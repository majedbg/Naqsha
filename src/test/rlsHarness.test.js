import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { createRlsHarness, signJwt } from './rlsHarness.js';

function b64urlDecode(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

describe('rlsHarness — tracer (skip path)', () => {
  it('returns { skipped: true } without throwing when the stack is stopped', () => {
    // Inject a fake status runner that reports the stack is NOT running, the way
    // `npx supabase status` does when Docker is down. The helper must degrade to
    // a skip signal so autonomous CI never stalls on dead Docker.
    const statusRunner = () => ({ running: false, output: 'supabase local development setup is not running.' });

    const result = createRlsHarness({ statusRunner });

    expect(result.skipped).toBe(true);
    expect(typeof result.reason).toBe('string');
  });
});

describe('rlsHarness — running path (client shape, no real connection)', () => {
  it('exposes an anon client and a withUser() that mints a per-user JWT', () => {
    // Fake a running stack. The env runner stands in for
    // `npx supabase status -o env` so no Docker is touched. A fake createClient
    // captures the key it was built with instead of opening a connection
    // (real supabase-js createClient is lazy, but we stay fully offline here).
    const statusRunner = () => ({ running: true, output: 'running' });
    const envRunner = () => ({
      API_URL: 'http://127.0.0.1:54321',
      ANON_KEY: 'anon-key-abc',
      JWT_SECRET: 'super-secret-jwt-token-with-at-least-32-characters-long',
    });
    const built = [];
    const createClient = (url, key, opts) => {
      built.push({ url, key, opts });
      return { __url: url, __key: key, __opts: opts };
    };

    const resetRunner = () => {};
    const harness = createRlsHarness({
      statusRunner,
      envRunner,
      createClient,
      resetRunner,
    });

    expect(harness.skipped).toBe(false);
    expect(harness.anon.__key).toBe('anon-key-abc');
    expect(typeof harness.withUser).toBe('function');

    const userClient = harness.withUser({ sub: 'u1' });
    // withUser builds a client whose Authorization header carries a minted JWT.
    const auth = userClient.__opts.global.headers.Authorization;
    expect(auth).toMatch(/^Bearer \S+\.\S+\.\S+$/);
  });

  it('runs db reset BEFORE building any client', () => {
    const order = [];
    const statusRunner = () => ({ running: true, output: 'running' });
    const envRunner = () => ({ API_URL: 'u', ANON_KEY: 'k', JWT_SECRET: 'sssssssssssssssssssssssssssssssss' });
    const resetRunner = () => order.push('reset');
    const createClient = () => {
      order.push('client');
      return {};
    };

    createRlsHarness({ statusRunner, envRunner, createClient, resetRunner });

    expect(order[0]).toBe('reset');
    expect(order).toContain('client');
  });

  it('skips (no throw) when db reset fails — migrations may not be normalized yet', () => {
    const statusRunner = () => ({ running: true, output: 'running' });
    const envRunner = () => ({ API_URL: 'u', ANON_KEY: 'k', JWT_SECRET: 's' });
    const resetRunner = () => {
      throw new Error('migration 0003 failed: relation already exists');
    };
    const createClient = () => ({});

    const harness = createRlsHarness({ statusRunner, envRunner, createClient, resetRunner });

    expect(harness.skipped).toBe(true);
    expect(harness.reason).toMatch(/reset/i);
  });
});

describe('signJwt — HS256 minting (matches Supabase local auth)', () => {
  it('produces a header.payload.signature triple that decodes to the claims', () => {
    const secret = 'super-secret-jwt-token-with-at-least-32-characters-long';
    const token = signJwt({ sub: 'u1', role: 'authenticated' }, secret);

    const [header, payload, signature] = token.split('.');
    expect(header && payload && signature).toBeTruthy();

    const decodedHeader = JSON.parse(b64urlDecode(header));
    expect(decodedHeader).toMatchObject({ alg: 'HS256', typ: 'JWT' });

    const decodedPayload = JSON.parse(b64urlDecode(payload));
    expect(decodedPayload.sub).toBe('u1');
    expect(decodedPayload.role).toBe('authenticated');
  });

  it('signs with the given secret so the signature verifies', () => {
    const secret = 'super-secret-jwt-token-with-at-least-32-characters-long';
    const token = signJwt({ sub: 'u1' }, secret);

    const [header, payload, signature] = token.split('.');
    const expected = createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(signature).toBe(expected);
  });
});
