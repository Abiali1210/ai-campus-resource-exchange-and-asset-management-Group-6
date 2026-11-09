# Phase 6 implementation environment and selected features

Group 6 — COSC 336 — Fall 2026

## Selected scope

Per Abdulrahman's 8 November clarification, this draft implements only the lab
minimum: **C1–C6, AI #2 matching/ranking and AI #5 generated reports**.
The broader SRS remains the semester baseline; other capabilities are deferred,
not claimed complete. Slide 5 requires this environment/selected-features report;
it does not specify a page count or separate submission format.

## 1 Environment and catalogue — Abdulrahman

Approved working stack: React/TypeScript/Vite and Supabase/PostgreSQL. Abdulrahman
reported instructor approval on 8 November. Gemini/pgvector are introduced by the
matching/report owners, not Part 1. Part 1 contains login/accounts/roles/departments,
conventional catalogue registration/publication/search and audit groundwork.
See [setup](setup.md) and [progress handoff](handoffs/01-abdulrahman.md).

Part 1 was rechecked after removing the broader AI and file-storage features.
The production build, 20 unit tests, 16 PostgreSQL checks and 6 Chrome flows passed.
These original checks were local. The newer main setup records a shared hosted
PostgreSQL 17.11 foundation with 12 synthetic accounts and six assets provisioned.
Account Edge Function deployment and full hosted acceptance remain pending; this
merge does not reproduce or extend that hosted provisioning.

## 2 Requests and transfers — Ahmed

Implemented C4–C6 on `codex/phase6-02-workflows`, extending the existing
React/TypeScript/Vite and Supabase/PostgreSQL application with an additive migration.
Staff submit and track permitted requests with requested, accepted, actively
allocated and remaining quantities. Published-item selection creates linked Interest;
supplier reservation approval performs allocation. Release is a separate recorded
decision. Both reject requester/Interest-creator self-approval across multiple roles.

The implementation follows SRS UC-04/07/08 and design v1.4 Sections 5 and 9–11.
Request/stock row locks serialize competing approvals, and partial allocation splits
conserved leaf StockPortions. Assigned Facilities schedule and dispatch; physical
holder/location change during movement, while formal department/custodian/location
change only on full suitable accepted receipt. Disputes retain allocation until
full reconciled acceptance or supplier-confirmed return. Unsafe/unknown stock remains
unavailable. Current roles/department scope, expected versions, stable retry keys and
transactional actor/time/reason audit are enforced in PostgreSQL.

Local verification after main integration: **31 unit tests, 16 inherited plus 23 workflow PGlite checks,
the same 23 workflow checks on native PostgreSQL, four genuinely overlapping native
transaction races, ten Chrome flows, production build, fixture integrity and formatting passed**.
Browser evidence comprises five inherited HTTP-mocked foundation flows, a read-only
preview, and four workflow/integration flows running actual SQL with synthetic Auth/HTTP
adapters. These are local checks, not hosted Supabase acceptance. The initial run used
Node 24.15.0. A follow-up review reran all suites, native concurrency and the build
on the documented Node 22 runtime (22.23.4), including the split/mixed-owner catalogue
action regression. The inherited foundation checks pass with both migrations installed.

A read-only independent reviewer examined requirements, implementation and checks,
independently reproduced defects, and verified fixes for unsafe cancellation,
observer/holder separation, terminal tracking privacy and immutable Interest supplier
authority. Regression checks cover those findings. Seven synthetic workflow recipes
provide ordinary inputs for the later matching/report owners; no AI or report module
was added. See [Part 2 handoff](handoffs/02-ahmed.md) for tested revision, commands,
contracts, demonstration and resolved failures.

Hosted Part 2 migration/seed execution and actual browser-to-Supabase workflow
acceptance remain pending. Incoming main provides modern publishable/secret-key
configuration and short demo aliases; the workflow seed shares its identity mapping
with the foundation provisioner. Shared-project data and credentials were not touched.
Human owner review/demo and remote CI remain pending; no hosted deployment, remote
push or feature-branch merge into main was performed. The latest main commit
`2fcc41b` was integrated into the feature branch and retested locally.

## 3 Matching and ranking — Abi Ali

Pending AI #2 implementation, human selection and fallback evidence.

## 4 Generated report and integration — Muhammad Awais

Pending AI #5, authoritative calculated snapshot, edited publication and integrated
demonstration. Keep the report short and distinguish recorded outcomes from estimates.

## Status

| Required feature                                       | Owner          | Status                                                                   |
| ------------------------------------------------------ | -------------- | ------------------------------------------------------------------------ |
| C1 accounts/roles/departments                          | Abdulrahman    | Implemented and locally verified; hosted acceptance/human review pending |
| C2 assets/status; C3 publication/search                | Abdulrahman    | Implemented and locally verified; hosted acceptance/human review pending |
| C4 requests; C5 approval/transfer; C6 workflow/history | Ahmed          | Implemented and locally verified; hosted acceptance/human review pending |
| AI #2 matching/ranking                                 | Abi Ali        | Planned                                                                  |
| AI #5 generated report                                 | Muhammad Awais | Planned                                                                  |

Deferred now: C7–C9 as standalone modules, AI #1/#3/#4, maintenance and end-of-life.
No synthetic data establishes actual campus savings/adoption or general AI accuracy.
Each member records their actual AI assistance, human review and executed checks.
