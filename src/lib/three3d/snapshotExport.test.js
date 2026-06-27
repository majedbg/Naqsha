import { describe, it, expect } from 'vitest';
import { buildSnapshotFilename, formatTimestamp } from './snapshotExport.js';

// Fixed local clock: 2026-06-27 09:05 → stamp 2026-06-27_0905.
const CLOCK = new Date(2026, 5, 27, 9, 5, 0);

describe('formatTimestamp', () => {
  it('formats YYYY-MM-DD_HHmm in local time, zero-padded', () => {
    expect(formatTimestamp(CLOCK)).toBe('2026-06-27_0905');
  });

  it('zero-pads single-digit month/day/hour/minute', () => {
    expect(formatTimestamp(new Date(2026, 0, 3, 4, 7, 0))).toBe('2026-01-03_0407');
  });
});

describe('buildSnapshotFilename (PRD D8)', () => {
  it('builds naqsha-3d_<design>_<YYYY-MM-DD_HHmm>.png with the injected clock', () => {
    expect(buildSnapshotFilename({ designName: 'mandala', now: CLOCK })).toBe(
      'naqsha-3d_mandala_2026-06-27_0905.png',
    );
  });

  it('sanitizes whitespace in the design name (\\s+ -> _), mirroring 2D export', () => {
    expect(buildSnapshotFilename({ designName: '  My Cool   Design ', now: CLOCK })).toBe(
      'naqsha-3d_My_Cool_Design_2026-06-27_0905.png',
    );
  });

  it('falls back to "untitled" for blank / missing design name (matches 2D ZIP default)', () => {
    expect(buildSnapshotFilename({ designName: '', now: CLOCK })).toBe(
      'naqsha-3d_untitled_2026-06-27_0905.png',
    );
    expect(buildSnapshotFilename({ now: CLOCK })).toBe(
      'naqsha-3d_untitled_2026-06-27_0905.png',
    );
  });

  it('always ends in .png and carries the naqsha-3d prefix (never the 2D .svg/.zip path)', () => {
    const name = buildSnapshotFilename({ designName: 'x', now: CLOCK });
    expect(name.startsWith('naqsha-3d_')).toBe(true);
    expect(name.endsWith('.png')).toBe(true);
    expect(name).not.toMatch(/\.(svg|zip)$/);
  });

  it('is PURE: same inputs → same output, no implicit Date.now()', () => {
    const a = buildSnapshotFilename({ designName: 'd', now: CLOCK });
    const b = buildSnapshotFilename({ designName: 'd', now: CLOCK });
    expect(a).toBe(b);
  });
});
