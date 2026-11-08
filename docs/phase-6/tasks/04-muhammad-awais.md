# Part 4 — Muhammad Awais — reporting and final integration

Read [the shared plan](../README.md). Status: waiting for part 3.
Start from the three reviewed, merged parts and their handoffs. Verify the inherited
workflow before adding reports; log missing predecessor work rather than silently
claiming it complete. Coordinate a bounded correction if a prerequisite is broken.

## Build

- [ ] Authorized operational tables for assets, outstanding requests, reservations,
      transfers, maintenance, ownership and approvals; department/category/period
      filters and CSV export. Protect financial detail in both screens and exports.
- [ ] Database/calculated snapshots separating completed, pending, canceled, disputed
      and returned outcomes. Use the SRS and design Section 12 formulas.
- [ ] Dashboard with at least three populated measures; separate transfer-event counts
      from accepted reused units and repairs from restored units. Include the required
      financial, diversion, reuse/repair, carbon and life-extension measures, showing
      unavailable estimates when required evidence is absent.
- [ ] Avoided purchase requires a recorded otherwise-purchase basis. Deduplicate outcomes,
      allocate shared costs once, retain negative savings, and use N/A for zero denominators.
      Preserve cohort, units, source inputs, factor/method version and limitations.
- [ ] Use design-mapped electronics factors only where supported; preserve documented
      mass conversion/boundary. Unsupported categories remain unavailable. Life extension
      is a reviewed forecast difference, not measured life or additive overlapping claims.
- [ ] Generated report draft via the existing server gateway using only a permitted,
      computed snapshot. Check all narrative numbers/facts; withhold unsupported drafts.
      Include period, data basis and model provenance. Human edits/review precede publishing.
- [ ] Fixed reports and exports remain available during AI outage; summaries never
      update authoritative source figures.
- [ ] Reproducible setup/reset and demo instructions; verify the chosen frontend delivery
      route if available without purchases. Record local-only delivery honestly if hosting
      is unavailable; do not call an unvisited URL deployed.
- [ ] Demonstrate database plus private-object backup and isolated restore using checksums
      where the authorized environment permits it. Record configuration/retention decisions
      still pending; never test restore by overwriting the live/shared environment.

## Final checks and demonstration

- [ ] Clean setup, migrations, seed and available build/type/test checks.
- [ ] Register/classify/publish -> request/match/select -> reserve -> release -> dispatch
      -> accept receipt -> correct history/notifications -> calculated and AI reports.
- [ ] Denied direct access, self-approval, two competing last-unit approvals, partial
      need, cancellation, disputed receipt/return, unsafe maintenance and rejected EOL.
- [ ] All five AI capabilities exercised, including invalid output, missing evidence,
      human correction and AI-disabled conventional operation.
- [ ] Independent calculation cases: no purchase basis, missing factors/mass, zero
      denominator, duplicate outcomes, allocated shared costs and negative savings.
- [ ] Verify report CSV scope and data; assistant/reporting cannot leak financial data.
- [ ] Record a small declared-workload search timing check, with dataset/session counts,
      method and observed results; do not claim the SRS performance target passed without
      measuring the specified workload. Full Phase 7 evaluation can remain pending.
- [ ] No credentials, unexplained placeholders or false completed statuses in deliverables.

## Report and handoff

Complete report Section 4; retain each member's contributions and actual AI assistance.
Update the feature table with implemented/partial/pending IDs and real evidence links.
Assemble the concise report; do not recreate Phase 4/5 or write invented results.
Confirm the lab's required submission format before extra Word/PDF conversion.
Create `docs/phase-6/handoffs/04-muhammad-awais.md` with the submission manifest,
demo, tested revision, results, unresolved decisions and Phase 7 follow-up list.
Update repository README links to actual runnable instructions and deliverables.

Suggested branch: `codex/phase6-04-reporting-integration`.
Requirement focus: FR-REPORT-001–009, SUS-001–007, AI-REQ-007, supporting reliability,
recovery and quality requirements. Do not label full SRS verification complete.

## Prompt for the member's AI assistant

> Implement only docs/phase-6/tasks/04-muhammad-awais.md after reading the shared
> plan and three handoffs. Explain the approach, verify inherited work, implement
> reporting and perform final integration checks. Finish the shared report and
> submission handoff; honor user/AGENTS instructions and distinguish actual results
> from pending Phase 7 checks. Do not invent approvals or measured performance.
