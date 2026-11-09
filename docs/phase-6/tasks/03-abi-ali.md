# Part 3 — Abi Ali — AI feature 2 matching and ranking

Read [the shared plan](../README.md) and the first two handoffs.
**Scope: AI #2 only.** Reuse the functioning request, stock and approval operations.

## Implement

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

> Implement only AI feature #2 from docs/phase-6/tasks/03-abi-ali.md. Read the shared
> minimum scope and prior handoffs, reuse ordinary operations, explain the approach,
> and finish checks/report/handoff. Do not add the other AI features or notifications.
