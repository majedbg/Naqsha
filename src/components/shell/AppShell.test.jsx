// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppShell, {
  MenuBarRegion,
  ControlBarRegion,
  ToolStripRegion,
  ObjectTreeRegion,
  CanvasRegion,
  InspectorRegion,
  OperationsPanelRegion,
  StatusBarRegion,
} from './AppShell';
import { SHELL_REGIONS } from './regions';

// Issue #2 (Lane B / B1): the pro app-shell is an empty, labeled set of eight
// region frames. AppShell itself is pure/presentational — no feature flag, no
// breakpoint logic — so these render tests are deterministic regardless of the
// matchMedia stub. Region labels double as the "empty labeled frame" contract
// and the test hooks (role="region" + aria-label).

const EXPECTED_LABELS = [
  'Menu bar',
  'Contextual control bar',
  'Tool strip',
  'Object tree',
  'Canvas',
  'Inspector',
  'Operations panel',
  'Status bar',
];

describe('AppShell (B1 empty pro-layout regions)', () => {
  it('mounts all eight labeled regions', () => {
    render(<AppShell />);
    const regions = screen.getAllByRole('region');
    expect(regions).toHaveLength(8);
    for (const label of EXPECTED_LABELS) {
      expect(
        screen.getByRole('region', { name: label })
      ).toBeInTheDocument();
    }
  });

  it('exposes the eight regions as the canonical SHELL_REGIONS list', () => {
    expect(SHELL_REGIONS).toEqual(EXPECTED_LABELS);
  });

  it('renders children inside the Canvas region', () => {
    render(
      <AppShell>
        <div data-testid="canvas-child">hosted studio</div>
      </AppShell>
    );
    const canvas = screen.getByRole('region', { name: 'Canvas' });
    expect(canvas).toContainElement(screen.getByTestId('canvas-child'));
  });

  it('exports each region as an independently mountable component', () => {
    // Later slices target exactly one region without touching the others, so
    // each region must render on its own.
    const cases = [
      [MenuBarRegion, 'Menu bar'],
      [ControlBarRegion, 'Contextual control bar'],
      [ToolStripRegion, 'Tool strip'],
      [ObjectTreeRegion, 'Object tree'],
      [CanvasRegion, 'Canvas'],
      [InspectorRegion, 'Inspector'],
      [OperationsPanelRegion, 'Operations panel'],
      [StatusBarRegion, 'Status bar'],
    ];
    for (const [Region, label] of cases) {
      const { unmount } = render(<Region />);
      expect(screen.getByRole('region', { name: label })).toBeInTheDocument();
      unmount();
    }
  });
});
