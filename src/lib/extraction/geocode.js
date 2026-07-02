// Reverse geocoding (S8, issue #57): turn GPS into a human-readable place
// suggestion, keylessly, via OpenStreetMap's Nominatim.
//
// PRIVACY (locked rule): GPS never leaves the device without an explicit,
// visible user action. This module does NOT auto-run — the Save step wires it
// to a "look up place name" button. It is a plain function over an injectable
// `fetchImpl` so tests prove no request is made until it is called, and so the
// caller owns the trigger.
//
// Nominatim usage policy: no API key, but expects a valid identifying HTTP
// referer/User-Agent and a light request rate. In the browser the Referer is
// set automatically (a User-Agent header can't be overridden from a page);
// server-side/native callers should pass their own UA. We request jsonv2 and
// attribute OSM data in the UI. Failure/offline → null, never an error state.

const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';

function validCoord({ lat, lng } = {}) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** The exact reverse-geocode request URL (exposed for transparency + tests). */
export function buildReverseGeocodeURL({ lat, lng }) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    zoom: '14', // ~town/suburb granularity — a place name, not a house number
    addressdetails: '1',
  });
  return `${NOMINATIM_REVERSE}?${params.toString()}`;
}

// A concise "City, Country" label, resiliently sourced across Nominatim's
// varying address keys (city vs town vs village vs municipality vs county).
function conciseName(address = {}) {
  const locality =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    address.state ||
    null;
  const country = address.country || null;
  return [locality, country].filter(Boolean).join(', ') || null;
}

/**
 * Reverse-geocode a coordinate.
 * @param {{lat:number,lng:number}} coord
 * @param {{ fetchImpl?: typeof fetch, signal?: AbortSignal }} [opts]
 * @returns {Promise<{ placeName: string, address: string }|null>} null on any
 *   failure (invalid coord, offline, non-ok, malformed body) — never throws.
 */
export async function reverseGeocode(coord, { fetchImpl, signal } = {}) {
  if (!validCoord(coord)) return null;
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return null;
  try {
    const res = await doFetch(buildReverseGeocodeURL(coord), {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!res || !res.ok) return null;
    const json = await res.json();
    const placeName = conciseName(json?.address) || json?.name || null;
    const address = typeof json?.display_name === 'string' ? json.display_name : null;
    if (!placeName && !address) return null;
    return { placeName: placeName || address, address: address || placeName };
  } catch {
    return null; // offline / abort / parse — degrade to manual entry
  }
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthYear(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  if (!Number.isFinite(d.getTime())) return null;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Suggested entry title from place + date (PRD: "Ornament — Uppsala, June
 * 2026"). Editable — surfaced only when SOME data exists; null means "leave
 * the title placeholder", never a fabricated title.
 */
export function placeToTitle(placeName, isoDate) {
  const my = monthYear(isoDate);
  // With a date, the country is redundant next to the month/year, so use just
  // the leading locality ("Uppsala, Sweden" → "Uppsala") — PRD: "Ornament —
  // Uppsala, June 2026". Without a date, keep the fuller place label.
  const place = placeName
    ? my
      ? String(placeName).split(',')[0].trim()
      : String(placeName).trim()
    : null;
  const parts = [place || null, my].filter(Boolean);
  if (parts.length === 0) return null;
  return `Ornament — ${parts.join(', ')}`;
}
