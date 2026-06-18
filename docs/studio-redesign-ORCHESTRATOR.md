# Studio Redesign — Autonomous Orchestrator Runbook

> **Paste this whole file as the first message of a fresh Claude Code session**
> (run from `/Users/jadembg/Documents/Sonoform_all/Sonoform_generativeArt/generative-art-studio`).
> It turns that session into an **orchestrator** that implements the redesign
> issues end-to-end, in dependency order, each via a TDD subagent, leaving the
> build and tests green after every issue — unattended, overnight.

---

## 0. Mission

Implement GitHub issues **#1–#17** on `majedbg/Naqsha` (the AFK issues of the
Studio pro-layout redesign), in the dependency-respecting order in §3, each by
spawning **one implementation subagent that follows strict TDD** (red → green →
refactor). After each issue, **you** (the orchestrator) verify `npm test` +
`npm run build` are green, commit, log progress, and move to the next.

**STOP before #18, #19, #20.** They are HITL — blocked on data the user hasn't
provided (see §7). Do not implement them.

Context docs (read them once at start, and pass them to every subagent):
- `docs/studio-redesign-plan.md` — the locked decision spec (source of truth).
- `docs/studio-redesign-PRD.md` — the code-grounded PRD (per-issue requirements).
- Each issue's full body lives on GitHub: `gh issue view <N>`.

---

## 1. Hard rules (do not violate, even to "make progress")

1. **Never proceed past a red suite.** If `npm test` or `npm run build` fails and
   a retry doesn't fix it, STOP advancing that issue (see §5).
2. **Never touch #18 / #19 / #20.**
3. **One commit per issue**, on the integration branch only. Never commit to
   `main`. Never force-push. Never `git reset --hard` shared history.
4. **Do not auto-close issues.** Comment with the commit SHA and leave them open
   for the user's morning review.
5. **2-attempt cap per issue.** On a second failure, mark it blocked, revert that
   issue's uncommitted changes, skip its dependents, continue with the rest (§5).
6. **No scope drift.** A subagent implements exactly its issue's acceptance
   criteria — nothing from other issues.
7. If anything is ambiguous or a decision is missing, **do not guess** — log it as
   a question for the user and skip to the next runnable issue.

---

## 2. One-time preflight (run before any issue)

```bash
cd /Users/jadembg/Documents/Sonoform_all/Sonoform_generativeArt/generative-art-studio
gh auth status                      # must be logged in as majedbg
node -v                             # expect v22.x
npm ci || npm install               # ensure deps present
npm test                            # BASELINE must be GREEN before you start
```

- If the baseline is red, **stop and report** — do not start on a broken base.
- The integration branch **`layout-rework`** has **already been created off `main`**
  with the planning docs committed and pushed. Just make sure you're on it and current:

```bash
git checkout layout-rework
git pull --ff-only origin layout-rework   # no-op if already up to date
git status --short                          # expect clean working tree
```

(Fallback only if the branch is somehow missing: `git checkout main && git pull && git checkout -b layout-rework`, then re-add the four planning docs under `docs/` and commit them.)

- Create a run log: `docs/redesign-run-log.md` with a header line. Append one
  line per issue as you go (status, commit SHA, test count, notes).

Commands you will reuse:
- Tests: `npm test`  ·  Build: `npm run build`  ·  Lint: `npm run lint`
- Dev server (only if a subagent needs browser verification): `npm run dev`

---

## 3. Execution order (linearized topological — run top to bottom)

Run **sequentially** in exactly this order. Every issue's blockers appear above
it, so each is safe to start when you reach it. (Parallelization is possible but
**not recommended unattended** — see §6.)

| Step | Issue | Title | Blocked by (all done above) |
|----:|:-----:|-------|------------------------------|
| 1 | **#1** | Operation library (model + export + migration) | — |
| 2 | **#2** | App-shell scaffold (empty pro-layout regions) | — |
| 3 | **#3** | Machine-profile model (Laser/Plotter/Drag Cutter) | #1 |
| 4 | **#6** | Param inspector → right column | #2 |
| 5 | **#8** | Menu bar + fold legacy actions | #2 |
| 6 | **#9** | Tool strip + contextual control bar | #2 |
| 7 | **#12** | SVG import — place as artwork | #2, #1 |
| 8 | **#4** | Variable line-weight band model | #1, #3 |
| 9 | **#5** | Layer tree → left column + machine selector | #2, #3 |
| 10 | **#7** | Canvas chrome: rulers + bed + status bar | #2, #3 |
| 11 | **#10** | Operations / Cut-Settings panel | #1, #3, #2 |
| 12 | **#11** | Stroke/operation swatch → operation picker | #1, #9 |
| 13 | **#13** | Per-pattern unit-tagging (mm in inspector) | #6 |
| 14 | **#14** | Document Setup dialog (machine + bed) | #3, #8 |
| 15 | **#15** | Plot preview + overlap → canvas overlay | #7 |
| 16 | **#17** | Variable line-weight UI (advanced toggle) | #4, #10, #6 |
| 17 | **#16** | Decommission old two-pane + simplified mobile | #5,#6,#7,#8,#9,#1 |
| — | ~~#18~~ | ITP Camp Kit | **HITL — STOP, see §7** |
| — | ~~#19~~ | ITP Camp access + submission | **HITL — STOP, see §7** |
| — | ~~#20~~ | [Stretch] Direct machine-code generation | **PARKED, see §7** |

**Dependents-skip map** (if an issue fails twice, skip these too and log it):
- #1 fails → skip #3,#4,#5,#7,#10,#11,#12,#16,#17 (almost everything — STOP & report)
- #2 fails → skip #5,#6,#7,#8,#9,#10,#12,#16,#17 (STOP & report)
- #3 fails → skip #4,#5,#7,#10,#14,#17,#16
- #6 fails → skip #13,#17,#16
- #4 fails → skip #17
- #10 fails → skip #17
- #7 fails → skip #15,#16
- #5/#8/#9 fail → skip #16 (and #14 if #8); continue everything else

---

## 4. Per-issue loop (do this for each step in §3)

For issue **N**:

1. **Preflight:** working tree clean (`git status --short` empty) and `npm test`
   green. If not, fix or stop.
2. **Read the issue:** `gh issue view N` — note **## What to build**,
   **## Acceptance criteria**, **## Test plan (TDD)**.
3. **Spawn a TDD implementation subagent** (Agent tool, `general-purpose`) with
   the prompt in §4a. Wait for it to return its structured result.
4. **Verify (you, not the subagent):**
   ```bash
   npm test && npm run build
   ```
   - **Green** → commit:
     ```bash
     git add -A
     git commit -m "feat(redesign): #N <short title>"
     ```
     Then comment on the issue (leave it open):
     ```bash
     gh issue comment N --body "Implemented on layout-rework in <SHA>. Tests + build green. Left open for review."
     ```
     Append a success line to `docs/redesign-run-log.md`.
   - **Red** → give the subagent ONE more turn with the failing output (SendMessage
     to the same agent). Re-verify. If still red:
     ```bash
     git checkout -- . && git clean -fd   # revert this issue's changes only
     ```
     Log it as **BLOCKED**, apply the dependents-skip map (§3), continue.
5. **Push after every green issue** (required) so progress is visible remotely:
   ```bash
   git push origin layout-rework
   ```
   Do **not** open PRs automatically. If a push is rejected (non-fast-forward),
   STOP and report — do not force-push.

### 4a. Subagent prompt template (fill in N and the title)

> You are implementing **GitHub issue #N — "<title>"** in the Naqsha repo
> (`/Users/jadembg/.../generative-art-studio`), using **strict TDD**. If the
> `/tdd` skill is available to you, use it; otherwise follow its red-green-refactor
> discipline manually.
>
> **Read first:** `gh issue view N` (your spec — What to build, Acceptance
> criteria, Test plan), plus `docs/studio-redesign-plan.md` and
> `docs/studio-redesign-PRD.md` for cross-cutting context and the exact data
> shapes. Match existing repo conventions (React + Vite + Tailwind + Supabase;
> vitest; the scene-graph + operation-library patterns already established by
> earlier issues on this branch). Use the codebase-index / code-search MCP if
> available to locate symbols before editing.
>
> **Method:**
> 1. **RED** — write the tests from the issue's "Test plan (TDD)" section first;
>    run `npm test` and confirm they fail for the right reason.
> 2. **GREEN** — implement the minimum to pass every acceptance criterion.
> 3. **REFACTOR** — clean up; keep tests green; keep diffs minimal and on-topic.
> 4. Run `npm test`, `npm run build`, and `npm run lint`. All must pass.
>
> **Constraints:** implement ONLY issue #N — no other issue's scope. Do not
> commit, push, close issues, or touch git history (the orchestrator handles
> that). Do not start the dev server unless browser verification is required by
> an acceptance criterion. Do not modify the planning docs.
>
> **Return:** a structured result — PASS/FAIL, files changed, new test count,
> `npm test` + `npm run build` outcomes, and anything you had to assume or
> couldn't satisfy.

---

## 5. Failure & stop conditions

- **Per-issue:** 2 subagent attempts max → revert + mark BLOCKED + apply skip map.
- **Global stop-and-report** if any of: baseline red; #1 or #2 fails; >4 issues
  BLOCKED; the working tree won't return to clean; `gh` auth lost; or you detect
  you're looping on the same failure. On a global stop, write the report (§8) and
  end — do not thrash.
- **Never** weaken or delete a failing test to make the suite "green." If a test
  in the Test plan is wrong, note it in the log and skip the issue.

---

## 6. Parallelism (optional, advanced — default OFF)

Sequential is the safe default for unattended runs (no merge conflicts, clean
bisect). If you choose to parallelize, only run issues from the **same wave** that
**don't share files**, each subagent in its **own git worktree**
(`isolation: "worktree"`), and merge them back **one at a time** with a full
`npm test` gate between merges. Waves: `{#1,#2}` → `{#3,#6,#8,#9,#12}` →
`{#4,#5,#7,#10,#11,#13,#14}` → `{#15,#16,#17}`. When in doubt, stay sequential.

---

## 7. HITL / parked issues — DO NOT IMPLEMENT

Leave a comment on each and move on:
- **#18 ITP Camp Kit** — blocked on user data: the **2 ITP Camp laser-bed
  dimensions**, the **ITP Camp logo SVG**, and **palette sign-off**.
- **#19 ITP Camp access + submission** — blocked on the **NYU-ID roster** (IDs +
  names) for `itp_camp_roster`.
- **#20 [Stretch] direct machine-code generation** — out of scope for this
  redesign; do not start.

```bash
gh issue comment 18 --body "Parked overnight: needs the 2 ITP laser-bed dimensions, the ITP Camp logo SVG, and palette sign-off before implementation."
gh issue comment 19 --body "Parked overnight: needs the NYU-ID roster (IDs + names) before implementation."
```

---

## 8. Morning report (always produce this at the end)

Write `docs/redesign-run-log.md` and also print a final summary containing:
- ✅ Issues completed (with commit SHAs and new-test counts).
- ⛔ Issues blocked/skipped (with the reason and which dependents were skipped).
- 🌙 HITL issues parked (#18/#19/#20) and the exact data each needs.
- Final `npm test` + `npm run build` status on `layout-rework`.
- Confirm the branch was pushed after each issue; suggest the next human action
  (e.g. open a PR from `layout-rework` → `main` for review).

---

## Quick reference

- Repo: `majedbg/Naqsha` · branch: **`layout-rework`** (off `main`), **pushed after every issue**.
- Order: **1, 2, 3, 6, 8, 9, 12, 4, 5, 7, 10, 11, 13, 14, 15, 17, 16**, then stop.
- Gate after every issue: `npm test && npm run build` must be green before commit, then `git push origin layout-rework`.
- Labels: `ready-for-agent` = AFK (do it) · `needs-human` = HITL (#18–20, skip).
