# NEEDS-HUMAN — Material → 3D Appearance

> Branch `feat/material-3d-appearance` is green per the gate (`npm test` 2366 passed / 0 failed; build succeeds;
> lint at baseline 24 errors + 6 warnings) but **NOT merged**. The items below are visual/runtime claims the green
> gate **cannot** verify — they require a human eyeball in `npm run dev` before merge. See `run-report.md` for the
> full slice/commit table and the open issues found during the run.

## §7 Morning NEEDS-HUMAN checklist (verbatim from `docs/material-3d-appearance-plan.md`)

- [ ] Fluorescent ≠ clear ≠ opaque ≠ translucent — each visibly distinct in panel-stack.
- [ ] Fluorescent edge glow is visible and **tracks orbit / light direction** (incidence dot working).
- [ ] Face fresnel rim reads as "internally lit", not edge-painted.
- [ ] Engraved/scored marks still bloom (ribbons intact).
- [ ] Wood reads as wood (procedural grain), distinct from acrylic — not colored plastic.
- [ ] Clear acrylic still transmissive; no regression in existing Surface A look.
- [ ] No new console warnings beyond the known "Layer out of range" item.
- [ ] 2D canvas / Color View material lens unaffected.

## Reference smoke shots (S7, best-effort, single static viewpoints)

`docs/3d-shots/mat-fluorescent.png`, `mat-clear.png`, `mat-opaque.png`, `mat-walnut.png` — captured via Playwright MCP.
Per-material pixel fingerprints differed (fluorescent avg RGB [74,72,40] / clear [47,34,38] / opaque [52,82,79] /
walnut [51,33,29]), confirming the four render distinctly. These are static viewpoints — "glow tracks orbit" is NOT
captured and must be confirmed live.

## Extra human-only verifications surfaced during the run (beyond §7)

- [ ] **"Maximum update depth exceeded" React loop** — fires ~70× on every lens/material switch into the 3D path.
      Pre-existing (S3–S6, not S7), real prod-affecting invariant violation, corroborated by the existing
      `react-hooks/set-state-in-effect` lint hit (~Studio line 635). Scene still renders, but **diagnose before merge.**
- [ ] **Per-archetype `edgeGain` gating** — the S7 opaque (turquoise) and walnut shots appear to show edge/body bloom,
      yet `opaque-acrylic` and `wood` should have NO edge glow (`edgeGain 0`). Confirm the S5 rim meshes self-gate
      correctly in `Sheets.jsx`.
- [ ] **Gate-blind GLSL** — the fresnel `shaderMaterial` (S5) and wood-grain `onBeforeCompile` (S6) are bundled by Vite
      as strings and never compiled by `npm run build`. Confirm in-browser: no console shader-compile error, canvas
      non-blank, wood slab shows procedural grain (not flat plastic, not blank).

## How to verify

1. `cd /Users/jadembg/Documents/Sonoform_all/Sonoform_generativeArt/mat-3d && npm run dev`
2. Open `localhost:5173` → Color View radiogroup → **Material** lens → "change material" picker → pick a material →
   click the **3D** radio. (The 3D radio may need a JS click; the material picker is hidden while in 3D, so choose the
   material in the Material lens first, then re-enter 3D — this round-trip is the only reachable path and also proves
   live threading without a Rebuild.)
3. Cycle green-fluorescent / clear / an opaque / walnut; **orbit** the camera for each and watch the bright edge rotate
   relative to the camera (incidence is view-independent by design).
4. Watch the dev console for any **new** shader-compile error or warning beyond the known "Layer out of range" item.

## Pre-existing plotter-extractor gap (surfaced during Spiral/Grid modulation work, 2026-07-01)

- [ ] **`<line>` and `<polyline>` patterns never reach the plotter.**
      `extractRenderedPaths` (`src/lib/plotter/pipeline.js:179`) only recurses/extracts
      elements whose `tagName` is `path`; every other tag (`<line>`, `<polyline>`,
      `<rect>`, `<ellipse>`) falls through the `else` branch and is walked-but-not-emitted.
      **Consequence:** current **Grid** (`<line>`) and **TopographicContours**
      (`<polyline>`) produce NO plotter geometry at all — the plot preview / export
      silently omits them. This is a **long-standing pre-existing bug**, independent of
      the modulation feature; it was merely re-confirmed while wiring Grid's warp.
      **Scoped out of the Spiral/Grid-modulation change on purpose** (per
      `docs/spiral-grid-modulation-targets.md §8.6`): fixing the extractor to flatten
      `<line>`/`<polyline>` is its own change with its own snapshot blast-radius.
      Note the one interaction: once Grid is warp-modulated it emits a `<path>`, so a
      **warped** grid becomes plotter-visible for the first time while an unwarped grid
      still does not — expected, not a regression.

## Raster Etch S1 (#80) — localStorage quota for Etch source data-URIs

- [ ] **Etch source data-URIs can exceed the localStorage quota (S1 known limit).**
      A guest/offline Etch stores its downscaled (≤1024px) source as a PNG data-URI on
      the layer; several Etches (or one large one) can push the `sonoform-layers` blob
      past the ~5MB `localStorage` ceiling. S1 FIX 4 isolates that write so a
      `QuotaExceededError` no longer cascade-kills the other document writes and now
      emits a `console.warn` (no more silent TOTAL loss), but the Etch source itself
      still won't persist when over quota. **Real fix = source compression + signed-in
      private-bucket storage (S7 / #86 — now built, see below; guests are still capped).**
      Until then, a large multi-Etch document may not fully survive a guest reload.

## Raster Etch S7 (#86) — signed-in source bucket + `sourcePath` (UNAPPLIED MIGRATION)

- [ ] **Apply migration `supabase/migrations/20250101000015_etch_sources.sql` — NOT run by the agent.**
      It provisions the PRIVATE `etch-sources` storage bucket (public = false, 10 MB cap,
      images only) plus an **owner-only** `storage.objects` RLS policy: object access is
      scoped to the first path segment (`(storage.foldername(name))[1] = auth.uid()::text`),
      the standard per-user-folder pattern — mirroring the `material-evaluations` bucket
      (migration 014). **NO table / NO column**: `sourcePath` is a plain Etch-layer param
      that rides inside the existing `public.designs.config` jsonb (`{ layers, … }`), so no
      schema change is needed.
      - **Human-gated & must be coordinated** with the other unapplied migration
        (`014_material_evaluations.sql`, above) — apply both via the Supabase SQL editor / CLI.
        Nothing in CI or the agent run touched a live database.
      - **How it behaves once applied:** on import a SIGNED-IN user's full-resolution source
        photo is uploaded to `etch-sources` under `<uid>/<sourceId>/source.<ext>` and the
        layer stores only `sourcePath` (no base64 in the saved design); on load the Etch
        downloads its source from the bucket (a download, not a signed URL — keeps the
        resample canvas same-origin so `getImageData` isn't tainted) and feeds it into the
        SAME `resolveEtchBitmap` pipeline. A GUEST/offline user keeps the S1 capped data-URI
        on the layer, UNCHANGED, and any upload failure falls back to that data-URI (no lost
        work).
      - **How to verify (needs the migration applied + live auth — cannot be checked by the
        green gate):**
        1. Signed in, `File → Import Image` an Etch. Confirm the source object appears in the
           `etch-sources` bucket under your uid, the saved design's layer holds a `sourcePath`
           (NOT a `source` data-URI), and reloading the design re-renders the Etch by
           downloading from the bucket.
        2. Confirm owner-only RLS: a second account cannot read the first account's objects.
        3. Signed OUT (or with the backend offline), import an Etch and confirm it still uses
           the local capped data-URI exactly as before (guest path unchanged).
      - **Known operational gap (orphan-on-abandon), out of scope for this slice:** unlike the
        material-evaluation precedent (which uploads the object AND inserts its DB row in one
        call), the Etch source is uploaded at IMPORT time while `sourcePath` is only persisted
        by a LATER design save. If the user imports an Etch then never saves (closes the tab,
        deletes the layer, discards the draft), the uploaded object is stranded in the bucket
        with nothing referencing it, and there is no reaper. A real fix needs save-time
        reconciliation or a periodic orphan sweep — deferred, but worth knowing before this
        bucket accrues storage.

- [ ] **PRODUCT DECISION (C-1) — signed-in Etch silently breaks in SHARED designs. Decide before
      signed-in Etch ships to makers who share.** A shared design (`share_token` →
      `loadSharedDesign`) carries the Etch layer's `sourcePath` in its config. For a signed-in
      maker the source now lives ONLY in the owner-private `etch-sources` bucket, so a
      RECIPIENT's `fetchEtchSourceDataUrl` hits owner-only RLS → download fails → null → the
      Etch renders as its placeholder. Previously (guest inline `source` data-URI travelled in
      the shared config) the same shared design rendered the Etch. So this slice is a **sharing
      regression** for signed-in makers. The human must decide: **is Etch-in-shared-design
      supported?** If YES, sharing must fall back to an inline/copied source in the shared
      config OR a recipient-scoped signed URL (a real feature, not a bug-fix). If NO, document
      it as a known limitation. **Not code-fixed in this slice — surfaced for the decision.**

- [ ] **(M-2) A source over the 10 MB bucket cap silently falls back to guest-grade storage.**
      `uploadEtchSource` throws on an over-cap file, so `persistEtchSource` returns the CAPPED
      data-URI — graceful (no lost work), but the "full-resolution source survives" promise
      fails with NO user-facing signal. A friendly "too large, stored at reduced resolution"
      message is future work.

- [ ] **(M-3) Only `File → Import Image` was rewired to the bucket.** Signed-in drag-drop /
      paste image imports still inline the base64 source. Inconsistent (some signed-in Etches
      bucket-backed, some inline); unify the other import entry points in a later slice.

- [ ] **(M-4, minor) In-session download cache is unbounded.** `fetchEtchSourceDataUrl` memoizes
      one data-URL per distinct `sourcePath` for the session; the S-1 sign-out clear caps the
      worst case (it empties on account switch). Add an LRU bound only if session Etch counts
      grow large — not needed now.

## Raster Etch S4 (#83) — Highlight Hold

### ⚠️ SAFETY — the mirror AUTO-default does NOT engage through the shipping UI

- [ ] **The Highlight Hold mirror auto-default currently NEVER fires through the UI —
      Highlight Hold must be enabled MANUALLY for every mirror-acrylic job.**
      The guarantee itself is solid: when Highlight Hold is ON, no dot etches above the
      cutoff in any dither mode/size/invert (proven test-first + browser-verified through
      the real Worker). The *automatic* material-aware default is what's unreachable. The
      only mirror id in `MIRROR_MATERIAL_IDS` (`src/lib/etch/etchHold.js`) is
      `gold-mirror`, and a whole-repo check confirms `gold-mirror` is **not** in
      `DEFAULT_PREVIEW_MATERIALS` (`src/lib/materialPreview.js`) — the catalog the panel
      material and Material-lens selectors offer. It exists only as a swatch photo
      (`materialSwatches.js`), the id in `MIRROR_MATERIAL_IDS`, and test fixtures. So
      `isMirrorMaterial` never sees a `gold-mirror` id from any real selection, and the
      effective-material resolution (`effectiveMaterialId` = panel material OR lens
      material) can never resolve to a mirror. **Net effect: Highlight Hold defaults OFF
      on every panel, mirror included. Until this is resolved, do NOT rely on the
      automatic default — turn Highlight Hold on by hand for any mirror-acrylic run.**
      Resolution options (maintainer's aesthetic-domain call — deliberately NOT fixed in
      this slice, since adding stock to the shared catalog has optics / Material Archetype
      implications):
        (a) add a mirror stock to the selectable material catalog WITH its calibrated
            Material Archetype (then it becomes selectable as a panel/lens material and the
            auto-default engages), OR
        (b) add a per-panel "mirror" boolean flag independent of preview optics, and have
            `isMirrorMaterial` / the Hold default read that flag.
      `MIRROR_MATERIAL_IDS` is a `Set` — trivially extensible with the real id once a
      mirror material is actually wired into the catalog.

- [ ] **MobileStudio does not thread panels / the Material lens to the Inspector, so the
      Highlight Hold default would resolve OFF there if Etch editing is ever added.**
      As of this slice an Etch is NOT creatable or editable in `src/pages/MobileStudio.jsx`
      (no import-as-Etch, no lens) — the mobile shell has no Etch surface at all, so this
      is latent, not a live bug. If Etch editing is later added to mobile, thread `panels`
      and `colorView` into its `<Inspector>` the way `src/pages/Studio.jsx` does, or the
      Hold control will always show/resolve the OFF default regardless of material.
