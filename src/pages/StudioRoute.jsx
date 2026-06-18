import { useSyncExternalStore } from 'react';
import Studio from './Studio';
import AppShell from '../components/shell/AppShell';
import { PRO_SHELL_FLAG } from '../components/shell/proShell';

// Desktop breakpoint for the pro shell. Matches Tailwind's `md` (768px), which
// is already the breakpoint the legacy Studio layout switches on. Below it, the
// pro shell falls through to the current Studio layout for now (B1 is
// desktop-first; responsive shell is a later concern).
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

// Strangler gate for the pro app-shell (Lane B / B1, issue #2).
//
// `proShell` defaults to the env-driven `PRO_SHELL_FLAG` but is overridable as a
// prop so tests assert each branch without env stubbing.
//
//   flag OFF                 → legacy Studio, byte-identical to the pre-shell app.
//   flag ON + below md       → fall through to legacy Studio (desktop-first B1).
//   flag ON + desktop (≥md)  → eight empty shell regions, Studio hosted in canvas.
//
// When the flag is off this returns bare <Studio /> and calls *no* hooks — no
// resize subscription, nothing — so the legacy render path is a true no-op. The
// breakpoint subscription lives in the shell-only child, which is only mounted
// when the flag is on.
export default function StudioRoute({ proShell = PRO_SHELL_FLAG }) {
  if (!proShell) {
    return <Studio />;
  }
  return <ProShellRoute />;
}

function ProShellRoute() {
  const isDesktop = useIsDesktop();

  if (!isDesktop) {
    return <Studio />;
  }

  return (
    <AppShell>
      <Studio />
    </AppShell>
  );
}
