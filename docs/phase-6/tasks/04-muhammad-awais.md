# Part 4 — Muhammad Awais — AI feature 5 report and integration

Read [the shared plan](../README.md) and all previous handoffs.
**Scope: AI #5 and final integration of C1–C6/AI #2/#5 only.**

## Implement

- [ ] A small authorized report view with a period/filter and a database-calculated
      snapshot: requests/open requests, approved allocations, completed transfers and
      accepted units, using the records already implemented.
- [ ] Separate completed/pending/canceled/disputed/returned outcomes. Do not claim
      maintenance activity or environmental/financial savings not supported by this draft.
- [ ] Server-side Gemini generation using only that permitted snapshot. The model
      writes a short summary; it does not calculate or alter authoritative totals.
- [ ] Validate every narrative figure/fact against the snapshot. Withhold unsupported
      output; identify period, data basis and model/run provenance.
- [ ] Authorized human admin review/editing before explicit publication. Preserve
      appropriate report scope; technical admin is not an automatic business approver.
- [ ] Calculated figures remain visible during AI outage. Reuse the existing server
      pattern and model configuration; no separate application server.
- [ ] Final clean-setup and required-feature walkthrough; resolve integration defects
      caused by this work and document any remaining prerequisite failures.

Do not implement C7 sustainability dashboard, C8 notifications, C9 full operational
report/CSV suite, classification, assistant, action advice, maintenance or end-of-life.
The small calculated snapshot is a dependency of AI #5, not a full reporting project.

## Finish evidence

- [ ] Clean setup/migrations/seed/build and inherited checks.
- [ ] Login -> register/publish -> request/match/accept -> supplier approval/release ->
      dispatch -> receiver confirmation -> history -> calculated/AI report.
- [ ] Direct unauthorized access, no self-approval, last-unit race, partial allocation,
      cancellation/dispute and AI-outage cases do not corrupt records.
- [ ] Generated and human-edited publication does not introduce unsupported figures.
- [ ] Actual provider trial and local mocked tests distinguished; no invented accuracy,
      hosted performance, deployment or institutional impact claims.

Complete report Section 4 and assemble the short shared report. Confirm the lab's
upload format before unnecessary Word/PDF conversion. Finish
`docs/phase-6/handoffs/04-muhammad-awais.md` with tested revision, submission files,
demo and Phase 7 follow-up. Branch: `codex/phase6-04-generated-report`.

## AI starting prompt

> Implement only docs/phase-6/tasks/04-muhammad-awais.md: AI #5 and integration of
> the highlighted minimum. Reuse Parts 1–3, explain the approach, test supported
> numbers and human review, and finish the shared report/handoff. Do not build the
> deferred dashboard, notifications, CSV suite or other project modules.
