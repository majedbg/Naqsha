// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { useState } from 'react';
import { StatusBarRegion } from './AppShell';
import { StatusBarSlotProvider, useStatusBarSlot } from './shellSlots';

// Issue #7 (Lane B / B4): the status bar is portaled into the shell's Status bar
// region through a new slot, mirroring the Inspector/Menu/ToolStrip/ControlBar/
// ObjectTree slots. Default null (no provider) → flag-OFF no-op.

function Consumer() {
  const slot = useStatusBarSlot();
  if (!slot) return <span data-testid="no-slot" />;
  return createPortal(<span data-testid="portaled-status">hi</span>, slot);
}

describe('StatusBar slot bridge (B4)', () => {
  it('useStatusBarSlot returns null with no provider (flag-OFF no-op)', () => {
    render(<Consumer />);
    expect(screen.getByTestId('no-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('portaled-status')).not.toBeInTheDocument();
  });

  it('StatusBarRegion exposes a contentRef mount node a consumer can portal into', () => {
    function Harness() {
      const [node, setNode] = useState(null);
      return (
        <>
          <StatusBarRegion contentRef={setNode} />
          <StatusBarSlotProvider value={node}>
            <Consumer />
          </StatusBarSlotProvider>
        </>
      );
    }
    render(<Harness />);
    const region = screen.getByRole('region', { name: 'Status bar' });
    expect(region).toContainElement(screen.getByTestId('portaled-status'));
  });
});
