# Part 3 — Abi Ali — live-site repairs, then AI feature 2

Read [the shared plan](../README.md) and the first two handoffs.
**Priority: fix the two live-site issues below before AI #2 matching/ranking.**
Abdulrahman assigned these repairs to Abi Ali on 10 November 2026. They repair the
existing C1–C6 implementation; they do not add broader project features.

## Priority 1 — live database errors

Observed while signed in as the Science requester:

- Requests and transfers reports that `public.workflow_workspace` without parameters
  cannot be found in the schema cache.
- Asset details reports that `public.asset_detail(p_asset_id, p_portion_id)` cannot
  be found in the schema cache.

The merged frontend calls the Part 2 functions. Both were introduced by the workflow
upgrade; the shared hosted foundation alone does not supply them. Missing migrations
or an outdated schema cache must be investigated on the actual connected project.

- [ ] Read [shared setup](../setup.md) and confirm the frontend's connected project
      is `campus-exchange-group6-dev` (`gcctwsxullabhkddbzgo`). Check migration history
      and function signatures through authorized access before changing anything.
- [ ] Review the remote migration dry-run and obtain the project owner's deployment
      approval as required by setup. Apply only the outstanding reviewed migrations,
      in order: `202611090001_workflows.sql`, then
      `202611090002_workflow_financial_redaction.sql`. If already applied, inspect
      exact function signatures/permissions and refresh the schema cache as needed.
      Do not blindly rerun migrations that the database already records as applied.
- [ ] Do not reset the shared database, rerun foundation/account provisioning or
      reseed existing accounts. Never commit credentials or weaken grants/RLS to
      make an error disappear. Keep the financial redaction correction in place.
- [ ] Verify on the deployed site, with authorized test accounts, that request
      tracking loads and selected asset details load without missing-function errors.
      Verify no self-approval, receipt-controlled custody and restricted cost access
      remain enforced. Do not create business records without permission.
- [ ] If an infrastructure error remains possible, show an actionable user message
      without raw SQL/function diagnostics. Do not hide a failed load behind a false
      "no requests" state or claim the database was fixed by changing the message.

## Priority 2 — profile avatar is squished

The initials circle becomes an oval beside the long name `Synthetic requester-Science`.
The sidebar uses a flex row, and the avatar currently has width/height but no explicit
non-shrinking flex size.

- [ ] Make the avatar retain equal fixed width and height instead of shrinking.
      Let the adjacent profile text wrap within its available width without forcing
      horizontal overflow. Preserve the existing design and initials.
- [ ] Verify desktop and mobile layouts with long names. Add a browser regression
      checking equal rendered avatar dimensions and no sidebar/page overflow.

## Repair completion evidence

- [ ] Record the actual project/migration status, deployment revision and live
      checks in `docs/phase-6/handoffs/03-abi-ali.md`; keep secret values out.
- [ ] Include regression results and before/after screenshots of the avatar and the
      working request/asset screens. Distinguish actual hosted checks from mocks.
- [ ] Publish reviewed frontend changes through the normal PR/main deployment path;
      Cloudflare frontend deployment alone does not apply database migrations.

These repairs were not applied by Abdulrahman's assistant. The attempted local UI
edits were discarded, and no hosted schema/data change was made.

## Then implement — AI feature 2 only

- [ ] Server-side Gemini embedding integration with secret-only provider credentials.
      Verify available model ID/dimension; add the required model/run/embedding schema
      and pgvector migration without changing previously applied migrations.
- [ ] Compute/store asset embeddings after saved metadata. Retain source version/hash,
      model/dimension and pending/ready/failed status. Failure never removes a saved asset.
- [ ] Semantic candidates alongside conventional retrieval. Apply permission, safety,
      specification, condition, quantity and current availability gates before ranking.
- [ ] Up to five eligible surplus matches with compatibility score and one-line
      reason. Use design Section 12.1's deterministic scoring and missing-data rules;
      do not train a ranker or fabricate scores with generation calls.
- [ ] Show missing mandatory evidence as Needs review and prevent allocation;
      show weak scores/uncertainty clearly. Scores are not probabilities.
- [ ] Requester accept/reject review, retained run/review evidence and normal Interest
      creation on selection. AI cannot reserve or bypass supplier approval.
- [ ] Conventional search/manual selection remains available on outage, malformed
      provider output, incompatible/stale embeddings or no matches.

Do not implement classification (AI #1), sustainable-action advice (AI #3), assistant
(AI #4), notifications, maintenance, dashboards or reporting.

## Finish evidence

- [ ] Synonym and exact matches, incompatible/unsafe/unknown cases, partial quantity
      and remaining-demand cases with declared synthetic expected results.
- [ ] Human accept/reject; no selection-driven allocation or authority bypass.
- [ ] Invalid output, stale vectors and outage leave ordinary workflows usable.
- [ ] Local tests and actual configured embedding call recorded separately.
- [ ] Existing catalogue/transfer checks continue to pass.

Complete report Section 3 and `docs/phase-6/handoffs/03-abi-ali.md` with model config,
contracts, test data/results and limitations. Branch: `codex/phase6-03-matching`.

## AI starting prompt

> Read docs/phase-6/tasks/03-abi-ali.md and the shared minimum scope first. Fix its
> two priority live-site issues, record real deployment/verification evidence, then
> implement AI feature #2 only. Reuse existing operations, explain your approach and
> finish checks/report/handoff. Follow the project's approval rules for hosted changes;
> never reset/reseed shared data or add deferred AI features or notifications.
