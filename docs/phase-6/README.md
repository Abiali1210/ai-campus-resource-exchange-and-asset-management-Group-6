# Phase 6 minimum implementation plan

Updated 8 November 2026. **Current scope: C1–C6 and AI features #2 and #5 only.**
Abdulrahman clarified that the team should implement only the highlighted lab
minimum for now. This supersedes the broader Phase 6 task allocation previously
published. The full SRS/design remain references for later phases; deferred
features are not deleted from those submitted documents.

## Required deliverables

The [Phase 6 slides](sources/phase-6-draft-implementation.pptx), slides 3–5, require:

- C1: login and at least three roles; server-side permission checks.
- C2: departments and asset registration with category, condition, department/status.
- C3: publish surplus; keyword/category/condition/department search and filters.
- C4: request submission and tracking of the user's own requests.
- C5: at least one approval, no self-approval, receiver confirmation, correct
  ownership/department update and no double allocation of the last item.
- C6: guarded state transitions and asset history showing who did what and when.
- AI #2: up to five matching/ranked eligible surplus items with scores, one-line
  reasons and requester accept/reject. Selection does not bypass approval.
- AI #5: database-calculated report numbers, AI-written short summary and human
  admin editing before publication.

**Deferred for now:** C7 sustainability dashboard, C8 in-app notifications, C9
standalone operational reporting/CSV, AI #1 classification, AI #3 sustainable-action
advice, AI #4 conversational assistant, maintenance/repair and end-of-life workflows.
A small calculated report snapshot/page is necessary for AI #5; it is not a request
to build the full dashboard or C9 report suite. Do not implement these deferred
features opportunistically or add them to another member's checklist.

## Sequential owners

| Order | Owner | Task | Target dates |
| --- | --- | --- | --- |
| 1 | Abdulrahman | [Foundation and catalogue: C1–C3, audit foundation](tasks/01-abdulrahman.md) | 8–11 Nov |
| 2 | Ahmed | [Requests, approval and transfer: C4–C6](tasks/02-ahmed.md) | 12–14 Nov |
| 3 | Abi Ali | [AI #2 matching/ranking](tasks/03-abi-ali.md) | 15–17 Nov |
| 4 | Muhammad Awais | [AI #5 generated report and integration](tasks/04-muhammad-awais.md) | 18–20 Nov |

Dates are targets, not completion promises. Reserve 21 November for corrections and
practice. The brief's tentative Phase 6 deadline is the lab week starting 22 November;
confirm the actual lab instructions. Each member starts from the previous reviewed,
merged part and leaves a working application, actual check results and a handoff.

## Baseline and implementation rules

Read the [brief](../Project-September2026.pdf), [SRS v1.2](../phase-3/COSC336_Group6_Phase3_SRS_v1.2.docx),
[design v1.4](../phase-4-5/COSC336_Group6_Phase4_5_Design_v1.4.docx) and the lab slides.
Repository versions take priority over old attached/local drafts.
User-reported instructor approval of React/TypeScript + Supabase was confirmed on
8 November. Keep the proposed React/Vite, Supabase/PostgreSQL managed backend;
Gemini and pgvector are introduced only by the AI stages that need them.

- Use domain/service classes and reusable React screens. Do not rebuild the app at
  each handoff, switch architecture or add another application server.
- Keep the nine existing role keys for compatibility, but build only the screens/
  operations needed here. Technical administration does not grant business approval.
- Preserve StockPortion quantities, department boundaries and backend authorization.
  Interest is not reservation; supplier approval allocates atomically.
- Preserve separate reservation/release records where the design requires them,
  physical tracking at dispatch, and formal custody only on accepted receipt.
- Preserve invalid/unsafe/unknown condition guards; do not build a maintenance or
  disposal module merely because the full state vocabulary includes those states.
- Keep audit with committed mutations. An internal event record for audit integration
  is not an instruction to build notifications.
- AI remains advisory and caller-scoped; ordinary workflows survive an AI outage.
  Scores are compatibility indicators, not probabilities. Report totals come from
  recorded/calculated data, never invented model output.
- No institutional integration, model training, paid purchases or production platform
  work. Use synthetic test data; never commit credentials or impersonate a teammate.

## Instructions for each AI assistant

Read this plan, your owner's task, previous handoffs and applicable AGENTS/user
instructions. Explain the approach, inspect existing code and run inherited checks.
Implement only your assigned minimum. Use additive migrations and existing contracts;
do not reset shared data. Keep meaningful commits attributable to the member doing
the work, and obtain authorization before publishing or merging.

Each handoff records owner/branch/revision/reviewer, setup/migration/seed commands,
changed contracts, checks actually run, failures and remaining work. Do not report
mocked/local checks as live service tests. Each human owner reviews and demonstrates
the result.

## Report and current status

Slide 5 explicitly requests an environment/selected-features report. No page count,
template or separate upload format is specified. Use the short shared
[implementation report](implementation-report.md); 2–4 pages is a recommendation,
not an instructor rule. Each member writes their section during their turn.

Part 1 has been narrowed and locally checked on the unpublished implementation branch.
Follow [setup](setup.md) and [Abdulrahman's progress handoff](handoffs/01-abdulrahman.md)
for current verification and live configuration still needed.
