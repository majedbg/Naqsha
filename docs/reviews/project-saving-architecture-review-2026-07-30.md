# Project saving architecture review

Date: 2026-07-30  
Reviewed commit: `7a6fd19` on `feat/motif-lines-updates`  
Scope: offline persistence, authenticated cloud saving after Google sign-in, project loading/recovery, Supabase SQL, and a possible Supabase → Neon pivot.

## Verdict

The current save path should not be treated as a reliable whole-document persistence system yet.

The primary problem is not one missing field. Several modules independently define what a document is:

- history captures one shape;
- cloud save captures a smaller shape;
- dirty tracking compares a different shape;
- offline persistence writes several unrelated keys;
- failed-save recovery captures another partial shape.

This distributes document knowledge across callers, so new fields can appear correct in one persistence path while remaining invisible to another.

The first architectural change should be a canonical, schema-versioned Project Document module. Dirty tracking, local persistence, cloud persistence, recovery, history, and tests should consume that same representation. A Save Coordinator should then own durable project identity, serialization of writes, authentication continuation, retries, and recovery.

## Domain correction from the review

The review originally gave too much importance to `bgColor`. The product distinction is now:

- A **Panel** is a document partition targeting one physical **Sheet**.
- A Panel's Sheet material choice and thickness are important document content.
- The **Canvas Background** is a visualization preference. It is not Sheet identity and is not fabrication content.

This vocabulary is recorded in [`CONTEXT.md`](../../CONTEXT.md).

The code currently has two related material representations:

- `panel.substrate`: physical identity such as kind and thickness;
- `panel.materialId`: described in code as an optional catalog material used by the 3D preview.

An adversarial reviewer should determine whether `materialId` is intentionally preview-only or is becoming the canonical selection of physical Sheet stock. That decision changes the required document invariant.

## Review method and limitations

Reviewed:

- save, load, autosave, dirty tracking, recovery, auth, and cloud-list modules;
- local persistence modules;
- the initial Supabase schema and subsequent relevant migrations;
- targeted persistence tests;
- current official Neon documentation, captured separately in [`neon-pivot-from-supabase-2026-07.md`](../research/neon-pivot-from-supabase-2026-07.md).

Verification:

- 12 targeted test files passed;
- 97 targeted tests passed.

Limitation:

- `supabase db advisors --linked` was attempted against the linked project but returned HTTP 401.
- SQL findings below are therefore migration-file findings. Deployed grants, policies, drift, and advisor output remain unverified.

## Severity and confidence vocabulary

- **P0**: credible data-loss, authorization, or project-identity failure.
- **P1**: reliability, cost, or workflow failure that should precede a provider migration.
- **P2**: architectural friction or incomplete observability.
- **Confirmed**: directly follows from code paths or migration text.
- **Conditional**: exploitability or production impact depends on deployed grants/configuration.
- **Inference**: likely consequence requiring a reproduction test.

## Findings

### P0 — Panel Sheet changes do not participate in dirty tracking

**Status:** Confirmed.

Manual cloud save includes `panels`, and cloud load normalizes and restores them:

- `src/lib/hooks/useCloudPersistence.js:128-139`
- `src/lib/hooks/useCloudPersistence.js:233-244`

Panel material/thickness edits call `setPanels` without changing Layers:

- `src/pages/Studio.jsx:3021-3025`

Dirty tracking serializes only:

- Layers, excluding `paramsCache`;
- Canvas Background;
- applied Optimizations.

Evidence:

- `src/lib/hooks/useDesignPersistence.js:39-68`

Autosave schedules when that dirty function changes identity and returns true:

- `src/lib/hooks/useAutosave.js:8-16`
- `src/lib/hooks/useAutosave.js:109-114`

**Failure scenario**

1. Open an already-saved laser project.
2. Change a Panel from 3 mm acrylic to 5 mm acrylic.
3. Make no Layer edit.
4. Wait beyond the autosave delay or choose an action guarded by `isDirty()`.

Expected: the Sheet change is unsaved, autosaves, and blocks destructive replacement until committed.  
Current result predicted from the code: no dirty signal, no autosave, and no unsaved-work warning.

**Required reproduction test**

An integration test should begin from a clean saved baseline, update only `panel.substrate.kind`, `panel.substrate.thickness`, or the chosen physical material identifier, and assert:

- status becomes Unsaved;
- autosave commits the updated Panel;
- replacing the current project requires a decision;
- reload restores the exact Sheet choice.

### P0 — Cloud save is not a whole fabrication document

**Status:** Confirmed and partly acknowledged in code comments.

The cloud config currently includes:

- Layers;
- canvas width/height;
- `presetIndex`;
- Panels;
- custom Glyphs;
- applied Optimizations;
- history tail on manual save only.

Evidence:

- `src/lib/hooks/useCloudPersistence.js:125-149`

It omits at least:

- Operation library;
- Unit;
- Margin;
- active Machine Profile / effective output mode.

The code acknowledges that cloud load does not restore several whole-document history slices and that the history checksum generally fails:

- `src/pages/Studio.jsx:665-673`

**Product consequence**

A maker can see “Saved” although the fabrication setup that determines what the machine should do does not round-trip.

Canvas Background should not be added merely to make the shapes match. It should instead be removed from the document invariant if the product decision remains that it is workspace preference.

### P0 — Cloud identity is not durable across reload

**Status:** Confirmed from state initialization and repository branching.

`currentDesignId` starts as `null` and is set only after an in-session save or load:

- `src/lib/hooks/useCloudPersistence.js:56`
- `src/lib/hooks/useCloudPersistence.js:178-180`
- `src/lib/hooks/useCloudPersistence.js:243`

Local content persistence does not persist the corresponding cloud id. `saveDesign` inserts when `existingId` is false:

- `src/lib/designService.js:3-25`

**Failure scenario**

1. Save a new cloud project.
2. Reload the browser.
3. The current canvas is restored from local keys.
4. Manually save again without first selecting the cloud row.

Predicted result: a second design row is inserted rather than updating the first.

This requires an end-to-end reproduction test because route/mount behavior may affect whether the same content is restored.

### P0 — Existing-project failed-save recovery cannot be discovered after reload

**Status:** Confirmed.

Draft keys are namespaced only by `designId` or `"new"`:

- `src/lib/localDraft.js:13-18`

On mount, `currentDesignId` is `null`; the hook freezes and reads only the `"new"` key:

- `src/lib/hooks/useCloudPersistence.js:77-82`

A failed update to an existing design writes under that existing design id:

- `src/lib/hooks/useCloudPersistence.js:150-153`
- `src/lib/hooks/useCloudPersistence.js:198-205`

After reload, that key is never selected by the recovery surface. Draft keys also omit the authenticated account subject, allowing `"new"` recovery data to cross accounts on a shared browser.

### P0 — Google sign-in does not resume the save intent

**Status:** Confirmed for intent loss; edit-loss timing is an inference requiring browser verification.

A guest save routes directly to `signIn()`:

- `src/pages/Studio.jsx:1736-1747`

Google OAuth performs a full redirect:

- `src/lib/AuthContext.jsx:196-204`

The callback obtains the session and unconditionally navigates home:

- `src/pages/AuthCallback.jsx:8-18`

No durable pending-save intent is restored. After login, autosave is still gated until a cloud id exists:

- `src/pages/Studio.jsx:1758-1763`

Local Layer persistence waits three seconds and cancels its timer on unmount:

- `src/lib/useLayers.js:366-402`

The intended user experience needs an explicit decision:

- “Sign in, return, and automatically finish the requested save”; or
- “Sign in, return, preserve the checkpoint, and ask the maker to confirm Save.”

The current behavior does neither explicitly.

### P0 — Local project state is global rather than account/project scoped

**Status:** Confirmed.

Every tier currently enables local storage:

- `src/lib/tierLimits.js:4-95`

Document state is stored in global `sonoform-*` keys. Canvas state uses another global key:

- `src/lib/useLayers.js`
- `src/lib/hooks/useCanvasSize.js:11-74`

Sign-out clears extracted-pattern and Etch source caches, but not the current document keys or cloud identity:

- `src/lib/AuthContext.jsx:164-180`
- `src/lib/AuthContext.jsx:207-218`

The next account on a shared browser can therefore inherit the previous account's local project content. Even when RLS blocks an overwrite, this is an account-hygiene and recovery failure.

### P0 — SQL may allow users to mint tier/credit privileges

**Status:** Conditional on deployed table/function grants; migration text is unsafe by construction.

The profile update policy restricts rows but not columns:

- `supabase/migrations/20250101000001_initial_schema.sql:40-46`

Later migrations add privileged fields such as `ai_credits`, `ai_credits_purchased`, and user settings:

- `supabase/migrations/20250101000002_ai_credits.sql:8-11`
- `supabase/migrations/20250101000008_user_settings_json.sql:11-14`

The migration does not introduce column-level write restrictions. If the authenticated role retains general UPDATE privilege on `profiles`, a user can attempt to update `tier` or credit fields on their own row.

Two `SECURITY DEFINER` credit functions also accept caller-controlled amounts:

- `deduct_ai_credits(amount)` subtracts `amount`; a negative amount increases the balance.
- `add_ai_credits(amount)` directly increases both balances.

Evidence:

- `supabase/migrations/20250101000002_ai_credits.sql:38-83`

The migration shown does not revoke public/authenticated execution or validate `amount > 0`. The deployed grants must be queried before assigning final exploitability, but the functions should fail closed regardless of dashboard configuration.

**Required live verification**

- inspect `information_schema.role_table_grants` for `profiles`;
- inspect `information_schema.routine_privileges` for both functions;
- call each path as a restricted test user on an isolated branch/project;
- verify server-only credit purchase and tier mutation paths.

### P0 — Shared designs may be enumerable without their share token

**Status:** Conditional on deployed table grants/Data API exposure; policy predicate is confirmed.

The anonymous SELECT policy permits every row satisfying:

```sql
share_token is not null
and share_mode != 'none'
and deleted_at is null
```

Evidence:

- `supabase/migrations/20250101000001_initial_schema.sql:117-123`

The `get_shared_design(token)` function suggests token possession is intended as the discovery mechanism:

- `supabase/migrations/20250101000001_initial_schema.sql:194-209`

If anonymous callers can select the `designs` table through the Data API, RLS returns every shared row; it does not require a caller-supplied matching token. That makes an unguessable token ineffective as an access capability.

**Required live verification**

Run an anonymous `SELECT` against exposed `designs` columns without a token filter and record exactly which rows/columns are returned.

### P1 — Local persistence is fragmented and non-atomic

**Status:** Confirmed architecture; crash result requires fault injection.

Layers, background, Panels, custom Glyphs, Optimizations, and canvas state are written through different keys and sometimes different effects:

- `src/lib/useLayers.js:216-239`
- `src/lib/useLayers.js:366-402`
- `src/lib/hooks/useCanvasSize.js:57-74`

When the Layer write hits quota, the implementation deliberately continues writing smaller sibling keys. Other sibling failures are swallowed.

This can pair old Layers with new Panels or canvas state. A fault-injection test should throw on each write in turn and reload the document to determine which mixed snapshots are accepted.

### P1 — Manual saves are not single-flight or revision-aware

**Status:** Confirmed absence of coordination; duplicate/stale result requires concurrency test.

`handleSaveToCloud` has no shared in-flight guard:

- `src/lib/hooks/useCloudPersistence.js:125-207`

`useAutosave` guards its own calls but does not serialize every manual caller:

- `src/lib/hooks/useAutosave.js:56-88`

Two fast first saves can both capture `currentDesignId === null` and insert. Overlapping updates can resolve out of order because rows have no expected-revision condition.

### P1 — Cloud open/history replacement can discard dirty work

**Status:** Confirmed control flow.

The cloud modal invokes load and closes immediately:

- `src/components/CloudSaveModal.jsx:64-75`
- `src/components/CloudSaveModal.jsx:167-175`
- `src/components/CloudSaveModal.jsx:200-205`

The load hook overwrites document state without consulting dirty state and reports failure only to the console:

- `src/lib/hooks/useCloudPersistence.js:227-267`

Cloud open should use the same unsaved-work decision as File → New.

### P1 — Save-slot and history cost controls are ineffective

**Status:** Confirmed for unused count path and write pattern.

`countUserDesigns` exists but has no caller:

- `src/lib/designService.js:63-71`

No database constraint or transaction enforces the configured 100-row limit.

Every successful authenticated save with `historySnapshots > 0` starts a history write:

- `src/lib/hooks/useCloudPersistence.js:181-185`

Each history write inserts config and a base64 thumbnail, selects all ids, and may prune:

- `src/lib/designService.js:134-151`

At current limits, repeated full thumbnails/history can consume a small database allowance quickly. Pruning errors are not surfaced as save failures.

### P2 — Resolved null can produce a false “Saved”

**Status:** Confirmed edge path.

When Supabase is unconfigured, `saveDesign` returns `null`:

- `src/lib/designService.js:3-5`

`handleSaveToCloud` only guards identity/clean marking behind `if (design)`, but sets the saved timestamp, clears name-dirty, sets `"saved"`, and clears recovery after the conditional:

- `src/lib/hooks/useCloudPersistence.js:178-197`

The Save Coordinator should require a committed result, not merely a resolved promise.

## Existing strengths

The review should preserve these working ideas:

- one cloud save path is reused by manual save and autosave;
- retry delays and visible save status are already localized in `useCloudPersistence`;
- Panel normalization protects legacy documents on load;
- custom Glyphs and applied Optimizations were explicitly added to local/cloud paths;
- RLS is enabled on the main user-data tables in the migration files reviewed;
- the app has a whole-document history snapshot assembly in `src/lib/history/documentSnapshot.js`;
- document-load sites already try to clear cross-document undo history.

The recommendation is to deepen these modules, not discard all current work.

## Deepening opportunities

### 1. Canonical Project Document module — Strong

Make one schema-versioned representation authoritative for fabrication document content.

It should include, subject to final domain decisions:

- Layers and custom Glyphs;
- Panels and physical Sheet selection/thickness;
- Operation library and assignments;
- Machine Profile;
- canvas dimensions, Unit, and Margin;
- applied Optimizations;
- any other state required to reproduce fabrication/export.

Canvas Background should remain outside if it is a workspace preference.

All persistence and equality paths should consume this module. The interface is the test surface: a whole-document round-trip test should survive internal refactors and provider changes.

### 2. Save Coordinator module — Strong

Deepen `useCloudPersistence` around:

- durable project identity;
- a committed-result invariant;
- single-flight/coalescing;
- expected revisions or idempotency keys;
- OAuth continuation;
- local checkpoint/outbox;
- retry classification;
- observable load/save failure.

The current hook has useful implementation, but its interface exposes nearly every document slice and allows state knowledge to leak.

### 3. Local Project Repository adapter — Strong

Replace fragmented document keys and `localDraft` with an atomic IndexedDB adapter keyed by:

- account subject or explicit guest scope;
- project id;
- revision.

The adapter should commit document, metadata, and pending outbox together.

### 4. Identity and Project Repository seams — Worth exploring before Neon

Create seams only where two adapters are real:

- Identity: current Supabase Auth adapter, then Neon Auth or another OIDC adapter.
- Project Repository: current Supabase/PostgREST adapter, then Neon/Postgres adapter.

Do not expose raw provider query shapes as the application interface.

## Suggested Supabase → Neon route

Do not treat the migration as a connection-string change. The repo currently depends on:

- Supabase Auth and its `auth.*` schema/functions;
- browser-facing PostgREST and RLS;
- four Storage buckets;
- one Edge Function;
- several RPC functions.

Recommended order:

1. Fix the canonical document, dirty tracking, recovery, and SQL privilege issues while Supabase remains production.
2. Put identity and repository seams in place.
3. Measure actual database and object-storage usage.
4. Import the application-owned PostgreSQL schema/data into a Neon branch.
5. Preserve existing profile UUIDs through an explicit external-identity mapping.
6. Pilot Neon Auth Google plus Neon Data API, with a serverless-backend fallback.
7. Migrate Storage buckets and the AI function separately.
8. Port the RLS harness and run it using restricted Neon roles.
9. Cut over reversibly and retain Supabase read-only during a rollback window.

Current official product/cost research and source links:

- [`docs/research/neon-pivot-from-supabase-2026-07.md`](../research/neon-pivot-from-supabase-2026-07.md)

## Decisions that should precede implementation

1. What exact state is fabrication document content?
2. Is `materialId` preview-only, or the canonical physical Sheet stock selection?
3. Does Google sign-in automatically complete a pending save or return to a confirmation?
4. Does a browser retain one guest draft, multiple local projects, or a local cache of cloud projects?
5. How is project identity recovered after reload?
6. What conflict rule applies across tabs/devices: last-write-wins, expected revision, or explicit conflict?
7. Are share tokens secret capabilities or merely stable public links?
8. Which auth/provider maturity risks are acceptable for the Neon pilot?
9. Which database/storage measurements define “fits Neon Free”?

## Recommended next verification work

Before changing architecture:

1. Add a whole-document save/load contract fixture.
2. Add the Panel Sheet-only dirty/autosave regression.
3. Reproduce reload → duplicate cloud insert.
4. Reproduce existing-design failed-save recovery after reload.
5. Exercise guest edit → Google redirect → callback → resumed save in a real browser.
6. Fault-inject local storage quota/write failures.
7. Run restricted-user SQL privilege and anonymous sharing probes against an isolated live database.
8. Measure database size, history/thumbnail bytes, and all bucket bytes/object counts.

## Top recommendation

Resolve the authoritative Project Document content first, beginning with the physical Panel/Sheet invariant. That decision makes the Save Coordinator, offline adapter, SQL repair, and Neon migration testable through one interface.
