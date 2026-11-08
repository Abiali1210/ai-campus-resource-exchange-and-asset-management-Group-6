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
No hosted Supabase account provisioning has been executed. Local checks are not
live service acceptance. Report exact narrowed-scope results in the handoff.

## 2 Requests and transfers — Ahmed

Pending C4–C6 implementation and actual verification evidence.

## 3 Matching and ranking — Abi Ali

Pending AI #2 implementation, human selection and fallback evidence.

## 4 Generated report and integration — Muhammad Awais

Pending AI #5, authoritative calculated snapshot, edited publication and integrated
demonstration. Keep the report short and distinguish recorded outcomes from estimates.

## Status

| Required feature | Owner | Status |
| --- | --- | --- |
| C1 accounts/roles/departments | Abdulrahman | Source exists; narrowed checks/live setup pending |
| C2 assets/status; C3 publication/search | Abdulrahman | Source exists; narrowed checks/live setup pending |
| C4 requests; C5 approval/transfer; C6 workflow/history | Ahmed | Planned; Part 1 audit groundwork exists |
| AI #2 matching/ranking | Abi Ali | Planned |
| AI #5 generated report | Muhammad Awais | Planned |

Deferred now: C7–C9 as standalone modules, AI #1/#3/#4, maintenance and end-of-life.
No synthetic data establishes actual campus savings/adoption or general AI accuracy.
Each member records their actual AI assistance, human review and executed checks.
