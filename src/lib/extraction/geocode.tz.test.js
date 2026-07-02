// S9 follow-up: the suggested-title month/year must match the LOCAL capture
// date shown in the Save step + Library detail. This test forces a positive-
// offset-crossing timezone and a near-UTC-midnight fixture so it FAILS on the
// old getUTC* implementation and PASSES on the local getters.
//
// TZ is set at module top (each vitest test file runs in a fresh worker, so the
// runtime picks it up before any Date is constructed here — verified).
process.env.TZ = 'America/New_York';

import { describe, it, expect } from 'vitest';
import { placeToTitle } from './geocode';

// 2026-07-01T02:30:00Z is July in UTC but June 30 (22:30) in America/New_York.
const NEAR_MIDNIGHT = '2026-07-01T02:30:00Z';

describe('placeToTitle — local timezone alignment', () => {
  it('sanity: the fixture straddles the UTC/local month boundary', () => {
    const d = new Date(NEAR_MIDNIGHT);
    expect(d.getMonth()).toBe(5); // June, local
    expect(d.getUTCMonth()).toBe(6); // July, UTC
  });

  it('uses the LOCAL month/year (June, not the UTC July)', () => {
    expect(placeToTitle(null, NEAR_MIDNIGHT)).toBe('Ornament — June 2026');
    expect(placeToTitle('Uppsala, Sweden', NEAR_MIDNIGHT)).toBe('Ornament — Uppsala, June 2026');
  });
});
