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

describe('StudioRoute flag gate (B1)', () => {
  it('flag OFF renders the legacy Studio layout untouched (no shell regions)', () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={false} />
      </MemoryRouter>
    );
    // Legacy layout has no role="region" shell frames.
    expect(screen.queryAllByRole('region')).toHaveLength(0);
    // The real Studio chrome is present.
    expect(
      screen.getByRole('button', { name: /Examples/ })
    ).toBeInTheDocument();
    expect(screen.getByTestId('canvas-surface')).toBeInTheDocument();
  });

  it('flag ON but below the desktop breakpoint falls through to legacy Studio (no shell regions)', () => {
    const prevWidth = window.innerWidth;
    window.innerWidth = 500; // below the 768px md breakpoint
    try {
      render(
        <MemoryRouter>
          <StudioRoute proShell={true} />
        </MemoryRouter>
      );
      expect(screen.queryAllByRole('region')).toHaveLength(0);
      expect(
        screen.getByRole('button', { name: /Examples/ })
      ).toBeInTheDocument();
    } finally {
      window.innerWidth = prevWidth;
    }
  });

  it('flag ON renders the eight shell regions with Studio inside the canvas region', () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('region')).toHaveLength(8);
    const canvas = screen.getByRole('region', { name: 'Canvas' });
    // The existing Studio renders inside the Canvas region. (Originally this
    // probed Studio's loose Examples button; #8 folds that button into the File
    // menu and suppresses the legacy loose top bar in the shell, so we assert
    // the invariant — Studio-in-canvas — via its canvas surface instead.)
    const surface = screen.getByTestId('canvas-surface');
    expect(canvas).toContainElement(surface);
  });
});
