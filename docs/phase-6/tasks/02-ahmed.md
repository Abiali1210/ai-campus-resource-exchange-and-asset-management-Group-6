# Part 2 — Ahmed — exchange and asset life cycle

Read [the shared plan](../README.md). Status: waiting for part 1.
Start only from Abdulrahman's reviewed, merged work and `handoffs/01-abdulrahman.md`.
Run his setup/checks first. Reuse his services, authorization and stock model.

## Build

- [ ] Request submission, validation and own/departmental tracking; quantity accepted,
      allocated and still unallocated remain distinguishable. Add Interest selection.
- [ ] Reservation, Transfer, Approval and Handover migrations and service operations,
      using design Sections 10–11. Enforce Interest/request/portion agreement.
- [ ] Supplier reservation approval atomically locks/checks request and portion,
      suitable stock, remaining demand and no self-approval. Create allocation,
      reservation, pending transfer, decision and audit together or none at all.
- [ ] Separate release approval; scheduling and assigned Facilities dispatch.
      Keep physical tracking separate from formal departmental assignment/custody.
- [ ] Authorized receiver observation and full accepted receipt completion. Discrepancies
      remain open/allocated. Reconciled acceptance and supplier-confirmed return must
      have usable screens; do not force direct database edits for the demonstration.
- [ ] Partial allocations and remaining unmet demand; pre-dispatch cancellation;
      post-dispatch reconciliation. Protect against stale versions and duplicate retries.
- [ ] State guards and actor/time/reason history, preserving portion conservation.
      Submission order is normal allocation order; exceptions retain human reasons.
- [ ] Basic defects, inspections, maintenance actions/costs/outcome. Maintenance Staff
      record work; separately authorized Representative/Custodian updates suitability.
- [ ] Basic end-of-life proposal, Business Administrator decision and recorded physical
      completion. No active allocation; rejection restores actual prior state. Do not
      treat no demand, maintenance cancellation or rejection as proof of safety.
- [ ] Business audit and committed event records carrying authorized recipient context
      for part 3 notifications. Include costs, purchase basis and outcome links needed
      for part 4 calculations; do not calculate fictional impact values.

Combined approval UI, automatic escalation routing and purchase indicator refinement
may remain pending. They do not excuse missing separate decisions or purchase-basis data.

## Acceptance evidence

- [ ] Complete supplier/requester/Facilities/receiver walkthrough with role boundaries.
- [ ] Two concurrent approvals for the last unit: only one allocation succeeds.
- [ ] Request 10, accepted 3 and allocated 2 leaves 5 unallocated; leaf stock is conserved.
- [ ] Self-approval, wrong department, unsafe stock and bypassed release are rejected.
- [ ] Retry accepted receipt: no duplicate fulfillment, custody change or audit outcome.
- [ ] Disputed/short receipt stays allocated; confirmed return restores demand without
      counting accepted reuse. Unsafe returned stock stays unavailable.
- [ ] Cancellation, maintenance completion/condition assessment, and rejected unfit
      end-of-life cases preserve the design's safety and authority boundaries.
- [ ] Existing part 1 checks continue passing; record actual results and known failures.

## Documentation and handoff

Complete report Section 2 and update feature/requirement status. Create
`docs/phase-6/handoffs/02-ahmed.md` with exact migrations, service contracts, states,
event payloads, demonstration data, checks and limitations. Abi Ali must consume
these ordinary business operations rather than create AI-specific mutation paths.

Suggested branch: `codex/phase6-02-workflows`.
Requirement focus: FR-REQUEST-001–008, FR-TRANSFER-001–008, FR-MAINT-001–006,
BR-001–011 and quantity/safety/audit requirements. Identify optional/partial items.

## Prompt for the member's AI assistant

> Implement only docs/phase-6/tasks/02-ahmed.md after reading the shared plan and
> part 1 handoff. Verify the inherited application first, explain the approach,
> preserve contracts, and finish this part's checks, report contribution and handoff.
> Honor applicable user/AGENTS instructions; do not claim unrun checks passed.
