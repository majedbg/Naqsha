// @vitest-environment jsdom
// useMaterialEvaluations.test.js — material-evaluation slice 1
//
// The hook mirrors useGlobalMotifLibrary: load the signed-in user's
// evaluations, submit prepends, everything GRACEFUL when logged-out or
// offline (no user → empty list + submit resolves null; a service rejection
// sets `error` and never throws to the caller).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../materialEvaluationService', () => ({
  loadEvaluations: vi.fn(),
  submitEvaluation: vi.fn(),
}));

import { loadEvaluations, submitEvaluation } from '../materialEvaluationService';
import useMaterialEvaluations from './useMaterialEvaluations';

const USER = { id: 'user-1' };
const EVAL_A = { id: 'a', materialName: 'Turquoise Opaque', archetype: 'opaque-acrylic' };
const EVAL_B = { id: 'b', materialName: 'Clear', archetype: 'clear-acrylic' };

beforeEach(() => {
  vi.clearAllMocks();
  loadEvaluations.mockResolvedValue([]);
});

describe('useMaterialEvaluations — load', () => {
  it('stays empty and never fetches with no user (login gate lives in the UI)', async () => {
    const { result } = renderHook(() => useMaterialEvaluations(null));
    expect(result.current.evaluations).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(loadEvaluations).not.toHaveBeenCalled();
  });

  it('loads the user evaluations on mount', async () => {
    loadEvaluations.mockResolvedValue([EVAL_A, EVAL_B]);
    const { result } = renderHook(() => useMaterialEvaluations(USER));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(loadEvaluations).toHaveBeenCalledWith('user-1');
    expect(result.current.evaluations.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('resets to empty when the user signs out', async () => {
    loadEvaluations.mockResolvedValue([EVAL_A]);
    const { result, rerender } = renderHook(({ user }) => useMaterialEvaluations(user), {
      initialProps: { user: USER },
    });
    await waitFor(() => expect(result.current.evaluations).toHaveLength(1));
    rerender({ user: null });
    expect(result.current.evaluations).toEqual([]);
  });

  it('is graceful on a load failure: empty list + surfaced error, no throw', async () => {
    const boom = new Error('offline');
    loadEvaluations.mockRejectedValue(boom);
    const { result } = renderHook(() => useMaterialEvaluations(USER));
    await waitFor(() => expect(result.current.error).toBe(boom));
    expect(result.current.evaluations).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

describe('useMaterialEvaluations — submit', () => {
  it('resolves null without calling the service when logged out (belt-and-braces)', async () => {
    const { result } = renderHook(() => useMaterialEvaluations(null));
    let out;
    await act(async () => {
      out = await result.current.submit({ material: { id: 'clear' } });
    });
    expect(out).toBeNull();
    expect(submitEvaluation).not.toHaveBeenCalled();
  });

  it('submits scoped to the user and prepends the stored evaluation', async () => {
    loadEvaluations.mockResolvedValue([EVAL_A]);
    submitEvaluation.mockResolvedValue(EVAL_B);
    const { result } = renderHook(() => useMaterialEvaluations(USER));
    await waitFor(() => expect(result.current.evaluations).toHaveLength(1));

    let out;
    await act(async () => {
      out = await result.current.submit({ material: { id: 'clear' }, archetype: 'clear-acrylic' });
    });
    expect(submitEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', archetype: 'clear-acrylic' }),
    );
    expect(out).toBe(EVAL_B);
    expect(result.current.evaluations.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('drops a submit that resolves AFTER sign-out: no prepend into the reset state', async () => {
    loadEvaluations.mockResolvedValue([]);
    let resolveSubmit;
    submitEvaluation.mockReturnValue(new Promise((r) => { resolveSubmit = r; }));
    const { result, rerender } = renderHook(({ user }) => useMaterialEvaluations(user), {
      initialProps: { user: USER },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let p;
    act(() => {
      p = result.current.submit({ material: { id: 'clear' } });
    });
    // Sign out while the submit is in flight — rerender is act-wrapped by RTL,
    // so the user-change effect (seq bump + reset) flushes BEFORE we resolve.
    rerender({ user: null });
    let out;
    await act(async () => {
      resolveSubmit(EVAL_B);
      out = await p;
    });
    expect(out).toBeNull();
    expect(result.current.evaluations).toEqual([]); // no ghost prepend
  });

  it('is graceful on a submit failure: resolves null + surfaces error, never throws', async () => {
    const boom = new Error('upload failed');
    submitEvaluation.mockRejectedValue(boom);
    const { result } = renderHook(() => useMaterialEvaluations(USER));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let out;
    await act(async () => {
      out = await result.current.submit({ material: { id: 'clear' } });
    });
    expect(out).toBeNull();
    expect(result.current.error).toBe(boom);
  });
});
