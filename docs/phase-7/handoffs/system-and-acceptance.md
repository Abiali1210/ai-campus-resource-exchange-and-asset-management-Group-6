# Phase 7 handoff: system and acceptance tests

Written for a teammate's AI coding assistant. Read this whole file before acting.

## Context

- Repository: `Abiali1210/ai-campus-resource-exchange-and-asset-management-Group-6`.
- Branch: `docs/phase-7-testing`, PR #28. Work on this branch, not `main`.
- The Phase 7 report is
  [COSC336_Group6_Phase7_Testing_Report_v1.0.docx](../COSC336_Group6_Phase7_Testing_Report_v1.0.docx).
  It follows the instructor's format: objective, strategy, test case tables
  (input, expected, actual, pass/fail) and conclusion.
- Unit and integration testing is done: 328/328 unit, 59/59 PGlite, 61/61 native
  PostgreSQL. See [../README.md](../README.md) for the full evidence.
- **Remaining:** Table 6 (system, TC-SYS-01 to 13) and Table 7 (acceptance,
  TC-ACC-01 to 08). Their Actual and Result cells currently say `Pending` and
  are shaded yellow.

## Rules

- Never commit, print or screenshot the shared demo password, `.env.local`, or
  any key. Ask the human for the password; they get it privately.
- Never reset, reseed or migrate the hosted Supabase project.
- Record what actually happened. If a case fails, write the real behaviour in
  Actual and `Fail` in Result. Do not change a test or the app to make it pass.
- Commit atomically (one logical change per commit) and push to
  `docs/phase-7-testing`. Do not merge the PR.

## Task A: system tests (Playwright)

The browser tests mock the Supabase API with `page.route`, so they need no
backend or password. They do need **Google Chrome** installed, because
`playwright.config.ts` uses `channel: "chrome"`.

```bash
npm ci
npm run test:browser 2>&1 | tee docs/phase-7/results/04-browser-playwright.txt
```

Strip ANSI colour codes from the saved file if present. Then map each report
case to its Playwright test by exact title:

| Report ID | File                        | Playwright test title                                                                  |
| --------- | --------------------------- | -------------------------------------------------------------------------------------- |
| TC-SYS-01 | `foundation.spec.ts`        | configured UI: sign in and publish/withdraw                                            |
| TC-SYS-02 | `foundation.spec.ts`        | requester UI does not expose registration or account administration                    |
| TC-SYS-03 | `foundation.spec.ts`        | technical administrator sees account management without implicit catalogue authority   |
| TC-SYS-04 | `foundation.spec.ts`        | server form failure preserves entered data and editable specifications                 |
| TC-SYS-05 | `foundation.spec.ts`        | mobile catalogue has no horizontal overflow                                            |
| TC-SYS-06 | `workflows.spec.ts`         | request draft survives navigation, clears on submit and never crosses logout           |
| TC-SYS-07 | `workflows.spec.ts`         | request through separate approval/release, assigned dispatch and accepted receipt      |
| TC-SYS-08 | `foundation.spec.ts`        | the owning department is not offered its own resource to request                       |
| TC-SYS-09 | `foundation.spec.ts`        | asset history shows plain-language events and actor names, never codes or user IDs     |
| TC-SYS-10 | `workflows.spec.ts`         | C9 activity report lists permitted requests/transfers and exports CSV                  |
| TC-SYS-11 | `workflows.spec.ts`         | AI matching outage leaves manual interest selection usable and does not allocate stock |
| TC-SYS-12 | `workflows.spec.ts`         | calculated report survives an AI outage and requires human editing and publication     |
| TC-SYS-13 | `audit-regressions.spec.ts` | a failed assistant answer can be retried in place with Try again                       |

If a title is not found in the file named, `grep -rn "<title>" tests/browser` to
locate it. Fill each row with `As expected` / `Pass`, or the actual failure
message and `Fail`. Also record the total (for example `30 / 30`) for the
summary table.

## Task B: acceptance tests (hosted, manual)

Run on the live system <https://ai-campus-exchange-g6.pages.dev> with the
synthetic accounts below. A human must sign in; the assistant can guide and
record. Use a fresh browser profile or sign out between roles. Label any record
you create with the prefix `PHASE7-2026-11-<day>-01` so it is clearly test data.
Follow [the Phase 6 demonstration guide](../../phase-6/demonstration-guide.md)
for the detailed workflow steps.

| Report ID | Account(s)                                 | Steps                                                                                  | Expected result                                                                               |
| --------- | ------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| TC-ACC-01 | `fin@demo.test`                            | Open an asset record                                                                   | Unit value and costs are visible                                                              |
| TC-ACC-02 | `proc@demo.test`                           | Browse the catalogue and open an asset                                                 | Read-only: no edit, publish or request-approval controls                                      |
| TC-ACC-03 | `inactive@demo.test`                       | Try to sign in                                                                         | Access denied; no workspace data shown                                                        |
| TC-ACC-04 | `req-sci@demo.test`                        | Submit a labelled request, click Get recommendations, accept one with a note           | Up to five matches with scores and reasons; Interest created; no stock allocated yet          |
| TC-ACC-05 | `rep-eng@`, `fac@`, `rep-sci@demo.test`    | Reserve and release, schedule and dispatch, then accept receipt (demo guide section 3) | Separate approvals; custody changes only on accepted receipt; history shows actor and time    |
| TC-ACC-06 | `biz-eng@demo.test`, then `sust@demo.test` | Capture report facts, generate narrative, edit, mark Ready; view as Sustainability     | Numbers match facts; human edit needed before publish; Sustainability sees Published, no edit |
| TC-ACC-07 | `maint@demo.test`                          | Ask the assistant to approve a transfer                                                | Assistant refuses to perform the action                                                       |
| TC-ACC-08 | `admin@demo.test`                          | Open system administration                                                             | Account management visible; no catalogue editing authority                                    |

For each case, record the actual result in one line and take a screenshot
without the password visible. Save screenshots as
`docs/phase-7/evidence/TC-ACC-0N.png`.

## Task C: update the report to v1.1

Edit `COSC336_Group6_Phase7_Testing_Report_v1.0.docx` and save it as
`COSC336_Group6_Phase7_Testing_Report_v1.1.docx` (keep v1.0 unchanged). Either
edit it in Word, or unpack the DOCX, edit `word/document.xml` and re-zip (each
row's first cell holds its ID; replace that row's two `Pending` cells). Then:

1. Fill the Actual and Result cells in Tables 6 and 7. Change the cell shading
   from yellow (`FFF2CC`) to green (`E2EFDA`) for Pass, or red (`F4CCCC`) for Fail.
2. Update Table 2 (summary): fill the System and Acceptance rows and set Status.
3. Remove "(pending)" from the headings of sections 3.5 and 3.6, and reword
   their intro paragraphs in the past tense.
4. Update section 4 (Conclusion): add the system and acceptance totals, list any
   failures, and delete the "Remaining work" paragraph if nothing remains.
5. Cover page: change the version line to `Version: 1.1, <date>`.
6. Export a PDF next to it, and update `docs/phase-7/README.md` (results table
   and Outstanding section).

## Done when

- `docs/phase-7/results/04-browser-playwright.txt` exists and its totals match Table 6.
- No `Pending` remains in the v1.1 report.
- Acceptance screenshots are in `docs/phase-7/evidence/`.
- The changes are pushed to `docs/phase-7-testing`, and a PR #28 comment says
  who ran what and on which date.
