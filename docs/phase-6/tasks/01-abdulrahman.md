# Part 1 — Abdulrahman — foundation and catalogue

**First part. Scope: C1–C3 and the C6 audit foundation only.**
Read [the shared plan](../README.md). Instructor stack approval was reported by
Abdulrahman on 8 November. Service setup is still needed; see [setup](../setup.md).

## Implement

Checked items mean source exists and local checks passed, not hosted acceptance.

- [x] React/TypeScript/Vite application, clear navigation and service/domain classes.
- [x] Supabase login/logout, administrator-created accounts, roles, departments and
  account activation/deactivation. Server-side permissions, not just hidden buttons.
- [x] Requester, Representative/Custodian and technical administrator paths. Preserve
  the other existing role keys without building their unrelated workflows.
- [x] Asset/category/StockPortion data; name, description/specifications, quantity,
  condition, department/custodian, location and state needed by subsequent parts.
- [x] Conventional registration/editing and separate surplus publication/withdrawal.
  Prevent invalid quantities and unsafe/allocated state changes.
- [x] Keyword, category, condition and department search/filtering. Clear unknown
  condition and empty-result states.
- [x] Asset history and account/asset/publication audit with actor, UTC time and changes.
- [x] Synthetic two-department catalogue with individual equipment, a quantity batch,
  unknown condition and unsafe/retired cases; reproducible account/seed setup.
- [x] Setup instructions, dependency lockfile and backend/validation checks.

Do not implement classification, embeddings, uploads, assistant, advice, notifications,
maintenance, end-of-life, dashboards or reports. Abi Ali owns matching/embeddings later;
Awais owns report generation later. Do not expose unfinished future screens.

## Finish evidence

- [x] Build, 20 unit tests, 16 core PostgreSQL checks and 6 Chrome flows pass.
- [ ] Actual configured login/logout and inactive-account behavior verified.
- [ ] Direct unauthorized RPC/table access, wrong department and attempted technical-
  admin business mutation are rejected.
- [ ] Register/edit/publish/withdraw/search and history work with seeded quantities.
- [ ] A second member can reproduce setup; record remaining live checks honestly.

Update report Section 1 and [your handoff](../handoffs/01-abdulrahman.md).
Branch: `codex/phase6-01-foundation`. Ahmed starts from your reviewed merged revision.

## AI starting prompt

> Implement only Part 1 in docs/phase-6/tasks/01-abdulrahman.md. Read the shared plan
> and current repo first. Scope is C1–C3 plus audit groundwork, not the full project.
> Explain your approach, reuse existing work, test meaningful boundaries and update
> my report/handoff. Honor applicable user/AGENTS instructions and record failures.
