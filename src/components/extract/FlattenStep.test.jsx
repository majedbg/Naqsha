// @vitest-environment jsdom
//
// FlattenStep (S3, issue #52) — the manual 4-corner rectify UI: draggable
// corner handles over the photo (controlled quad — the S4 auto-detect seam),
// live convexity validation, the "already flat" escape hatch, and the
// before/after preview phase. Pointer math needs only a mocked
// getBoundingClientRect on the overlay; the warp itself is the parent's job
// (worker-side), so these tests stay pure UI.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FlattenStep, { DEFAULT_QUAD } from './FlattenStep';

const BOX = {
  left: 0,
  top: 0,
  width: 400,
  height: 300,
  right: 400,
  bottom: 300,
  x: 0,
  y: 0,
  toJSON() {},
};

function renderStep(overrides = {}) {
  const props = {
    imageURL: 'data:image/png;base64,orig',
    quad: DEFAULT_QUAD,
    onQuadChange: vi.fn(),
    rectifiedURL: null,
    flattening: false,
    onApply: vi.fn(),
    onSkip: vi.fn(),
    onBack: vi.fn(),
    onAdjust: vi.fn(),
    onContinue: vi.fn(),
    ...overrides,
  };
  render(<FlattenStep {...props} />);
  return props;
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(BOX);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FlattenStep — corner handles', () => {
  it('renders four handles at the quad corners', () => {
    renderStep();
    const tl = screen.getByRole('button', { name: /top-left corner/i });
    const br = screen.getByRole('button', { name: /bottom-right corner/i });
    expect(tl.style.left).toBe('12%');
    expect(tl.style.top).toBe('12%');
    expect(br.style.left).toBe('88%');
    expect(br.style.top).toBe('88%');
  });

  it('dragging a handle updates that corner (fractional coords)', () => {
    const { onQuadChange } = renderStep();
    const area = screen.getByTestId('flatten-area');
    const handle = screen.getByTestId('corner-handle-0');

    // Fired on the handle → bubbles to the overlay's pointer-down handler.
    fireEvent.pointerDown(handle, { clientX: 48, clientY: 36 });
    fireEvent.pointerMove(area, { clientX: 100, clientY: 60 });

    expect(onQuadChange).toHaveBeenCalled();
    const next = onQuadChange.mock.calls.at(-1)[0];
    expect(next[0].x).toBeCloseTo(100 / 400, 6);
    expect(next[0].y).toBeCloseTo(60 / 300, 6);
    // Other corners untouched.
    expect(next.slice(1)).toEqual(DEFAULT_QUAD.slice(1));
  });

  it('clamps dragged corners inside the image', () => {
    const { onQuadChange } = renderStep();
    const area = screen.getByTestId('flatten-area');
    fireEvent.pointerDown(screen.getByTestId('corner-handle-1'), { clientX: 352, clientY: 36 });
    fireEvent.pointerMove(area, { clientX: 900, clientY: -50 });
    const next = onQuadChange.mock.calls.at(-1)[0];
    expect(next[1]).toEqual({ x: 1, y: 0 });
  });

  it('ignores pointer-downs that are not on a handle', () => {
    const { onQuadChange } = renderStep();
    const area = screen.getByTestId('flatten-area');
    fireEvent.pointerDown(area, { clientX: 200, clientY: 150 });
    fireEvent.pointerMove(area, { clientX: 220, clientY: 160 });
    expect(onQuadChange).not.toHaveBeenCalled();
  });

  it('stops dragging on pointer-up', () => {
    const { onQuadChange } = renderStep();
    const area = screen.getByTestId('flatten-area');
    fireEvent.pointerDown(screen.getByTestId('corner-handle-2'), { clientX: 352, clientY: 264 });
    fireEvent.pointerUp(area);
    fireEvent.pointerMove(area, { clientX: 10, clientY: 10 });
    expect(onQuadChange).not.toHaveBeenCalled();
  });
});

describe('FlattenStep — validation + actions', () => {
  it('offers Back, skip, and Apply in the adjust phase', () => {
    const { onApply, onSkip, onBack } = renderStep();
    fireEvent.click(screen.getByRole('button', { name: /apply flatten/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip flatten/i }));
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('disables Apply and warns on a concave/crossed quad', () => {
    renderStep({
      quad: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.3, y: 0.3 }, // dented inward — concave
        { x: 0.1, y: 0.9 },
      ],
    });
    expect(screen.getByRole('button', { name: /apply flatten/i }).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/crossed or folded/i);
  });

  it('disables Apply while flattening', () => {
    renderStep({ flattening: true });
    expect(screen.getByRole('button', { name: /flattening/i }).disabled).toBe(true);
  });
});

// S4 (issue #53): when auto-detect pre-fills the corners, a confidence badge
// invites correction (editable proposal, locked decision 8); with no detection
// the plain manual instruction shows instead.
describe('FlattenStep — detection badge (S4)', () => {
  it('shows the plane-detected badge with rounded confidence', () => {
    renderStep({ confidence: 0.82 });
    const badge = screen.getByTestId('flatten-detection-badge');
    expect(badge.textContent).toMatch(/plane detected/i);
    expect(badge.textContent).toMatch(/adjust if needed/i);
    expect(badge.textContent).toMatch(/82%/);
  });

  it('shows the plain manual instruction when confidence is null', () => {
    renderStep({ confidence: null });
    expect(screen.queryByTestId('flatten-detection-badge')).toBeNull();
    expect(screen.getByText(/shot at an angle/i)).toBeTruthy();
  });
});

describe('FlattenStep — before/after preview phase', () => {
  it('shows before and after images with the rectified result', () => {
    renderStep({ rectifiedURL: 'data:image/png;base64,rect' });
    expect(screen.getByAltText(/original photo/i).src).toContain('base64,orig');
    expect(screen.getByAltText(/flattened photo/i).src).toContain('base64,rect');
    expect(screen.getByText(/^before$/i)).toBeTruthy();
    expect(screen.getByText(/after — flattened/i)).toBeTruthy();
  });

  it('wires Adjust corners / Use original / Continue', () => {
    const { onAdjust, onSkip, onContinue } = renderStep({
      rectifiedURL: 'data:image/png;base64,rect',
    });
    fireEvent.click(screen.getByRole('button', { name: /adjust corners/i }));
    fireEvent.click(screen.getByRole('button', { name: /use original/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onAdjust).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('hides the corner handles while previewing', () => {
    renderStep({ rectifiedURL: 'data:image/png;base64,rect' });
    expect(screen.queryByTestId('corner-handle-0')).toBeNull();
    expect(screen.queryByRole('button', { name: /apply flatten/i })).toBeNull();
  });
});
