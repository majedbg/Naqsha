# Motif combined-shell (D) — workflow shots, 2026-07-20

Captured on `feat/motif-shell` (uncommitted working tree) at 1440x900, light mode unless noted. Device close-ups taken with the inspector docked to the bottom shelf (full-width layout); before-pair taken against committed HEAD `df520fb` in a throwaway worktree.

- `00a-before-quick-start-chips.png` — OLD device at HEAD: "QUICK START" chip row (Vine 🌸-🌿-🌿 chip) above full-height ROUTE/SEQUENCER cards; no mode column, no compact rows, no Trace, sequencer slots overflow the 270px dock — evidences: before/after pair with 02.
- `00b-before-device-full.png` — full old right-dock inspector (Pattern + old motif device + Structure) for wider before context — evidences: before/after pair with 02.
- `01-shell-overview.png` — full app: Layers rail, grid pattern with diamond motif on canvas, right-dock inspector with motif device — evidences: combined shell D (one unified pro shell, no separate tabs).
- `02-motif-device-vine-lit.png` — full-width motif device, Vine mode row lit saffron with rhythm strip; mode column left, Route compact row with role glyph-toggles + 677→169 anchor chip, expanded Sequencer right — evidences: mode column + compact block rows replacing the old card stack.
- `03-mode-custom-divergence.png` — after toggling the Edges role glyph in the Route row: Custom row lit, Vine unlit, chip now 677→481 — evidences: emergent divergence-to-Custom; mode is computed from the chain, not stored.
- `04-compact-row-unfolded.png` — Every N block unfolded via chevron: cadence strip ("tap a beat to shift the offset"), Every/Offset fields, 481→241 chip in the header — evidences: compact one-liner rows unfold to full editors.
- `05-anchor-chips.png` — close crop of the block chain: Route 677→481 → Every N 481→241 → Sequencer "241 placed" — evidences: in→out anchor-count chips narrating the funnel through the chain.
- `06-trace-mid-sweep.png` — Trace pressed, mid-accumulation: saffron numbered rings laid over roughly the left half of the canvas, Trace button in stop state — evidences: Trace placement-order sweep animating placement sequence on canvas.
- `07-trace-complete.png` — sweep finished, all rings lit across the grid — evidences: Trace end-state showing complete placement order.
- `08-start-with-empty.png` — host with zero motifs: "No motifs on this host." + START WITH mode column (Alternate x-o / Vine / Sparse scatter / Border march) — evidences: modes double as creation entry points on empty hosts.
- `09-library-panel.png` — left rail on Motifs: mini layer tree (host row), search + Built-in/In document/My library set filters, glyph grid, Import SVG + drag hint footer — evidences: Layers/Motifs rail with drag-apply library panel.
- `10-glyph-picker-flyout.png` — glyph picker chip open: portaled full-width flyout with search, RECENT row, set tabs, glyph grid, Manage library footer — evidences: glyph-picker chip with portaled flyout (search/sets/recents).
- `11-dark-mode-device.png` — shot 02's state (Vine lit, 677→169) after ThemeToggle to dark — evidences: device theming holds in dark mode.
- `12-proto-variant-d.png` — /?variant=D overlay "D · Compact ledger": MODE column + BLOCKS ledger with 40→35/35→30/30→25 chips + SEQUENCER + TRACE — evidences: the prototype the shipped combined shell was chosen from.
- `13-proto-variant-b.png` — /?variant=B overlay "B · Chain": Vine lit with ROUTE/SEQUENCE/DENSITY cards and live preview — evidences: rejected Chain prototype kept for comparison.
- `14-placement-warning.png` — grid cranked to 60x60: tone-mild banner "Showing 2,000 of 3,721 placements — reduce density or host complexity.", Route 14885→3721 — evidences: per-host placement budget degrades gracefully instead of crashing (P0 fix).

Not part of this set: `ref-ableton-browser-arpeggiator.png` (pre-existing design reference).
