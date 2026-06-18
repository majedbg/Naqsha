// useKitMode — the reversible kit-mode lifecycle (issue #18, Lane C / C9).
//
// Owns enter/exit. On ENTER it snapshots the prior theme + bed (the LITERAL live
// values — prior theme may be 'dark', prior bed may be a user-customized bed),
// applies the kit's theme skin (the named third theme) and a kit bed. On EXIT it
// restores the snapshot verbatim — no leftover state.
//
// Presentational ownership stays in Studio: Studio passes the live `theme` +
// `bed` and the `setTheme` / `setBed` setters; this hook decides WHAT to apply
// and remembers WHAT to restore. The Operations-panel control just calls
// enter()/exit().

import { useCallback, useRef, useState } from 'react';
import { getKit } from '../../kits/kitRegistry.js';

// The theme source of truth is the live DOM attribute, NOT a passed-in value.
// `useTheme` is per-call-site state (not a shared store): another instance (e.g.
// ThemeToggle in the menu) may have flipped the DOM without this caller's `theme`
// prop catching up. Snapshotting `data-theme` directly is the only way to restore
// the user's ACTUAL prior theme (a menu-set dark must not be discarded on exit).
function readLiveTheme(fallback) {
  if (typeof document === 'undefined') return fallback ?? 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr || fallback || 'light';
}

export default function useKitMode({ kitId, theme, bed, setTheme, setBed }) {
  const [active, setActive] = useState(false);
  // Snapshot of the pre-enter state, captured on enter, consumed on exit.
  const snapshotRef = useRef(null);

  const enter = useCallback(() => {
    const kit = getKit(kitId);
    if (!kit) return;
    if (active) return; // idempotent — a second enter must not overwrite the snapshot
    // Snapshot the LITERAL prior values so exit restores exactly what was there.
    // Theme comes from the live DOM (the real source of truth); bed from the
    // passed live bed (Studio owns the single bedSize state, so it isn't stale).
    snapshotRef.current = {
      theme: readLiveTheme(theme),
      bed: bed ? { ...bed } : bed,
    };
    // Apply the theme skin (named third theme).
    setTheme(kit.themeSkin.theme);
    // Apply the kit's first bed preset (the confirmed small bed), as canonical mm.
    const firstBed = kit.bedPresets[0];
    if (firstBed) {
      setBed({ width: firstBed.width, height: firstBed.height, unit: 'mm' });
    }
    setActive(true);
  }, [kitId, active, theme, bed, setTheme, setBed]);

  const exit = useCallback(() => {
    if (!active) return;
    const snap = snapshotRef.current;
    if (snap) {
      setTheme(snap.theme);
      if (snap.bed !== undefined) setBed(snap.bed);
    }
    snapshotRef.current = null;
    setActive(false);
  }, [active, setTheme, setBed]);

  const kit = getKit(kitId);
  // Bed presets are surfaced for Document Setup ONLY while the kit is active —
  // empty when inactive so there is no leftover state.
  const bedPresets =
    active && kit ? kit.bedPresets.map((p) => ({ ...p })) : [];

  return { active, enter, exit, bedPresets };
}
