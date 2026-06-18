// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBar from './StatusBar';
import { getProfile, defaultBedSize } from '../../lib/machineProfiles';

// Issue #7 (Lane B / B4): the bottom status bar reports units, zoom %, the live
// cursor coordinates in the active unit, and the active material/bed. It is
// prop-driven so the interaction test can re-render with a new zoom and assert
// the zoom % text changes (the live p5/Studio path is not drivable in jsdom).

const baseProps = {
  unit: 'mm',
  zoom: 1,
  cursor: { x: 12, y: 34 },
  profileId: 'laser',
  bedSize: defaultBedSize('laser'),
};

describe('StatusBar (B4 — units, zoom, cursor, bed)', () => {
  it('shows the active unit', () => {
    render(<StatusBar {...baseProps} />);
    expect(screen.getByLabelText(/unit/i)).toHaveTextContent(/mm/i);
  });

  it('shows the zoom as a percentage', () => {
    render(<StatusBar {...baseProps} zoom={1} />);
    expect(screen.getByLabelText(/zoom/i)).toHaveTextContent('100%');
  });

  it('updates the zoom % when zoom changes (interaction contract)', () => {
    const { rerender } = render(<StatusBar {...baseProps} zoom={1} />);
    expect(screen.getByLabelText(/zoom/i)).toHaveTextContent('100%');
    rerender(<StatusBar {...baseProps} zoom={2} />);
    expect(screen.getByLabelText(/zoom/i)).toHaveTextContent('200%');
    rerender(<StatusBar {...baseProps} zoom={0.5} />);
    expect(screen.getByLabelText(/zoom/i)).toHaveTextContent('50%');
  });

  it('shows the live cursor X/Y in the active unit', () => {
    render(<StatusBar {...baseProps} cursor={{ x: 12.4, y: 34.6 }} />);
    const coords = screen.getByLabelText(/cursor/i);
    expect(coords).toHaveTextContent(/12/);
    expect(coords).toHaveTextContent(/34/);
    expect(coords).toHaveTextContent(/mm/i);
  });

  it('shows a placeholder when the cursor is off the canvas', () => {
    render(<StatusBar {...baseProps} cursor={null} />);
    const coords = screen.getByLabelText(/cursor/i);
    // Off-canvas reads as a dash rather than stale coords.
    expect(coords).toHaveTextContent(/[–-]/);
  });

  it('shows the active machine/bed', () => {
    render(<StatusBar {...baseProps} />);
    const bed = screen.getByLabelText(/bed|material|machine/i);
    expect(bed).toHaveTextContent(new RegExp(getProfile('laser').label, 'i'));
    // Bed dimensions surfaced (508 x 305 mm for laser).
    expect(bed).toHaveTextContent(/508/);
    expect(bed).toHaveTextContent(/305/);
  });

  it('reflects a different active profile bed', () => {
    render(
      <StatusBar
        {...baseProps}
        profileId="plotter"
        bedSize={defaultBedSize('plotter')}
      />
    );
    const bed = screen.getByLabelText(/bed|material|machine/i);
    expect(bed).toHaveTextContent(new RegExp(getProfile('plotter').label, 'i'));
    expect(bed).toHaveTextContent(/152/);
    expect(bed).toHaveTextContent(/203/);
  });
});
