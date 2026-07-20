// Unit tests for useLayers.addLayer panel assignment + cap threading (P2).
// Drives the real hook via renderHook (jsdom) with persistToLocal:false so each
// test starts from a clean, localStorage-free seed.

// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLayers from './useLayers.js';
import { MAX_LAYERS } from '../constants';

describe('useLayers.addLayer panel assignment', () => {
  it('assigns the new layer to opts.panelId when provided', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));

    act(() => {
      result.current.addLayer('grid', { panelId: 'p2' });
    });

    const newest = result.current.layers[result.current.layers.length - 1];
    expect(newest.panelId).toBe('p2');
  });

  it('leaves panelId at createLayer default (null) when called with no opts', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));

    act(() => {
      result.current.addLayer('grid');
    });

    const newest = result.current.layers[result.current.layers.length - 1];
    expect(newest.panelId).toBeNull();
  });

  it('still default-cycles and leaves panelId null when first arg is a non-string (event object)', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    const before = result.current.layers.length;

    act(() => {
      result.current.addLayer({}); // bare onClick={addLayer} passes an event
    });

    expect(result.current.layers.length).toBe(before + 1);
    const newest = result.current.layers[result.current.layers.length - 1];
    expect(newest.panelId).toBeNull();
  });

  it('no-ops at the tier cap even when a panelId is supplied', () => {
    // maxLayers:1 → init seeds exactly one layer → already at cap.
    const { result } = renderHook(() => useLayers({ persistToLocal: false, maxLayers: 1 }));
    const before = result.current.layers.length;

    act(() => {
      result.current.addLayer('grid', { panelId: 'p2' });
    });

    expect(result.current.layers.length).toBe(before);
  });
});

describe('useLayers.cap', () => {
  it('exposes the effective tier cap as a number', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false, maxLayers: 4 }));
    expect(result.current.cap).toBe(4);
  });
});

describe('useLayers.addMotifLayer', () => {
  it('appends a motif layer bound to its host with the expected params + auto name', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));

    // Seed a host to adorn, then read back its id + name.
    act(() => {
      result.current.addLayer('grid');
    });
    const host = result.current.layers[result.current.layers.length - 1];
    const before = result.current.layers.length;

    let ret;
    act(() => {
      ret = result.current.addMotifLayer(host.id, { glyphRef: 'leaf' });
    });

    expect(ret.ok).toBe(true);
    expect(typeof ret.id).toBe('string');
    expect(result.current.layers.length).toBe(before + 1);

    const motif = result.current.layers.find((l) => l.id === ret.id);
    expect(motif).toBeDefined();
    expect(motif.type).toBe('motif');
    expect(motif.patternType).toBe('motif');
    expect(motif.params.hostLayerId).toBe(host.id);
    expect(motif.params.glyphRef).toBe('leaf');
    expect(motif.params.anchorMode).toBe('semantic'); // default
    // Auto name is "<Glyph name> on <host name>".
    expect(motif.name).toBe(`Leaf on ${host.name}`);
  });

  it('is EXEMPT from the tier cap — adds a motif even when non-motif layers are at the cap (Fix 2)', () => {
    // maxLayers:1 → init seeds exactly one layer → already at the tier cap. Under
    // the OLD semantics this refused the motif; now motifs get their own budget.
    const { result } = renderHook(() => useLayers({ persistToLocal: false, maxLayers: 1 }));
    const host = result.current.layers[0];
    const before = result.current.layers.length;

    let ret;
    act(() => {
      ret = result.current.addMotifLayer(host.id, { glyphRef: 'leaf' });
    });

    expect(ret.ok).toBe(true);
    expect(result.current.layers.length).toBe(before + 1);
    const motif = result.current.layers.find((l) => l.id === ret.id);
    expect(motif.type).toBe('motif');
    expect(motif.params.hostLayerId).toBe(host.id);
  });

  it('refuses the 5th motif on one host with the per-host limit error (Fix 2)', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    act(() => {
      result.current.addLayer('grid');
    });
    const host = result.current.layers[result.current.layers.length - 1];

    // Four motifs succeed (MAX_MOTIFS_PER_HOST = 4).
    for (let i = 0; i < 4; i += 1) {
      act(() => {
        const r = result.current.addMotifLayer(host.id, { glyphRef: 'leaf' });
        expect(r.ok).toBe(true);
      });
    }
    // The 5th is refused with the exact per-host message.
    let fifth;
    act(() => {
      fifth = result.current.addMotifLayer(host.id, { glyphRef: 'leaf' });
    });
    expect(fifth.ok).toBe(false);
    expect(fifth.error).toBe('Motif limit reached for this layer (4).');
  });

  it('existing motifs do not block adding a pattern layer at cap-1 (Fix 2)', () => {
    // maxLayers:2 → seeds 1 layer (non-motif). Adorn it with a motif, then add a
    // 2nd pattern: the motif must NOT count toward the tier cap.
    const { result } = renderHook(() => useLayers({ persistToLocal: false, maxLayers: 2 }));
    const host = result.current.layers[0];
    act(() => {
      result.current.addMotifLayer(host.id, { glyphRef: 'leaf' });
    });
    const nonMotifBefore = result.current.layers.filter((l) => l.type !== 'motif').length;
    expect(nonMotifBefore).toBe(1); // 1 pattern + 1 motif = 2 layers, but 1 counts

    act(() => {
      result.current.addLayer('grid');
    });
    // The pattern was added (motif didn't consume the slot).
    expect(result.current.layers.filter((l) => l.type !== 'motif').length).toBe(2);
  });

  it('enforces the absolute MAX_LAYERS document backstop with a distinct error (Fix 2)', () => {
    // Fill the document to exactly MAX_LAYERS total, spreading motifs across
    // hosts so the LAST host stays UNDER its per-host budget (4) — isolating
    // the DOCUMENT backstop as the blocker (not the per-host message).
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    // 3 pattern hosts: the seed + 2 more.
    act(() => {
      result.current.addLayer('grid');
    });
    act(() => {
      result.current.addLayer('grid');
    });
    const hosts = result.current.layers.slice(0, 3);
    // Round-robin motifs (≤3 per host, below the per-host budget) until full.
    let i = 0;
    while (result.current.layers.length < MAX_LAYERS) {
      const h = hosts[i % hosts.length];
      i += 1;
      act(() => {
        result.current.addMotifLayer(h.id, { glyphRef: 'leaf' });
      });
    }
    expect(result.current.layers.length).toBe(MAX_LAYERS);
    // The least-loaded host is under its per-host budget, but the DOCUMENT is
    // full → the distinct doc-backstop error.
    const target = hosts[i % hosts.length];
    let ret;
    act(() => {
      ret = result.current.addMotifLayer(target.id, { glyphRef: 'leaf' });
    });
    expect(ret.ok).toBe(false);
    expect(ret.error).toBe('Document layer limit reached.');
    expect(result.current.layers.length).toBe(MAX_LAYERS);
  });
});
