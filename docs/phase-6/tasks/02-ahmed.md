# Part 2 — Ahmed — requests, approval and transfer

Read [the shared plan](../README.md) and Abdulrahman's reviewed handoff.
**Scope: C4–C6 only.** Run inherited setup/checks before extending the application.

## Implement

- [ ] Resource request form and own/department-authorized request status tracking.
- [ ] Selecting a published item creates linked Interest, not an automatic allocation.
- [ ] Supplier approval/rejection with no self-approval and a distinct release
  decision where required by the existing design.
- [ ] Atomic stock and remaining-demand checks. The same last unit cannot be allocated
  twice; partial allocations preserve the batch and outstanding request quantity.
- [ ] Scheduling/dispatch and receiver acceptance. Physical holder/location changes
  during movement; formal ownership/department/custody changes only on accepted receipt.
- [ ] Basic cancellation, disputed receipt and supplier-confirmed return needed to
  keep the transfer cycle consistent. Unsafe/unresolved stock remains unavailable.
- [ ] Guarded request/transfer/portion states, actor/time/reason history and
  transactional audit. Stale versions and repeated operations cannot duplicate outcomes.
- [ ] Reproducible workflow sample data for matching and generated-report stages.

Do not implement maintenance/repair, end-of-life approval, notifications, sustainability
dashboard, AI advice, assistant, classification or the general report/CSV suite.

## Finish evidence

- [ ] End-to-end request -> approval/release -> dispatch -> accepted receipt.
- [ ] Direct role/department denial and self-approval rejection.
- [ ] Two competing approvals for the last unit: exactly one succeeds.
- [ ] Partial quantities, pre-dispatch cancellation and disputed receipt/return reconcile
  stock/demand correctly; no premature custody change.
- [ ] Asset history shows who did what and when. Existing Part 1 checks still pass.

Complete report Section 2 and `docs/phase-6/handoffs/02-ahmed.md` with commands,
contracts, tested revision/results and limitations. Branch: `codex/phase6-02-workflows`.

## AI starting prompt

> Implement only docs/phase-6/tasks/02-ahmed.md, C4–C6. Inspect Part 1 and its handoff,
> explain the plan, preserve quantity/authority rules, and finish checks/report/handoff.
> Do not implement deferred modules or claim unrun tests passed.
