# Adversarial review: project saving and the Neon pivot

Date: 2026-07-30
Reviewed tree: working copy on `main` (post-merge of `feat/pitch-control`, `f3183ee`)
Reviews: [`project-saving-architecture-review-2026-07-30.md`](./project-saving-architecture-review-2026-07-30.md) against the brief in [`project-saving-adversarial-brief-2026-07-30.md`](./project-saving-adversarial-brief-2026-07-30.md)

---

## 1. Verdict

**The prior review's conclusion holds, but its evidence base was weaker than its confidence and its severity ranking is wrong in three places.**

Three corrections matter more than the agreement:

1. **The SQL findings are no longer conditional.** The prior review could not reach the deployed database and labelled the privilege findings "conditional on deployed grants." Read-only probes against the live production project (`auyanasfakhppsodgcdy.supabase.co`) settle it: `add_ai_credits` and `deduct_ai_credits` are **executable by the anonymous role today**, and `profiles` accepts a `PATCH` carrying the `tier` column without a privilege error. This is a live, deployed authorization defect, not a migration-text concern. It is now the highest-severity finding in the report and it is independent of everything else here.

2. **The dirty-tracking defect is an inversion, not an omission.** The prior review reported "Panel Sheet changes do not participate in dirty tracking." That is true but understates it. `useDesignPersistence` hashes `bgColor` — which `CONTEXT.md` defines as *explicitly not document content* — and is structurally blind to `panels`, which `CONTEXT.md` defines as *owning Sheet stock identity*. The dirty signal tracks precisely the wrong two things. Stated as an inversion, it forces the first decision on the map rather than merely listing a bug.

3. **The prior review missed the largest data-loss surface in the app.** Nothing flushes the 3-second `useLayers` local write. The only `beforeunload`/`visibilitychange` handler in the entire codebase lives in `useAutosave` and is gated on a signed-in user *with an existing cloud id*. Every reload, crash, tab-close, and OAuth redirect silently discards up to three seconds of layer, panel, glyph, and optimization edits — for **every tier, including guests, including users who have never signed in**. The prior review saw one instance of this (as an OAuth timing inference, claim 6) and missed the general case.

Against that, two of the prior review's findings are **overstated** and one is **effectively unreachable in production** (§4).

The prior review's architectural recommendation — a canonical, schema-versioned Project Document consumed by every persistence path, plus a Save Coordinator owning identity and write serialization — is correct and I endorse it unchanged. My disagreement is with the ranking, the evidence, and what must be decided before any of it is built.

**On the Neon question: not yet.** Not because Neon is wrong, but because migrating a persistence layer whose document boundary is undecided means porting the ambiguity into a less mature platform. The SQL privilege repair, however, should not wait for that decision — see §8.

---

## 2. Blocking findings

### B1 — Privileged credit functions are executable by the anonymous role (live, deployed)

**Status: CONFIRMED — deployed grant proven by live probe. Exploit outcome deterministic from source, not live-proven.**

`deduct_ai_credits` and `add_ai_credits` are declared `SECURITY DEFINER` with no `REVOKE` anywhere in the migration set (`supabase/migrations/20250101000002_ai_credits.sql:38-84`). PostgreSQL grants `EXECUTE` on new functions to `PUBLIC` by default. The migrations contain exactly two `GRANT` statements in the whole directory (both in `20250101000009_user_patterns.sql`, both for `ai_patterns`) and **zero `REVOKE` statements**.

Probes run against production with the public anon key (read-only by construction — see the safety note below):

```
POST /rest/v1/rpc/add_ai_credits    {"amount":0}  ->  200, body: null
POST /rest/v1/rpc/deduct_ai_credits {"amount":0}  ->  400, {"code":"P0001","message":"Profile not found"}
```

Both prove `EXECUTE` is granted to `anon`. The second is the stronger evidence: `P0001` is the `RAISE EXCEPTION 'Profile not found'` on line 52 of the migration — the request reached *inside the function body*. A missing grant returns `42501`, not a user-defined exception.

These probes could not mutate anything. As the anonymous role `auth.uid()` is `NULL`, so every `UPDATE public.profiles ... WHERE id = auth.uid()` in both function bodies matches zero rows. That property is what makes the grant testable without touching production data.

Two independent defects sit behind that grant:

- **`add_ai_credits(amount)`** takes a caller-supplied amount and adds it to both `ai_credits` and `ai_credits_purchased` with no authorization check beyond `auth.uid()` being non-null. Any signed-in user would be able to grant themselves unlimited AI credits with one RPC call — pending the isolated-branch confirmation below, which is the only step this review could not take. There is no server-side purchase verification anywhere in the path.
- **`deduct_ai_credits(amount)`** subtracts `amount`. A negative amount adds credits, and it also bypasses the `current_credits < amount` guard, since a negative amount is less than any non-negative balance.

**A third defect the prior review did not identify:** both functions are `SECURITY DEFINER` with **no `SET search_path`**. `handle_new_user` in the initial schema (`20250101000001_initial_schema.sql:51`) sets it correctly, so the omission is inconsistent rather than a house style. `get_shared_design` (line 195) has the same omission. A `SECURITY DEFINER` function with a mutable `search_path` is a standard privilege-escalation primitive and Supabase's own advisor flags it. These functions fail open by construction, independent of any grant configuration.

**Why this outranks everything else:** it is live, it is reachable by any authenticated user with no tooling beyond the browser console, and unlike every other finding in this report it has nothing to do with the architecture refactor. It can and should be fixed on its own.

**Exact verification still required** (needs service-role or SQL-editor access):

```sql
-- confirm the grant and the missing search_path
select p.proname, p.prosecdef, p.proconfig,
       array(select grantee::text from information_schema.routine_privileges rp
             where rp.routine_name = p.proname and rp.privilege_type = 'EXECUTE') as executors
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('add_ai_credits','deduct_ai_credits','get_shared_design');
```

**Exploit confirmation** must run on an isolated branch or a throwaway project, never production: create a test user, sign in, call `add_ai_credits(1000)`, and assert the `ai_credits` delta on that user's own row.

### B2 — `profiles` accepts writes to `tier` at the column-privilege level

**Status: CONFIRMED for the `anon` role by live probe. NARROWER THAN STATED for `authenticated` — near-certain, but not proven.**

The prior review's reasoning is right: `"Users update own profile"` (`20250101000001_initial_schema.sql:44-46`) is row-scoped (`auth.uid() = id`) with no column restriction, and later migrations added privileged columns — `ai_credits`, `ai_credits_purchased` (`002`) and `settings` (`008`) — without adding one. Migration `008` explicitly documents this as intentional at lines 11-14.

Live probe, using a filter that matches no row:

```
PATCH /rest/v1/profiles?id=eq.00000000-0000-0000-0000-000000000000
  body {"tier":"studio"}   ->  204 No Content
```

`204` rather than `42501` proves the `anon` role holds `UPDATE` privilege on `profiles` **including the `tier` column**. PostgreSQL checks column privileges independently of whether any row matches, so this is a sound inference about the privilege, not about the row.

**Where I stop short of the prior review:** this proves the grant for `anon`, not for `authenticated`. Anonymous callers are still blocked at the row level (`auth.uid()` is `NULL`, so no row satisfies the policy). The exploit requires the `authenticated` role to hold the same column privilege — which is Supabase's default and which no migration revokes, making it near-certain, but I did not prove it and will not by mutating production.

The consequence if it holds: any signed-in user can set their own `tier` to `'studio'` and their own `ai_credits` to any value. `getEffectiveTier` in `AuthContext.jsx:53-75` trusts the column directly, including an explicit `if (!subscription_status) return tier;` branch commented "manually set in DB — trust it."

**Exact verification query:**

```sql
select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee in ('anon','authenticated')
  and privilege_type = 'UPDATE'
  and column_name in ('tier','ai_credits','ai_credits_purchased',
                      'stripe_customer_id','subscription_status');
```

Any row returned for `authenticated` confirms the escalation.

### B3 — Up to 3 seconds of document edits are lost on every reload, for every tier

**Status: CONFIRMED. Not present in the prior review as a general finding.**

`useLayers` writes layers, background, panels, custom glyphs, and optimizations on a 3000ms debounce (`src/lib/useLayers.js:371-402`), with `clearTimeout` in the effect cleanup. The unified-history tail rides an identical independent 3000ms timer (`Studio.jsx:1796-1816`).

The only `beforeunload` / `visibilitychange` / `pagehide` listeners in the entire `src/` tree are in `useAutosave.js:117-131`. They call `flush()` → `runSave()`, which returns early unless `enabledRef.current` (a signed-in user) **and** `hasDesignIdRef.current` (an existing cloud id) are both true (`useAutosave.js:61-64`). That path saves to the *cloud*; it never touches the local write.

So there is no flush of local document state on unload for anyone:

- a **guest** — `localStorage: true` for every tier (`tierLimits.js:32`) — loses the last ≤3s unconditionally;
- a **signed-in user who has never saved to cloud** loses it (no `currentDesignId`);
- a **signed-in user with a cloud id** has the cloud write attempted, but `beforeunload` cannot await an async HTTP call, so this is best-effort at most; the local write is still not flushed.

**Compounding it — a live torn-write, not just a quota edge case.** `useCanvasSize` persists `sonoform-canvas` in an effect with **no debounce** (`useCanvasSize.js:57-74`), so canvas dimensions, unit, margin, and `outputMode` are written *immediately* while layers and panels lag by up to three seconds. A reload inside that window restores new canvas state against an older document. The prior review characterised key fragmentation as needing "fault injection" to demonstrate; it does not — the two writers run on different clocks by design and the skew is reachable in normal use.

This is a data-loss finding affecting the app's largest user population (guests, who cannot save at all), which is why it outranks the cloud-identity finding below.

### B4 — Failed-save recovery drafts for existing designs are permanently unreachable

**Status: CONFIRMED, and worse than the prior review states.**

`draftKey` namespaces by design id, or the literal `'new'` (`localDraft.js:16-18`). `useCloudPersistence` freezes the mount key in `useState` at mount, when `currentDesignId` is always `null` — so the key is always `sonoform-cloud-draft:new` — and reads `pendingDraft` exactly once, at mount (`useCloudPersistence.js:81-82`).

A failed save of an *existing* design writes under `draftKey(currentDesignId)`, captured at call time (line 153), so the draft lands at `sonoform-cloud-draft:<uuid>` (line 204).

The prior review says that key "is never selected by the recovery surface" after reload. It is stronger than that: because both the mount key and `pendingDraft` are frozen at mount, **loading that same design later in the session does not surface the draft either**. There is no code path in the application that ever reads a `sonoform-cloud-draft:<uuid>` key. The draft is unreachable from the moment it is written, and `clearDraft` is only ever called with a key the session already holds — so these entries accumulate in `localStorage` permanently, each carrying a full document config.

**Cross-account leak, additionally confirmed:** draft keys carry no account subject, so the `:new` draft written by account A is read at mount by account B on the same browser (see B5).

### B5 — Sign-out leaves the entire previous account's document on the browser

**Status: CONFIRMED.**

`AuthContext` clears exactly three things on sign-out: the extracted-pattern library, the Etch source cache, and `sonoform-profile` (`AuthContext.jsx:164-180` and `207-219`). Both the `SIGNED_OUT` event branch and the belt-and-braces `signOut` twin clear the same three.

Enumerated from the source, these survive sign-out and are read by the next account at mount:

| Key | Written by | Content |
|---|---|---|
| `sonoform-layers` | `useLayers.js:383` | full layer set, including Etch source images |
| `sonoform-panels` | `panels.js:305` | Panels and their Sheet stock identity |
| `sonoform-custom-glyphs` | `useLayers.js:392` | document custom glyphs |
| `sonoform-optimizations` | `useLayers.js:395` | applied Optimizations |
| `sonoform-bg-color` | `useLayers.js:388` | canvas background |
| `sonoform-canvas` | `useCanvasSize.js:59` | dimensions, unit, margin, machine mode |
| `sonoform-history` (tail) | `history/persist.js:33` | undo/redo tail incl. document snapshots |
| `sonoform-cloud-draft:*` | `localDraft.js:21` | full document configs from failed saves |
| `sonoform-layer-groups` | — | saved layer groups |

Account B on a shared browser opens the studio to account A's document. Row-level security correctly prevents B from *overwriting* A's cloud rows, so this is a confidentiality and hygiene failure rather than a corruption one — but the document content, including imported photographs in Etch layers, is fully readable.

The asymmetry is the tell: the codebase already understood this class of problem for the extracted-pattern library (issue #50) and the Etch source cache (#86), with careful comments explaining exactly why each must clear. The document itself was never brought under the same rule.

---

## 3. High and medium findings

### H1 — Dirty tracking is inverted with respect to the domain model

**Status: CONFIRMED, and re-framed. This is the finding that should drive the first decision.**

`serializeState` hashes exactly three things (`useDesignPersistence.js:43-52`): `bgColor`, applied optimizations, and layers minus `paramsCache`. `panels` is not an input to the hook at all — not a parameter, not a dependency.

Set against `CONTEXT.md`:

- **Canvas Background** — "*a visual aid behind the design, not a description of the Sheet and not fabrication content. It belongs to the maker's workspace preferences rather than the document.*" → **is in the dirty signal.**
- **Panel** — "*Each Panel owns its Sheet stock identity — material choice and thickness.*" → **is invisible to the dirty signal.**

The consequence chain: `useAutosave` schedules on `isDirty`'s referential identity changing (`useAutosave.js:110-114`), and that identity derives from `[serializeState, layers, bgColor, optimizations]`. A Panel edit — `setPanels` via `onUpdatePanel` at `Studio.jsx:3021-3025`, which mutates no layer — changes none of those. No dirty signal, no autosave, no unsaved-work guard.

There is a second-order oddity worth recording: `bgColor` *is* passed into `useCloudPersistence` (`Studio.jsx:1713`) but is **not** included in the saved `config` (`useCloudPersistence.js:128-139`). It is used only to compute the clean baseline. So background is the one piece of state that dirties the document, triggers a cloud write, and is not in what gets written. That is self-consistent with the domain model's claim that it isn't document content — and inconsistent with it being the dirty signal.

**Where I narrow the prior review's severity.** It rated this P0 on the basis that the maker's fabrication intent is silently lost. In *document-integrity* terms that is right. In *fabrication-output* terms it is narrower than implied, and the distinction matters for prioritisation:

- `panel.substrate.kind` reaches the export path in exactly one place — the generated **filename** (`panelExport.js:46`).
- `panel.substrate.thickness` **does not reach the export path at all.**

So a lost 3mm→5mm change does not today produce a wrong cut file; it produces a wrong record of what the maker decided to cut, and a wrong 3D preview. That is still a real defect — the document is the maker's record — but it is a correctness-of-record failure, not a machine-output failure. Ranking it below B1–B5 reflects that.

### H2 — `materialId` is already leaking out of "preview-only"

**Status: the prior review's open question is answerable — and the answer is not the one the code comment gives.**

`createPanel` documents `materialId` as "*Optional catalog material … for the 3D preview*" (`panels.js:56-59`). Tracing every reader:

- `materialPreview.js:72-87` — canvas/3D colour resolution. Preview.
- `useCanvas.js:718-719` — **`resolveHold(layer.params?.hold, materialId)`**.

That second one is not preview. Per `CONTEXT.md`, Highlight Hold is "*the guarantee that highlights above a cutoff produce zero etched dots — the 'err on the side of NOT etching' floor that protects irreversible surfaces like mirror acrylic. Defaults on for mirror stock, off for forgiving stock.*"

So `materialId` already determines whether a region of an Etch **burns or does not burn** on an irreversible surface. It is a fabrication-affecting input wearing a preview-only label, and it is currently: not in the dirty signal (it lives on `panels`), saved to the cloud (via `panels`), and not restored on a history-snapshot load (H4).

This is not a bug to fix in passing — it is a genuine product decision about whether `substrate` and `materialId` are two representations of one thing. Getting it wrong in either direction produces a wrong document invariant. It belongs on the map, not in a patch.

### H3 — Cloud open discards dirty work with no decision point

**Status: CONFIRMED for the design-load path; the prior review's control-flow reading is accurate.**

`CloudSaveModal` calls `onLoad(design.id)` and `onClose()` back to back on a thumbnail click (`CloudSaveModal.jsx:169` and `204`). `handleLoadCloudDesign` overwrites layers, panels, canvas size, name, and history with no reference to `isDirty` (`useCloudPersistence.js:227-267`).

Failure is invisible: the `catch` at line 265-267 logs to the console and returns. The user sees the modal close and nothing change, with the save-status indicator still reading whatever it read before.

### H4 — Restoring a history snapshot silently drops applied Optimizations

**Status: CONFIRMED. Not in the prior review.**

The `onLoadConfig` handler (`Studio.jsx:2652-2663`) — the Pro history-snapshot restore path — is a *different* loader from `handleLoadCloudDesign`, and the two disagree.

To its credit it is **safer** than the prior review would predict: it routes through `loadDocumentWithPanels`, so `normalizePanels` runs and panels are restored. But comparing it against the cloud loader:

| | `handleLoadCloudDesign` | `onLoadConfig` (history restore) |
|---|---|---|
| layers + custom glyphs | yes | yes |
| panels (normalized) | yes | yes |
| canvas size | yes | yes |
| **applied Optimizations** | `hydrateOptimizations(...)` | **never called** |
| `currentDesignId` | set | **not set** |
| marks clean | yes | yes |

Restoring a snapshot therefore leaves the *previous* document's applied Optimizations in place while calling `markCleanFrom` (line 2662) — so the mismatched state is immediately labelled "Saved". Per ADR 0002, export uses applied optimization values, so this one silently pairs restored geometry with unrelated conditioning. It is the sharpest possible illustration of the prior review's central thesis: five loaders, five different opinions about what a document is.

### H5 — Concurrent first saves both insert; no revision guard on updates

**Status: CONFIRMED as an absence of coordination.**

`handleSaveToCloud` has no in-flight guard (`useCloudPersistence.js:125-207`). `useAutosave`'s `inFlightRef`/`isSavingRef` guard (lines 61-64) protects auto-vs-auto and auto-vs-manual, but nothing serialises manual-vs-manual: `onCloudSaveIntent` (`Studio.jsx:1744-1747`) is wired to both ⌘S and the menu item and calls straight through.

Two rapid ⌘S presses before the first resolves both read `currentDesignId === null` and both take the insert branch of `saveDesign` (`designService.js:19-25`). `saveDesign`'s update branch has no expected-revision predicate (`.eq('id').eq('user_id')` only), so overlapping updates resolve last-writer-wins with no detection — which is also the two-tab and two-device story.

### H6 — The 100-design cap is not enforced anywhere

**Status: CONFIRMED.**

`countUserDesigns` exists (`designService.js:63-71`) and `checkGate(tier, 'cloudSave', count)` exists (`tierLimits.js:217-228`). Neither has a single production caller — `grep` across `src/` returns only `tierLimits.test.js`. There is no database constraint or trigger enforcing `maxCloudSaves: 100`. The cap is documented, tested in isolation, and inert.

This compounds B6 below and the cloud-identity finding: every reload followed by a manual save mints another row, against an unenforced ceiling.

### H7 — History snapshots are written on every autosave (cost projection)

**Status: CONFIRMED write pattern. Volume is a PROJECTION, not a measurement — see the caveat.**

Every successful save with `limits.historySnapshots > 0` fires `saveHistorySnapshot` (`useCloudPersistence.js:182-186`), and that includes **autosaves**, not just manual saves. `historySnapshots` is 50 for free/pro/studio (`tierLimits.js:56`), so this is on for every signed-in user.

Each call inserts a full `config` jsonb **plus a base64 JPEG thumbnail into a Postgres `text` column** (`designService.js:134-140`; column declared `text` at `initial_schema.sql:93` with the comment "~50-100KB"), then selects every id for the design and may issue a bulk delete (lines 143-151). With autosave on a 3000ms debounce, sustained editing produces a snapshot roughly every few seconds until the 50-row window saturates.

Projected steady state: 100 designs (the nominal cap) × 50 snapshots × ~100KB thumbnail ≈ **500MB of thumbnails alone**, before `config` jsonb. Neon's Free plan storage ceiling is 0.5 GB per project. If that projection is even directionally right, the app does not fit Neon Free on `design_history` alone — which makes this a go/no-go input, not a tidy-up.

**Why this is a projection.** `design_history` is correctly protected by RLS (my anonymous probe returned zero rows), so I cannot measure it without service-role access. The exact measurements needed:

```sql
select relname,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and relname in ('designs','design_history','ai_patterns','user_motifs')
order by pg_total_relation_size(c.oid) desc;

select count(*) as rows,
       pg_size_pretty(sum(length(thumbnail))::bigint) as thumb_bytes,
       pg_size_pretty(sum(pg_column_size(config))::bigint) as config_bytes
from public.design_history;
```

Plus per-bucket object counts and bytes for `submissions`, `pattern-photos`, `material-evaluations`, and `etch-sources`. Storage is not covered by the database allowance and is not in the 0.5 GB figure at all.

Pruning failures are additionally invisible: `saveHistorySnapshot` is called with `.catch(() => {})` (line 183-185), and the prune's own delete result is never checked (`designService.js:150`).

---

## 4. Refuted or overstated claims

Answering the brief's fourteen claims directly. Verdicts are **Confirmed** / **Refuted** / **Narrower than stated** / **Cannot verify**.

| # | Claim | Verdict |
|---|---|---|
| 1 | Panel Sheet-only edits do not dirty or autosave | **Confirmed** — and re-framed as an inversion (H1) |
| 2 | Cloud persistence omits important fabrication state | **Confirmed** (§4.1 below) |
| 3 | Reload loses cloud identity, causing duplicate insertion | **Confirmed**, severity lowered (§4.2) |
| 4 | Existing-design recovery drafts undiscoverable after reload | **Confirmed**, and stronger (B4) |
| 5 | Google sign-in loses the pending save intent | **Confirmed** (§4.3) |
| 6 | The redirect can beat the delayed local checkpoint | **Confirmed but badly understated** — it is not OAuth-specific (B3) |
| 7 | Local project content can cross authenticated accounts | **Confirmed** (B5) |
| 8 | Manual saves can race or resolve out of order | **Confirmed** (H5) |
| 9 | Cloud open/history can replace dirty work without a decision | **Confirmed for cloud open; partly refuted for history** (§4.4) |
| 10 | The configured cloud-save cap is not enforced | **Confirmed** (H6) |
| 11 | Full config/thumbnail history is a meaningful cost risk | **Confirmed as a projection; not measured** (H7) |
| 12 | A resolved `null` repository result can show "Saved." | **Narrower than stated — unreachable in production** (§4.5) |
| 13 | Profile/credit SQL permits privilege escalation | **Confirmed and upgraded from conditional to deployed** (B1, B2) |
| 14 | Shared designs enumerable without token possession | **Confirmed in mechanism; blast radius currently zero** (§4.6) |

### 4.1 Claim 2 — confirmed, with the omission list corrected

The saved `config` is exactly `{ layers, canvasW, canvasH, presetIndex, panels, customGlyphs, optimizations }`, plus `history` on manual saves only (`useCloudPersistence.js:128-149`).

Confirmed omissions, each verified against a real state owner rather than inferred:

- **Operation library** (`operations`) — the document's fabrication recipes, which layers reference by id. Per `CONTEXT.md`, "*order in the library is machine execution order*." Absent.
- **Unit** and **Margin** — owned by `useCanvasSize`, in `sonoform-canvas` locally, absent from the cloud config.
- **Machine Profile / `outputMode`** — same. `CONTEXT.md`: "*Determines which operation parameters exist and how export colors resolve.*" Absent.
- **`bgColor`** — absent, which is *correct* per the domain model, and is worth stating so that "make the shapes match" is not treated as the fix.

`presetIndex` is saved but never re-applied on load; `applyCanvasSize` recomputes it from dimensions (`useCanvasSize.js:93-101`), so the stored value is dead weight.

The code already admits this. `Studio.jsx:665-673` documents that the history checksum "*mismatches and the tail is dropped*" for any non-default document precisely because "*the cloud save/load only round-trip layers + panels + canvas W/H.*" The whole-document history feature is shipped but non-functional for real documents, and the reason is this finding.

### 4.2 Claim 3 — confirmed, but it is not a P0

`currentDesignId` initialises to `null` (`useCloudPersistence.js:56`) and is set only by an in-session save (line 179) or load (line 243). Nothing persists it; `saveDesign` inserts whenever `existingId` is falsy (`designService.js:7`). After reload, local keys restore the document but not its cloud identity, so the next manual save inserts a second row.

I disagree with the P0 rating. The user's work is not lost — it is duplicated, and both copies are intact and openable. Ranked against B3, where edits are irrecoverably gone, and against B1, where an authorization boundary is open, "an extra row appears in your saved list" is a serious workflow and cost defect but not a data-loss one. Rated High.

One aggravating detail the prior review missed: because autosave is gated on `hasDesignId` (`Studio.jsx:1760`), the post-reload session has **no autosave at all** until the user manually saves. The window in which only the 3-second local write protects the work is therefore unbounded, which is what makes B3 bite hardest exactly here.

### 4.3 Claim 5 — confirmed; the fix is a product decision, not a bug fix

A guest's save intent routes to `signIn()` and nothing else (`Studio.jsx:1744-1747`). `signInWithOAuth` performs a full-page redirect (`AuthContext.jsx:196-205`). `AuthCallback` awaits the session then unconditionally `navigate('/')` (`AuthCallback.jsx:16-18`) — no `returnTo`, no intent. Post-return, autosave is still gated on a cloud id that does not exist.

Nothing durable records that the user asked to save. Confirmed. But the prior review is right that the *remedy* is a genuine fork — finish the save automatically, or return and ask — and that is a decision for the map.

The edit-loss half is the general B3 problem, now confirmed rather than inferred: the redirect is a full page navigation, so a pending 3000ms local write simply never fires.

### 4.4 Claim 9 — confirmed for cloud open, partly refuted for history

Cloud open: confirmed (H3).

History-snapshot restore: **the specific concern is partly refuted.** `onLoadConfig` (`Studio.jsx:2652-2663`) does route through `loadDocumentWithPanels`, so `normalizePanels` runs and panels survive — it is not the naive overwrite the framing implies. What it does instead is worse in a different way: it drops applied Optimizations and never sets `currentDesignId` (H4). Both loaders replace without a dirty check; they differ in what they lose.

### 4.5 Claim 12 — narrower than stated: unreachable in production

The code path is real. `saveDesign` returns `null` when `supabase` is falsy (`designService.js:4`); `handleSaveToCloud` guards only identity and clean-marking behind `if (design)` (lines 178-187) while `setLastSavedAt`, `setNameDirty(false)`, `setSaveState("saved")`, and `clearDraft(key)` all run unconditionally after it (lines 188-197). A `null` result does present as "Saved" and drops the recovery draft.

**But it cannot be reached in production.** `handleSaveToCloud` returns immediately on `!user` (line 126), and `user` derives from `session?.user` in `AuthContext`, whose `onAuthStateChange` subscription is itself inside `if (!supabase) return` (`AuthContext.jsx:136`). No `supabase` means no session, means no `user`, means the function has already returned. The two conditions are mutually exclusive.

This is a **latent interface hazard**, not a live defect: the module's contract permits a caller to inject a `user` without a configured client, and tests do exactly that. It supports the Save Coordinator's committed-result invariant as a design principle. It does not belong at P2 among live defects.

### 4.6 Claim 14 — mechanism confirmed and deployed; blast radius currently zero

The policy is as quoted (`initial_schema.sql:118-120`): `share_token is not null and share_mode != 'none' and deleted_at is null`, with **no `to anon` role restriction** — so it applies to every role, anonymous and authenticated alike. It contains no predicate tying the row to a caller-supplied token. `get_shared_design(token)` (lines 194-209) shows the intended discovery mechanism is token possession.

Live probe with the public anon key:

```
GET /rest/v1/designs?select=id  (Prefer: count=exact)  ->  200, content-range: */0
```

Two facts, and the distinction matters:

- **The table is reachable by `anon`.** A `200` with a count header, rather than `401 permission denied for table designs`, proves the `SELECT` grant exists and PostgREST exposes the table. The enumeration mechanism is deployed.
- **Zero rows are exposed right now,** because no row currently has a non-null `share_token`. Nobody has used sharing on this project yet.

So this is a **loaded but unfired** defect, and the sharper statement is one the prior review did not make: `share_token` is itself a selectable column. The first time a user shares a design, a single unauthenticated `GET /rest/v1/designs?select=*` returns **every shared design, its full config, its thumbnail, and its share token**. The token stops being a capability the moment sharing is used at all. Whether tokens are meant to be secret capabilities or merely stable public links is the decision; the current schema quietly answers "public," and the function-based API quietly answers "secret."

---

## 5. Verified-safe behavior

Behavior I actively tried to break and could not. This section exists so the refactor does not discard working invariants.

**RLS is correctly enforced on the protected tables.** Anonymous probes returned `200` with zero rows for both `profiles` and `design_history` — the grant exists, and the policies do their job. `profiles` exposes no row without `auth.uid()`; `design_history` has owner-only select/insert/delete policies (`initial_schema.sql:143-148`) and no public read path. The `designs` owner policy correctly scopes full access to `auth.uid() = user_id`.

**Anonymous guest reads are tightly scoped.** Migration `20250101000007_anon_guest_reads.sql` is the model the rest of the schema should follow: every policy is explicitly `to anon`, every one is gated through `is_org_accepting_guests`, and the header documents exactly what stays hidden. That the sharing policy lacks a `to anon` clause reads as an early-schema oversight rather than house style.

**`normalizePanels` genuinely protects legacy documents.** All three branches are correct and non-mutating (`panels.js:271-288`): absent panels seed a Panel 1 and adopt every layer; dangling `panelId`s reassign to the smallest-`order` panel; valid input passes through. Every genuine document-load seam routes through it — mount init, `loadDocumentWithPanels`, the cloud loader, and the history-snapshot loader.

**Cross-document glyph leakage is prevented at every seam.** Each load site passes `customGlyphs ?? {}` rather than leaving the store untouched — cloud load (`useCloudPersistence.js:240`), draft recover (line 96), share hydration (`useDesignPersistence.js:101`), history restore (`Studio.jsx:2656`). The `?? {}` is deliberate and commented at each site: an old blob with no field *resets* the store instead of inheriting the previous document's glyphs. This is the discipline the rest of the persistence layer needs.

**`useAutosave`'s reentrancy guard is sound.** `inFlightRef` covers auto-vs-auto and `isSavingRef` covers manual-vs-auto (`useAutosave.js:61-64`), and the trailing re-arm after a settled save (lines 78-86) correctly catches edits that landed mid-save. The gap in H5 is specifically manual-vs-manual, which this hook is not in a position to guard.

**Sign-out hygiene is correct for the surfaces it covers.** Extracted patterns and the Etch source cache are cleared on the `SIGNED_OUT` event *and* again in `signOut` as a belt-and-braces twin for the case where `signOut()` errors and no event fires (`AuthContext.jsx:171-180`, `207-219`). The profile cache is cleared and TTL-bounded. The mechanism is right; B5 is that the document was never added to it.

**Retry and observable save status work as designed.** The retry loop keeps `saveState` at `"saving"` across attempts and surfaces a real error state rather than swallowing it (`useCloudPersistence.js:156-207`), and the failed-save draft write is a genuine safety net. B4 is about the draft being unreadable afterwards, not about it being unwritten.

**One save path.** Manual save, ⌘S, and autosave all funnel through `handleSaveToCloud`; autosave is a caller, never a second writer. This is the seam that makes the Save Coordinator a deepening rather than a rewrite.

---

## 6. Missing decisions

Decisions this review cannot make, ordered by what unblocks the most downstream work. These become the map.

1. **What is fabrication document content?** Forced by H1: the current dirty signal includes `bgColor` (which `CONTEXT.md` says is not document content) and excludes `panels` (which it says is). Until the boundary is drawn, no invariant can be written and no round-trip test can be authored.
2. **Is `materialId` preview-only, or the canonical Sheet stock selection?** H2 shows it already gates Highlight Hold, so "preview-only" is already false in the code. The choice is to pull it back to preview or promote it to physical identity alongside `substrate` — and then decide whether two representations should exist at all.
3. **How is project identity recovered after reload?** §4.2 and B4 both reduce to this. Persist the cloud id locally, restore from a route, or make the local store authoritative with a cloud id as an attribute?
4. **Harden the SQL in Supabase now, or defer to the Neon cutover?** B1 and B2 are live and independent of the refactor. Doing the work twice is the cost of fixing now; leaving a deployed privilege hole open is the cost of deferring. This is a decision on the go/no-go critical path, not a fix ticket.
5. **Are share tokens secret capabilities or stable public links?** §4.6 — the schema and the RPC currently give opposite answers, and the row count is zero, so this can be settled before anyone is affected.
6. **Does Google sign-in complete a pending save, or return and ask?** §4.3.
7. **What does a browser hold?** One guest draft, several local projects, or a local cache of cloud projects? This determines whether B5's fix is "clear on sign-out" or "scope by account subject," and whether the local store is a cache or a peer.
8. **What is the conflict rule across tabs and devices?** Last-write-wins, expected revision, or explicit conflict (H5).
9. **What storage and history envelope is acceptable?** H7 — is per-save history the right feature at all, and should thumbnails live in Postgres?

Items 8 and 9 depend on 1 and 3 respectively and are fog, not frontier — see §10.

---

## 7. Corrected architecture candidates

I endorse the prior review's two central modules and correct their boundaries.

**Canonical Project Document (schema-versioned).** One representation, consumed by dirty tracking, local persistence, cloud persistence, recovery, history, share links, and tests. The correction to the prior review: it listed candidate contents, but the contents *are decision 1* — the module cannot be specified until that is settled. What can be specified now is the shape: a version field, a single serializer, and a single equality function, so that "is this dirty," "what do we save," and "what do we compare" stop being three different answers. Canvas Background stays outside and gets an explicit workspace-preference home, so its removal from the dirty signal is a deliberate act rather than an omission.

**Save Coordinator.** Owns durable identity, single-flight and coalescing, a committed-result invariant (§4.5), expected-revision or idempotency-keyed writes, retry classification, and observable failure for loads as well as saves (H3). The prior review's framing is right that `useCloudPersistence` has the useful implementation and the wrong interface — it currently takes fourteen document slices as parameters, which is what lets the document definition scatter.

**Local Project Repository.** The prior review proposed an atomic IndexedDB adapter keyed by account subject, project id, and revision. I agree, and would add the requirement it missed: **an unload flush path**. B3 is not solved by atomicity — a single atomic write that fires three seconds too late loses the same edits. The adapter needs a synchronous or `pagehide`-safe commit, and the acceptance test is "edit, reload immediately, nothing lost," not "the keys agree."

**One loader, not five.** H4 is the strongest argument in the report for the canonical module: cloud load, history restore, share hydration, group load, and draft recover currently disagree about what a document contains, and the disagreements are invisible because each was correct when written. Whatever the Project Document turns out to be, there should be exactly one function that installs one, and every entry point should call it.

**Sequencing.** Fix the deployed SQL first and separately (B1, B2) — it is not coupled to any of this. Then decisions 1-3. Then the document module, then the coordinator, then the local adapter. Provider seams last, and only where two adapters genuinely exist.

---

## 8. Corrected Neon migration risks

The research document's inventory is accurate and I found nothing in it to refute. Corrections to the *sequencing* argument:

**The cost case is unproven in the one place it matters.** The research doc correctly identifies the 0.5 GB Free ceiling as the number to measure. H7 suggests `design_history` alone may approach or exceed it under the current write pattern. Nobody should decide go/no-go before the measurement queries in H7 have been run — and if the projection holds, the correct response is to change the history write pattern *before* migrating, not to size a plan around it.

**The SQL repair should not wait for the migration.** The research doc's step 5 folds RLS rewriting into the cutover. B1 and B2 are live today on Supabase. Carrying an open privilege hole through a platform migration means it is open throughout, and it means the port has no known-good reference to port *to*. Fix on Supabase, then port the fixed policies.

**One risk the research doc understates.** It correctly says Supabase's `auth.uid()` must be replaced with a resolution through an identity mapping. What it does not say is that the current schema's authorization is *entirely* row-scoped with no column-level restrictions anywhere (B2), so a mechanical `auth.uid()` → `auth.user_id()` translation reproduces the escalation faithfully. The port needs a policy redesign, not a predicate substitution.

**Where I agree without reservation:** identity mapping to preserve existing profile UUIDs; keeping Storage and the AI function as separate workstreams; the Beta labels on Data API, Neon Storage, and Neon Functions being the real risk rather than Postgres compatibility; and retaining Supabase read-only through a rollback window.

**Recommended go/no-go inputs**, in order: (1) run the H7 measurements; (2) fix and verify B1/B2 on Supabase; (3) settle decisions 1-3 so the persistence interface exists to write an adapter against; (4) only then pilot on a branch.

---

## 9. Evidence and tests run

### Live database probes (read-only, production)

Run against `https://auyanasfakhppsodgcdy.supabase.co` with the public anon key from `.env` — the same key any visitor's browser holds.

**Safety property:** every probe is non-mutating *by construction*, not by convention. The RPC probes execute function bodies whose every `UPDATE` is `WHERE id = auth.uid()`, and `auth.uid()` is `NULL` for the anonymous role, so zero rows can match. The `PATCH` probes filter on the all-zeros UUID, which matches no row, and are additionally blocked at the row level by RLS. No production data was read beyond row counts, and none was written.

| Probe | Result | Proves |
|---|---|---|
| `GET /designs?select=id` count | `200`, `content-range: */0` | anon holds SELECT on `designs`; 0 rows currently shared |
| `GET /profiles?select=id` count | `200`, `*/0` | grant exists; **RLS correctly blocks all rows** |
| `GET /design_history?select=id` count | `200`, `*/0` | grant exists; **RLS correctly blocks all rows** |
| `POST /rpc/add_ai_credits {"amount":0}` | `200`, `null` | **EXECUTE granted to `anon`** |
| `POST /rpc/deduct_ai_credits {"amount":0}` | `400`, `P0001 "Profile not found"` | **EXECUTE granted to `anon`** — error raised from inside the body |
| `POST /rpc/get_shared_design` | `200`, `null` | EXECUTE granted; correct null for unknown token |
| `PATCH /designs?id=eq.<zeros>` | `204` | anon holds UPDATE on `designs` |
| `PATCH /profiles?id=eq.<zeros>` body `{"tier":"studio"}` | `204` | **anon holds UPDATE on `profiles.tier`** — column privilege, not row access |

`supabase db advisors --linked` was not run: the local Docker daemon is down (`Cannot connect to the Docker daemon`), so the local stack and the `RLS_LIVE=1` harness in `src/test/rlsHarness.js` are unavailable, and the prior review recorded HTTP 401 for the linked-project attempt.

### Static verification

Every source path cited by the prior review was opened and read in full rather than quoted. Line references in this document were re-derived from the current working tree, not carried over. Additional greps that produced findings: `beforeunload|visibilitychange|pagehide` across `src/` (one hit, B3); `countUserDesigns` and `'cloudSave'` callers (H6); `materialId` readers (H2); `substrate|thickness` in `panelExport.js` (H1 severity); `GRANT|REVOKE` across `supabase/migrations/` (two grants, zero revokes, B1).

### Reproduction tests

A characterization-test suite was commissioned against the persistence interfaces, covering: Panel-only dirty tracking and the `bgColor` inverse; autosave non-firing on a Panel-only edit; the exact saved-config key set; cloud identity across a remount; the orphaned `sonoform-cloud-draft:<uuid>` key; concurrent first saves; the resolved-`null` path; a quota fault isolated to the `sonoform-layers` write; and sign-out key survival. These are additive test files only — **no production source file was modified during this review**, verified by `git status`.

**Two items on the brief's minimum-test list were not covered by a test, deliberately:**

- *"dirty current project → cloud open"* (brief item 6). No test was written. H3 is a structural finding: there is no dirty check anywhere in `handleLoadCloudDesign` or `CloudSaveModal`'s click handler to exercise, and the absence is the finding. A test here would assert that a guard which does not exist did not fire.
- *"whole fabrication document manual save/load"* (brief item 2). Only the **save** half was tested (the exact-key-set assertion). A true round-trip fixture cannot be written until the document's contents are decided — that is decision 1 in §6, and authoring the fixture is the first task after it resolves. Writing one now would encode the current, disputed boundary as the contract.

Where §2-§4 states a verdict, that verdict rests on the source evidence cited inline; the tests corroborate rather than establish it. Findings B1, B2, and §4.6 rest on live probes and require no test at all.

#### 9.1 Test results

13 tests across 7 files, all passing, under `src/lib/hooks/__adv__/*.adv.test.jsx`. Each asserts *current* behavior, including buggy behavior, and is commented as such. `git status` confirms the only changes on disk are these new test files plus this review — no production source was modified.

| Test | File | Result | Establishes |
|---|---|---|---|
| Panel `substrate` edit leaves `isDirty()` false | `dirtyTracking` | pass | H1 — panels have no route into the hook |
| `bgColor`-only edit flips `isDirty()` true | `dirtyTracking` | pass | H1 — the inversion, stated positively |
| `serializeState` shape is exactly `{bg, opts, layers}` | `dirtyTracking` | pass | H1 — structural, no panels channel |
| Panels-only edit fires no save at 3100ms | `autosavePanels` | pass | H1 — with Studio's exact `isDirty ∨ nameDirty` wiring |
| Control: `bgColor` edit *does* fire the save | `autosavePanels` | pass | the harness is not vacuous |
| Saved config key set is exact | `cloudConfig` | pass | §4.1 — absence of `bgColor`, `unit`, `margin`, `outputMode`, `operations` |
| `null` result still reports "Saved" | `cloudConfig` | pass | §4.5 — and see the correction below |
| `currentDesignId` does not survive remount | `cloudIdentity` | pass | §4.2 — 5th arg to `saveDesign` is `null` → INSERT |
| Two concurrent first saves both INSERT | `cloudIdentity` | pass | H5 — both calls carry `existingId: null` |
| `:<uuid>` draft orphaned after remount | `draftOrphan` | pass | B4 — `pendingDraft` null while the key persists |
| Quota fault tears layers from siblings (`persistDocumentSnapshotNow`) | `quotaSiblings` | pass | B3 — old layers + new panels, dangling `panelId` |
| Same tear through the real debounced writer | `quotaSiblings` | pass | B3 — driven through production `useLayers` |
| 8 document/draft keys survive `signOut()` | `signOutIsolation` | pass | B5 — only `sonoform-profile` is cleared |

**One correction the tests forced on §4.5.** The characterization test found the `null`-result path is worse than the prior review described: besides reporting `"saved"` and stamping `lastSavedAt`, it also **clears the local safety-net draft** — so the branch reports success, persists nothing, and destroys the last local copy. That strengthens the *consequence* if the path is reached. It does not change my reachability verdict: the test reaches it only by injecting a `user` while `supabase` is null, which production cannot produce (`AuthContext.jsx:136`). The finding stands as a latent interface hazard with a worse-than-stated payload — which is precisely the argument for the Save Coordinator's committed-result invariant.

**A second detail worth recording from the quota tests.** The tear was demonstrated on *both* writers — the `persistDocumentSnapshotNow` reset path and the production 3000ms debounced writer — and in both cases the stored layers' `panelId` dangles against the stored panels. `normalizePanels` repairs the dangling reference on load (§5), so the document opens rather than breaking; what the maker gets is a silently *rehomed* layer, not an error.

### Verification still outstanding

1. The two SQL queries in B1 and B2 (service-role or SQL Editor).
2. Isolated-branch exploit confirmation for `add_ai_credits` with a real authenticated JWT.
3. The storage measurements in H7.
4. Supabase security and performance advisors, once CLI auth is restored.
5. A real-browser run of guest edit → ⌘S → Google redirect → callback → return, to time B3's loss window against the redirect.

---

## 10. Recommended Wayfinder destination

**Destination:** an agreed, implementation-ready decision set for reliable offline and cloud project persistence, plus a go/no-go on the Supabase→Neon migration — the decisions, not the refactor and not the migration.

**Frontier** — decisions with no unanswered upstream question, takeable now:

1. **Is `materialId` preview-only or canonical Sheet stock?** (H2) — narrow, sharp, and the entry point, because it gates (4).
2. **How is project identity recovered after reload?** (§4.2, B4) — independent; unblocks conflict semantics and the local adapter's key design.
3. **Fix the SQL privilege defects on Supabase now, or defer to cutover?** (B1, B2) — independent of everything else here and on the go/no-go path.

**Blocked, but sharp enough to state now:**

4. **What is fabrication document content?** (H1) — the keystone, which unblocks the document module, the round-trip fixture, and every conflict-semantics question. Blocked by (1): the Panel/Sheet portion of the invariant cannot be finally stated while it is unresolved whether Sheet stock has one representation or two.

**Fog** — real but not yet sharp enough to ticket, because each hangs on the frontier above: conflict and revision semantics across tabs and devices; what a browser holds (one draft, several projects, or a cloud cache) and how account scoping follows from it; Google-auth save continuation; the storage and history cost envelope once measured; the Neon auth/data/storage/function replacement strategy; and migration verification and rollback criteria.

**Out of scope** for this map: the implementation refactor itself, the migration execution, and any change to the Etch, motif, or Run Plan subsystems that this review touched only as evidence.

**Single recommended first decision: is `materialId` preview-only or canonical Sheet stock?** The keystone is document content, but that question is blocked on this one, and this one is small, sharp, and answerable in a single sitting. Answering it makes the keystone takeable — and everything downstream of *that* (the invariant, the round-trip fixture, the coordinator's contract, the Neon adapter's interface) is a restatement of the keystone's answer. Both are decisions only the product owner can make.

The one exception to that ordering is B1. It is a deployed authorization defect with no dependency on any decision on this map, and it should be fixed on its own schedule regardless of where the map goes.

### Charted map

This destination was charted on 2026-07-30 as [Wayfinder: reliable project persistence and the Neon go/no-go](https://github.com/majedbg/Naqsha/issues/212), with five child tickets:

- [Decide: is materialId preview-only or canonical Sheet stock?](https://github.com/majedbg/Naqsha/issues/214) — frontier
- [Decide: how is project identity recovered after reload?](https://github.com/majedbg/Naqsha/issues/215) — frontier
- [Decide: repair SQL privileges on Supabase now, or defer to the Neon cutover?](https://github.com/majedbg/Naqsha/issues/216) — frontier
- [Measure the deployed database: sizes, history payload, grants, buckets](https://github.com/majedbg/Naqsha/issues/217) — frontier
- [Decide: what state is fabrication document content?](https://github.com/majedbg/Naqsha/issues/213) — blocked by the `materialId` ticket

No research ticket was created: the Neon product and cost research in `docs/research/neon-pivot-from-supabase-2026-07.md` was captured the same day and is current.
