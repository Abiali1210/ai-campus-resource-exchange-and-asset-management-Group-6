# Part 2 — Ahmed/Awais — requests, approval and transfer

Read [the shared plan](../README.md) and Abdulrahman's reviewed handoff.
**Scope: C4–C6 only.** Run inherited setup/checks before extending the application.

## Implement

- [x] Resource request form and own/department-authorized request status tracking.
- [x] Selecting a published item creates linked Interest, not an automatic allocation.
- [x] Supplier approval/rejection with no self-approval and a distinct release
      decision where required by the existing design.
- [x] Atomic stock and remaining-demand checks. The same last unit cannot be allocated
      twice; partial allocations preserve the batch and outstanding request quantity.
- [x] Scheduling/dispatch and receiver acceptance. Physical holder/location changes
      during movement; formal ownership/department/custody changes only on accepted receipt.
- [x] Basic cancellation, disputed receipt and supplier-confirmed return needed to
      keep the transfer cycle consistent. Unsafe/unresolved stock remains unavailable.
- [x] Guarded request/transfer/portion states, actor/time/reason history and
      transactional audit. Stale versions and repeated operations cannot duplicate outcomes.
- [x] Reproducible workflow sample data for matching and generated-report stages.

Do not implement maintenance/repair, end-of-life approval, notifications, sustainability
dashboard, AI advice, assistant, classification or the general report/CSV suite.

## Finish evidence

- [x] End-to-end request -> approval/release -> dispatch -> accepted receipt.
- [x] Direct role/department denial and self-approval rejection.
- [x] Two competing approvals for the last unit: exactly one succeeds.
- [x] Partial quantities, pre-dispatch cancellation and disputed receipt/return reconcile
      stock/demand correctly; no premature custody change.
- [x] Asset history shows who did what and when. Existing Part 1 checks still pass.
- [x] Report Section 2, shared contracts and owner handoff updated with actual results.
- [x] Independent implementation review completed and substantive findings addressed.

Checked items refer to implemented source and executed local verification, including
native PostgreSQL concurrency. Hosted Supabase acceptance and human review remain
pending; see the [handoff](../handoffs/02-ahmed.md) for exact evidence and limitations.

## Remaining acceptance

- [ ] Hosted Part 2 migration and integrated Auth/JWT/Edge acceptance verified; existing foundation account provisioning is recorded in setup.
- [ ] Actual browser-to-Supabase catalogue and transfer journey verified.
- [ ] Human owner review and demonstration completed.

Complete report Section 2 and `docs/phase-6/handoffs/02-ahmed.md` with commands,
contracts, tested revision/results and limitations. Branch: `codex/phase6-02-workflows`.

## AI starting prompt

> Implement only docs/phase-6/tasks/02-ahmed.md, C4–C6. Inspect Part 1 and its handoff,
> explain the plan, preserve quantity/authority rules, and finish checks/report/handoff.
> Do not implement deferred modules or claim unrun tests passed.
