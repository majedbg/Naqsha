import { useSyncExternalStore } from 'react';
import Studio from './Studio';
import MobileStudio from './MobileStudio';
import AppShell from '../components/shell/AppShell';

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

  if (!isDesktop) {
    return <MobileStudio />;
  }

  return (
    <AppShell>
      <Studio />
    </AppShell>
  );
}
