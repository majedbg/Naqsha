import { useEffect, useRef, useState } from 'react';
import { useGate } from '../../lib/useGate';
import { useLayerParams } from '../../lib/useLayerParams';
import { SEED_HERO_RANGES } from '../../lib/onboarding/seedDocuments';
import { isHeroCueSeen, markHeroCueSeen } from '../../lib/onboarding/heroCueStore';
import { emitOnboardingEvent, ONBOARDING_EVENTS } from '../../lib/onboarding/telemetry';

// Guest onboarding S3 — "drag me" cue (D6, D21, BUILD BRIEF element #2, the
// aha driver). Wraps ONE param control (rendered by ParamRow) and, ONLY when
// every condition below holds, paints a highlight ring + a small always-
// visible "Drag me" badge directly on it:
//   - the viewer is a RESOLVED guest — `!loading && !user && tier ===
//     'guest'`, the same guard S1/S2 use at the Studio call site (see
//     seedDocuments wiring + GuestOnboarding.jsx), not the bare `tier ===
//     'guest'` PatternParams uses for its own (invisible) param-count gate.
//     `getEffectiveTier` (AuthContext.jsx) returns 'guest' for a signed-in
//     user whose profile hasn't loaded yet — an infinite pulsing ring is a
//     much louder mistake to flash during that window than a hidden param,
//     so this cue needs the stricter, resolved-auth check. Read via
//     `useGate()` (which now passes `loading`/`user` through from its own
//     internal `useAuth()` call) rather than calling `useAuth()` directly —
//     `useGate` is the established, already-mockable seam every other
//     component in this exact tree (PatternParams, ParamGroup) depends on;
//     several existing tests mock `useGate` alone (no AuthProvider), and a
//     direct `useAuth()` call here would throw for them.
//   - this row's `def.key` is the ACTIVE pattern type's hero key
//     (SEED_HERO_RANGES, S1: phyllotaxis->angle, recursive->scaleFactor,
//     topographic->noiseScale) — never shown on any other param
//   - the guest hasn't changed that hero param yet this tab-session
//     (heroCueStore, keyed per pattern type)
//
// Dismissal is driven by watching the LIVE param value against the value
// captured at mount: the FIRST time it differs — drag OR arrow-key edit,
// same onChange path either way, so the aha stays fully keyboard-operable
// (D21) — the cue retires for the session and `aha-reached` fires once
// (D22). SelectedLayerInspector keys its subtree by `layer.id`
// (src/components/shell/Inspector.jsx), so switching layers/starters
// remounts this component and the captured "initial value" is always fresh
// for the newly-selected layer, never stale across layers.
//
// Reduced motion (D21): checked once at mount via the same
// `window.matchMedia('(prefers-reduced-motion: reduce)')` idiom already used
// elsewhere in the app (Studio.jsx, SortablePatternCard.jsx, SubmitForm.jsx)
// — a pulsing ring becomes a STATIC ring, never removed outright, so the
// target is still pointed at. The overlay is `pointer-events-none` and
// purely decorative (aria-hidden), plus an always-present sr-only hint — it
// never blocks or intercepts pointer/keyboard interaction with the control
// underneath.
function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export default function HeroDragCue({ def, children }) {
  const { tier, loading, user } = useGate();
  const { patternType, params } = useLayerParams();
  const isGuest = !loading && !user && tier === 'guest';
  const heroRange = SEED_HERO_RANGES[patternType];
  const isHero = Boolean(heroRange && heroRange.key === def.key);

  const [seen, setSeen] = useState(() => isHeroCueSeen(patternType));
  const [reducedMotion] = useState(prefersReducedMotion);
  // Captured once per mount (i.e. once per selected layer, since the
  // SelectedLayerInspector subtree is keyed by layer.id) — the value this
  // hero param had when the cue first had a chance to show.
  const initialValueRef = useRef(params[def.key]);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!isHero || !isGuest || seen) return;
    if (params[def.key] !== initialValueRef.current) {
      markHeroCueSeen(patternType);
      setSeen(true);
      if (!firedRef.current) {
        firedRef.current = true;
        emitOnboardingEvent(ONBOARDING_EVENTS.AHA_REACHED, {
          patternType,
          key: def.key,
        });
      }
    }
  }, [params, isHero, isGuest, seen, def.key, patternType]);

  const showCue = isHero && isGuest && !seen;

  return (
    <div className="relative">
      {children}
      {showCue && (
        <>
          <div
            aria-hidden="true"
            data-testid="hero-drag-cue"
            data-reduced-motion={reducedMotion || undefined}
            className={`hero-drag-cue pointer-events-none absolute -inset-1.5 rounded-md border-2 border-saffron ${
              reducedMotion ? 'opacity-70' : 'anim-hero-cue-pulse'
            }`}
          />
          <span
            aria-hidden="true"
            className="hero-drag-cue-badge pointer-events-none absolute -top-2 -right-1 z-10 rounded-full border border-saffron bg-paper px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-saffron shadow-pop"
          >
            Drag me
          </span>
          <span className="sr-only">
            Try it: drag {def.label}, or use the arrow keys — the art updates live.
          </span>
        </>
      )}
    </div>
  );
}
