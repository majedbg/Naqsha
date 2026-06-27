// @vitest-environment jsdom
//
// RightPanel ↔ 3D preview mount wiring (S1, PRD D1). Verifies the lazy host
// mounts ONLY when a sub-mode is active and that the p5 surface is HIDDEN (not
// unmounted) while 3D is up — and that 'off' is byte-identical to before.
//
// Canvas3DHost is MOCKED to a sentinel: rendering the real host would React.lazy
// → Scene3D → three.js → attempt a WebGL <Canvas> render, which jsdom can't do
// (and the slice rules forbid). The lazy boundary + code-split is verified at
// build time (separate chunk), not here.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../lib/useCanvas', () => ({ default: () => ({ patternInstances: {} }) }));
vi.mock('./canvas3d/Canvas3DHost', () => ({
  default: ({ mode, focusFieldLayerId }) => (
    <div
      data-testid="canvas3d-host-mock"
      data-mode={mode}
      data-focus-field={focusFieldLayerId ?? ''}
    />
  ),
}));

const { default: RightPanel } = await import('./RightPanel.jsx');

function baseProps(overrides = {}) {
  return {
    layers: [],
    canvasW: 384,
    canvasH: 384,
    bgColor: '#ffffff',
    ...overrides,
  };
}

describe('RightPanel 3D mount wiring', () => {
  it('does not mount the 3D host when threeDMode is off (default)', () => {
    render(<RightPanel {...baseProps()} />);
    expect(screen.queryByTestId('canvas3d-host')).toBeNull();
    expect(screen.queryByTestId('canvas3d-host-mock')).toBeNull();
  });

  it('leaves the p5 surface visible (no inline visibility) when off', () => {
    render(<RightPanel {...baseProps()} />);
    const box = screen.getByTestId('canvas-scaled-box');
    // 'off' must be byte-identical: no visibility key applied.
    expect(box.style.visibility).toBe('');
  });

  it('mounts the 3D host when a sub-mode is active', () => {
    render(<RightPanel {...baseProps({ threeDMode: 'panel-stack' })} />);
    expect(screen.getByTestId('canvas3d-host')).toBeInTheDocument();
    expect(screen.getByTestId('canvas3d-host-mock')).toBeInTheDocument();
  });

  it('hides (not unmounts) the p5 surface while 3D is active', () => {
    render(<RightPanel {...baseProps({ threeDMode: 'panel-stack' })} />);
    const box = screen.getByTestId('canvas-scaled-box');
    expect(box.style.visibility).toBe('hidden');
    // Hidden, NOT removed — the p5 box is still in the DOM.
    expect(box).toBeInTheDocument();
  });

  it('forwards mode + focusFieldLayerId to the host (Surface B)', () => {
    render(
      <RightPanel
        {...baseProps({ threeDMode: 'height-surface', focusFieldLayerId: 'guide-9' })}
      />,
    );
    const host = screen.getByTestId('canvas3d-host-mock');
    expect(host).toHaveAttribute('data-mode', 'height-surface');
    expect(host).toHaveAttribute('data-focus-field', 'guide-9');
  });
});
