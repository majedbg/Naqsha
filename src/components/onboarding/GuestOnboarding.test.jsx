// Guest onboarding S2 — "Choose your naqsheh" starter-select chooser.
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GuestOnboarding from './GuestOnboarding';
import {
  isOnboardingDismissed,
  setOnboardingDismissed,
} from '../../lib/onboarding/dismissalStore';
import { getSeedDocument } from '../../lib/onboarding/seedDocuments';

// `getSeedDocument` builds on `createLayer`, which assigns a fresh random id
// per call (by design — see seedDocuments.js), so two independent calls for
// the same seed key are structurally identical but never id-equal. Strip the
// id before comparing so these assertions check "loaded the right seed",
// not "got the exact same object instance".
function withoutIds(layers) {
  return layers.map(({ id, ...rest }) => rest);
}

vi.mock('../../lib/onboarding/telemetry', () => ({
  ONBOARDING_EVENTS: { STARTER_SELECTED: 'onboarding:starter-selected' },
  emitOnboardingEvent: vi.fn(),
}));
import { emitOnboardingEvent, ONBOARDING_EVENTS } from '../../lib/onboarding/telemetry';

// The chooser card is deliberately NOT a landmark role (see GuestOnboarding.jsx
// for why: `dialog` collides with the app's real dialogs, `region` collides
// with AppShell's fixed 8-region layout count in other test files) — queried
// by its stable data-testid instead.
const CHOOSER = () => screen.queryByTestId('guest-onboarding-chooser');

describe('GuestOnboarding (S2)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing at all for a signed-in / non-guest user', () => {
    render(<GuestOnboarding isGuest={false} onLoadSeed={vi.fn()} />);
    expect(CHOOSER()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reopen starter guide/i })).not.toBeInTheDocument();
  });

  it('renders the chooser for a guest who has not dismissed it', () => {
    render(<GuestOnboarding isGuest onLoadSeed={vi.fn()} />);
    expect(CHOOSER()).toBeInTheDocument();
    expect(CHOOSER()).toHaveAttribute('aria-label', 'Choose your naqsheh');
    // The confidence line (D16) is present verbatim.
    expect(screen.getByText(/this is your naqsheh/i)).toBeInTheDocument();
    expect(screen.getByText(/⌘z undoes it/i)).toBeInTheDocument();
    // All three starters are offered.
    expect(screen.getByRole('button', { name: /choose phyllotaxis/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose recursive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose topographic/i })).toBeInTheDocument();
  });

  it('does not render the chooser when already dismissed this session, but keeps the reopen affordance', () => {
    setOnboardingDismissed(true);
    render(<GuestOnboarding isGuest onLoadSeed={vi.fn()} />);
    expect(CHOOSER()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reopen starter guide/i })).toBeInTheDocument();
  });

  it('picking a starter loads its seed document, dismisses the chooser, and emits telemetry', () => {
    const onLoadSeed = vi.fn();
    render(<GuestOnboarding isGuest onLoadSeed={onLoadSeed} />);

    fireEvent.click(screen.getByRole('button', { name: /choose recursive/i }));

    expect(onLoadSeed).toHaveBeenCalledTimes(1);
    expect(withoutIds(onLoadSeed.mock.calls[0][0])).toEqual(withoutIds(getSeedDocument('recursive')));
    expect(isOnboardingDismissed()).toBe(true);
    expect(CHOOSER()).not.toBeInTheDocument();
    expect(emitOnboardingEvent).toHaveBeenCalledWith(
      ONBOARDING_EVENTS.STARTER_SELECTED,
      expect.objectContaining({ seedKey: 'recursive' })
    );
  });

  it('picking the default (phyllotaxis) starter is a valid choice too (reload/confirm)', () => {
    const onLoadSeed = vi.fn();
    render(<GuestOnboarding isGuest onLoadSeed={onLoadSeed} />);
    fireEvent.click(screen.getByRole('button', { name: /choose phyllotaxis/i }));
    expect(withoutIds(onLoadSeed.mock.calls[0][0])).toEqual(withoutIds(getSeedDocument('phyllotaxis')));
    expect(isOnboardingDismissed()).toBe(true);
  });

  it('the dismiss (skip) button closes the chooser without touching the current document', () => {
    const onLoadSeed = vi.fn();
    render(<GuestOnboarding isGuest onLoadSeed={onLoadSeed} />);
    fireEvent.click(screen.getByRole('button', { name: /skip starter chooser/i }));
    expect(onLoadSeed).not.toHaveBeenCalled();
    expect(isOnboardingDismissed()).toBe(true);
    expect(CHOOSER()).not.toBeInTheDocument();
  });

  it('Escape closes the chooser like the skip button', () => {
    render(<GuestOnboarding isGuest onLoadSeed={vi.fn()} />);
    fireEvent.keyDown(CHOOSER(), { key: 'Escape' });
    expect(isOnboardingDismissed()).toBe(true);
    expect(CHOOSER()).not.toBeInTheDocument();
  });

  it('the "?" reopen affordance clears dismissal and re-shows the chooser', () => {
    setOnboardingDismissed(true);
    render(<GuestOnboarding isGuest onLoadSeed={vi.fn()} />);
    expect(CHOOSER()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reopen starter guide/i }));

    expect(CHOOSER()).toBeInTheDocument();
    expect(isOnboardingDismissed()).toBe(false);
  });

  it('starter card buttons are real, accessibly-named <button> elements (keyboard focusable)', () => {
    render(<GuestOnboarding isGuest onLoadSeed={vi.fn()} />);
    for (const name of [/choose phyllotaxis/i, /choose recursive/i, /choose topographic/i]) {
      const btn = screen.getByRole('button', { name });
      expect(btn.tagName).toBe('BUTTON');
    }
  });
});
