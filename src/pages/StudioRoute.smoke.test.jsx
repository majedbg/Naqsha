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

// B1 smoke: an existing Studio interaction still works while Studio is hosted
// inside the pro-shell canvas region. The Examples button is a real Studio
// control that toggles its own aria-pressed state.
describe('StudioRoute smoke — Studio interaction inside the shell', () => {
  it('toggles the Examples button (real Studio state) while mounted in the shell', () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    const examples = screen.getByRole('button', { name: /Examples/ });
    expect(examples).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(examples);
    expect(examples).toHaveAttribute('aria-pressed', 'true');
  });
});
