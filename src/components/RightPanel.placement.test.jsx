// @vitest-environment jsdom
//
// Click-to-place wiring on the canvas overlay. The centring MATH is proven in
// lib/scene/placement.test.js; this covers the RightPanel side: the armed-mode
// prompt + ghost render, the overlay routes a click to onPlaceAsset, and Cancel
// aborts. (jsdom reports zero-size rects, so the click POINT is not asserted
// here — the placement unit test owns the geometry.)

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// useCanvas pulls in p5 (→ gifenc, a CJS/ESM interop hazard in the test env) and
// drives a real p5 sketch we don't need here. Stub it to an inert instance map so
// the test exercises RightPanel's own placement wiring, not the canvas renderer.
vi.mock('../lib/useCanvas', () => ({ default: () => ({ patternInstances: {} }) }));

const { default: RightPanel } = await import('./RightPanel.jsx');
const { parseForPlacement } = await import('../lib/scene/placement.js');

const ASSET_SVG =
  '<svg viewBox="0 0 100 100"><path d="M 0 0 L 100 0 L 100 100 L 0 100 Z"/></svg>';

function baseProps(overrides = {}) {
  return {
    layers: [],
    canvasW: 384,
    canvasH: 384,
    bgColor: '#ffffff',
    ...overrides,
  };
}

describe('RightPanel click-to-place', () => {
  it('renders neither prompt nor ghost when no placement is armed', () => {
    render(<RightPanel {...baseProps()} />);
    expect(screen.queryByTestId('placement-banner')).toBeNull();
    expect(screen.queryByTestId('placement-ghost')).toBeNull();
  });

  it('shows the prompt + ghost when a placement is armed', () => {
    const placement = parseForPlacement(ASSET_SVG);
    render(<RightPanel {...baseProps({ placement })} />);
    expect(screen.getByTestId('placement-banner')).toBeInTheDocument();
    expect(screen.getByText(/click to place object on canvas/i)).toBeInTheDocument();
    expect(screen.getByTestId('placement-ghost')).toBeInTheDocument();
  });

  it('routes a click on the canvas overlay to onPlaceAsset', () => {
    const placement = parseForPlacement(ASSET_SVG);
    const onPlaceAsset = vi.fn();
    render(<RightPanel {...baseProps({ placement, onPlaceAsset })} />);
    fireEvent.pointerDown(screen.getByTestId('select-overlay'), { button: 0 });
    expect(onPlaceAsset).toHaveBeenCalledTimes(1);
    expect(onPlaceAsset.mock.calls[0][0]).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
    });
  });

  it('Cancel button aborts placement', () => {
    const placement = parseForPlacement(ASSET_SVG);
    const onCancelPlacement = vi.fn();
    render(<RightPanel {...baseProps({ placement, onCancelPlacement })} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancelPlacement).toHaveBeenCalledTimes(1);
  });

  it('a non-primary button does not place', () => {
    const placement = parseForPlacement(ASSET_SVG);
    const onPlaceAsset = vi.fn();
    render(<RightPanel {...baseProps({ placement, onPlaceAsset })} />);
    fireEvent.pointerDown(screen.getByTestId('select-overlay'), { button: 2 });
    expect(onPlaceAsset).not.toHaveBeenCalled();
  });
});
