# Part 3 — Abi Ali — matching, advice, assistant and notifications

Read [the shared plan](../README.md). Status: waiting for part 2.
Start from Ahmed's reviewed, merged work and both earlier handoffs. Run inherited
checks; reuse the existing AI gateway, authorization, records and business operations.

## Build

- [ ] Asset/request semantic retrieval using compatible model/version/dimension vectors
      alongside keyword/category retrieval. Invalidate stale embeddings; retain manual
      retrieval during failures. Saved assets remain searchable without vectors.
- [ ] Mandatory safety/suitability/permission gates before deterministic compatibility
      and ranking calculations from design Section 12.1. Do not invent scores with an LLM.
      Missing mandatory evidence blocks reservation and shows Needs review.
- [ ] Up to five candidates with factor explanations, missing evidence, model/run and
      review outcome. Rank below 60 is Weak match, not a probability. Missing optional
      factors use the documented treatment, not ad hoc weight redistribution.
- [ ] Candidate accept/dismiss records review; selection records Interest only. Cover
      active remaining unmet demand and closed requests, without reimplementing allocation.
- [ ] Sustainable-action suggestions from actual condition/history/demand/cost evidence.
      Show alternatives, reasons and uncertainty; missing essential evidence means Needs
      review. Accept/reject/override records the reason and opens the normal workflow.
- [ ] Scoped assistant for search, history/status, supplied policy, sustainability and
      navigation; request preparation opens the normal editable form. Do not fabricate
      institutional policy. Missing/restricted evidence produces an honest abstention.
- [ ] Assistant has no approval/reservation/transfer/disposal execution tools. Permission
      checks run before retrieval/provider calls, not merely on links after generation.
- [ ] In-app notices for matches, approvals/exceptions, status, dispatch/receipt/return,
      assignment, maintenance and final-action events already implemented in part 2.
      Unique recipient/event keys, authorized links, visible retryable delivery failure.
- [ ] Validate structured outputs/evidence, record provenance and reviewed corrections,
      and handle provider timeout/outage/usage limits. Use provisional design timeouts;
      record observed timings separately without claiming benchmarks were achieved.

## Acceptance evidence

- [ ] Same seeded catalogue: compare keyword search and semantic matching with expected
      synonym, exact, incompatible, unsafe, unknown, partial-stock and no-match cases.
- [ ] Test stale embeddings, invalid provider output and AI outage; conventional paths work.
- [ ] Equivalent synthetic cases changing only department identity reveal no unexplained
      ranking difference. Record findings and dataset limitations, not accuracy claims.
- [ ] Advice cannot execute an action or bypass end-of-life/maintenance approvals.
- [ ] Assistant handles permitted questions, missing policy, forbidden finance/department
      queries, attempted approvals and editable request confirmation safely.
- [ ] Correct notification recipients/links; duplicate event and delivery-failure cases
      do not duplicate notices or reverse business outcomes.
- [ ] Existing checks pass; record actual service calls versus simulated failure tests.

## Documentation and handoff

Complete report Section 3 and update feature/requirement status. Create
`docs/phase-6/handoffs/03-abi-ali.md`: AI task contracts, model/config identifiers,
score inputs, known limitations, notification event mapping, test cases/results and
instructions for reusing the gateway for report drafting. Never include secret values.

Suggested branch: `codex/phase6-03-ai-notifications`.
Requirement focus: FR-AI-MATCH-001–011, FR-AI-SUST-001–004, FR-ASSIST-001–005,
FR-REPORT-006–009 and related AI/privacy/safety requirements.

## Prompt for the member's AI assistant

> Implement only docs/phase-6/tasks/03-abi-ali.md. Read the shared plan and
> previous handoffs, verify inherited work, and explain your approach. Reuse normal
> business operations and scoped AI gateway. Finish my report, checks and handoff;
> honor user/AGENTS instructions and record failures honestly.
