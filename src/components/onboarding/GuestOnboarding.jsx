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
import { useCallback, useEffect, useState } from 'react';
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
import { shuffleSeedParams } from '../../lib/onboarding/shuffle';
import { isTextEntryTarget } from '../../lib/history/typingGuard';

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

// S4 — "Surprise me" / Shuffle (D11). `activeLayer` (the guest's current
// seed/pattern layer — id + patternType + params + locked) and
// `onUpdateLayer` (the SAME `updateLayer(id, patch)` setter every other
// param edit in the app already goes through, from useLayers) are passed
// down from Studio, matching the existing `onLoadSeed` prop pattern — this
// component stays the single owner of ALL guest-onboarding UI + telemetry,
// Studio stays the single owner of layer state.
//
// S5 — Operation lens discoverability tip (D13, D17, BUILD BRIEF element
// #4). `lensTipUsed` (whether the guest has already engaged the
// ColorViewControl lens switch OR manually dismissed the tip this session)
// and `onDismissLensTip` are passed down from Studio, mirroring the
// activeLayer/onUpdateLayer split above — but reversed: here STUDIO owns the
// "seen" state + telemetry emission (in its wrapped ColorViewControl
// `onSetMode` handler), because the actual event source (ColorViewControl)
// is wired directly in Studio, not nested under this component. This
// component still owns WHEN the tip is actually visible: only after the
// "Choose your naqsheh" chooser itself is dismissed (`dismissed`, local
// state below) — showing the chooser + drag-me cue + lens tip all at once on
// landing would be exactly the front-loaded "tour fatigue" D17 warns against.
export default function GuestOnboarding({
  isGuest,
  onLoadSeed,
  activeLayer,
  onUpdateLayer,
  lensTipUsed = false,
  onDismissLensTip = () => {},
}) {
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

  // S4 — Shuffle / "Surprise me" (D11). Re-rolls ONLY the active seed
  // layer's params (never switches starters — that's the chooser above),
  // via the pure `shuffleSeedParams` helper (reuses the app's existing
  // randomize RNG + honors RANDOMIZE_EXCLUDED_KEYS + clamps the hero param
  // to its curated golden band). Writes back through the same
  // `onUpdateLayer` setter every other param edit uses, so
  // HeroDragCue (S3) sees the hero param change through its normal `params`
  // prop and retires itself exactly as it would for a manual drag — no
  // separate aha-reached emit needed here (D11 build note).
  const handleShuffle = useCallback(() => {
    if (!activeLayer || activeLayer.locked) return;
    const newParams = shuffleSeedParams(activeLayer.patternType, activeLayer.params);
    onUpdateLayer?.(activeLayer.id, { params: newParams });
    emitOnboardingEvent(ONBOARDING_EVENTS.SHUFFLE_CLICK, {
      patternType: activeLayer.patternType,
    });
  }, [activeLayer, onUpdateLayer]);

  const isOpen = isGuest && !dismissed;

  // S5 — the lens tip only makes sense once the guest has actually landed
  // (chooser dismissed, one way or another) AND hasn't already engaged the
  // lens or dismissed the tip itself this session.
  const showLensTip = isGuest && dismissed && !lensTipUsed;

  // Shared by the button's `disabled` state and the keydown handler's
  // early-return, so both surfaces agree on when Shuffle is unavailable —
  // silently no-op'ing on a locked layer with no visual feedback was itself
  // a review finding.
  const shuffleDisabled = !activeLayer || activeLayer.locked;

  // D12 — `S` keyboard shortcut. Build-time check confirmed no existing
  // Studio/useCanvas/modal keydown handler binds a bare 's'/'S' anywhere in
  // the app (only Escape/Enter/arrow-keys/Space/⌘Z/⌘E are bound), so this is
  // safe to add. Scoped to guests only, active whenever the onboarding
  // surface is mounted (NOT gated on the chooser being open — Shuffle is
  // the exploration engine and must keep working after dismissal, same as
  // the button). Requires no modifier so it never collides with the
  // browser's own Cmd/Ctrl+S "Save Page", and is ignored while a text-entry
  // surface has focus (isTextEntryTarget — the same guard ⌘Z/⌘E use in
  // Studio.jsx) so typing "s" in a layer-name field never fires it.
  useEffect(() => {
    if (!isGuest) return undefined;
    const onKeyDown = (e) => {
      // Auto-repeat guard (Opus review of 1784d89, FIX 1) — holding the key
      // down fires ~30 keydowns/sec with `repeat: true`, flooding telemetry
      // + canvas regen. Matches how useActiveTool ignores auto-repeat.
      if (e.repeat) return;
      if (e.key !== 's' && e.key !== 'S') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextEntryTarget(e.target)) return;
      // isTextEntryTarget deliberately excludes <select> (no native text
      // cursor/undo — see typingGuard.js's own comment, shared with ⌘Z),
      // but a focused <select> still has native browser type-ahead, so "s"
      // there should pick an option, not also fire Shuffle (FIX 2, nit).
      if (e.target?.tagName === 'SELECT') return;
      if (shuffleDisabled) return;
      e.preventDefault();
      handleShuffle();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isGuest, handleShuffle, shuffleDisabled]);

  // Escape reliably dismisses the OPEN chooser via a scoped document-level
  // listener, not a React onKeyDown on the card: nothing autofocuses into
  // the card on open (D2 — this is a non-modal surface floating over a live,
  // still-interactable canvas, so it must never steal focus), so an
  // onKeyDown handler on the card div would never see an Escape pressed
  // from cold focus (e.g. the canvas, or nothing at all). The listener is
  // only attached while the chooser is actually open, and torn down on
  // dismiss/unmount, so it never leaks or lingers once there is nothing
  // left to close. `stopPropagation` keeps the keydown from also reaching
  // Studio's own Escape handling (e.g. the armed-placement Esc-to-cancel).
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      handleDismiss();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, handleDismiss]);

  if (!isGuest) return null;

  return (
    <>
      {/* Persistent re-open affordance (D4). Always present for guests, even
          after dismissal, so the chooser is recoverable. Small + unobtrusive
          — top-left of the canvas region (see placement rationale below),
          out of the way of the cut/engrave lens (bottom-left) and the
          panels export button (top-right). */}
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

      {/* S4 — Shuffle / "Surprise me" (D11, BUILD BRIEF element #3). Sits
          right next to the "?" affordance so it reads as part of the SAME
          onboarding row, always available (independent of the chooser's
          open/dismissed state — it's the post-aha exploration engine, not a
          first-run-only prompt). Never switches starter/pattern type — only
          re-rolls the active seed's own params within curated ranges. */}
      <button
        type="button"
        onClick={handleShuffle}
        disabled={shuffleDisabled}
        aria-label="Surprise me — shuffle this pattern within its curated range"
        title="Surprise me (S)"
        className="absolute top-3 left-12 z-40 flex h-7 items-center gap-1 rounded-full border border-hairline bg-paper/95 px-2.5 text-[11px] font-semibold text-ink-soft shadow-pop backdrop-blur-[2px] transition-colors hover:border-violet/60 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-hairline disabled:hover:text-ink-soft"
      >
        <span aria-hidden="true">🎲</span>
        Surprise me
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

      {/* S5 — Operation lens discoverability tip (D13, D17, BUILD BRIEF
          element #4 "Always-on cut/engrave lens"). Fires only AFTER the
          starter chooser is dismissed (see comment on the component
          signature above) so guests never see three "look here" prompts at
          once. Points at ColorViewControl (bottom-4 left-4, z-20) without
          touching or rebuilding it (D13 — "surface the existing lens...
          don't rebuild it"): sits just above it in the same corner, with a
          small pointer triangle bridging the two. Auto-retires the moment
          Studio's wrapped ColorViewControl `onSetMode` reports the guest
          actually used the lens (`lensTipUsed` flips true) — the × here is
          only for a guest who wants it gone without touching the lens. */}
      {showLensTip && (
        <div
          // Same "no landmark role" reasoning as the chooser card above —
          // aria-label + data-testid, not `role="dialog"`/`"region"`.
          aria-label="Operation lens tip"
          data-testid="guest-lens-tip"
          className="absolute bottom-16 left-4 z-30 w-64 rounded-lg border border-hairline bg-paper/95 p-2.5 shadow-pop backdrop-blur-[2px]"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] leading-snug text-ink-soft">
              This is a real fabrication file. The{' '}
              <span className="font-semibold text-ink">Operation</span> lens below shows exactly
              what the machine will cut, score, or engrave.
            </p>
            <button
              type="button"
              onClick={onDismissLensTip}
              aria-label="Dismiss lens tip"
              className="-mt-0.5 -mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-soft transition-colors hover:bg-muted hover:text-ink"
            >
              ×
            </button>
          </div>
          {/* Pointer triangle bridging down toward ColorViewControl. Purely
              decorative. */}
          <span
            aria-hidden="true"
            className="absolute -bottom-1.5 left-6 h-3 w-3 rotate-45 border-b border-r border-hairline bg-paper"
          />
        </div>
      )}
    </>
  );
}

// Re-exported for tests/consumers that want the default without importing
// seedDocuments directly.
export { DEFAULT_SEED_KEY };
