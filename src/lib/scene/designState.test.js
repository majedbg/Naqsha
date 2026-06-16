import { describe, it, expect } from 'vitest';
import { collectLiveIds, filterTransforms, parseTextNodes } from './designState.js';

describe('collectLiveIds', () => {
  it('unions layer ids and text-node ids', () => {
    const layers = [{ id: 'l1' }, { id: 'l2' }];
    const textNodes = [{ id: 't1' }, { id: 't2' }];
    expect(collectLiveIds(layers, textNodes).sort()).toEqual(['l1', 'l2', 't1', 't2']);
  });

  it('tolerates missing/empty inputs', () => {
    expect(collectLiveIds(null, undefined)).toEqual([]);
    expect(collectLiveIds([{ id: 'l1' }], [])).toEqual(['l1']);
  });
});

describe('filterTransforms', () => {
  it('keeps only entries whose id is live (drops stale entries)', () => {
    const transforms = {
      l1: { x: 1, y: 0, rotation: 0, scale: 1 },
      gone: { x: 9, y: 9, rotation: 0, scale: 1 },
      t1: { x: 0, y: 2, rotation: 0, scale: 1 },
    };
    const out = filterTransforms(transforms, ['l1', 't1']);
    expect(out).toEqual({
      l1: { x: 1, y: 0, rotation: 0, scale: 1 },
      t1: { x: 0, y: 2, rotation: 0, scale: 1 },
    });
    expect(out.gone).toBeUndefined();
  });

  it('returns an empty object for missing input', () => {
    expect(filterTransforms(null, ['a'])).toEqual({});
    expect(filterTransforms({ a: {} }, null)).toEqual({});
  });
});

describe('parseTextNodes', () => {
  it('passes through an array and defaults anything else to []', () => {
    const arr = [{ id: 't1', text: 'Hi' }];
    expect(parseTextNodes(arr)).toBe(arr);
    expect(parseTextNodes(undefined)).toEqual([]);
    expect(parseTextNodes(null)).toEqual([]);
    expect(parseTextNodes({})).toEqual([]);
  });
});
