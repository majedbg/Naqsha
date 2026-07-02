// Reverse geocoding (S8, issue #57): GPS → human-readable place suggestion.
// PRIVACY (locked): this is the ONLY GPS-carrying network call, and it fires
// only when the caller invokes it (a visible "look up place name" button) —
// never on upload. Tests inject fetch so no real request leaves the machine,
// and assert failure/offline degrades to null, never an error state.

import { describe, it, expect, vi } from 'vitest';
import { reverseGeocode, buildReverseGeocodeURL, placeToTitle } from './geocode';

function okFetch(json) {
  return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(json) });
}

const NOMINATIM_UPPSALA = {
  display_name: 'Uppsala Cathedral, Domkyrkoplan, Uppsala, Uppsala County, 753 10, Sweden',
  name: 'Uppsala Cathedral',
  address: {
    city: 'Uppsala',
    county: 'Uppsala County',
    country: 'Sweden',
    country_code: 'se',
  },
};

describe('buildReverseGeocodeURL', () => {
  it('targets the keyless Nominatim reverse endpoint with lat/lng', () => {
    const url = buildReverseGeocodeURL({ lat: 59.8586, lng: 17.6389 });
    expect(url).toContain('nominatim.openstreetmap.org/reverse');
    expect(url).toContain('lat=59.8586');
    expect(url).toContain('lon=17.6389');
    expect(url).toContain('format=jsonv2');
  });
});

describe('reverseGeocode', () => {
  it('resolves a concise placeName + full address from a Nominatim response', async () => {
    const fetchImpl = okFetch(NOMINATIM_UPPSALA);
    const out = await reverseGeocode({ lat: 59.8586, lng: 17.6389 }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(out).toEqual({
      placeName: 'Uppsala, Sweden',
      address: NOMINATIM_UPPSALA.display_name,
    });
  });

  it('falls back through town/village/municipality for the place label', async () => {
    const fetchImpl = okFetch({
      display_name: 'Some Hamlet, Region, Country',
      address: { village: 'Some Hamlet', country: 'Country' },
    });
    const out = await reverseGeocode({ lat: 1, lng: 2 }, { fetchImpl });
    expect(out.placeName).toBe('Some Hamlet, Country');
  });

  it('returns null (no error state) when the network is offline / fetch rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    const out = await reverseGeocode({ lat: 1, lng: 2 }, { fetchImpl });
    expect(out).toBeNull();
  });

  it('returns null on a non-ok HTTP response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    const out = await reverseGeocode({ lat: 1, lng: 2 }, { fetchImpl });
    expect(out).toBeNull();
  });

  it('returns null for invalid coordinates without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const out = await reverseGeocode({ lat: 999, lng: 0 }, { fetchImpl });
    expect(out).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('placeToTitle', () => {
  it('composes "Ornament — Place, Month Year" from place + date', () => {
    expect(placeToTitle('Uppsala, Sweden', '2026-06-28T12:32:10.000Z')).toBe(
      'Ornament — Uppsala, June 2026'
    );
  });

  it('uses place alone when no date is present', () => {
    expect(placeToTitle('Uppsala, Sweden', null)).toBe('Ornament — Uppsala, Sweden');
  });

  it('uses date alone when no place is present', () => {
    expect(placeToTitle(null, '2026-06-28T12:32:10.000Z')).toBe('Ornament — June 2026');
  });

  it('returns null when neither place nor date exists (no fabricated title)', () => {
    expect(placeToTitle(null, null)).toBeNull();
  });
});
