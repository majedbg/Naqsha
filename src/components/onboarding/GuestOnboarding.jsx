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
import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  isModulationNudgeSeen,
  markModulationNudgeSeen,
} from '../../lib/onboarding/modulationNudgeStore';
import { resetAllOnboarding } from '../../lib/onboarding/session';
import ConfirmDialog from '../ui/ConfirmDialog';

// D16 confidence line — naqsheh metaphor + reversibility. Copy is LOCKED
// verbatim (BUILD BRIEF). "naqsheh" is metaphor copy only here, never a UI
// noun elsewhere (D25).
const CONFIDENCE_LINE =
  "This is your naqsheh — the sheet the machine weaves. Nudge anything; ⌘Z undoes it. You can't break it.";

// S6 — D17a modulation nudge copy. Modulation is a SPATIAL relationship, not
// animation: one pattern's field warps another's geometry — its peaks pull
// vertices uphill toward them and its valleys push them away (see
// stackWarpDisplacement in lib/fields/warp.js). The seeds are STATIC
// (D9-fallback — no live modulation runs on any starter yet, see
// seedDocuments.js), so this must NOT claim a running effect ("that glow
// follows your pattern", "your pattern moves on its own") — nothing is moving.
// It INVITES trying the feature instead. Direction is left neutral ("push and
// pull") on purpose: warp v1 attracts toward peaks, but the density channel has
// a polarity/invert control, so a general nudge shouldn't hard-commit.
// TODO(user): tune nudge copy
const MODULATION_NUDGE_LINE =
  "Route this pattern into another layer, where one's peaks and valleys push and pull the other's lines — that's modulation, one pattern reshaping another.";

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
// P0-C — "New session / hand to next person" reset (D18). `onNewSession` is
// an OPTIONAL extra hook for Studio-owned onboarding state that lives
// OUTSIDE this component (today: just `lensTipUsed`, S5's own useState seeded
// once from lensTipStore at mount — see Studio.jsx). This component clears
// every store it knows about itself via `resetAllOnboarding` + resyncs its
// OWN local state (dismissed/nudge); `onNewSession` exists purely so Studio
// can resync state it owns that this component has no reach into, without
// this component needing to know Studio's internals.
export default function GuestOnboarding({
  isGuest,
  onLoadSeed,
  activeLayer,
  onUpdateLayer,
  lensTipUsed = false,
  onDismissLensTip = () => {},
  onNewSession = () => {},
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

  // S6 — D17a modulation nudge + D22 activation event ("second distinct
  // param change"). Watches the SAME `activeLayer` prop Shuffle (S4) already
  // reads — no separate observation path into the param-write pipeline is
  // needed, matching the pattern LayerCard/useLayerParams funnel every param
  // edit (drag, arrow-key, or Shuffle's own re-roll) through: `onChange` ->
  // `writeParams({ params })` -> the same `onUpdateLayer(id, patch)` setter
  // that produces the next `activeLayer.params` this component already
  // receives as a prop. Diffing that object against a per-seed baseline is
  // therefore sufficient to "observe changes without disrupting normal
  // editing" — no new write-path hook required.
  //
  // Distinct keys are counted PER ACTIVE SEED: the baseline resets whenever
  // `activeLayer.id` changes (a fresh mount, or the guest picked a different
  // starter via the chooser — `onLoadSeed`/`loadDocumentLayers` always
  // builds a brand-new layer id, see seedDocuments.js), so switching
  // starters starts a fresh count rather than carrying over an unrelated
  // seed's edits. A Shuffle re-roll writes through the identical
  // `onUpdateLayer` path as a manual drag (see the S4 handler above, and the
  // matching precedent in HeroDragCue's own comment: "no separate aha-reached
  // emit needed here" for Shuffle-driven changes) — so a Shuffle click that
  // touches 2+ keys at once also counts, consistent with how the rest of
  // onboarding already treats Shuffle as equivalent to a manual edit.
  //
  // The "seen" flag (modulationNudgeStore) is a single session-wide flag,
  // NOT per-seed (unlike heroCueStore) — once fired, the nudge never re-fires
  // even if the guest later switches starters and makes more distinct edits
  // there (D17: "at most two tips in v1", this is a one-shot prompt).
  //
  // Opus review (S5/S6, FIX 1) — `nudgeSeen` below is a LOCAL re-entrancy
  // guard only (seeded from the persisted flag so an already-fired-in-a-prior-
  // mount session skips detection entirely). It intentionally does NOT
  // persist `markModulationNudgeSeen()` at threshold-cross time anymore: the
  // lens tip (S5) and this nudge must be mutually exclusive on screen (see
  // `showNudge` below), so crossing the threshold while the lens tip is still
  // showing must NOT burn the one-shot session flag before the guest has
  // actually seen the nudge — a reload before the lens tip is
  // dismissed/used would otherwise permanently lose the nudge. The flag is
  // persisted separately, only once the nudge is actually displayed (see the
  // effect below `showNudge`).
  const [nudgeSeen, setNudgeSeen] = useState(() => isModulationNudgeSeen());
  const [nudgeVisible, setNudgeVisible] = useState(false);
  const paramBaselineRef = useRef(null);
  const changedParamKeysRef = useRef(new Set());

  // P0-C — "New session / hand to next person" (D18). This wipes the current
  // canvas to the default seed, so a single accidental click must never
  // discard real work: `confirmingNewSession` arms a `ConfirmDialog` (the
  // codebase's established destructive-action confirm — never window.confirm,
  // see ConfirmDialog.jsx's own comment) rather than acting immediately.
  const [confirmingNewSession, setConfirmingNewSession] = useState(false);

  const handleRequestNewSession = useCallback(() => {
    setConfirmingNewSession(true);
  }, []);

  const handleCancelNewSession = useCallback(() => {
    setConfirmingNewSession(false);
  }, []);

  const handleConfirmNewSession = useCallback(() => {
    // 1. Clear every per-tab onboarding store this component doesn't own
    //    directly (dismissal/hero-cue/lens-tip/modulation-nudge) in one call.
    resetAllOnboarding();
    // 2. Reset the canvas to the DEFAULT seed for the next attendee. The FULL
    //    document reset (layers/panels/glyphs/bg/optimizations/undo-history) +
    //    the SYNCHRONOUS localStorage flush that closes the P0-C reload race
    //    (D18) lives in Studio's `onNewSession` handler, which owns the pieces
    //    spread across useLayers + useOptimizations + history. The seed doc is
    //    built ONCE here and handed over so the persisted layers match the
    //    layers loaded into state (no id drift from building it twice).
    onNewSession?.(getSeedDocument(DEFAULT_SEED_KEY));
    // 3. Resync THIS component's own local state, which was seeded from the
    //    stores above only once at mount and would otherwise stay stale even
    //    though the underlying store is now cleared (a reload wouldn't fix
    //    this either — sessionStorage survives it, D3/D18 — this reset IS the
    //    hand-off mechanism).
    setDismissed(false); // re-open the chooser for the next attendee
    setNudgeSeen(false);
    setNudgeVisible(false);
    paramBaselineRef.current = null;
    changedParamKeysRef.current = new Set();
    setConfirmingNewSession(false);
    emitOnboardingEvent(ONBOARDING_EVENTS.NEW_SESSION);
  }, [onNewSession]);

  useEffect(() => {
    if (!isGuest || nudgeSeen || !activeLayer) return;
    const currentParams = activeLayer.params || {};
    const baseline = paramBaselineRef.current;
    if (!baseline || baseline.layerId !== activeLayer.id) {
      // Fresh seed (first render for this layer id, or a starter switch) —
      // (re)start the distinct-key count from this seed's own params, never
      // comparing across two different seeds' values.
      paramBaselineRef.current = { layerId: activeLayer.id, params: currentParams };
      changedParamKeysRef.current = new Set();
      return;
    }
    for (const key of Object.keys(currentParams)) {
      if (currentParams[key] !== baseline.params[key]) {
        changedParamKeysRef.current.add(key);
      }
    }
    if (changedParamKeysRef.current.size >= 2) {
      // Activation is a real event regardless of display (same
      // display-independent telemetry contract the chooser-open case above
      // already relies on) — only the STORE PERSIST is deferred to display.
      setNudgeSeen(true);
      setNudgeVisible(true);
      emitOnboardingEvent(ONBOARDING_EVENTS.SECOND_PARAM_CHANGE, {
        patternType: activeLayer.patternType,
        keys: Array.from(changedParamKeysRef.current),
      });
    }
  }, [isGuest, nudgeSeen, activeLayer]);

  const handleDismissNudge = useCallback(() => {
    setNudgeVisible(false);
  }, []);

  // Only actually shown once the chooser is dismissed — same front-loading
  // guard as the lens tip above (D17): the 2nd-distinct-change threshold can
  // technically be crossed while the chooser is still open (it's
  // non-blocking, D2), but the visual prompt waits so a guest never sees the
  // chooser + the nudge stacked at once. Telemetry above still fires at the
  // true moment of activation, independent of this display gate.
  //
  // Opus review (S5/S6, FIX 1) — also mutually exclusive with the lens tip
  // (`!showLensTip`): a guest who makes 2 param edits before ever engaging
  // the Operation lens would otherwise see both the centered nudge (w-72)
  // and the left-anchored lens tip (w-64) stacked at once, which can overlap
  // on a narrow canvas. The lens tip wins the race (it's about the deeper
  // "real fabrication file" wow, per the fix note) — this nudge simply waits
  // until the lens tip is gone (dismissed, or `lensTipUsed` flips true).
  const showNudge = isGuest && dismissed && nudgeVisible && !showLensTip;

  // Persist the once-per-session flag ONLY once the nudge is actually shown
  // to the guest — see the comment on `nudgeSeen` above for why this can't
  // happen at threshold-cross time. `markModulationNudgeSeen` is idempotent
  // (plain sessionStorage set), so re-running this on further renders while
  // `showNudge` stays true is harmless.
  useEffect(() => {
    if (showNudge) markModulationNudgeSeen();
  }, [showNudge]);

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

  // Opus review (S5/S6, FIX 2, nit) — Escape only dismissed the chooser;
  // extend the same document-level pattern to the nudge and the lens tip so
  // keyboard users can dismiss those too. Scoped exactly like the chooser's
  // own listener above: only attached while one of the two is actually
  // visible, and `stopPropagation` only fires on the branch that actually
  // dismisses something — if neither is open, this effect isn't even
  // mounted, so Studio's own Escape handling (e.g. armed-placement
  // Esc-to-cancel) is never touched. Priority if both were somehow open:
  // nudge, then lens tip — moot in practice today since `showNudge` already
  // requires `!showLensTip` (see above), so at most one of the two is ever
  // visible at once, but the explicit order matches the fix note.
  useEffect(() => {
    if (!showNudge && !showLensTip) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (showNudge) {
        handleDismissNudge();
      } else if (showLensTip) {
        onDismissLensTip();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showNudge, showLensTip, handleDismissNudge, onDismissLensTip]);

  if (!isGuest) return null;

  return (
    <>
      {/* Top-left onboarding row: "?" reopen (D4), Shuffle (S4), and the
          P0-C "New session" reset all share ONE flex row (rather than each
          claiming its own hardcoded `left-N` offset) so a variable-width
          label (e.g. "Surprise me") can never silently collide with its
          neighbor — flexbox handles the spacing instead of guessed pixel
          math. Top-left of the canvas region is the one corner nothing else
          claims (ColorViewControl owns bottom-left, the zoom pod owns
          bottom-right, the laser-only panels-ZIP export owns top-right). */}
      <div className="absolute top-3 left-3 z-40 flex items-center gap-2">
        {/* Persistent re-open affordance (D4). Always present for guests,
            even after dismissal, so the chooser is recoverable. */}
        <button
          type="button"
          onClick={handleReopen}
          aria-label="Reopen starter guide"
          title="Choose a starting pattern"
          // S6 a11y sweep (D21/P0-D): bumped 28px -> 32px toward the ~40px
          // touch-target guidance — a full 40px would visually clash with the
          // rest of the app's much denser icon buttons (ColorViewControl's
          // own controls are 16-20px, see BUILD-NOTES), so this is a
          // pragmatic partial fix, not full compliance.
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-hairline bg-paper/95 text-xs font-semibold text-ink-soft shadow-pop backdrop-blur-[2px] transition-colors hover:border-violet/60 hover:text-ink"
        >
          ?
        </button>

        {/* S4 — Shuffle / "Surprise me" (D11, BUILD BRIEF element #3).
            Always available (independent of the chooser's open/dismissed
            state — it's the post-aha exploration engine, not a
            first-run-only prompt). Never switches starter/pattern type —
            only re-rolls the active seed's own params within curated
            ranges. */}
        <button
          type="button"
          onClick={handleShuffle}
          disabled={shuffleDisabled}
          aria-label="Surprise me — shuffle this pattern within its curated range"
          title="Surprise me (S)"
          // S6 a11y sweep: 28px -> 32px height, same rationale as the "?"
          // button above.
          className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-hairline bg-paper/95 px-2.5 text-[11px] font-semibold text-ink-soft shadow-pop backdrop-blur-[2px] transition-colors hover:border-violet/60 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-hairline disabled:hover:text-ink-soft"
        >
          <span aria-hidden="true">🎲</span>
          Surprise me
        </button>

        {/* P0-C — "New session / hand to next person" (D18, BUILD BRIEF
            "shared-machine re-fire"). A long-lived guest tab on a shared
            workshop machine can't rely on a reload to re-show onboarding
            (sessionStorage survives it, D3) — this is the RELIABLE hand-off
            action instead. Arms a `ConfirmDialog` rather than acting
            immediately (see `handleRequestNewSession` above): this wipes the
            current canvas to the default seed, so a single accidental click
            must never discard real work. */}
        <button
          type="button"
          onClick={handleRequestNewSession}
          aria-label="Start a new session — hand off to the next person: clears this tab's guide and reloads the default pattern"
          title="New session (hand to next person)"
          className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-hairline bg-paper/95 px-2.5 text-[11px] font-semibold text-ink-soft shadow-pop backdrop-blur-[2px] transition-colors hover:border-violet/60 hover:text-ink"
        >
          <span aria-hidden="true">↺</span>
          New session
        </button>
      </div>

      <ConfirmDialog
        open={confirmingNewSession}
        title="Start a new session?"
        message="This clears the current canvas and resets the guide for the next person. Unsaved changes to this pattern will be lost."
        confirmLabel="Start new session"
        cancelLabel="Cancel"
        danger
        onConfirm={handleConfirmNewSession}
        onCancel={handleCancelNewSession}
      />

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
              // S6 a11y sweep: 20px -> 24px, same partial-fix rationale as
              // the "?"/Shuffle buttons above (matches the new S6
              // modulation-nudge dismiss button for consistency).
              className="-mt-0.5 -mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-soft transition-colors hover:bg-muted hover:text-ink"
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
              // S6 a11y sweep: 20px -> 24px, same partial-fix rationale as
              // the "?"/Shuffle buttons above (matches the new S6
              // modulation-nudge dismiss button for consistency).
              className="-mt-0.5 -mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-soft transition-colors hover:bg-muted hover:text-ink"
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

      {/* S6 — Modulation nudge (D17a, D22 activation event). Fires once the
          guest has made a 2nd DISTINCT param change on the active seed AND
          the chooser is dismissed (see `showNudge` above). Bottom-center,
          away from every corner-anchored surface (chooser/reopen/Shuffle
          top-left, ColorViewControl + the lens tip bottom-left, zoom pod
          bottom-right, laser panels-ZIP export top-right) so it never
          overlaps another onboarding or canvas control. Centered via
          `inset-x-0 mx-auto` (NOT a `-translate-x-1/2` transform) so it can
          also carry `anim-rise`'s entrance transform without the two
          fighting over the `transform` property. */}
      {showNudge && (
        <div
          aria-label="Modulation nudge"
          data-testid="guest-modulation-nudge"
          className="anim-rise absolute bottom-4 inset-x-0 z-30 mx-auto w-72 rounded-lg border border-hairline bg-paper/95 p-2.5 shadow-pop backdrop-blur-[2px]"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] leading-snug text-ink-soft">{MODULATION_NUDGE_LINE}</p>
            <button
              type="button"
              onClick={handleDismissNudge}
              aria-label="Dismiss modulation nudge"
              className="-mt-0.5 -mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-soft transition-colors hover:bg-muted hover:text-ink"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Re-exported for tests/consumers that want the default without importing
// seedDocuments directly.
export { DEFAULT_SEED_KEY };
