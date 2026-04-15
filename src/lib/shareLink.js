// Stateless, DB-free share links.
// Encodes the full design into the URL itself via base64url(JSON).
// Universal across tiers — this is the growth/viral primitive in Weeks 1–3.
//
// Distinct from the Pro-tier DB-backed `/share/:token` flow in designService.
// Both can coexist: this one is the copy-anywhere link; that one is the
// persisted, revocable published design.

const PROTOCOL_VERSION = 1;
const PARAM_KEY = 's';

function encodeBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function encodeShare(state) {
  const payload = { v: PROTOCOL_VERSION, ...state };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return encodeBytes(bytes);
}

export function decodeShare(token) {
  try {
    const bytes = decodeBytes(token);
    const json = new TextDecoder().decode(bytes);
    const obj = JSON.parse(json);
    if (obj.v !== PROTOCOL_VERSION) return null;
    return obj;
  } catch {
    return null;
  }
}

export function buildShareUrl(state) {
  const token = encodeShare(state);
  const base = window.location.origin + window.location.pathname;
  return `${base}?${PARAM_KEY}=${token}`;
}

export function readShareTokenFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(PARAM_KEY);
  } catch {
    return null;
  }
}

export function clearShareTokenFromUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(PARAM_KEY);
    window.history.replaceState({}, '', url.toString());
  } catch {
    /* noop */
  }
}
