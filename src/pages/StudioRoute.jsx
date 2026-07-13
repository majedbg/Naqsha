import { useSyncExternalStore } from 'react';
import Studio from './Studio';
import MobileStudio from './MobileStudio';
import AppShell from '../components/shell/AppShell';
import { useAuth } from '../lib/AuthContext';

// Desktop breakpoint for the pro shell. Matches Tailwind's `md` (768px).
// At/above it the pro app-shell renders with Studio hosted in the canvas
// region; below it the simplified single-column mobile view renders instead.
const SHELL_MIN_WIDTH = 768;

// Subscribe to viewport width so the gate re-evaluates desktop/mobile on resize
// without owning extra state. `getServerSnapshot` keeps SSR/no-window safe.
function subscribe(callback) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}
function getSnapshot() {
  return typeof window === 'undefined' ? true : window.innerWidth >= SHELL_MIN_WIDTH;
}
function getServerSnapshot() {
  return true;
}

function useIsDesktop() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Studio route (Lane B / B7, issue #16 — old two-pane + flag decommissioned).
//
// The pro app-shell is now the default and only desktop surface; the legacy
// two-pane Design/Prepare/Export layout and the `VITE_PRO_SHELL` flag are gone.
//
//   desktop (≥768px) → the pro shell, with Studio hosted in the canvas region.
//   below breakpoint → the simplified single-column mobile editing view.
export default function StudioRoute() {
  const isDesktop = useIsDesktop();
  const { loading } = useAuth();

  if (!isDesktop) {
    return <MobileStudio />;
  }

  // Hold Studio's mount until auth has resolved. Studio.jsx's guest-onboarding
  // seed gate (S1, D5/D10) reads `tier` at useLayers' one-shot init, and
  // `tier` is derived from `profile` (getEffectiveTier(null) === 'guest').
  // During the loading flash a signed-in user can transiently have
  // profile:null (stale/absent cache), so mounting Studio before auth
  // resolves would let it read the wrong tier and permanently capture the
  // phyllotaxis seed. Not mounting Studio at all until `loading` is false
  // fixes this for both a real fresh guest (tier is still 'guest' once
  // resolved) and a signed-in user (tier resolves to their real tier).
  if (loading) {
    return (
      <div className="h-screen bg-paper flex items-center justify-center">
        <p className="text-sm text-ink-soft">Loading…</p>
      </div>
    );
  }

  return (
    <AppShell>
      <Studio />
    </AppShell>
  );
}
