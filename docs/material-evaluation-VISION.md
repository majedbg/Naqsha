# Material Evaluation — Vision (pre-grill capture)

**Captured from:** Majed (product owner), verbally, 2026-07-10.
**Status:** capture only. Not designed, not decided, not scoped. Grilling session pending.

The local render-vs-photo calibration harness being built right now to sign off
Material Archetypes against vendor reference photos should eventually open up into a
user-led evaluation loop: makers submit a photo of their own material next to a
screenshot of the rendering, the platform accumulates these submissions, and a
periodic backend job re-assesses the calibrated archetype constants against that
community evidence — turning "does the render match the material" from a one-time
internal sign-off into an ongoing, crowd-verified process. The owner's evolution of
the idea extends it further: instead of (or alongside) a plain material-vs-render
pairing, a maker photographs their *executed* laser-cut/plotted piece next to the
render of that same panel — which doubles the feature as project documentation on
the platform. Owner's verdict: "great feature worth a grilling session and a build."

---

## Where it grows from

ADR `docs/adr/0003-fidelity-first-3d-preview.md` establishes the stance this whole
feature is downstream of: the 3D preview's job is to be a fidelity-first material
proof, not a stylized render, and — critically — "acceptance is external, not taste:
each archetype is signed off side-by-side against a reference photo of the physical
sheet in a fixed calibration scene." That line is the seed. Today, "side-by-side
against a reference photo" is an internal, agent/developer-run process:

- The reference photos are a vendor catalog: `docs/material-references/canal-plastics/`
  (Canal Plastics acrylic sheet product photography, scraped, 141 products / 279
  images) with staging conventions documented in
  `docs/material-references/canal-plastics/STAGING-NOTES.md` — two shots per product
  (an oblique "hero" shot carrying the optical cue, a flat top-down swatch carrying
  albedo/pattern), consistent camera/lighting rig, background-color-as-signal
  convention, etc.
- A **local calibration harness is in progress in parallel with this capture** — a
  dev-only in-app calibration route plus `scripts/calibration-capture.mjs` and
  `scripts/calibration-compose.mjs`, composing renderer screenshots against the
  Canal Plastics references, landing under `docs/material-references/calibration/`.
  **These paths do not exist in the repo yet as of this capture** (confirmed absent
  on `main` and on `feat/preview-fidelity`, the ADR 0003 implementation branch) —
  another agent is building them concurrently. This doc references them by their
  intended path; do not treat their absence as a gap in this research, and do not
  assume their eventual shape — that's for the harness's own design, not this vision.

The vision is the lineage from that harness: **local, agent-run, vendor-photo-only,
one-time-per-archetype today → user-led, phone-photo, continuously-collected
tomorrow.** The mechanism (a photo of a physical material next to a render, judged
for match) is the same; what changes is who submits, at what cadence, and against
what ground truth (vendor catalog vs. a maker's own sheet, possibly of a different
lot).

---

## The UX in one image

The keystone interaction, in the owner's own words, is a **side-by-side**: a
user-submitted photo on one side, a screenshot of the rendering on the other.
Two variants of what fills each side, one an evolution of the other:

1. **Material vs. render** (v1 framing): a photo of a raw material sample/sheet the
   maker owns, next to a render of that same Material Archetype in the 3D preview.
   This is the direct, narrow evaluation — "does the render of Turquoise Opaque
   acrylic look like my actual sheet of Turquoise Opaque acrylic."
2. **Executed piece vs. render** (owner's stated evolution): a photo of a
   maker's finished laser-cut/plotted piece — the physical Run's output — next to
   the render of that same panel/design. This is richer evidence (a whole
   composition under real light, not just a swatch) and it does double duty:
   the same upload that feeds calibration is also the maker showing off/documenting
   their project on the platform.

Both variants produce the same underlying artifact: an **evaluation submission**
(photo + render screenshot + whatever material/archetype metadata ties them
together), stored server-side, judged (by whom and how is open — see below), and
periodically rolled up into archetype re-tuning.

---

## What exists to build on

Grounded by reading the actual files, not inferring from names.

**Fidelity/calibration lineage**
- `docs/adr/0003-fidelity-first-3d-preview.md` — the binding stance (fidelity over
  stylization, external acceptance via reference photo) this feature extends from
  "one team member's judgment" to "community-supplied evidence at scale."
- `docs/material-references/canal-plastics/` + its `STAGING-NOTES.md` — the existing
  reference-photo corpus and the staging conventions (oblique hero shot for optical
  cues, flat swatch for albedo, background-as-signal) a user-submission flow would
  need an opinion on matching or not matching.
- The in-progress local calibration harness (dev route, `scripts/calibration-*.mjs`,
  `docs/material-references/calibration/`) — not yet landed; the direct ancestor of
  this feature's core loop (photo-of-material next to render-screenshot).

**Material Archetype system (the thing being re-tuned)**
- `src/lib/three3d/materialArchetypes.js` — "the single source of optics for every
  preview material," a fixed registry of `AppearanceParams` (tintHex, transmission,
  roughness, metalness, ior, edgeGain, clearcoat) per archetype, calibrated under
  `THREE.NeutralToneMapping`, "grounded in measured stock properties." This is
  exactly the set of constants the owner means by "the calibrated material archetype
  constants get tuned from community evidence over time."
- `src/lib/materialPreview.js` — the 2D "Material" color-view lens (a separate,
  simpler recoloring of the canvas); not the 3D optics system, but shares the sheet
  vocabulary and is a second surface that could plausibly want its own accuracy
  signal if this feature scoped out that far (out of scope for this capture; noting
  for the grilling session).

**Screenshot / capture capability (the "render" half of the pairing)**
- `src/lib/three3d/snapshotExport.js` + `Scene3D.jsx`'s `<SnapshotCapture>` — the
  existing PNG snapshot export (`naqsha-3d_<design>_<timestamp>.png`), explicitly a
  *preview* artifact, "NEVER part of the fabrication path." This is the closest
  existing building block for "a screenshot of the rendering" — today it's a
  user-facing download button (`data-testid="canvas3d-save-image"` in `Scene3D.jsx`),
  not a server-submitted evaluation payload; that gap (download vs. upload-as-part-
  of-a-submission) is real, unbuilt work.

**Auth / entitlement plumbing (precedent for gating a submission flow)**
- `src/lib/AuthContext.jsx` + `src/components/AuthButton.jsx` + `src/lib/supabase.js`
  — Supabase-backed auth already exists in the app (client is `null` when env vars
  are absent, i.e. local dev without a backend still runs).
  `@supabase/supabase-js` and the `supabase` CLI are both in `package.json`.
- `src/lib/motifLibraryEntitlement.js` — the closest existing precedent for a
  submission-style feature that's gated: the global motif library separates a real,
  shipped **login gate** (enforced in UI) from a **premium-entitlement scaffold**
  (`canUseGlobalLibrary`, currently `return true` for everyone, designed to flip to a
  tier check in one line via `checkGate`). If evaluation submission or project
  documentation needs gating, this two-gate pattern (login vs. premium, kept
  deliberately distinct) is the existing convention to follow or deviate from
  consciously — not something to invent fresh.
- `src/lib/hooks/useGlobalMotifLibrary.js` — the existing pattern for a
  user-contributed, server-persisted collection (motifs) that other users draw from;
  the nearest existing analogue to "a community pool of evaluation submissions,"
  worth reading before designing the submission data model.

**Persistence / storage**
- Supabase is the only backend integration found in `src/lib` and `package.json` —
  no other database/storage SDK is present. Blob storage for user-submitted photos
  (provider, bucket policy, size/format limits) is undesigned; Supabase Storage is
  the adjacent existing capability but no code path uses it yet for file upload.

**Vocabulary (CONTEXT.md, "Language" section)**
- **Sheet** — the physical material the machine works on.
- **Run** — one execution of a design on a physical machine (a maker "plans a run,
  then exports it"). The owner's "executed laser-cut/plotted piece" is a Run's
  physical output.
- **Mark** — the visible trace an operation leaves on a Sheet (frosted engraving,
  charred score, kerf-thin cut seam).
- **Reaction** — how a substrate responds to a process (physical, not stylistic);
  a Mark is the Reaction of a Sheet's substrate to an operation's process.
- **Material Archetype** — "the calibrated optics recipe a preview material
  resolves to... the single source of truth for how a material renders; grounded in
  measured properties of the physical stock." This is the noun the owner means by
  "rendering properties" / "calibrated material archetype constants."

---

## Open questions for the grilling session

Trust and evidence quality
- What makes a submission trustworthy enough to actually move an archetype
  constant? Phone photos vary wildly in white balance, exposure, ambient light color,
  and lens distortion — none of which the Canal Plastics reference corpus has to
  contend with (its whole value is a controlled, consistent rig). Does a submission
  need some in-app capture guidance (a fixed pose, a neutral-background prompt, a
  gray-card step) to be usable, or is raw-phone-photo chaos filtered out
  statistically once volume is high enough?
- Per-material-batch variance: acrylic sheets from different supplier lots (or
  different suppliers entirely) can differ from the Canal Plastics reference the
  archetype was originally calibrated against. Does a submission carry
  supplier/batch metadata, or is "Turquoise Opaque acrylic" treated as one ground
  truth regardless of where the maker's sheet came from?
- Is there any per-submission judgment step (self-rated match quality? a simple
  thumbs-up/down? nothing, and the aggregation pipeline is trusted to average out
  noise) — or does every submission get treated as equally weighted evidence?

The re-assessment job
- Weekly-ish cadence: does it **auto-apply** new archetype constants, or does it
  **propose** a diff for a human (Majed) to accept — given ADR 0003's "acceptance is
  external, not taste" stance was written for a human-in-the-loop sign-off, does
  automating that sign-off contradict or extend the ADR?
- What's the blast radius of a bad re-assessment — one bad batch of submissions
  skewing an archetype for every maker using that material, with no visible
  version history? Is there a rollback/versioning story for archetype constants?
- Does re-assessment operate per-archetype only, or could it ever suggest a *new*
  archetype (a material that doesn't fit the current fixed set) — and if so, that's
  a much bigger surface than constant-tuning inside `materialArchetypes.js`'s
  "small FIXED set."

Feature shape
- Is "evaluation" (photo of raw material vs. render, feeding calibration) and
  "project documentation" (photo of executed piece vs. render, feeding a portfolio/
  gallery) **one feature or two**? They share the side-by-side UX and the upload
  mechanism, but serve different purposes (private/aggregate calibration signal vs.
  public-facing maker showcase) and likely need different privacy/visibility
  defaults.
- If they're one feature: does every project-documentation upload implicitly become
  calibration evidence, or is that an opt-in checkbox?
- Does the "render screenshot" side of the pairing get captured fresh at submission
  time (in-app capture flow, possibly with a required camera pose/lighting preset
  for comparability) or can a maker attach an existing snapshot exported earlier via
  `Scene3D`'s save-image (today a "preview... NEVER part of the fabrication path"
  artifact with no submission/upload path)?
- How is a render screenshot made genuinely comparable to a phone photo? Fixed
  staging instructions mirroring `STAGING-NOTES.md` (angle, background, prop)?
  An in-app capture pose that locks camera/lighting for this purpose specifically?
  Without some constraint here, the community evidence pool inherits the same
  variance problem as the "trust" question above, one layer deeper.

Access and gating
- Entitlement: is submitting an evaluation free, signed-in-only, or premium —
  following the motif library's two-gate precedent
  (`src/lib/motifLibraryEntitlement.js`: separate login gate vs. premium scaffold)?
  Is *viewing* the community gallery/evidence pool gated differently than
  *contributing* to it?
- Moderation: uploaded project photos are user-generated content shown to other
  users (per the documentation-doubling framing) — what's the moderation story
  (automated, manual queue, report-and-remove, none at launch)?

Infrastructure
- Storage choice for uploaded photos: Supabase Storage is the only backend
  integration currently wired into the app (`src/lib/supabase.js`,
  `@supabase/supabase-js` in `package.json`); no blob storage code path exists yet.
  Provider choice, bucket/access policy, and size/format constraints are all
  undesigned.
- Where does the accumulated-evaluations database submission live — a new
  Supabase table, and if so what's its relationship (if any) to the existing motif
  library's persistence pattern (`useGlobalMotifLibrary.js`) as a precedent for a
  user-contributed, server-side collection?

---

**Status:** Vision captured 2026-07-10, pre-grill. Next step: `/grill-with-docs`
session, then PRD/issues.
