# Material Evaluation — Decisions Draft (slice 1)

**⚠️ PROVISIONAL — morning review required, not ADRs.**

Every decision below was made autonomously during the overnight build of the
first vertical slice (branch `feat/material-evaluation`, worktree
`~/Documents/Sonoform_all/Naqsha-material-eval`), resolving the open questions
the vision doc (`docs/material-evaluation-VISION.md`) deliberately left
undecided. Each was chosen as the most conservative, reversible default.
None of these are settled — they exist to be grilled.

Two decisions were **pre-made and binding** (owner's instruction, not mine):

- **B1 — The weekly re-assessment job is PROPOSE-ONLY.** It may generate a
  report suggesting archetype constant changes but must never auto-apply them.
  (This slice builds no job at all — see D10 — but B1 is recorded here and in
  migration 014's header so no future slice drifts into auto-apply.)
- **B2 — Evaluation submission is gated behind sign-in**, mirroring the motif
  library's login gate.

---

## D1 — Built in an isolated worktree, not the invoked checkout

**Decision.** All work happened in a fresh git worktree
(`~/Documents/Sonoform_all/Naqsha-material-eval`, branch
`feat/material-evaluation` off `origin/main` @ `7c0e8d9`), not in the
`Sonoform_generativeArt/generative-art-studio` checkout the session started in.

**Why.** Pre-flight found that checkout dirty with the concurrent calibration
harness's **uncommitted** work (modified `package.json`, `Scene3D.jsx`,
`main.jsx`; untracked `scripts/calibration-*.mjs`, `src/dev/`). Branching in
place would have entangled my commits with another agent's live workspace —
the exact checkout-race that previously sent a merge to the wrong branch in
the extraction workstream.

**Alternatives.** (a) Branch in place and `git add` only my paths — fragile,
and my feature touches `Scene3D.jsx` too; (b) stash their work — destructive
to a concurrent workstream, previously caused a near-loss ("rogue-agent
stash"). **Reversible:** the worktree can be removed after merge;
`git worktree remove` leaves main untouched.

## D2 — Depend only on committed code; the calibration harness is not a dependency

**Decision.** The slice reuses the **committed** snapshot path
(`<SnapshotCapture>` in `Scene3D.jsx` + `snapshotExport.js`) for the render
half of the pairing, and does not touch or build on the uncommitted
calibration route (`src/dev/CalibrationRoot.jsx`) or scripts.

**Why.** The harness exists only as uncommitted work owned by another agent;
code and tests cannot depend on files that aren't in history. The vision doc
itself says "do not assume their eventual shape."

**Known interaction for the morning:** the harness's uncommitted `Scene3D.jsx`
diff contains a real regression fix (idle scene renders black once the
composer went on-demand, because `SnapshotCapture`'s positive-priority
`useFrame` flips R3F into manual-render mode). My "Evaluate material" capture
uses the same `SnapshotCapture` pathway, so **in-app captures may come out
black until that fix lands**. Unit tests can't see this (WebGL). When the
harness merges, expect a trivial adjacent-lines merge in `Scene3D.jsx`.
*Empirically confirmed during the overnight browser run:* in a headless Chrome
against this branch, the 3D viewport does not present and the Evaluate capture
comes back as a black PNG (see `material-eval-2-dialog-sidebyside.png`). The
submission flow itself is unaffected — only the pixels are — and the fix is
already written on the harness's side.

## D3 — Feature shape: material-vs-render only, with a `kind` seam

**Decision.** Slice 1 implements only the v1 framing (photo of raw Sheet vs.
render). The owner's executed-piece evolution is OUT of scope but reserved as
data: the row carries `kind text check (kind in ('material-vs-render',
'piece-vs-render'))` defaulting to the former.

**Why.** The vision explicitly stages piece-vs-render as an evolution; a
constrained enum column is the cheapest reversible seam (new variant = widen
the check + UI, no new table). **Alternative:** two tables or a polymorphic
schema — heavier, decides the "one feature or two" question prematurely.

## D4 — Visibility: owner-only (private), no community gallery yet

**Decision.** RLS on `material_evaluations` is owner-only full access
(mirroring `user_motifs` verbatim); the `/evaluations` review view lists only
your own submissions. The storage bucket is **private**; images are served via
1-hour signed URLs created by the owner's session.

**Why.** Public visibility, moderation, and "is documentation a public
showcase" are open vision questions with UGC/moderation consequences.
Private-by-default is reversible (adding a read policy later is additive);
public-by-default is not (you can't unpublish what others saw). This also
defers the moderation story entirely — nothing user-uploaded is shown to
anyone but its owner.

**Alternatives.** Public bucket + public gallery (matches the "show off your
project" energy, but needs moderation before it's safe); org-scoped reads
(no org context in Studio yet).

**✅ GRILLED 2026-07-10 — LOCKED (Majed):** owner-only stands as authored.
Two corollaries locked with it: (1) the future re-assessment job reads via
**service role only** (a server-side job) — client RLS is never widened for
aggregation; (2) no admin-read policy — dogfood evidence review happens in the
Supabase dashboard. A `visibility` column is deliberately deferred to the
piece-vs-render grill (adding it later is one defaulted column).

## D5 — Storage layout & limits

**Decision.** One private bucket `material-evaluations`; objects at
`<user_id>/<evaluation_id>/photo.<ext>` and `.../render.png`. Owner-uid-first
paths are what the storage RLS keys on (`(storage.foldername(name))[1] =
auth.uid()::text` — the standard Supabase per-user-folder pattern). 10 MB cap,
`image/png|jpeg|webp` allowlist, mirrored client-side in
`validateSubmission()` so failures are friendly and early. The evaluation id
is generated client-side (`crypto.randomUUID`) so paths and row agree before
anything is written.

**Alternatives.** Two buckets (photo/render) — no benefit, doubles policy
surface; server-generated id with a two-phase insert — more round-trips for no
gain at this scale.

**✅ GRILLED 2026-07-10 — LOCKED (Majed):** (1) orphaned objects are handled by
**best-effort client cleanup** — any failure after the first upload removes the
already-written objects, cleanup failures never mask the original error
(implemented in `submitEvaluation`, 2 tests); a transactional edge function is
the graduation path, not slice-1 work. (2) The mime allowlist **stays
png/jpeg/webp** — iOS Safari transcodes HEIC→JPEG when `accept` excludes it,
and browsers can't render HEIC in `<img>` anyway; the desktop-.heic edge case
gets a clear validation message. (3) 10 MB cap unchanged.

## D6 — One row per pairing; archetype denormalized at capture time

**Decision.** The photo and render are stored as ONE `material_evaluations`
row ("the pairing is the atomic unit of evidence"). The row records
`material_id`, `material_name`, **and** the resolved `archetype` — computed at
capture time with the same `resolveAppearance()` the 3D scene uses.

**Why.** The re-assessment loop tunes *archetype* constants, and inference
rules (`NAME_RULES`) can change over time — the evidence must record what the
render *actually used*, not what today's resolver would say. Denormalization
here is honesty, not laziness. **Alternative:** resolve archetype at read
time — silently re-attributes historical evidence when rules change.

## D7 — Render capture: fresh in-app capture only, no attach-existing-PNG

**Decision.** The render side always comes from a fresh `<SnapshotCapture>`
frame taken by the new "Evaluate material" button in the 3D preview (Material
lens only). A maker cannot attach a previously downloaded save-image PNG.

**Why.** The vision flags comparability as a core worry; a fresh capture at
least guarantees the render is of the *current* material/archetype/scene and
lets a future slice lock camera/lighting presets. An attach-anything flow
invites mismatched pairs the aggregation layer can't detect. **Deferred (grill
topics):** a fixed calibration pose mirroring `STAGING-NOTES.md`; in-app
photo-capture guidance (gray card, neutral background); recording
environment/camera metadata into the row.

## D8 — Entry point & UI shape

**Decision.** The button lives in Scene3D's top-right control cluster next to
"Save image" and renders only when a material is selected AND the capture
handler is wired. One capture-target ref routes the frame: 'download' (Save
image, unchanged) or 'evaluate' (opens the dialog). The dialog is
self-contained (owns auth + submission hook) so Studio only threads the
capture pairing — ~15 lines of Studio change, following the
"minimal-Studio-edits" precedent. The review view is a plain `/evaluations`
route under NavLayout.

**Alternatives.** A submission flow inside the Material lens control (2D side,
no render to capture there); a dev-route-style dedicated page (hides the
feature from where the material decision actually happens).

## D9 — Gating: real login gate + premium scaffold, motif-library pattern verbatim

**Decision (B2 + precedent).** Login gate ships ON, enforced in the dialog
(logged-out → submit disabled + sign-in prompt) and belt-and-braces in the
hook (`submit` resolves null with no user). Premium entitlement is a separate
scaffold module (`materialEvaluationEntitlement.canSubmitEvaluation`, ships
OFF/always-true, one-line flip) that deliberately never encodes the login
requirement. *Viewing* `/evaluations` requires sign-in implicitly (owner-only
data — nothing to show a guest).

## D10 — The re-assessment job: not built, seam documented

**Decision.** No job, no report generator, no scoring in this slice. B1
(propose-only) is recorded in this doc and in migration 014's header; the
`idx_material_evaluations_archetype` index exists so the future job's
per-archetype rollup has a cheap access path.

**Why.** The scope was explicit that scoring/trust is out; a report that
"suggests constant changes" without a scoring model would be theater. Building
nothing is the most conservative honest option. **Also out of scope, noted:**
executed-piece-vs-render UX (seam in D3), trust/weighting model, supplier/
batch metadata (the `note` free-text is the interim home for it), moderation
(mooted by D4), any change to `materialArchetypes.js` (explicitly forbidden —
calibration is human-led).

## D11 — Offline behavior mirrors the motif library

**Decision.** Every service fn guards `!supabase` (null client → graceful
no-op: submit resolves null, list resolves empty); the hook surfaces errors as
state, never throws. Tests run with the same mutable-ref supabase mock idiom
as `userMotifService.test.js` — **no live Supabase anywhere in the suite**, and
migrations 009–014 remain UNAPPLIED (human-gated, per standing rule).

## D12 — Naming

**Decision.** Table/artifacts say **evaluation** (`material_evaluations`,
`MaterialEvaluationDialog`, `/evaluations`); user-facing copy says "Evaluate
material" / "Material evaluations" and uses canonical vocabulary (Sheet,
Material Archetype) in prose. "Submission" was avoided as a noun-of-record
because `submissions` already means org job submissions (org-admin feature).

---

## What needs Majed's judgment before ADR-ification

1. ~~D4 read model~~ — **GRILLED + LOCKED 2026-07-10** (owner-only,
   service-role aggregation, no admin policy). Still open from the same
   cluster: the documentation-doubling question (private calibration evidence
   vs. public maker showcase — one feature or two?) belongs to the
   piece-vs-render grill.
2. **Comparability constraints (D7):** should capture lock a pose/scene?
   Should photo upload get staging guidance? Without either, is the evidence
   pool usable at all (the vision's own trust question)?
3. ~~Orphaned-object cleanup (D5)~~ — **GRILLED + LOCKED 2026-07-10**
   (best-effort client cleanup shipped; mime allowlist and 10 MB cap stand;
   edge function deferred to graduation).
4. **Supplier/batch metadata (D10):** structured columns or keep free-text
   `note` until the re-assessment design forces the question?
5. **Scene3D merge coordination (D2):** land the calibration harness's
   black-frame fix before or with this branch; eyeball a real in-app capture.
6. **Migration 014 review + apply** (human-gated, alongside pending 009–013).
