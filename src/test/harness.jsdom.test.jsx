// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ThemeToggle from '../components/ui/ThemeToggle';

// jsdom smoke test (AR-P0): proves the per-file `@vitest-environment jsdom`
// override works and that React Testing Library can render an app component.
describe('test harness (jsdom)', () => {
  it('renders ThemeToggle with an accessible toggle label', () => {
    render(<ThemeToggle />);
    // Defaults to light theme, so the button offers to switch to dark.
    expect(
      screen.getByRole('button', { name: 'Switch to dark' })
    ).toBeInTheDocument();
  });
});
