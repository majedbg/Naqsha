// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudioRoute from './StudioRoute';

// Studio pulls p5 (and a CommonJS gif encoder) through RightPanel, which does
// not load under jsdom. Stub the canvas surface + auth so the *real* Studio
// renders its real chrome and we can drive a real interaction. Everything else
// in Studio is exercised unchanged.
vi.mock('../components/RightPanel', () => ({
  default: () => <div data-testid="canvas-surface">canvas</div>,
}));
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ loading: false, user: null }),
  AuthProvider: ({ children }) => children,
}));

// #16 (B7) decommissioned the legacy two-pane layout + the VITE_PRO_SHELL flag.
// StudioRoute is now: desktop (≥768px) → the pro shell with Studio in the canvas
// region; below the breakpoint → the simplified MobileStudio view (NOT the
// removed legacy layout). These tests assert that gate.
describe('StudioRoute desktop/mobile gate (B7 / #16)', () => {
  it('desktop (≥768px) renders the eight shell regions with Studio inside the canvas region', () => {
    render(
      <MemoryRouter>
        <StudioRoute />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('region')).toHaveLength(8);
    const canvas = screen.getByRole('region', { name: 'Canvas' });
    // Studio renders inside the Canvas region (probed via its canvas surface).
    const surface = screen.getByTestId('canvas-surface');
    expect(canvas).toContainElement(surface);
  });

  it('below the 768px breakpoint renders the simplified mobile view (no shell regions)', () => {
    const prevWidth = window.innerWidth;
    window.innerWidth = 500; // below the 768px md breakpoint
    try {
      render(
        <MemoryRouter>
          <StudioRoute />
        </MemoryRouter>
      );
      // MobileStudio (not the removed legacy two-pane): no AppShell regions, but
      // the live canvas surface is still present.
      expect(screen.queryAllByRole('region')).toHaveLength(0);
      expect(screen.getByTestId('canvas-surface')).toBeInTheDocument();
    } finally {
      window.innerWidth = prevWidth;
    }
  });
});
