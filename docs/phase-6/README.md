# Phase 6 implementation plan

Prepared 8 November 2026. Status: **planning only; implementation has not started**.
Abi Ali's part is first. Work sequentially on the same application; each successor
starts from the predecessor's merged, verified work.

## Owners and order

| Order | Owner | Task file | Target dates | Status |
| --- | --- | --- | --- | --- |
| 1 | Abi Ali | [Foundation, catalogue and classification](tasks/01-abi-ali.md) | 8–11 Nov | Ready to start; technology confirmation pending |
| 2 | Ahmed | [Exchange and life cycle](tasks/02-ahmed.md) | 12–14 Nov | Waiting for part 1 |
| 3 | Abdulrahman | [Matching, advice, assistant and notifications](tasks/03-abdulrahman.md) | 15–17 Nov | Waiting for part 2 |
| 4 | Muhammad Awais | [Reporting and final integration](tasks/04-muhammad-awais.md) | 18–20 Nov | Waiting for part 3 |

21 November is a proposed correction/practice buffer. These dates are planning
targets, not effort estimates or completion promises. The brief tentatively lists
Phase 6 in labs of the week starting 22 November; the confirmed lab schedule governs.

## Read these sources first

1. [Project brief](../Project-September2026.pdf), Phase 6 on PDF pages 8–9 and schedule on page 10.
2. [Phase 1](../phase-1/COSC336_Group6_Phase1_v1.0.docx): scope and business intent.
3. [Phase 2](../phase-2/COSC336_Group6_Phase2_v1.1.docx): proposed environment and feasibility checks.
4. [Current SRS v1.2](../phase-3/COSC336_Group6_Phase3_SRS_v1.2.docx): requirements, acceptance criteria, role matrix and state tables.
5. [Design v1.4](../phase-4-5/COSC336_Group6_Phase4_5_Design_v1.4.docx): particularly Sections 5–6 and 10–12.
6. [Phase 6 lab slides](sources/phase-6-draft-implementation.pptx): slides 3–5.

Reviewed baseline: repository commit `3dcf69c7cc7e28a4da5c110d107287346e53d983`.
Use newer reviewed repository documents if they change. Do not use old local drafts,
untracked generated sources, or Downloads copies in preference to repository files.
If requirements conflict, record the conflict and ask the team/instructor; do not
silently replace the SRS with this plan.

## Scope and decisions

- The slides require at least C1–C6 and say "atleast 2 and 5 AI features". Implement
  numbered AI features 2 (matching) and 5 (reports) to cover that wording.
- The brief also lists classification, maintenance, notifications, dashboard and
  reports as prototype minimums. The SRS retains all five AI capabilities. This
  plan therefore includes basic versions of C1–C9, classification, matching,
  sustainable-action advice, assistant and generated reporting.
- This is a working draft, not a claim of complete SRS verification. Map each
  implemented, partial and pending requirement to evidence. Comprehensive Phase 7
  testing follows, but every part must be tested before handoff.
- Working proposal: React/TypeScript/Vite, Supabase Auth/storage/functions,
  PostgreSQL/pgvector, Gemini, and Cloudflare static frontend hosting. TBD-001
  remains unresolved. Confirm instructor acceptance before substantial stack-specific
  work; do not mark approval obtained merely because the feasibility report passed.
- Keep one modular application, one database and one server-side AI gateway. Follow
  class-diagram responsibilities with domain/service classes; functional React
  components are appropriate for screens. Do not introduce another application
  server or a general autonomous-agent framework without a recorded reason.
- Verify actual provider model identifiers, embedding dimensions and account access
  during the initial trial. Do not assume proposed model names are currently usable.
- Use synthetic records and permitted sample files. The approximately $35/month
  feasibility allowance is not authorization to buy services or upgrade plans.
- Optional SRS Should refinements may remain pending: combined approval interaction
  (FR-TRANSFER-002), escalation routing (FR-TRANSFER-008), purchase indicator
  (FR-REQUEST-008). Institutional integration, forecasting, training and production
  infrastructure are outside this draft. Required controls cannot be dropped as polish.

## Shared implementation rules

- Preserve all nine human role classes. System Administrator is technical authority,
  not a universal business approver. Enforce scope in backend/database and file access.
- Use Asset + StockPortion. Active leaf quantities sum to asset total. Each transfer
  handles one asset or homogeneous portion. Never replace this with a single mutable
  batch owner/status or introduce a multi-asset transfer engine.
- Selection creates Interest only. Supplying Representative/Custodian approves a
  reservation, then records a distinct release decision. No self-approval in the prototype.
- Lock/check stock and outstanding demand together. Commit allocation, reservation,
  pending transfer, approval and audit atomically. Retries must not duplicate outcomes.
- Dispatch changes physical tracking. Only accepted full approved receipt changes
  formal assignment/custody and fulfilled quantity. Disputes stay allocated; supplier-
  confirmed return restores unmet demand and condition-controlled stock.
- Maintenance work completion and authorized condition update are separate. End-of-life
  rejection restores recorded prior state; neither event clears an unsafe assessment.
- Business mutations and audit commit together. Notifications follow committed events;
  delivery failures are visible/retryable and do not reverse business transactions.
- AI is advisory. Scope retrieval before provider calls; validate output and retain
  model/run/review provenance. Standard forms/search/workflows work during outages.
  Optional embeddings run after saving and cannot roll back a saved asset.
- Reports calculate facts before AI drafts text. Preserve units, sources, assumptions,
  cohort/deduplication and unavailable states. Scores are not probabilities.

## Working conventions for an AI implementing a part

1. Read this file, the assigned task and applicable AGENTS.md/user instructions.
   Explain the approach before editing. This task file does not override learning,
   approval or safety instructions from the member using the assistant.
2. Inspect the actual code and previous handoff. Do not regenerate the application
   or silently switch architecture. Run the existing checks before extending it.
3. Use a branch such as `codex/phase6-01-foundation`. Keep commits meaningful and
   attributable to the member doing and reviewing the work; do not impersonate others.
4. Follow existing names/contracts. Suggested layout, once needed: `src/`,
   `supabase/migrations/`, `supabase/functions/`, `tests/`, and this documentation folder.
   The first member records the actual structure and reproducible setup commands.
5. Add sequential migrations. Do not edit applied migrations or reset shared data.
   Commit `.env.example` placeholders and dependency lockfiles, never credentials.
6. Implement only the assigned part, including its screens, meaningful checks and
   documentation. Fix integration issues caused by that part before handing off.
7. Update the report section and create `handoffs/NN-owner.md` with the template below.
   Mark status complete only with evidence. Stop after the assigned part; the next
   member proceeds after the work is reviewed and merged. Do not push/merge without
   authorization from the member's active session.

### Required handoff contents

- Owner, branch, commit, date and reviewer; what is implemented/partial/pending.
- Exact setup, migration, seed and run/check commands; required secret names only.
- Changed schema/contracts and integration points for the next part.
- Checks actually run, results and a short manual demonstration; include failures.
- Known issues, external blockers, remaining decisions and the next person's first action.

Each member must understand and demonstrate the result. AI assistance is disclosed;
it does not establish independent authorship, approval, measured accuracy or passing tests.

## Report and completion

Slide 5 explicitly requests a report deciding implementation environment and selected
features. It does not specify page count, template or a separate submission format.
Use [the shared report](implementation-report.md); 2–4 pages plus necessary evidence
is a recommendation, not a course rule. Each member updates their section during
their turn. Awais assembles the final reading copy if the lab requires one.

At the end: runnable draft, source/configuration/lockfiles, reproducible synthetic
seed, actual checks and limitations, short report, and a repeatable demonstration.
Do not claim all SRS acceptance tests or production readiness. The team checks the
lab upload/demonstration instructions and confirmed deadline.
