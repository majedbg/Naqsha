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
  ONBOARDING_EVENTS: {
    STARTER_SELECTED: 'onboarding:starter-selected',
    SHUFFLE_CLICK: 'onboarding:shuffle-click',
  },
  emitOnboardingEvent: vi.fn(),
}));
import { emitOnboardingEvent, ONBOARDING_EVENTS } from '../../lib/onboarding/telemetry';

// S4 fixture — a minimal, real-shaped active layer (a guest's landed seed).
const ACTIVE_LAYER = {
  id: 'layer-1-abc',
  patternType: 'phyllotaxis',
  locked: false,
  params: { angle: 137.5, minSize: 4, maxSize: 40, strokeWeight: 1, symmetry: 1 },
};

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

  it('Escape closes the chooser like the skip button, even from cold focus (document-level listener)', () => {
    render(<GuestOnboarding isGuest onLoadSeed={vi.fn()} />);
    // Nothing inside the card has focus (no autofocus-on-open, by design —
    // this is a non-modal surface over a live canvas). Dispatching on
    // `document` itself (not the card div) exercises the real path: a
    // scoped document-level keydown listener, not React's bubble-phase
    // onKeyDown on the card.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(isOnboardingDismissed()).toBe(true);
    expect(CHOOSER()).not.toBeInTheDocument();
  });

  it('does not attach an Escape listener when there is no open chooser to dismiss (not a guest)', () => {
    render(<GuestOnboarding isGuest={false} onLoadSeed={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    // No chooser was ever open, so nothing should have been marked dismissed.
    expect(isOnboardingDismissed()).toBe(false);
  });

  it('stops attending to Escape once the chooser is dismissed or the component unmounts (no leaked listener)', () => {
    const { unmount } = render(<GuestOnboarding isGuest onLoadSeed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /skip starter chooser/i }));
    expect(CHOOSER()).not.toBeInTheDocument();

    // A second Escape after dismissal should be a harmless no-op (no error,
    // dismissal store already true, nothing left to close).
    expect(() => fireEvent.keyDown(document, { key: 'Escape' })).not.toThrow();

    unmount();
    expect(() => fireEvent.keyDown(document, { key: 'Escape' })).not.toThrow();
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

describe('GuestOnboarding — S4 "Surprise me" / Shuffle (D11)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const SHUFFLE_BUTTON = () => screen.queryByRole('button', { name: /surprise me/i });

  it('renders the Shuffle button for a guest', () => {
    render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={vi.fn()}
      />
    );
    const btn = SHUFFLE_BUTTON();
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe('BUTTON');
  });

  it('does not render the Shuffle button for a signed-in / non-guest user', () => {
    render(
      <GuestOnboarding
        isGuest={false}
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={vi.fn()}
      />
    );
    expect(SHUFFLE_BUTTON()).not.toBeInTheDocument();
  });

  it('remains available after the chooser is dismissed', () => {
    setOnboardingDismissed(true);
    render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={vi.fn()}
      />
    );
    expect(CHOOSER()).not.toBeInTheDocument();
    expect(SHUFFLE_BUTTON()).toBeInTheDocument();
  });

  it('clicking Shuffle re-rolls the active layer\'s params (honoring RANDOMIZE_EXCLUDED_KEYS, hero in golden band), never touches patternType, and emits telemetry', () => {
    const onUpdateLayer = vi.fn();
    render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={onUpdateLayer}
      />
    );

    fireEvent.click(SHUFFLE_BUTTON());

    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [id, patch] = onUpdateLayer.mock.calls[0];
    expect(id).toBe(ACTIVE_LAYER.id);
    expect(patch).not.toHaveProperty('patternType');
    expect(patch.params).toBeDefined();
    // Excluded keys untouched.
    expect(patch.params.strokeWeight).toBe(ACTIVE_LAYER.params.strokeWeight);
    expect(patch.params.symmetry).toBe(ACTIVE_LAYER.params.symmetry);
    // Hero param (phyllotaxis -> angle) lands in the curated golden band.
    expect(patch.params.angle).toBeGreaterThanOrEqual(137.2);
    expect(patch.params.angle).toBeLessThanOrEqual(137.9);

    expect(emitOnboardingEvent).toHaveBeenCalledWith(
      ONBOARDING_EVENTS.SHUFFLE_CLICK,
      expect.objectContaining({ patternType: 'phyllotaxis' })
    );
  });

  it('clicking Shuffle does not touch the onboarding dismissal/chooser state', () => {
    render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={vi.fn()}
      />
    );
    expect(CHOOSER()).toBeInTheDocument(); // starts open (not dismissed)
    fireEvent.click(SHUFFLE_BUTTON());
    expect(CHOOSER()).toBeInTheDocument(); // Shuffle never dismisses/opens the chooser
    expect(isOnboardingDismissed()).toBe(false);
  });

  it('is a no-op (no crash, no telemetry) when there is no active layer', () => {
    const onUpdateLayer = vi.fn();
    render(
      <GuestOnboarding isGuest onLoadSeed={vi.fn()} activeLayer={null} onUpdateLayer={onUpdateLayer} />
    );
    expect(() => fireEvent.click(SHUFFLE_BUTTON())).not.toThrow();
    expect(onUpdateLayer).not.toHaveBeenCalled();
    expect(emitOnboardingEvent).not.toHaveBeenCalled();
  });

  it('D12 — the "S" key triggers Shuffle for a guest', () => {
    const onUpdateLayer = vi.fn();
    render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={onUpdateLayer}
      />
    );
    fireEvent.keyDown(document, { key: 's' });
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'S' });
    expect(onUpdateLayer).toHaveBeenCalledTimes(2);
  });

  it('D12 — the "S" shortcut is ignored while a text-entry surface is focused', () => {
    const onUpdateLayer = vi.fn();
    render(
      <div>
        <input type="text" data-testid="text-field" />
        <GuestOnboarding
          isGuest
          onLoadSeed={vi.fn()}
          activeLayer={ACTIVE_LAYER}
          onUpdateLayer={onUpdateLayer}
        />
      </div>
    );
    const input = screen.getByTestId('text-field');
    input.focus();
    fireEvent.keyDown(input, { key: 's' });
    expect(onUpdateLayer).not.toHaveBeenCalled();
  });

  it('D12 — the "S" shortcut is ignored when a modifier is held (never hijacks Cmd/Ctrl+S)', () => {
    const onUpdateLayer = vi.fn();
    render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={onUpdateLayer}
      />
    );
    fireEvent.keyDown(document, { key: 's', metaKey: true });
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    expect(onUpdateLayer).not.toHaveBeenCalled();
  });

  it('D12 — the "S" shortcut does nothing for a signed-in / non-guest user', () => {
    const onUpdateLayer = vi.fn();
    render(
      <GuestOnboarding
        isGuest={false}
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={onUpdateLayer}
      />
    );
    fireEvent.keyDown(document, { key: 's' });
    expect(onUpdateLayer).not.toHaveBeenCalled();
  });

  // Opus review of 1784d89 (S4 Shuffle) — FIX 1 (SHOULD-FIX): holding "S"
  // fires auto-repeat keydowns (~30/sec), flooding telemetry + canvas regen.
  it('D12 — an auto-repeat "S" keydown (holding the key) does not trigger Shuffle or telemetry', () => {
    const onUpdateLayer = vi.fn();
    render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={onUpdateLayer}
      />
    );
    fireEvent.keyDown(document, { key: 's', repeat: true });
    expect(onUpdateLayer).not.toHaveBeenCalled();
    expect(emitOnboardingEvent).not.toHaveBeenCalled();

    // A genuine (non-repeat) press still works right after.
    fireEvent.keyDown(document, { key: 's' });
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
  });

  // FIX 2 (NIT): isTextEntryTarget deliberately excludes <select> (no native
  // text cursor/undo — see typingGuard.js), but a focused <select> still has
  // browser type-ahead: pressing "s" there should not also fire Shuffle.
  it('D12 — the "S" shortcut is ignored while a native <select> is focused (type-ahead)', () => {
    const onUpdateLayer = vi.fn();
    render(
      <div>
        <select data-testid="select-field">
          <option value="a">a</option>
          <option value="s">s</option>
        </select>
        <GuestOnboarding
          isGuest
          onLoadSeed={vi.fn()}
          activeLayer={ACTIVE_LAYER}
          onUpdateLayer={onUpdateLayer}
        />
      </div>
    );
    const select = screen.getByTestId('select-field');
    select.focus();
    fireEvent.keyDown(select, { key: 's' });
    expect(onUpdateLayer).not.toHaveBeenCalled();
  });

  // FIX 3 (NIT): the button silently no-op'd when locked but stayed enabled
  // with no feedback. It must now be disabled (with a11y `disabled`
  // attribute) and the shortcut must remain a no-op, for both a locked
  // active layer and no active layer at all.
  it('the Shuffle button is disabled (a11y) and the "S" shortcut is a no-op when the active layer is locked', () => {
    const onUpdateLayer = vi.fn();
    const lockedLayer = { ...ACTIVE_LAYER, locked: true };
    render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={lockedLayer}
        onUpdateLayer={onUpdateLayer}
      />
    );
    const btn = SHUFFLE_BUTTON();
    expect(btn).toBeDisabled();

    fireEvent.keyDown(document, { key: 's' });
    expect(onUpdateLayer).not.toHaveBeenCalled();
    expect(emitOnboardingEvent).not.toHaveBeenCalled();
  });

  it('the Shuffle button is disabled (a11y) when there is no active layer', () => {
    render(
      <GuestOnboarding isGuest onLoadSeed={vi.fn()} activeLayer={null} onUpdateLayer={vi.fn()} />
    );
    expect(SHUFFLE_BUTTON()).toBeDisabled();
  });
});
