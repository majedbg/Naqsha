# SVG Motif — P4 (global motif library + premium-gating scaffold) ORCHESTRATOR — 2026-07-08

> **RESUME RULE:** a fresh session reads this file FIRST, trusts the WI statuses below, skips every
> `done` WI, and continues from the first non-`done` one. Update this doc BEFORE and AFTER each slice.
> Spec: `svg-motif-editor-DECISIONS.md` **D1** (verbatim). Shipped spine: P1/P2 orchestrators.

**P4 goal (D1):** custom motifs are a per-document library (`document.customGlyphs`); PROMOTABLE to a
user's GLOBAL library via an explicit "Save to my library" action that **requires login**; lean on
existing Supabase cloud persistence; add **premium-gating scaffolding** around the promotion but leave
it **OFF** (free now, one-line flip to premium later). Baseline suite before P4: **3892 passed / 54 skipped**.

## Architecture (verified in code + advisor-reviewed 2026-07-08)

### Seams we build on (all verified in code)
- **Auth:** `useAuth()` (`src/lib/AuthContext.jsx`) → `{ user, profile, tier, signIn, ... }`; `user = session?.user ?? null`.
- **Supabase client:** `src/lib/supabase.js` — `supabase` is **null** when env vars absent (offline / no backend). Every service guards `if (!supabase) return …`.
- **Service idiom:** `src/lib/designService.js` — `supabase.from('table').insert/update/select/...eq('user_id', userId)`, throw on error. Test idiom: `designService.test.js` (mocks `./supabase`).
- **RLS idiom:** migration `..._initial_schema.sql` / `009_user_patterns.sql` — `enable row level security` + `create policy "Owner full access" ... using (auth.uid() = user_id) with check (auth.uid() = user_id)`, per-user index, shared `set_updated_at` trigger. Migrations are **human-gated** (header comment; agents never apply).
- **Glyph shape:** `{ id, name, tradition, paths:[{d,closed}], viewRadius, root:{x,y,angle} }` (`motif/glyphs.js`). `getGlyph(id, customGlyphs)` — **built-ins ALWAYS win**; custom map only for non-builtin ids.
- **Doc store:** `useLayers.js` — `addCustomGlyph(g)→genId`, `updateCustomGlyph(id,g)` (**idempotent keyed upsert**, records undo, built-in-id guard), `setCustomGlyphs`. Undo snapshot + save/draft/share config already embed `customGlyphs`.
- **Share config carries customGlyphs:** `get_shared_design` RPC (initial_schema.sql:199) returns whole `d.config` → embedded `customGlyphs` travel with share links. **⇒ COPY-on-use is airtight** (see below).
- **Modal:** `MotifEditorModal.jsx` footer has Cancel / Save as copy / Save; `serialize()` returns the working glyph. **Inspector `MotifDevice`** (Inspector.jsx:572) has Built-in / Custom optgroups + per-row select `onChange` sets `params.glyphRef`.
- **Studio mount:** `src/pages/Studio.jsx` — `useAuth()` (line 96), modal mounted ~1696 (draft/edit sessions), threads `customGlyphs/addCustomGlyph/updateCustomGlyph`.

### Locked decisions (advisor-reviewed)
1. **COPY-on-use, NOT reference.** Placing a global-library motif COPIES its glyph JSON into the document's
   `customGlyphs`, keyed by the library row **uuid** (glyph.id = row.id). WHY: documents are self-contained
   snapshots (`customGlyphs` embedded in save/draft/share config, restored on load). A *reference* would need
   render-time resolution against `user_motifs`, which is RLS owner-only → **share links + other-user/cross-device
   rendering would silently break** (viewer can't read your library row). COPY keeps the single render seam
   `getGlyph(ref, customGlyphs)` untouched. Re-placing the same library motif = same uuid key → idempotent
   merge (no dup). In-doc edits then follow existing D6 semantics (edit-in-place restamps; Save-as-copy forks).
   Store method for the copy: `updateCustomGlyph(libUuid, glyph)` (keyed upsert; library uuids never collide with
   the four built-in ids `leaf/dot/diamond/rosette`).
2. **Id model:** promote = insert `{ id(uuid default), user_id, name, glyph jsonb, created_at, updated_at }`;
   the row uuid IS the document customGlyphs key on place.
3. **TWO DISTINCT GATES — never conflate.** (a) **Login gate** = D1's "requires login", ships **ON** (logged-out →
   button disabled / prompt sign-in). (b) **Premium entitlement** = scaffold, ships **OFF** (returns true for all).
   The one-line flip touches ONLY the entitlement, never the login requirement. Entitlement signature carries the
   args the real gate will need: `canUseGlobalLibrary({ user, tier })` → `true`, flip commented inline.
4. **Offline-graceful:** all service fns guard `!supabase`; the hook returns empty list + no-throw promote when
   logged-out or offline. "My library" optgroup **hidden when empty** (never renders as a broken empty group).

## Work items (sequential-on-main, sole writer — advisor: worktree overhead > gain for these small files)

| WI | Description | TDD | Files (one writer) | Status |
|----|-------------|-----|--------------------|--------|
| P4-1 | **Entitlement scaffold (pure).** `canUseGlobalLibrary({user,tier})→true` + inline one-line flip comment. Login gate is SEPARATE (in UI). | RED→GREEN | `src/lib/motifLibraryEntitlement.js` (+test) | **done** ✅ |
| P4-2 | **Service + migration.** Migration `20250101000013_user_motifs.sql` (table+RLS+index+trigger, human-gated header). `userMotifService.js`: pure mappers `glyphToRow`/`rowToLibraryMotif` (uuid-keyed, built-in-collision guard) + `saveUserMotif`/`loadUserMotifs`/`deleteUserMotif` (offline-graceful). | RED→GREEN, mirror designService.test.js | `supabase/migrations/20250101000013_user_motifs.sql`, `src/lib/userMotifService.js` (+test) | **done** ✅ |
| P4-3 | **Hook.** `useGlobalMotifLibrary(user)` → `{ motifs, loading, error, promote(glyph), refresh }`; logged-out/offline → `[]`, promote no-op/throws-caught. | RED→GREEN, mirror useCloudPersistence.test.jsx | `src/lib/hooks/useGlobalMotifLibrary.js` (+test) | **done** ✅ |
| P4-4 | **UI wiring.** Modal "Save to my library" btn (login-gated + entitlement-wrapped). Inspector "My library" optgroup (hidden when empty) + COPY-on-use. Studio threads hook + entitlement. | RED→GREEN component + wiring | `MotifEditorModal.jsx`, `Inspector.jsx`, `src/pages/Studio.jsx` (+tests) | **done** ✅ |

## ✅ P4 COMPLETE — all 4 WIs on main. Full suite **3920 passed / 54 skipped / 0 fail** (+28). Touched files lint clean.

### Where the premium flag lives + the ONE-LINE flip
- File: `src/lib/motifLibraryEntitlement.js` → `canUseGlobalLibrary({user,tier})` currently `return true;`.
- Flip: replace that line with `return checkGate(tier, 'globalLibrary').allowed;` (import `checkGate` from
  `./tierLimits` + add a `'globalLibrary'` case there). When false, Studio passes `canSaveToLibrary=false`
  → the modal HIDES the "Save to my library" button. The LOGIN gate is untouched by the flip (separate).

### Human verification checklist (green tests can't see live auth/DB or interactive correctness)
1. **APPLY THE MIGRATION (human, infra step):** review + run `supabase/migrations/20250101000013_user_motifs.sql`
   in the Supabase SQL editor / CLI. Agents never apply it. Confirm the `user_motifs` table + "Owner full
   access" RLS + `set_updated_at` trigger exist.
2. `npm run dev`, sign in (Google). Add a host layer (grid/spiral/recursive), open the Inspector Motif device,
   add a motif, "Import SVG as motif…" → **✎ Edit**. In the editor footer, click **Save to my library** →
   confirm a row lands in `user_motifs` (Supabase table view) scoped to your user id.
3. Reload / new document → open the Motif device picker → the promoted motif appears under **"My library"**.
   Select it → it's COPIED into this document's customGlyphs (keyed by the row uuid) and renders. Re-selecting
   the same library motif does NOT duplicate it.
4. **Share round-trip (COPY proof):** save the doc, open its share link (or another account) → the placed
   library motif still renders (it travelled inside `config.customGlyphs`, never resolved against your library).
5. **Login gate:** sign OUT → open the editor → the button reads **"Sign in to save to library"** and clicking
   it triggers Google sign-in (no promote). **Offline:** with Supabase unreachable, the library list is empty
   and a promote surfaces no crash (graceful).

### Deferred (recorded)
- **Promote feedback:** the "Save to my library" click is graceful (no crash, scope met) but gives no visible
  saved/error signal and the modal stays open. Repo culture makes saves observable (`useCloudPersistence.saveState`
  = idle|saving|saved|error) — a tiny inline "Saving…/Saved ✓/Couldn't save" state on the button would match.
  `onSaveToLibrary` already returns a promise resolving to the saved motif or null, so the seam is ready.
- **Atomic copy-on-use undo:** collapse the Inspector's copy+rebind into one `onUseLibraryGlyph` that Studio
  wraps in `recordBatch(...)` for a single undo step (currently two entries; fully revertable).

## Integration protocol
- Each WI runs sequential ON MAIN (sole writer). After each: full `npm test` + `npm run lint`; update this doc.

## Guardrails (auto-committer is ON — keep the tree clean)
- Never reset/force-push/rewrite pushed history. Never touch 3D WIP: `src/components/canvas3d/**`, `src/lib/three3d/**`. Only intended P4 files modified.
- Migration is AUTHORED ONLY — applying it is a HUMAN step (goes in the verification checklist).
- Premium flag ships OFF (free). Login gate ships ON.
- Skip Playwright/browser E2E — unit/integration coverage only.

## Run log
- **2026-07-08 (start):** Read DECISIONS(D1) + P1/P2 orchestrators. Recon'd auth (useAuth/user), supabase client
  (null-when-unconfigured), designService (service+test idiom), RLS convention (Owner full access), migration
  numbering (latest 012 → P4=013), featureFlags/tierLimits, glyph shape + getGlyph builtin-wins, useLayers store
  (updateCustomGlyph = idempotent keyed upsert), MotifDevice optgroups (Inspector:572), Studio modal mount (1696).
  Verified `get_shared_design` returns whole config → COPY-on-use airtight. Advisor folded 4 locks (copy-vs-ref,
  id model, two-distinct-gates, offline-graceful/hide-when-empty). Building sequential-on-main.
- **2026-07-08 (P4-1 done):** `motifLibraryEntitlement.js` — `canUseGlobalLibrary({user,tier})→true` (scaffold OFF),
  inline one-line flip comment (→ `checkGate(tier,'globalLibrary').allowed`). Does NOT encode login (separate UI
  gate). 4 tests GREEN.
- **2026-07-08 (P4-2 done):** Migration `20250101000013_user_motifs.sql` (human-gated header; table `{id uuid,
  user_id, name, glyph jsonb, timestamps}` + RLS "Owner full access" + `idx_user_motifs_user` + shared
  `set_updated_at` trigger; NO public/shared read — promoted motifs travel only by COPY into shared docs).
  `userMotifService.js`: pure `glyphToRow`/`rowToLibraryMotif` (re-keys glyph.id→row uuid) + offline-graceful
  `saveUserMotif`/`loadUserMotifs`/`deleteUserMotif` (mirror designService). 13 tests GREEN.
- **2026-07-08 (P4-3 done):** `hooks/useGlobalMotifLibrary.js` — `{motifs,loading,error,promote,refresh}`;
  seq-guarded fetch on user change; logged-out→[] + promote→null; load/promote rejection sets `error`, never
  throws. 5 tests GREEN. Next: P4-4 UI wiring (Modal + Inspector + Studio, sequential on main).
- **2026-07-08 (P4-4 done — P4 COMPLETE):** MODAL: added `canSaveToLibrary`/`isLoggedIn`/`onSaveToLibrary`/
  `onRequireSignIn` props + a left-aligned footer "Save to my library" button — HIDDEN when not entitled;
  logged-out → "Sign in to save to library" prompting `onRequireSignIn` (no promote); logged-in → promotes
  `serialize()`. 3 tests. INSPECTOR: `libraryMotifs` + `onCopyLibraryGlyph` threaded through Inspector →
  SelectedLayerInspector → MotifDevice; "My library" optgroup (hidden when empty); the Custom optgroup DEDUPES
  out library-backed ids so each id shows once; select onChange COPIES the library glyph into the doc (only if
  not already present — idempotent) then rebinds. 3 tests. STUDIO: `useGlobalMotifLibrary(user)` +
  `canUseGlobalLibrary({user,tier})` (tier from useGate); passes libraryMotifs + `onCopyLibraryGlyph=(g)=>
  updateCustomGlyph(g.id,g)` to Inspector and the 4 library props to the modal (`promoteMotif`, `signIn`).
  HOOK lint: converted to `useReducer` (dispatch is exempt from react-hooks/set-state-in-effect; useState was not).
  Full suite **3920 passed / 54 skipped / 0 fail**. Touched-file lint clean. Tree = only P4 files (no 3D WIP).
  NOTE (minor, acceptable): copy-on-use records TWO undo entries (updateCustomGlyph copy + updateLayer rebind);
  `recordBatch` exists to coalesce but the copy and rebind are separate Inspector callbacks — left as-is.
</content>
</invoke>
