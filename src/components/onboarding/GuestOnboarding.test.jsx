// Guest onboarding S2 — "Choose your naqsheh" starter-select chooser.
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GuestOnboarding from './GuestOnboarding';
import {
  isOnboardingDismissed,
  setOnboardingDismissed,
} from '../../lib/onboarding/dismissalStore';
import { DEFAULT_SEED_KEY, getSeedDocument } from '../../lib/onboarding/seedDocuments';
import { isModulationNudgeSeen, markModulationNudgeSeen } from '../../lib/onboarding/modulationNudgeStore';
import { markHeroCueSeen, isHeroCueSeen } from '../../lib/onboarding/heroCueStore';
import { markLensTipSeen, isLensTipSeen } from '../../lib/onboarding/lensTipStore';

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
    LENS_OPENED: 'onboarding:lens-opened',
    SECOND_PARAM_CHANGE: 'onboarding:second-param-change',
    NEW_SESSION: 'onboarding:new-session',
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

describe('GuestOnboarding — S5 Operation lens discoverability tip (D13/D17)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const LENS_TIP = () => screen.queryByTestId('guest-lens-tip');

  it('does not show the lens tip while the starter chooser is still open (avoids front-loading, D17)', () => {
    render(<GuestOnboarding isGuest onLoadSeed={vi.fn()} />);
    expect(CHOOSER()).toBeInTheDocument(); // chooser starts open
    expect(LENS_TIP()).not.toBeInTheDocument();
  });

  it('shows the lens tip once the chooser has been dismissed, for a guest who has not used the lens yet', () => {
    setOnboardingDismissed(true);
    render(<GuestOnboarding isGuest onLoadSeed={vi.fn()} lensTipUsed={false} />);
    expect(LENS_TIP()).toBeInTheDocument();
    expect(screen.getByText(/real fabrication file/i)).toBeInTheDocument();
  });

  it('does not show the lens tip once the guest has already used the lens this session (lensTipUsed=true)', () => {
    setOnboardingDismissed(true);
    render(<GuestOnboarding isGuest onLoadSeed={vi.fn()} lensTipUsed={true} />);
    expect(LENS_TIP()).not.toBeInTheDocument();
  });

  it('never shows the lens tip for a signed-in / non-guest user, even with the chooser dismissed', () => {
    setOnboardingDismissed(true);
    render(<GuestOnboarding isGuest={false} onLoadSeed={vi.fn()} lensTipUsed={false} />);
    expect(LENS_TIP()).not.toBeInTheDocument();
  });

  it('the tip\'s dismiss (×) button calls onDismissLensTip without touching the chooser/starter state', () => {
    setOnboardingDismissed(true);
    const onDismissLensTip = vi.fn();
    render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        lensTipUsed={false}
        onDismissLensTip={onDismissLensTip}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss lens tip/i }));
    expect(onDismissLensTip).toHaveBeenCalledTimes(1);
    // Purely a lens-tip concern — the chooser stays dismissed, no starter load fired.
    expect(isOnboardingDismissed()).toBe(true);
  });

  it('defaults lensTipUsed/onDismissLensTip so existing callers that omit them keep working (backward compatible)', () => {
    setOnboardingDismissed(true);
    expect(() => render(<GuestOnboarding isGuest onLoadSeed={vi.fn()} />)).not.toThrow();
    // Default lensTipUsed=false → tip shows; the default no-op dismiss handler must not throw.
    const dismissBtn = screen.queryByRole('button', { name: /dismiss lens tip/i });
    expect(dismissBtn).toBeInTheDocument();
    expect(() => fireEvent.click(dismissBtn)).not.toThrow();
  });
});

describe('GuestOnboarding — S6 modulation nudge (D17a/D22)', () => {
  const NUDGE = () => screen.queryByTestId('guest-modulation-nudge');

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not show after only ONE distinct param key changes (not "second change of the same key")', () => {
    setOnboardingDismissed(true);
    const { rerender } = render(
      <GuestOnboarding isGuest onLoadSeed={vi.fn()} activeLayer={ACTIVE_LAYER} onUpdateLayer={vi.fn()} />
    );
    expect(NUDGE()).not.toBeInTheDocument();

    // Same key ("angle") changes twice — still only ONE distinct key.
    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{ ...ACTIVE_LAYER, params: { ...ACTIVE_LAYER.params, angle: 137.6 } }}
        onUpdateLayer={vi.fn()}
      />
    );
    expect(NUDGE()).not.toBeInTheDocument();

    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{ ...ACTIVE_LAYER, params: { ...ACTIVE_LAYER.params, angle: 137.7 } }}
        onUpdateLayer={vi.fn()}
      />
    );
    expect(NUDGE()).not.toBeInTheDocument();
    expect(emitOnboardingEvent).not.toHaveBeenCalledWith(
      ONBOARDING_EVENTS.SECOND_PARAM_CHANGE,
      expect.anything()
    );
  });

  it('shows the nudge and emits SECOND_PARAM_CHANGE once a 2nd DISTINCT param key changes', () => {
    setOnboardingDismissed(true);
    // lensTipUsed=true — the lens tip is out of the way here (see the
    // dedicated mutual-exclusion suite below); this test is isolating nudge
    // logic only, same as `setOnboardingDismissed(true)` above is a
    // precondition rather than the thing under test.
    const { rerender } = render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );

    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{ ...ACTIVE_LAYER, params: { ...ACTIVE_LAYER.params, angle: 137.6 } }}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    expect(NUDGE()).not.toBeInTheDocument();

    // A DIFFERENT key changes — this is the 2nd distinct key.
    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{
          ...ACTIVE_LAYER,
          params: { ...ACTIVE_LAYER.params, angle: 137.6, minSize: 6 },
        }}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );

    expect(NUDGE()).toBeInTheDocument();
    expect(emitOnboardingEvent).toHaveBeenCalledWith(
      ONBOARDING_EVENTS.SECOND_PARAM_CHANGE,
      expect.objectContaining({ patternType: 'phyllotaxis' })
    );
    // Fired exactly once for this event, even though more re-renders may follow.
    expect(
      emitOnboardingEvent.mock.calls.filter((call) => call[0] === ONBOARDING_EVENTS.SECOND_PARAM_CHANGE)
    ).toHaveLength(1);
  });

  it('copy invites discovery — does NOT claim a live/running effect (D9 static-seed guard)', () => {
    setOnboardingDismissed(true);
    const { rerender } = render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{
          ...ACTIVE_LAYER,
          params: { ...ACTIVE_LAYER.params, angle: 137.6, minSize: 6 },
        }}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    expect(NUDGE()).toBeInTheDocument();
    // The banned claim from an earlier draft of the copy (there is no live
    // modulation running on a static seed, D9-fallback).
    expect(screen.queryByText(/glow follows your pattern/i)).not.toBeInTheDocument();
    // ...and never frames modulation as animation/self-movement (it's a spatial
    // warp between patterns, not motion on a static seed).
    expect(screen.queryByText(/move on its own/i)).not.toBeInTheDocument();
    expect(screen.getByText(/push and pull the other's lines/i)).toBeInTheDocument();
  });

  it('the nudge is a real, accessibly-named, dismissable <button> (no telemetry re-fire, chooser untouched)', () => {
    setOnboardingDismissed(true);
    const { rerender } = render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{
          ...ACTIVE_LAYER,
          params: { ...ACTIVE_LAYER.params, angle: 137.6, minSize: 6 },
        }}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    const dismissBtn = screen.getByRole('button', { name: /dismiss modulation nudge/i });
    expect(dismissBtn.tagName).toBe('BUTTON');

    fireEvent.click(dismissBtn);
    expect(NUDGE()).not.toBeInTheDocument();
    expect(isOnboardingDismissed()).toBe(true); // chooser dismissal state untouched by the nudge

    expect(
      emitOnboardingEvent.mock.calls.filter((call) => call[0] === ONBOARDING_EVENTS.SECOND_PARAM_CHANGE)
    ).toHaveLength(1); // dismissing does not re-fire telemetry
  });

  it('never shows for a signed-in / non-guest user, even after 2 distinct param changes', () => {
    const { rerender } = render(
      <GuestOnboarding
        isGuest={false}
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={vi.fn()}
      />
    );
    rerender(
      <GuestOnboarding
        isGuest={false}
        onLoadSeed={vi.fn()}
        activeLayer={{
          ...ACTIVE_LAYER,
          params: { ...ACTIVE_LAYER.params, angle: 137.6, minSize: 6 },
        }}
        onUpdateLayer={vi.fn()}
      />
    );
    expect(NUDGE()).not.toBeInTheDocument();
    expect(
      emitOnboardingEvent.mock.calls.filter((call) => call[0] === ONBOARDING_EVENTS.SECOND_PARAM_CHANGE)
    ).toHaveLength(0);
  });

  it('does not visually show while the chooser is still OPEN, even past the threshold (avoids front-loading, D17); appears once dismissed', () => {
    // Chooser starts open (not dismissed) — non-blocking, D2. lensTipUsed
    // is out of the way (true) so dismissing the chooser doesn't then hand
    // off to the mutually-exclusive lens tip instead — that hand-off is
    // covered by its own suite below.
    const { rerender } = render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    expect(CHOOSER()).toBeInTheDocument();

    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{
          ...ACTIVE_LAYER,
          params: { ...ACTIVE_LAYER.params, angle: 137.6, minSize: 6 },
        }}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    // Telemetry already fired (activation is a real event regardless of display)...
    expect(emitOnboardingEvent).toHaveBeenCalledWith(
      ONBOARDING_EVENTS.SECOND_PARAM_CHANGE,
      expect.anything()
    );
    // ...but the card itself waits for the chooser to close.
    expect(NUDGE()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /skip starter chooser/i }));
    expect(NUDGE()).toBeInTheDocument();
  });

  it('switching to a different seed (new activeLayer.id) resets the distinct-key count for the new seed', () => {
    setOnboardingDismissed(true);
    // lensTipUsed=true throughout — out of the way, see comment on the
    // mutual-exclusion suite below.
    const { rerender } = render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    // One distinct key changed on the FIRST seed.
    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{ ...ACTIVE_LAYER, params: { ...ACTIVE_LAYER.params, angle: 137.6 } }}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    expect(NUDGE()).not.toBeInTheDocument();

    // Guest picks a DIFFERENT starter — new layer id, fresh params (a real
    // document load, not a patch on the same layer).
    const NEW_SEED_LAYER = {
      id: 'layer-2-xyz',
      patternType: 'recursive',
      locked: false,
      params: { scaleFactor: 0.71, depth: 4, rotationPerLevel: 36, shape: 'pentagon' },
    };
    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={NEW_SEED_LAYER}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    expect(NUDGE()).not.toBeInTheDocument();

    // Only ONE distinct key changed so far on the NEW seed — must not fire
    // (the old seed's "angle" change must not carry over).
    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{ ...NEW_SEED_LAYER, params: { ...NEW_SEED_LAYER.params, scaleFactor: 0.75 } }}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    expect(NUDGE()).not.toBeInTheDocument();

    // A second distinct key on the NEW seed does fire.
    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{
          ...NEW_SEED_LAYER,
          params: { ...NEW_SEED_LAYER.params, scaleFactor: 0.75, depth: 5 },
        }}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    expect(NUDGE()).toBeInTheDocument();
  });

  it('fires at most once per session (sessionStorage-gated) — a Shuffle-style multi-key jump only triggers it once', () => {
    setOnboardingDismissed(true);
    // lensTipUsed=true — out of the way, see comment on the mutual-exclusion
    // suite below.
    const { rerender, unmount } = render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{
          ...ACTIVE_LAYER,
          params: { ...ACTIVE_LAYER.params, angle: 137.6, minSize: 6, maxSize: 44 },
        }}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    expect(NUDGE()).toBeInTheDocument();
    expect(isModulationNudgeSeen()).toBe(true);
    expect(
      emitOnboardingEvent.mock.calls.filter((call) => call[0] === ONBOARDING_EVENTS.SECOND_PARAM_CHANGE)
    ).toHaveLength(1);
    unmount();

    // A fresh mount within the SAME session (sessionStorage not cleared)
    // must never show or re-fire it again, even with an active layer already
    // past the threshold on first render.
    vi.clearAllMocks();
    render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{
          ...ACTIVE_LAYER,
          params: { ...ACTIVE_LAYER.params, angle: 137.6, minSize: 6, maxSize: 44 },
        }}
        onUpdateLayer={vi.fn()}
      />
    );
    expect(NUDGE()).not.toBeInTheDocument();
    expect(
      emitOnboardingEvent.mock.calls.filter((call) => call[0] === ONBOARDING_EVENTS.SECOND_PARAM_CHANGE)
    ).toHaveLength(0);
  });

  it('is a no-op (no crash) when there is no active layer', () => {
    setOnboardingDismissed(true);
    expect(() =>
      render(<GuestOnboarding isGuest onLoadSeed={vi.fn()} activeLayer={null} onUpdateLayer={vi.fn()} />)
    ).not.toThrow();
    expect(NUDGE()).not.toBeInTheDocument();
  });

  // Part B a11y sweep — unlike HeroDragCue's looping pulse (which branches in
  // JS via matchMedia), the nudge's ONE-SHOT entrance reuses the existing
  // `.anim-rise` utility (src/index.css), whose duration collapses to 0ms
  // under `prefers-reduced-motion: reduce` via the `--motion-*` CSS tokens
  // (styles/tokens.css) — the same mechanism already relied on by the gallery
  // cards / picker panels / ModulationParamBox reveal (naqsha-reveal-rows).
  // No JS branch is needed here, so this test just confirms reduced motion
  // never hides or breaks the nudge — the CSS collapse is a token-level
  // concern, not independently assertable from jsdom (no real animation
  // engine runs here).
  it('still renders (content + dismiss button) under prefers-reduced-motion, carrying the token-driven entrance class', () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));

    setOnboardingDismissed(true);
    // lensTipUsed=true — out of the way, see comment on the mutual-exclusion
    // suite below.
    const { rerender } = render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{
          ...ACTIVE_LAYER,
          params: { ...ACTIVE_LAYER.params, angle: 137.6, minSize: 6 },
        }}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );

    const nudge = NUDGE();
    expect(nudge).toBeInTheDocument();
    expect(nudge.className).toMatch(/anim-rise/);
    expect(screen.getByRole('button', { name: /dismiss modulation nudge/i })).toBeInTheDocument();
  });
});

// Opus review of S5/S6 — FIX 1 (SHOULD-FIX): the lens tip and the
// modulation nudge could both be visible at once (a guest who makes 2 param
// edits before ever clicking the Operation lens). FIX 2 (nit): Escape only
// dismissed the chooser, not the nudge/lens tip.
describe('GuestOnboarding — lens tip / modulation nudge mutual exclusion + Escape (Opus review fix)', () => {
  const LENS_TIP = () => screen.queryByTestId('guest-lens-tip');
  const NUDGE = () => screen.queryByTestId('guest-modulation-nudge');

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('suppresses the nudge while the lens tip is showing, and shows it once the lens tip is gone — without prematurely consuming the once-per-session flag', () => {
    setOnboardingDismissed(true);
    const { rerender } = render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={vi.fn()}
        lensTipUsed={false}
      />
    );
    expect(LENS_TIP()).toBeInTheDocument();
    expect(NUDGE()).not.toBeInTheDocument();

    // Cross the 2nd-distinct-param-change threshold while the lens tip is
    // still up.
    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{
          ...ACTIVE_LAYER,
          params: { ...ACTIVE_LAYER.params, angle: 137.6, minSize: 6 },
        }}
        onUpdateLayer={vi.fn()}
        lensTipUsed={false}
      />
    );
    // Activation is a real event regardless of display (telemetry fires
    // exactly like it does while the chooser is still open)...
    expect(emitOnboardingEvent).toHaveBeenCalledWith(
      ONBOARDING_EVENTS.SECOND_PARAM_CHANGE,
      expect.anything()
    );
    // ...but the nudge stays hidden — showing it now would overlap the lens
    // tip — and the once-per-session flag must NOT be burned while it's
    // suppressed (a reload here must still be able to show it later).
    expect(NUDGE()).not.toBeInTheDocument();
    expect(isModulationNudgeSeen()).toBe(false);

    // The lens tip goes away (guest engaged the lens, or dismissed the
    // tip) — the nudge now appears, and ONLY NOW is the flag persisted.
    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{
          ...ACTIVE_LAYER,
          params: { ...ACTIVE_LAYER.params, angle: 137.6, minSize: 6 },
        }}
        onUpdateLayer={vi.fn()}
        lensTipUsed={true}
      />
    );
    expect(LENS_TIP()).not.toBeInTheDocument();
    expect(NUDGE()).toBeInTheDocument();
    expect(isModulationNudgeSeen()).toBe(true);

    // Threshold activation telemetry did not re-fire for the hand-off.
    expect(
      emitOnboardingEvent.mock.calls.filter((call) => call[0] === ONBOARDING_EVENTS.SECOND_PARAM_CHANGE)
    ).toHaveLength(1);
  });

  it('Escape dismisses the modulation nudge when it is showing', () => {
    setOnboardingDismissed(true);
    const { rerender } = render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={ACTIVE_LAYER}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    rerender(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        activeLayer={{
          ...ACTIVE_LAYER,
          params: { ...ACTIVE_LAYER.params, angle: 137.6, minSize: 6 },
        }}
        onUpdateLayer={vi.fn()}
        lensTipUsed
      />
    );
    expect(NUDGE()).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(NUDGE()).not.toBeInTheDocument();
  });

  it('Escape dismisses the lens tip when it is showing', () => {
    setOnboardingDismissed(true);
    const onDismissLensTip = vi.fn();
    render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        lensTipUsed={false}
        onDismissLensTip={onDismissLensTip}
      />
    );
    expect(LENS_TIP()).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismissLensTip).toHaveBeenCalledTimes(1);
  });

  it('Escape does nothing (no throw, does not swallow) when no onboarding surface is open', () => {
    setOnboardingDismissed(true);
    const onDismissLensTip = vi.fn();
    render(
      <GuestOnboarding
        isGuest
        onLoadSeed={vi.fn()}
        lensTipUsed // lens tip already used/dismissed — nothing left open
        onDismissLensTip={onDismissLensTip}
      />
    );
    expect(LENS_TIP()).not.toBeInTheDocument();
    expect(NUDGE()).not.toBeInTheDocument();

    expect(() => fireEvent.keyDown(document, { key: 'Escape' })).not.toThrow();
    expect(onDismissLensTip).not.toHaveBeenCalled();
  });
});

describe('GuestOnboarding — P0-C "New session / hand to next person" (D18)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const NEW_SESSION_BUTTON = () =>
    screen.getByRole('button', { name: /start a new session/i });
  const CONFIRM_DIALOG = () => screen.queryByRole('alertdialog');

  it('renders the "New session" reset for a guest', () => {
    render(<GuestOnboarding isGuest onLoadSeed={vi.fn()} />);
    expect(NEW_SESSION_BUTTON()).toBeInTheDocument();
  });

  it('does not render the "New session" reset for a signed-in / non-guest user', () => {
    render(<GuestOnboarding isGuest={false} onLoadSeed={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /start a new session/i })).not.toBeInTheDocument();
  });

  it('a single click only ARMS the confirm dialog — does not reset anything yet', () => {
    const onLoadSeed = vi.fn();
    const onNewSession = vi.fn();
    setOnboardingDismissed(true);
    markHeroCueSeen('phyllotaxis');
    markLensTipSeen();
    markModulationNudgeSeen();

    render(<GuestOnboarding isGuest onLoadSeed={onLoadSeed} onNewSession={onNewSession} />);
    fireEvent.click(NEW_SESSION_BUTTON());

    expect(CONFIRM_DIALOG()).toBeInTheDocument();
    // Nothing has actually happened yet — a single accidental click must
    // never discard real work.
    expect(onLoadSeed).not.toHaveBeenCalled();
    expect(onNewSession).not.toHaveBeenCalled();
    expect(emitOnboardingEvent).not.toHaveBeenCalledWith(
      ONBOARDING_EVENTS.NEW_SESSION,
      expect.anything()
    );
    expect(isOnboardingDismissed()).toBe(true);
    expect(isHeroCueSeen('phyllotaxis')).toBe(true);
    expect(isLensTipSeen()).toBe(true);
    expect(isModulationNudgeSeen()).toBe(true);
  });

  it('Cancel aborts the reset — dialog closes, nothing changes', () => {
    const onLoadSeed = vi.fn();
    setOnboardingDismissed(true);
    markLensTipSeen();

    render(<GuestOnboarding isGuest onLoadSeed={onLoadSeed} />);
    fireEvent.click(NEW_SESSION_BUTTON());
    expect(CONFIRM_DIALOG()).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(CONFIRM_DIALOG()).not.toBeInTheDocument();
    expect(onLoadSeed).not.toHaveBeenCalled();
    expect(isOnboardingDismissed()).toBe(true);
    expect(isLensTipSeen()).toBe(true);
  });

  it('confirming clears every onboarding store, hands the DEFAULT seed to onNewSession (Studio does the full document reset + synchronous persist, P0-C), re-opens the chooser, and emits NEW_SESSION telemetry', () => {
    const onLoadSeed = vi.fn();
    const onNewSession = vi.fn();
    // Arrange every store as "dismissed/seen" — simulating a guest mid-session.
    setOnboardingDismissed(true);
    markHeroCueSeen('phyllotaxis');
    markHeroCueSeen('recursive');
    markLensTipSeen();
    markModulationNudgeSeen();

    render(
      <GuestOnboarding
        isGuest
        onLoadSeed={onLoadSeed}
        lensTipUsed
        onNewSession={onNewSession}
      />
    );
    expect(CHOOSER()).not.toBeInTheDocument(); // dismissed going in

    fireEvent.click(NEW_SESSION_BUTTON());
    fireEvent.click(screen.getByRole('button', { name: /start new session/i }));

    // The DEFAULT seed document is built ONCE here and handed to Studio via
    // onNewSession — Studio owns the full reset (layers/panels/glyphs/bg/opts/
    // history) AND the SYNCHRONOUS localStorage flush that closes the P0-C
    // reload race, since those pieces live in Studio-owned hooks. The starter
    // cards' onLoadSeed path is NOT used for the reset.
    expect(onNewSession).toHaveBeenCalledTimes(1);
    expect(withoutIds(onNewSession.mock.calls[0][0])).toEqual(
      withoutIds(getSeedDocument(DEFAULT_SEED_KEY))
    );
    expect(onLoadSeed).not.toHaveBeenCalled();

    // Every per-tab onboarding store cleared.
    expect(isOnboardingDismissed()).toBe(false);
    expect(isHeroCueSeen('phyllotaxis')).toBe(false);
    expect(isHeroCueSeen('recursive')).toBe(false);
    expect(isLensTipSeen()).toBe(false);
    expect(isModulationNudgeSeen()).toBe(false);

    // Chooser re-opened for the next attendee.
    expect(CHOOSER()).toBeInTheDocument();

    // Telemetry emitted.
    expect(emitOnboardingEvent).toHaveBeenCalledWith(ONBOARDING_EVENTS.NEW_SESSION);

    // Dialog closed itself.
    expect(CONFIRM_DIALOG()).not.toBeInTheDocument();
  });

  it('is a real, accessibly-named, keyboard-focusable <button> (not a div click handler)', () => {
    render(<GuestOnboarding isGuest onLoadSeed={vi.fn()} />);
    const btn = NEW_SESSION_BUTTON();
    expect(btn.tagName).toBe('BUTTON');
  });
});
