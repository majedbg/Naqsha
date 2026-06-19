// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import HoldToSubmitButton from './HoldToSubmitButton.jsx';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HoldToSubmitButton', () => {
  it('TRACER: holding for holdMs fires onConfirm', () => {
    const onConfirm = vi.fn();
    render(<HoldToSubmitButton onConfirm={onConfirm} holdMs={2000} />);
    const btn = screen.getByRole('button');

    act(() => {
      fireEvent.mouseDown(btn);
    });
    expect(onConfirm).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('releasing early does not fire and resets so a later hold works', () => {
    const onConfirm = vi.fn();
    render(<HoldToSubmitButton onConfirm={onConfirm} holdMs={2000} />);
    const btn = screen.getByRole('button');

    act(() => {
      fireEvent.mouseDown(btn);
      vi.advanceTimersByTime(1000);
      fireEvent.mouseUp(btn);
      vi.advanceTimersByTime(2000);
    });
    expect(onConfirm).not.toHaveBeenCalled();

    // a fresh full hold still fires
    act(() => {
      fireEvent.mouseDown(btn);
      vi.advanceTimersByTime(2000);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not engage when disabled', () => {
    const onConfirm = vi.fn();
    render(<HoldToSubmitButton onConfirm={onConfirm} holdMs={2000} disabled />);
    const btn = screen.getByRole('button');

    expect(btn.disabled).toBe(true);
    act(() => {
      fireEvent.mouseDown(btn);
      vi.advanceTimersByTime(5000);
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('mobile touch tap fires immediately (no hold friction)', () => {
    const onConfirm = vi.fn();
    render(<HoldToSubmitButton onConfirm={onConfirm} holdMs={2000} />);
    const btn = screen.getByRole('button');

    act(() => {
      fireEvent.touchStart(btn);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('keyboard Enter fires plainly (no 2s hold)', () => {
    const onConfirm = vi.fn();
    render(<HoldToSubmitButton onConfirm={onConfirm} holdMs={2000} />);
    const btn = screen.getByRole('button');

    act(() => {
      fireEvent.keyDown(btn, { key: 'Enter' });
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('reducedMotion renders a progress indicator and still holds 2s', () => {
    const onConfirm = vi.fn();
    render(
      <HoldToSubmitButton onConfirm={onConfirm} holdMs={2000} reducedMotion />,
    );
    const btn = screen.getByRole('button');

    // a progressbar affordance exists in reduced-motion mode
    expect(screen.getByRole('progressbar')).toBeTruthy();

    act(() => {
      fireEvent.mouseDown(btn);
      vi.advanceTimersByTime(1000);
    });
    // still requires the full 2s — not fired at the halfway point
    expect(onConfirm).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
