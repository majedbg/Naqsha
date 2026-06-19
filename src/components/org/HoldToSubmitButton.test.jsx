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

  it('Space does not fire an instant submit (bypasses 2s friction)', () => {
    const onConfirm = vi.fn();
    render(<HoldToSubmitButton onConfirm={onConfirm} holdMs={2000} />);
    const btn = screen.getByRole('button');

    act(() => {
      fireEvent.keyDown(btn, { key: ' ' });
    });
    expect(onConfirm).not.toHaveBeenCalled();

    // Enter still fires exactly once (no regression, no double-fire)
    act(() => {
      fireEvent.keyDown(btn, { key: 'Enter' });
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('exposes an accessible disabled reason when disabled + disabledReason set', () => {
    const reason = 'Pick a material before submitting';
    render(
      <HoldToSubmitButton
        onConfirm={() => {}}
        holdMs={2000}
        disabled
        disabledReason={reason}
      />,
    );
    const btn = screen.getByRole('button');

    // native disabled is preserved (existing contract)
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-disabled')).toBe('true');

    // the reason is associated via aria-describedby -> a hidden element with the text
    const describedBy = btn.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const desc = document.getElementById(describedBy);
    expect(desc).toBeTruthy();
    expect(desc.textContent).toContain(reason);
  });

  it('does not wire aria-disabled/describedby when not disabled or no reason', () => {
    const { rerender } = render(
      <HoldToSubmitButton onConfirm={() => {}} holdMs={2000} />,
    );
    let btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-disabled')).toBeNull();
    expect(btn.getAttribute('aria-describedby')).toBeNull();

    // disabled but no reason -> no describedby
    rerender(<HoldToSubmitButton onConfirm={() => {}} holdMs={2000} disabled />);
    btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-describedby')).toBeNull();
  });

  it('unmounting mid-hold does not fire a stray onConfirm', () => {
    const onConfirm = vi.fn();
    const { unmount } = render(
      <HoldToSubmitButton onConfirm={onConfirm} holdMs={2000} />,
    );
    const btn = screen.getByRole('button');

    act(() => {
      fireEvent.mouseDown(btn);
      vi.advanceTimersByTime(1000); // partway through the hold
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(5000); // blow past the original 2s
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('touch dedupe is time-bounded: a later genuine mousedown-hold still works', () => {
    const onConfirm = vi.fn();
    render(<HoldToSubmitButton onConfirm={onConfirm} holdMs={2000} />);
    const btn = screen.getByRole('button');

    // A touch tap fires immediately (and arms the dedupe guard).
    act(() => {
      fireEvent.touchStart(btn);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Well after the dedupe window, a real mousedown-hold (no preceding touch)
    // must NOT be swallowed — it should arm and fire after the full hold.
    act(() => {
      vi.advanceTimersByTime(1000); // past the short dedupe window
      fireEvent.mouseDown(btn);
      vi.advanceTimersByTime(2000);
    });
    expect(onConfirm).toHaveBeenCalledTimes(2);
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
