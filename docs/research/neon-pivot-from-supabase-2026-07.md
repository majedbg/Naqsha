# Supabase → Neon pivot research

Checked 2026-07-30 against official Neon sources and this repository. Prices and product maturity can change; re-check the linked pages at cutover.

## Recommendation

Neon is a credible cost-saving target for this app, but this is not a database-URL swap. The lowest-risk route is:

1. Put an app-owned persistence interface in front of the current Supabase calls.
2. Move the ordinary `public` Postgres schema and data first.
3. Pilot Neon Auth + Google and Neon Data API on a Neon branch, while preserving existing application user UUIDs through an explicit identity mapping.
4. Move the four object buckets and the AI edge function as separate workstreams.
5. Cut over only after the current RLS suite has been ported and run against a restricted Neon role.

For this Vite/browser-heavy app, the Neon Data API is the closest replacement for Supabase PostgREST. It is PostgREST-compatible, accepts Neon Auth or another JWKS provider, and exposes tables, views, and functions over HTTPS; however, Neon’s latest explicit maturity label I found is **Beta**, not GA. ([Data API announcement](https://neon.com/blog/a-postgrest-compatible-data-api-now-on-neon), [open-beta changelog](https://neon.com/docs/changelog/2025-06-20)) A conservative alternative is a small serverless backend using the GA Neon serverless driver, keeping database credentials and privileged workflows off the browser. ([serverless driver](https://neon.com/docs/serverless/serverless-driver))

## Cost fit

The current Free plan is $0 with no time limit/card requirement and lists 100 projects, 100 CU-hours per month **per project**, 0.5 GB storage per project, compute up to 2 CU/8 GB RAM, scale-to-zero after five idle minutes, 6-hour restore history (or 1 GB of changes), and Neon Auth up to 60,000 MAU. The Launch plan is usage-based at $0.106/CU-hour and $0.35/GB-month. ([current pricing](https://neon.com/pricing)) Those limits have changed repeatedly, so 0.5 GB is the number to measure before deciding this project will actually stay free.

The database allowance does not eliminate object-storage cost or quotas. Neon announced its own S3-compatible Storage and Functions in July 2026, but explicitly labels both Beta. ([Neon backend beta](https://neon.com/blog/neon-backend-is-beta)) For a low-risk production migration, keep an external S3-compatible object store and the hosting platform’s serverless functions as viable adapters until Neon’s new products have been piloted.

## What this repository actually depends on

The browser currently gets a nullable Supabase client from two public Vite variables, and “offline” means that client is `null`. ([`src/lib/supabase.js`](../../src/lib/supabase.js)) Google sign-in, session events, sign-out, profile fetch/upsert, and the user object are all supplied directly by Supabase Auth. ([`src/lib/AuthContext.jsx`](../../src/lib/AuthContext.jsx))

Cloud design saving is ordinary PostgREST CRUD over `designs` plus `design_history`; sharing and history add a Postgres function and more CRUD. ([`src/lib/designService.js`](../../src/lib/designService.js)) The save hook also keeps a local failed-save recovery draft, retries writes, and stores the whole design config plus a base64 JPEG thumbnail in Postgres. ([`src/lib/hooks/useCloudPersistence.js`](../../src/lib/hooks/useCloudPersistence.js)) The database migration makes the thumbnail a `text` field and couples ownership to `profiles.id`, which in turn references `auth.users(id)`. ([initial schema](../../supabase/migrations/20250101000001_initial_schema.sql))

The Supabase-specific inventory is broader than project saving:

- Direct table/PostgREST access spans profiles/settings, designs/history, collections, AI patterns/credits, user motifs/patterns, organizations/members/materials/submissions, and material evaluations. The calls are spread across the modules under [`src/lib`](../../src/lib).
- RPC calls include `get_shared_design`, `deduct_ai_credits`, and `claim_memberships`; the Data API can expose Postgres functions, so the functions themselves are portable after their auth assumptions are rewritten. ([Data API function support](https://neon.com/docs/changelog/2025-12-05), [`designService.js`](../../src/lib/designService.js), [`aiPatternService.js`](../../src/lib/aiPatternService.js), [`membershipService.js`](../../src/lib/org/membershipService.js))
- Supabase Storage backs four private buckets: `submissions`, `pattern-photos`, `material-evaluations`, and `etch-sources`. Their policies depend on `storage.objects`, `storage.foldername`, object `owner`, and `auth.uid()`. ([migrations](../../supabase/migrations), [`libraryRepository.js`](../../src/lib/libraryRepository.js), [`materialEvaluationService.js`](../../src/lib/materialEvaluationService.js), [`etchSourceStorage.js`](../../src/lib/etch/etchSourceStorage.js))
- One Supabase Edge Function, `generate-pattern`, holds the Anthropic secret and is invoked through `supabase.functions`. ([function](../../supabase/functions/generate-pattern/index.ts), [`aiPatternService.js`](../../src/lib/aiPatternService.js))
- The schema is tightly coupled to Supabase Auth through `auth.users`, `auth.uid()`, `auth.email()`, `auth.jwt()`, an `auth.users` trigger, Supabase roles, and storage policies. ([initial schema](../../supabase/migrations/20250101000001_initial_schema.sql), [organization migration](../../supabase/migrations/20250101000004_org_admin.sql))

No application use of Supabase Realtime was found, so no realtime replacement is currently required.

## Auth and identity implications

Current Neon Auth is based on Better Auth, keeps users, sessions, organizations, configuration, and JWKS in the database’s `neon_auth` schema, integrates with the Data API, and branches with the database. Google/GitHub sign-in is explicitly supported, and Neon previously documented Google/GitHub/Microsoft provider management with shared or custom OAuth credentials. ([current Auth architecture](https://neon.com/blog/neon-auth-branchable-identity-in-your-database), [OAuth provider management](https://neon.com/docs/changelog/2025-07-04)) Auth is available on Free. ([pricing](https://neon.com/pricing))

Google support is real, but the product is relatively young: Neon replaced the earlier Stack Auth synchronization architecture in December 2025, and says managed Neon Auth is not a drop-in self-hosted Better Auth installation and does not yet accept custom Better Auth plugins or server handlers. ([current Auth architecture](https://neon.com/blog/neon-auth-branchable-identity-in-your-database)) Keep the app’s auth interface independent of the Neon SDK.

Do **not** assume a new Google login will reproduce the old Supabase user UUID. Existing ownership columns are UUID foreign keys all over this schema. Preserve them by adding an application identity mapping such as `(provider, provider_subject) -> profile_id`, where `profile_id` remains the existing UUID. Then resolve the authenticated Neon subject to that UUID before reads/writes. This is a repository-specific inference from the existing foreign keys and the fact that Neon Auth owns a separate `neon_auth` identity model, not a claim that the two providers share identifiers. ([initial schema](../../supabase/migrations/20250101000001_initial_schema.sql), [Neon Auth architecture](https://neon.com/blog/neon-auth-branchable-identity-in-your-database))

Every Supabase RLS expression must be audited. With Neon Data API, JWT validation supplies `auth.user_id()` and every exposed table must have RLS enabled. ([Neon RLS guide](https://neon.com/docs/guides/row-level-security)) Replace `auth.uid()` with policies that resolve `auth.user_id()` through the identity mapping; replace `auth.email()` and the current Supabase-specific `auth.jwt()` metadata checks with functions based on the exact Neon Auth claims/user row. Do not carry the existing verified-email membership-claim function over unchanged.

If using the driver instead of Data API, Neon documents setting verified JWT claims and the query in one transaction, using a role without `BYPASSRLS`, and explicitly avoiding `neondb_owner`. ([serverless driver RLS guidance](https://neon.com/docs/serverless/serverless-driver)) This is also the right shape for privileged multi-step work such as credit deduction + AI generation bookkeeping. HTTP is suited to one-shot transactions; WebSocket `Pool`/`Client` is for interactive transactions/session behavior. ([serverless driver](https://neon.com/docs/serverless/serverless-driver))

## Practical migration sequence

1. **Measure first.** Record database size, bucket bytes/object counts, auth-user count, extensions, and the active Supabase/Postgres versions. The 0.5 GB Neon Free database ceiling is likely more important than row count. ([pricing](https://neon.com/pricing))
2. **Create one deep persistence module.** Give callers a small interface for auth/session, designs, object storage, and AI generation. Keep Supabase and Neon as adapters during migration. This prevents today’s many `supabase.from/storage/auth/functions` call shapes from becoming the application interface.
3. **Prepare a Neon branch.** Neon’s Import Data Assistant accepts a source connection string, checks compatibility, creates a target, and generates `pg_dump`/`pg_restore`; Neon also documents Supabase migration and standard dump/restore paths. ([migration tooling](https://neon.com/migration), [migration hub](https://neon.com/docs/import/migrate-intro))
4. **Move application schema/data, not managed product schemas blindly.** Dump/restore the application-owned `public` schema and data using **unpooled/direct** connections. Neon warns not to use pooled connections for `pg_dump`; large databases should use separate dump and restore files rather than a fragile pipe. ([dump/restore guidance](https://neon.com/docs/import/migrate-from-neon))
5. **Rebuild auth deliberately.** Enable current Neon Auth + Google, create the identity map, associate existing profiles with Google subjects on a verified-login/administrative flow, and only then rewrite RLS and triggers. An older official Supabase-auth migration article targets Neon’s retired Stack-era architecture, so its commands must not be copied into the current Better Auth system. ([older article](https://neon.com/blog/supabase-auth-neon-auth), [replacement architecture](https://neon.com/blog/neon-auth-branchable-identity-in-your-database))
6. **Port PostgREST callers.** The shortest pilot uses Neon Data API with `postgrest-js`/Neon’s client and the session JWT; ordinary `.from()` flows should map closely because Neon describes the protocol as PostgREST-compatible. RPCs remain Postgres functions but need the auth/RLS rewrite. ([Data API](https://neon.com/blog/a-postgrest-compatible-data-api-now-on-neon))
7. **Move files separately.** Copy actual objects from the four Supabase buckets to the chosen object-store adapter, preserve path/owner metadata in application tables, and replace bucket RLS with signed uploads/downloads authorized by the backend. A Postgres dump alone is not a safe file migration plan because the repository’s file access depends on Supabase Storage, not just ordinary `public` tables.
8. **Move `generate-pattern`.** Deploy it as a serverless function (or pilot Neon Functions Beta), verify the Neon/Auth token server-side, and move credit deduction/refund + pattern persistence behind one backend workflow. This removes the current cross-system failure window visible in [`aiPatternService.js`](../../src/lib/aiPatternService.js).
9. **Verify before cutover.** Run all CRUD/RPC tests against the Neon adapter, port the live RLS harness to restricted Neon roles, exercise Google login/logout/account switching, failed-save draft recovery, sharing, guest submissions, all four file flows, and AI refund paths. Neon’s Data API Advisors can flag missing RLS, exposed columns, and unindexed foreign keys, but it supplements rather than replaces application tests. ([Advisors](https://neon.com/docs/changelog/2026-03-06))
10. **Cut over reversibly.** Briefly stop or dual-write mutations, take a final dump/object sync, switch configuration, validate counts/checksums and representative users, and retain Supabase read-only until the rollback window closes.

## Bottom line

For the immediate goal—avoid paying roughly $15 for a small, intermittent project—pilot **Neon Free + Neon Auth Google + Data API** on a branch, but keep a serverless-backend fallback because Data API and Neon’s Storage/Functions are still labeled Beta in the latest official material found. The real migration cost is identity/RLS/storage, not Postgres: ordinary design rows, JSON configs, functions, indexes, and triggers are the easy part.
