// AR-1C: Characterization + Classic RED→GREEN for shareLink.js
//
// Environment: node (default). btoa/atob/TextEncoder/TextDecoder are global in
// Node 18+, so encode/decode tests run clean. buildShareUrl/buildShareUrlSafe
// reference window.location — stubbed per-suite below.

import {
  encodeShare,
  decodeShare,
  buildShareUrl,
  buildShareUrlSafe,
} from './shareLink';

// ---------------------------------------------------------------------------
// Helpers (test-local, mirrors the private encodeBytes in shareLink.js)
// ---------------------------------------------------------------------------

/** Build a raw token with a custom version number for protocol-mismatch testing. */
function makeTokenWithVersion(version, extraFields = {}) {
  const payload = { v: version, ...extraFields };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Suite 1 – encodeShare / decodeShare (pure, no window dependency)
// ---------------------------------------------------------------------------

describe('encodeShare / decodeShare', () => {
  it('round-trips a simple state object', () => {
    const state = { pattern: 'spirograph', seed: 42, freq: 7 };
    const token = encodeShare(state);
    const decoded = decodeShare(token);

    expect(decoded).not.toBeNull();
    expect(decoded.pattern).toBe('spirograph');
    expect(decoded.seed).toBe(42);
    expect(decoded.freq).toBe(7);
  });

  it('decoded object includes the protocol version field', () => {
    const token = encodeShare({ x: 1 });
    const decoded = decodeShare(token);
    expect(decoded).toHaveProperty('v');
    expect(typeof decoded.v).toBe('number');
  });

  it('round-trips an empty state object', () => {
    const token = encodeShare({});
    const decoded = decodeShare(token);
    expect(decoded).not.toBeNull();
    expect(typeof decoded.v).toBe('number');
  });

  it('round-trips a large JSON payload (within URL-safe ceiling)', () => {
    // A state object whose encoded form stays well under 8000 chars.
    const state = { data: 'x'.repeat(1000), nested: { a: 1, b: 2 } };
    const token = encodeShare(state);
    const decoded = decodeShare(token);
    expect(decoded).not.toBeNull();
    expect(decoded.data).toBe('x'.repeat(1000));
  });

  it('round-trips unicode / special-character values', () => {
    const state = { label: 'Ꝑermaflux ★ نقشة', emoji: '🎨' };
    const token = encodeShare(state);
    const decoded = decodeShare(token);
    expect(decoded.label).toBe('Ꝑermaflux ★ نقشة');
    expect(decoded.emoji).toBe('🎨');
  });

  it('returns null for a version-2 token (protocol mismatch)', () => {
    const token = makeTokenWithVersion(2, { pattern: 'test' });
    expect(decodeShare(token)).toBeNull();
  });

  it('returns null for a version-0 token (protocol mismatch)', () => {
    const token = makeTokenWithVersion(0, { pattern: 'test' });
    expect(decodeShare(token)).toBeNull();
  });

  it('returns null for a completely malformed token', () => {
    expect(decodeShare('!!not-valid-base64!!')).toBeNull();
  });

  it('returns null for an empty string token', () => {
    expect(decodeShare('')).toBeNull();
  });

  it('returns null for a valid base64url string that is not JSON', () => {
    // base64url of "hello world" — decodes to bytes that are not valid JSON
    const token = btoa('hello world').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeShare(token)).toBeNull();
  });

  it('returns null for a token whose JSON has no v field', () => {
    const payload = JSON.stringify({ pattern: 'spirograph' }); // no v
    const bytes = new TextEncoder().encode(payload);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const token = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeShare(token)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 – buildShareUrl (window-dependent, needs stub)
// ---------------------------------------------------------------------------

describe('buildShareUrl', () => {
  beforeEach(() => {
    globalThis.window = {
      location: {
        origin: 'https://app.test',
        pathname: '/',
        search: '',
        href: 'https://app.test/',
      },
      history: { replaceState: () => {} },
    };
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it('returns a string URL containing the encoded token', () => {
    const state = { pattern: 'spirograph', seed: 1 };
    const url = buildShareUrl(state);
    expect(typeof url).toBe('string');
    expect(url).toMatch(/^https:\/\/app\.test\/\?s=/);
  });

  it('the token in the URL round-trips back to the original state', () => {
    const state = { pattern: 'lissajous', seed: 99, freq: 3 };
    const url = buildShareUrl(state);
    const token = new URL(url).searchParams.get('s');
    const decoded = decodeShare(token);
    expect(decoded.pattern).toBe('lissajous');
    expect(decoded.seed).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 – buildShareUrlSafe: size guard (CLASSIC RED→GREEN)
// ---------------------------------------------------------------------------

describe('buildShareUrlSafe — size guard', () => {
  beforeEach(() => {
    globalThis.window = {
      location: {
        origin: 'https://app.test',
        pathname: '/',
        search: '',
        href: 'https://app.test/',
      },
      history: { replaceState: () => {} },
    };
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it('returns { url, tooLarge: false } for a normal-sized state', () => {
    const state = { pattern: 'spirograph', seed: 42 };
    const result = buildShareUrlSafe(state);
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('tooLarge', false);
    expect(typeof result.url).toBe('string');
    expect(result.url).toMatch(/^https:\/\/app\.test\/\?s=/);
  });

  it('returns { url: null, tooLarge: true } when encoded URL exceeds 8000 chars', () => {
    // A state that, when JSON-encoded + base64url + URL prefix, exceeds 8000 chars.
    // JSON of ~7000 'x' chars encodes to ~9500 base64 chars → well over the ceiling.
    const state = { data: 'x'.repeat(7000) };
    const result = buildShareUrlSafe(state);
    expect(result.tooLarge).toBe(true);
    expect(result.url).toBeNull();
  });

  it('URL in normal result is identical to buildShareUrl result', () => {
    const state = { pattern: 'lissajous', seed: 7 };
    const legacyUrl = buildShareUrl(state);
    const { url } = buildShareUrlSafe(state);
    expect(url).toBe(legacyUrl);
  });

  it('boundary: a state just under the ceiling is not flagged tooLarge', () => {
    // Craft a state whose final URL is just under 8000 chars.
    // URL overhead is ~24 chars ("https://app.test/?s="), so token must be < 7976.
    // base64url encodes 3 bytes → 4 chars; we need token ~< 7976 chars
    // → raw bytes < 5982 → JSON string < 5982 chars.
    // Use 5800 chars of data to stay comfortably under.
    const state = { data: 'a'.repeat(5800) };
    const result = buildShareUrlSafe(state);
    expect(result.tooLarge).toBe(false);
    expect(result.url).not.toBeNull();
  });
});
