# Phase 7 system and hosted acceptance follow-up

Updated 27 November 2026. **Executed with findings; this is not an all-pass sign-off.**

- **[Testing report v1.1 Word](COSC336_Group6_Phase7_Testing_Report_v1.1.docx)**. Word only, as requested; PDF conversion was stopped. The final shortened conclusion was not re-rendered after export stalled.
- [Raw Chrome output](results/04-browser-playwright.txt): **29 / 30 journeys passed**. The report's 13 representative cases are **12 Pass / 1 Fail**; see the [exact case mapping](results/system-case-map.json).
- [Hosted acceptance observations](results/05-hosted-acceptance.json): **7 / 8 passed**, operated by the assistant with Abdulrahman's authorization. This is not human/student acceptance sign-off.
- [Findings and team follow-up](results/06-findings.md), with current screenshots in [evidence](evidence/).

PR #28 and its test branch were already merged. This follow-up uses
`codex/phase7-system-acceptance` from current main `fb0352c`, including PR #29.
It does not modify the application or tests, reset data, migrate the hosted project
or change permissions. Unit/integration counts below are historical v1.0 results;
they were not rerun or silently attributed to the newer baseline.

## Remaining work

- Ahmed: review the stale numeric-error wording assertion in TC-SYS-12, then rerun the full journey through publication after a separate reviewed correction. The app rejected the bad number; the old assertion stopped the local journey.
- Abi: inspect why hosted matching returned no results for the labelled request despite a suitable manual candidate. Eligibility/index/provider cause is unconfirmed. Repeat recommendation acceptance with controlled eligible data.
- Team: review the evidence and provide human acceptance sign-off. All eight browser-operated scenarios were attempted; seven passed.

The `PHASE7-2026-11-27-01` request and completed two-unit transfer remain as
synthetic evidence. The in-app Published report is titled **Phase seven synthetic
acceptance report** (numbers are constrained by the snapshot, so its label is
spelled out). It explicitly identifies assistant-operated synthetic coursework.
No coursework submission was performed. All sessions were signed out at the end.

## Historical v1.0 evidence

# Phase 7 testing evidence

Report: [COSC336_Group6_Phase7_Testing_Report_v1.0.docx](COSC336_Group6_Phase7_Testing_Report_v1.0.docx)
([PDF](COSC336_Group6_Phase7_Testing_Report_v1.0.pdf)). System and acceptance
results are pending and go in v1.1.

Evidence base for the Phase 7 testing report (objective, strategy, test case
tables, conclusion). Branch `docs/phase-7-testing`, run on 26 November 2026
against commit `7a3e5ed` (main `444c1cb` plus the Phase 7 test additions).

## Results summary

| Level (lab slides)      | Suite and command                                      | Environment                   | Result                              | Raw output                                                        |
| ----------------------- | ------------------------------------------------------ | ----------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| Unit (black/white box)  | Vitest, `npm run test:coverage`                        | Local, Node                   | **328 / 328 passed**, 24 files      | [01-unit-coverage.txt](results/01-unit-coverage.txt)              |
| Integration             | PGlite database checks, `npm run test:db`              | Local, in-memory PostgreSQL   | **59 / 59 passed**, 6 scripts       | [02-database-pglite.txt](results/02-database-pglite.txt)          |
| Integration (native DB) | `npm run test:db:native` (workflows, concurrency, AI2) | GitHub Actions, PostgreSQL 17 | **61 / 61 passed** (30 + 4 + 27)    | [03-native-postgres-ci.txt](results/03-native-postgres-ci.txt)    |
| System                  | Playwright, `npm run test:browser`                     | Needs Chrome locally          | **Not rerun** (last recorded 30/30) | see [Outstanding](#outstanding)                                   |
| Acceptance              | Manual role walkthrough on the hosted app              | Hosted Supabase               | **Not rerun** (20 Nov evidence)     | [hosted evidence](../phase-6/reviews/2026-11-20/hosted-evidence/) |

The native results come from CI run `45125373861` on main `444c1cb` (23 Nov).
The Phase 7 commits add only Vitest files and coverage config, so no database
code differs from that run.

## White-box coverage (unit level)

V8 coverage of `src/**/*.ts` from the unit suite
([coverage-summary.json](results/coverage-summary.json)):

| Metric     | Covered   | %     |
| ---------- | --------- | ----- |
| Statements | 441 / 594 | 74.24 |
| Branches   | 407 / 530 | 76.79 |
| Functions  | 138 / 180 | 76.66 |
| Lines      | 389 / 522 | 74.52 |

Adding the black-box suite raised branch coverage from 71.50% to 76.79%
(`domain.ts` branches 62.6% → 90.1%). The lowest file is `api.ts`
(~16%): it is the Supabase RPC gateway and is exercised by the database and
browser suites instead of unit tests. React views (`*.tsx`) are covered by
Playwright, not by this metric.

## Black-box test cases (equivalence partitioning / boundary values)

[tests/phase7-blackbox.test.ts](../../tests/phase7-blackbox.test.ts) holds 58
cases, TC-BB-01 to TC-BB-58. Each test name starts with its ID so the report's
test case table rows map one-to-one to an assertion.

| IDs   | Function          | Input partitioned                                           | Requirement |
| ----- | ----------------- | ----------------------------------------------------------- | ----------- |
| 01–10 | `validateAsset`   | Quantity (batch vs individual tracking), 0/1/negative/NaN   | C2          |
| 11–16 | `validateAsset`   | Required name, location, owner, custodian                   | C2          |
| 17–24 | `validateAsset`   | Optional unit value (≥ 0) and mass (> 0)                    | C2          |
| 25–29 | `validateAsset`   | Purchase date: leap day, invalid day/month, format          | C2          |
| 30–41 | `validateRequest` | Quantity, purpose, category, destination, required date     | C4          |
| 42–58 | `matchesFilters`  | Keyword, location, department, min qty, value and age range | C3          |

## Requirement traceability

C1–C6 and AI #2/#5 are the Phase 6 minimum; C9 and AI #4 are merged extras.
C7 (sustainability dashboard) and C8 (notifications) were deferred and are not
implemented, so they have no tests.

| Req.  | Description                                              | Unit (Vitest)                                                                | Integration (DB)                                                                            | System (Playwright)                                        |
| ----- | -------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| C1    | Login, ≥ 3 roles, server-side permission checks          | `gateway`, `demo-accounts`, `supabase-client`                                | `test-database` (anonymous/inactive denied, nine role classes, deactivation)                | `foundation.spec` (sign-in, role menus, admin scope)       |
| C2    | Departments and asset registration                       | `domain`, `phase7-blackbox` 01–29, `specification-editor`                    | `test-database` (atomic save, invalid quantities roll back, stock conservation)             | `audit-regressions.spec` (form failure keeps data)         |
| C3    | Publish surplus; search and filters                      | `phase7-blackbox` 42–58, `domain`, `testData`                                | `test-database` (combined filters, publication idempotent)                                  | `foundation.spec` (publish/withdraw, mobile catalogue)     |
| C4    | Request submission and tracking own requests             | `phase7-blackbox` 30–41, `requestRequirements`, `workflows`                  | `test-workflows` (validation, role boundaries, forged department ignored)                   | `workflows.spec` (draft survives navigation, own requests) |
| C5    | Approval, no self-approval, receiver confirmation        | `resourceHandoff`, `interestPicker`, `workflowPresentation`                  | `test-workflows` (self-approval rejected, separate release, disputed receipt)               | `workflows.spec` (approval → dispatch → accepted receipt)  |
| C6    | Guarded state transitions; asset history (who/what/when) | `asset-history`, `workflows`                                                 | `test-workflows` (stale versions, audit commits with mutation), `test-workflow-concurrency` | `asset-history.spec`                                       |
| C7    | Sustainability dashboard                                 | Deferred, not implemented                                                    | —                                                                                           | —                                                          |
| C8    | In-app notifications                                     | Deferred, not implemented                                                    | —                                                                                           | —                                                          |
| C9    | Activity tables and CSV export                           | `c9Report`                                                                   | `test-c9-report`                                                                            | `workflows.spec` (C9 report CSV)                           |
| AI #2 | Semantic resource matching                               | `ai2-match`, `ai2-embeddings`, `ai2-presentation`, `backfill-ai2-embeddings` | `test-ai2-schema`, `test-ai2-native` (27 checks)                                            | `workflows.spec` (match strength, AI outage fallback)      |
| AI #4 | Campus assistant                                         | `ai4-assistant`                                                              | —                                                                                           | `audit-regressions.spec` (retry, account-switch discard)   |
| AI #5 | Generated report with human review                       | `ai5-generate`, `ai5-narrative`, `ai5-dates`, `ai5-number-words`             | `test-ai5-reports`, `test-ai5-outcomes`                                                     | `workflows.spec` (report survives AI outage)               |

Every implemented requirement has at least one test at two or more levels.

## Outstanding as recorded in v1.0

- **System tests (Playwright).** Not rerun: the config uses the Google Chrome
  channel, which is not installed on this machine, and CI does not run this
  suite. Install Chrome (or Playwright's Chromium) and run
  `npm run test:browser`, then save the output as
  `results/04-browser-playwright.txt`.
- **Acceptance tests.** Repeat the hosted role walkthrough from the
  [demonstration guide](../phase-6/demonstration-guide.md) and record actual
  results per step; the 20 November screenshots are the previous run.

## Rerunning

```bash
npm run test:coverage   # unit + coverage (writes coverage/)
npm run test:db         # PGlite integration
npm run test:browser    # Playwright system tests (needs Chrome)
```

`npm run test:db:native` and `npm run test:concurrency` need a disposable native
PostgreSQL (`POSTGRES_TEST_ADMIN_URL` / `WORKFLOW_TEST_DATABASE_URL`); CI
provides one on every push.
