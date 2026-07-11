import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setProcessAnnotation,
  getProcessAnnotation,
  subscribeProcessAnnotation,
} from './processAnnotation.js';

beforeEach(() => setProcessAnnotation(null));

describe('processAnnotation — left-panel → 3D hover channel', () => {
  it('publishes {panelId, process} and clears with null', () => {
    setProcessAnnotation({ panelId: 'p1', process: 'cut' });
    expect(getProcessAnnotation()).toEqual({ panelId: 'p1', process: 'cut' });
    setProcessAnnotation(null);
    expect(getProcessAnnotation()).toBe(null);
  });

  it('notifies subscribers once per REAL change — identical writes are silent', () => {
    const spy = vi.fn();
    const off = subscribeProcessAnnotation(spy);
    setProcessAnnotation({ panelId: 'p1', process: 'engrave' });
    setProcessAnnotation({ panelId: 'p1', process: 'engrave' }); // duplicate → no notify
    setProcessAnnotation({ panelId: 'p1', process: 'score' });
    setProcessAnnotation(null);
    setProcessAnnotation(null); // duplicate clear → no notify
    expect(spy).toHaveBeenCalledTimes(3);
    off();
    setProcessAnnotation({ panelId: 'p2', process: 'cut' });
    expect(spy).toHaveBeenCalledTimes(3); // unsubscribed
  });

  it('treats a process-less write as a clear (row with no resolvable operation)', () => {
    setProcessAnnotation({ panelId: 'p1', process: 'cut' });
    setProcessAnnotation({ panelId: 'p1', process: null });
    expect(getProcessAnnotation()).toBe(null);
    setProcessAnnotation({ panelId: 'p1' });
    expect(getProcessAnnotation()).toBe(null);
  });

  it('normalizes a missing panelId to null (matches any-panel semantics downstream)', () => {
    setProcessAnnotation({ process: 'pen' });
    expect(getProcessAnnotation()).toEqual({ panelId: null, process: 'pen' });
  });
});
