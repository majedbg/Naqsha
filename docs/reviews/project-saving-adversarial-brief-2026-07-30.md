# Adversarial review brief: project saving and Neon pivot

Date: 2026-07-30

## Purpose

This brief asks a fresh agent to challenge the project-saving architecture review before implementation or migration tickets are created.

The reviewer must not assume the prior review is correct. Its job is to falsify claims, find omitted failure modes, correct severity, and then use the user-invoked `$wayfinder` skill to chart the unresolved decisions—not implementation slices.

## Required inputs

Read completely:

1. [`project-saving-architecture-review-2026-07-30.md`](./project-saving-architecture-review-2026-07-30.md)
2. [`neon-pivot-from-supabase-2026-07.md`](../research/neon-pivot-from-supabase-2026-07.md)
3. [`CONTEXT.md`](../../CONTEXT.md)
4. [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md)
5. ADRs under [`docs/adr/`](../adr/)

Inspect the cited source files and tests rather than trusting quotations or line references.

## Domain assumptions to challenge

- A Panel is a document partition targeting one physical Sheet.
- Physical Sheet material choice and thickness are document content.
- Canvas Background is workspace visualization, not fabrication document content.
- `panel.substrate` currently holds physical identity.
- `panel.materialId` is currently described as preview material, but its intended future status is unresolved.

The reviewer should report any code or product behavior contradicting those assumptions.

## Threat and failure models

Exercise at least:

- accidental close/reload during a pending local/cloud write;
- two rapid manual saves;
- two tabs editing one cloud project;
- reload of a locally restored cloud project;
- Google sign-in immediately after a recent edit;
- cloud outage during creation and during update;
- account A sign-out followed by account B sign-in on the same browser;
- local quota exhaustion or a throwing storage implementation;
- soft deletion of the currently open cloud project;
- anonymous enumeration of shared rows;
- malicious authenticated attempts to update tier/credits or call credit functions;
- old document blobs missing recently introduced fields;
- a Panel-only physical Sheet edit with no Layer mutation.

## Claims requiring direct falsification

For every claim below, return one of:

- **Confirmed**
- **Refuted**
- **Narrower than stated**
- **Cannot verify**

Include code evidence and, where practical, a failing reproduction test.

1. Panel Sheet-only edits do not dirty or autosave.
2. Cloud persistence omits important fabrication state.
3. Reload loses cloud project identity and causes duplicate insertion.
4. Existing-design recovery drafts cannot be discovered after reload.
5. Google sign-in loses the pending save intent.
6. The redirect can beat the delayed local checkpoint.
7. Local project content can cross authenticated accounts.
8. Manual saves can race or resolve out of order.
9. Cloud open/history can replace dirty work without a decision.
10. The configured cloud-save cap is not enforced.
11. Full config/thumbnail history is a meaningful cost risk.
12. A resolved `null` repository result can show “Saved.”
13. Profile/credit SQL permits privilege escalation under deployed grants.
14. Shared designs are enumerable without token possession under deployed grants.

## Required SQL work

Do not settle SQL exploitability from migration text alone.

If live access is available, inspect:

- table grants for `profiles`, `designs`, and `design_history`;
- routine grants for `add_ai_credits`, `deduct_ai_credits`, and sharing functions;
- actual RLS policies;
- exposed Data API schemas/tables;
- anonymous and authenticated behavior using restricted test identities;
- Supabase security/performance advisors.

Use an isolated branch/project for mutation probes. Never change production data for the review.

If live access is unavailable, label each authorization conclusion as conditional and provide the exact read-only query or isolated test needed.

## Required test work

Prefer tests at the Project Document/Save interface. Temporary characterization tests are acceptable for falsification.

At minimum attempt:

1. Panel material/thickness-only dirty + autosave.
2. Whole fabrication document manual save/load.
3. Save → reload → save identity preservation.
4. Existing-design failed update → reload → recovery.
5. repeated first-save concurrency.
6. dirty current project → cloud open.
7. account-switch local isolation.
8. quota failure between sibling local writes.

Do not “fix” production code during the adversarial review unless separately authorized.

## Required adversarial-review output

Write:

`docs/reviews/project-saving-adversarial-review-2026-07-30.md`

Use this structure:

1. **Verdict**
2. **Blocking findings**
3. **High/medium findings**
4. **Refuted or overstated claims**
5. **Verified-safe behavior**
6. **Missing decisions**
7. **Corrected architecture candidates**
8. **Corrected Neon migration risks**
9. **Evidence and tests run**
10. **Recommended Wayfinder destination**

Do not merely summarize the supplied review.

## Wayfinder handoff

After writing the adversarial review, explicitly invoke the user-invoked `$wayfinder` skill in **Chart the map** mode.

The destination should be phrased as an agreed, implementation-ready decision set for reliable offline/cloud project persistence and a go/no-go Neon migration—not the completed refactor or migration itself.

Wayfinder requirements:

- use the repository's GitHub tracker described in `docs/agents/issue-tracker.md`;
- create one `wayfinder:map` issue;
- create decision tickets as child issues;
- use ticket types from the skill;
- wire native blocking relationships after issue creation;
- leave unresolved downstream questions in **Not yet specified**;
- keep implementation work out of the map unless it is a task required to resolve a decision;
- do not resolve more than one non-research ticket in this session;
- refer to every issue by its linked title, never by a bare number;
- get user input for HITL grilling tickets rather than answering on the user's behalf.

Suggested initial decision areas, subject to the adversarial review:

- authoritative fabrication document content;
- physical Sheet identity and the `substrate`/`materialId` relationship;
- durable local/cloud project identity;
- save conflict and revision semantics;
- Google-auth save continuation;
- local project/account isolation;
- share-link access semantics;
- SQL privilege repair;
- storage/history cost envelope;
- Neon auth/data/storage/function replacement strategy;
- migration verification and rollback criteria.

## Stop condition

Stop after:

1. the adversarial Markdown is written;
2. the Wayfinder map and currently visible decision-ticket frontier are created;
3. research tickets, if any, are dispatched as required by the skill;
4. the user receives links to the review, map, and frontier.

Do not begin the implementation refactor or provider migration.

## Copy-paste prompt

```text
Perform an adversarial review of this repository's project-saving architecture, then chart the unresolved decisions with the user-invoked $wayfinder skill.

Start by reading these files completely:
- docs/reviews/project-saving-adversarial-brief-2026-07-30.md
- docs/reviews/project-saving-architecture-review-2026-07-30.md
- docs/research/neon-pivot-from-supabase-2026-07.md
- CONTEXT.md
- docs/agents/issue-tracker.md
- relevant ADRs under docs/adr/

Treat the existing review as a set of hypotheses, not conclusions. Inspect every cited source path. Try to falsify each important claim with code evidence and focused tests. Pay particular attention to Panel/Sheet material and thickness persistence, dirty tracking, whole-document round trips, cloud identity after reload, failed-save recovery, OAuth continuation, account isolation, concurrent saves, destructive cloud loads, SQL grants/RLS/functions, share-token enumeration, and storage/history cost.

Do not change production code. If live database access is unavailable, clearly separate migration-text findings from deployed exploitability and provide the exact verification queries/tests required.

Write your review to:
docs/reviews/project-saving-adversarial-review-2026-07-30.md

Use the output structure and test requirements in the adversarial brief. Explicitly identify refuted or overstated claims and verified-safe behavior, not only defects.

After the review is written, explicitly invoke $wayfinder in Chart the map mode. Use the GitHub tracker configured in docs/agents/issue-tracker.md. The destination is: an agreed, implementation-ready decision set for reliable offline/cloud project persistence and a go/no-go Supabase-to-Neon migration. Create a wayfinder:map issue and only the decision tickets visible at the current frontier; wire blocking relationships, leave downstream fog in Not yet specified, and do not begin implementation. Do not resolve more than one non-research ticket. Ask me directly for every HITL decision rather than inventing my answers.

Finish by giving me links to the adversarial review, Wayfinder map, and current frontier, plus the single next decision you recommend I address.
```
