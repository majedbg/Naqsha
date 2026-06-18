// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudioRoute from './StudioRoute';

vi.mock('../components/RightPanel', () => ({
  default: () => <div data-testid="canvas-surface">canvas</div>,
}));
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ loading: false, user: null }),
  AuthProvider: ({ children }) => children,
}));

// Smoke: a real Studio state change still works through the shell's integrated
// chrome. (Originally this toggled Studio's loose Examples button's aria-pressed;
// #8 folds Examples into the shell's File menu, so we drive the real interaction
// through the portaled menu instead — File → Examples — and assert the real
// ExamplesGallery opens. Same invariant, new surface.)
describe('StudioRoute smoke — Studio interaction inside the shell', () => {
  it('opens Examples via the shell File menu (real Studio state) while mounted in the shell', () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    // Examples gallery is closed initially.
    expect(
      screen.queryByRole('button', { name: 'Close examples' })
    ).not.toBeInTheDocument();
    // Open the File menu in the shell's menu bar, then choose Examples.
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Examples' }));
    // Real Studio state flipped (showExamples → true) → ExamplesGallery rendered.
    expect(
      screen.getByRole('button', { name: 'Close examples' })
    ).toBeInTheDocument();
  });
});
