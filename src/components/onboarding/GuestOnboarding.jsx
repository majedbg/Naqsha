// Guest onboarding S2 — "Choose your naqsheh" starter-select chooser.
//
// A floating, NON-BLOCKING first-run surface (D1/D2): guests already land on
// the default Phyllotaxis seed (S1's `initialSeedLayers` guest branch), so
// this component never gates the canvas — it is a dismissable card that
// floats over an already-alive document. Picking a card swaps the CURRENT
// document to a different starter; skipping just keeps the default.
//
// Ownership: this component is the single owner of the open/dismissed state
// for both the chooser card AND the persistent "?" re-open affordance (D4),
// so Studio only has to render one component and never has to coordinate the
// two surfaces itself. `isGuest` is computed by the caller (Studio mirrors
// the same `!user && tier === 'guest'` guard S1 uses for the seed default, to
// avoid a loading-flash chooser for a signed-in user — see seedDocuments
// wiring in Studio.jsx) — this component just trusts it.
import { useCallback, useState } from 'react';
import {
  DEFAULT_SEED_KEY,
  SEED_KEYS,
  getSeedDocument,
} from '../../lib/onboarding/seedDocuments';
import {
  isOnboardingDismissed,
  setOnboardingDismissed,
} from '../../lib/onboarding/dismissalStore';
import { emitOnboardingEvent, ONBOARDING_EVENTS } from '../../lib/onboarding/telemetry';

// D16 confidence line — naqsheh metaphor + reversibility. Copy is LOCKED
// verbatim (BUILD BRIEF). "naqsheh" is metaphor copy only here, never a UI
// noun elsewhere (D25).
const CONFIDENCE_LINE =
  "This is your naqsheh — the sheet the machine weaves. Nudge anything; ⌘Z undoes it. You can't break it.";

// Static v1 copy per starter (BUILD BRIEF "three starters", D6). No live
// thumbnail render in v1 — a static glyph + one-word character label + a
// short human description is enough for the Pokémon-starter feel.
const STARTER_COPY = {
  phyllotaxis: {
    glyph: '\u{1F33B}', // sunflower — spiral phyllotaxis
    name: 'Phyllotaxis',
    character: 'Organic',
    description: 'Spiraling seed heads, golden-angle turns. Forgiving and always alive.',
  },
  recursive: {
    glyph: '\u{1F53A}', // pentagon-ish triangle glyph, geometric feel
    name: 'Recursive',
    character: 'Geometric',
    description: 'Nested shapes folding into themselves. Crisp, structured, exact.',
  },
  topographic: {
    glyph: '\u{1F5FA}️', // map
    name: 'Topographic',
    character: 'Flowing',
    description: 'Contour lines like terrain. Slow drift, quiet and organic-machined.',
  },
};

function StarterCard({ seedKey, onSelect }) {
  const copy = STARTER_COPY[seedKey];
  return (
    <button
      type="button"
      onClick={() => onSelect(seedKey)}
      aria-label={`Choose ${copy.name} — ${copy.character} starter`}
      className="flex flex-1 flex-col items-center gap-1 rounded-md border border-hairline bg-paper-warm px-2 py-2.5 text-center transition-colors hover:border-violet/60 hover:bg-paper"
    >
      <span className="text-xl leading-none" aria-hidden>
        {copy.glyph}
      </span>
      <span className="text-[11px] font-semibold text-ink">{copy.name}</span>
      <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-violet/80">
        {copy.character}
      </span>
      <span className="text-[10px] leading-snug text-ink-soft">{copy.description}</span>
    </button>
  );
}

export default function GuestOnboarding({ isGuest, onLoadSeed }) {
  // Lazy init reads sessionStorage once on mount (matches the dismissal
  // store's own per-tab semantics) — a fresh page load re-evaluates this and
  // naturally re-shows the chooser (D3).
  const [dismissed, setDismissed] = useState(() => isOnboardingDismissed());

  const handleDismiss = useCallback(() => {
    setOnboardingDismissed(true);
    setDismissed(true);
  }, []);

  const handleReopen = useCallback(() => {
    setOnboardingDismissed(false);
    setDismissed(false);
  }, []);

  const handleSelect = useCallback(
    (seedKey) => {
      onLoadSeed?.(getSeedDocument(seedKey));
      setOnboardingDismissed(true);
      setDismissed(true);
      emitOnboardingEvent(ONBOARDING_EVENTS.STARTER_SELECTED, { seedKey });
    },
    [onLoadSeed]
  );

  const handleKeyDown = useCallback(
    (e) => {
      // Escape closes the chooser. Scoped to this component's own subtree
      // (not a global window listener) so it can never race or double-fire
      // against Studio's existing Escape handling (e.g. the armed-placement
      // Esc-to-cancel) — it only ever sees keydowns that bubble from inside
      // this card.
      if (e.key === 'Escape') handleDismiss();
    },
    [handleDismiss]
  );

  if (!isGuest) return null;

  return (
    <>
      {/* Persistent re-open affordance (D4). Always present for guests, even
          after dismissal, so the chooser is recoverable. Small + unobtrusive
          — bottom-right of the canvas region, out of the way of the
          cut/engrave lens (bottom-left) and the panels export button
          (top-right). */}
      <button
        type="button"
        onClick={handleReopen}
        aria-label="Reopen starter guide"
        title="Choose a starting pattern"
        // Top-left of the canvas region is the one corner nothing else
        // claims (ColorViewControl owns bottom-left, the zoom pod owns
        // bottom-right, the laser-only panels-ZIP export owns top-right) —
        // keeps this persistent affordance visible but out of the way of
        // every other floating control instead of crowding the zoom pod.
        className="absolute top-3 left-3 z-40 flex h-7 w-7 items-center justify-center rounded-full border border-hairline bg-paper/95 text-xs font-semibold text-ink-soft shadow-pop backdrop-blur-[2px] transition-colors hover:border-violet/60 hover:text-ink"
      >
        ?
      </button>

      {!dismissed && (
        <div
          // Deliberately NO landmark role (not `dialog`, not `region`) — D2 is
          // explicit that this must never read as a modal (screen readers
          // announce "dialog" as a distinct interaction context you must
          // exit; this is a floating, always-dismissable card sitting
          // alongside a live, still-interactable canvas). `role="dialog"`
          // collides with the app's real dialogs (e.g. DocumentSetupDialog)
          // and `role="region"` collides with AppShell's fixed 8-landmark
          // layout in existing tests — `aria-label` + `data-testid` give it
          // an accessible name and a stable test hook without claiming a
          // landmark.
          aria-label="Choose your naqsheh"
          data-testid="guest-onboarding-chooser"
          onKeyDown={handleKeyDown}
          // Non-blocking (D2): a floating card, not a full-screen gate. No
          // inset-0 backdrop — the canvas underneath stays live and
          // interactable everywhere outside the card's own bounds. Anchored
          // under the "?" affordance (top-left) rather than the previous
          // bottom-right spot, which crowded the zoom pod.
          className="absolute top-14 left-3 z-40 w-72 rounded-lg border border-hairline bg-paper/95 p-3 shadow-pop backdrop-blur-[2px]"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <h2 className="text-[11px] font-semibold text-ink">Choose your naqsheh</h2>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Skip starter chooser"
              className="-mt-0.5 -mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-soft transition-colors hover:bg-muted hover:text-ink"
            >
              ×
            </button>
          </div>
          <p className="mb-2.5 text-[10px] leading-snug text-ink-soft">{CONFIDENCE_LINE}</p>
          <div className="flex gap-1.5">
            {SEED_KEYS.map((seedKey) => (
              <StarterCard key={seedKey} seedKey={seedKey} onSelect={handleSelect} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// Re-exported for tests/consumers that want the default without importing
// seedDocuments directly.
export { DEFAULT_SEED_KEY };
