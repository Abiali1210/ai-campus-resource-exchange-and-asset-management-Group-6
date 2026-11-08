# Part 2 requests and transfers handoff

Owner: Ahmed / Muhammad Awais. Implementation assistance: Codex. Date: 9 November
2026 (Asia/Dubai). Branch: `codex/phase6-02-workflows`. Starting revision:
`00cec3d819e4be272cebc1414907745f031e34e7`; the working tree was clean. Main was
kept unchanged. Tested implementation revision:
`a4eb8af10ad2f9767eb95ca0c4906c96ddfd48b8` (`feat: implement phase 6 request and transfer workflows`).
Independent reviewer: `/root/reviewer`, read-only review of design, source, diff and
tests, including independent database reproductions. Human owner review/demo pending.

## Delivered and design alignment

Implemented only C4–C6: requests and own/department-authorized tracking, linked
Interest without allocation, distinct reservation/release decisions, partial stock
allocation, Facilities scheduling/dispatch, receiver acceptance, cancellation,
dispute/reconciliation/return and transactional history. The screens explain the
next action and responsible role. Minimum-condition/specification gates protect
ordinary manual workflows without adding AI.

This follows SRS UC-04/07/08, relevant portions of FR-REQUEST-001–008 and
FR-TRANSFER-001–008, and design
v1.4 Sections 5, 9–11, especially the class, sequence, activity and transfer-state
diagrams. The React/TypeScript/Vite + Supabase/PostgreSQL architecture and nine
role keys are preserved. `WorkflowService` extends the existing service class;
authoritative permission, stock and audit changes run inside PostgreSQL transactions.
The workflow screen loads as a separate frontend chunk.

The new additive migration is `202611090001_workflows.sql`. No applied Part 1
migration, shared data, credentials or deferred module was rewritten. See
[contracts](../contracts/part-2-workflows.md) for every command/input, status and
quantity rule, including downstream matching/report integration.

The reviewer identified and verified fixes for cancellation clearing an unsafe
state, the need to separate observer from physical holder, terminal tracking
exposing later movements, and Interest permissions following a new stock owner.
All have regression checks. Related foundation integration fixes ensure selected
leaf details remain correct after splitting and revoked requester roles lose access.

## Setup and migrations

Use the existing [setup](../setup.md). Intended project runtime remains Node 22;
this Windows environment supplied Node **24.15.0**, npm **11.12.1** and Python
**3.14.3**. No hosted Supabase connection or `.env.local` was present.

```powershell
npm.cmd ci
# Select/check the intended authorized Supabase project first.
npx.cmd supabase db push
# In untracked .env.local configure public URL/key and provisioning settings.
# CONFIRM_SYNTHETIC_SEED=yes; strong local-only DEMO_ACCOUNT_PASSWORD.
npm.cmd run seed:accounts
npm.cmd run seed:workflows
npm.cmd run dev
```

`supabase db push` applies pending additive migrations; never reset a shared
project. A local Supabase stack needs Docker Desktop/WSL. The existing foundation
Edge function still serves account administration only; workflow RPCs need no new
Edge deployment, provider key or external service. Keep service secrets out of Vite.

`seed:workflows` signs into the existing synthetic Requester, supplier/receiving
Representatives and Facilities accounts through the public Supabase client. It
creates dedicated `[Part 2 fixture v1 ...]` records with seven reproducible recipes;
all business state changes use normal authorized RPCs. Existing requests are
preserved, not duplicated or reset. An interrupted recipe with an existing request
is reported/preserved for manual reconciliation; the seed does not silently repair
it. Its hosted Auth/provisioning execution remains unrun. Recipe quantities were
independently executed and checked with both local database engines.

## Verification commands and actual results

```powershell
npm.cmd test
npm.cmd run test:db
npm.cmd run test:browser
npm.cmd run build
python scripts/validate-foundation-fixture.py
```

| Check                               | Actual result / evidence boundary                                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inherited baseline before extending | 20 unit tests, 16 PGlite database checks, six Chrome flows, build and fixture integrity passed                                                                          |
| Unit suite after implementation     | 25 passed: 20 inherited and five workflow client-contract tests                                                                                                         |
| `test:db`                           | 16 inherited foundation + 23 workflow checks passed in PGlite with a synthetic Auth schema                                                                              |
| Native PostgreSQL workflow suite    | Same 23 workflow checks passed on isolated PostgreSQL 18.6 binaries, synthetic Auth adapter                                                                             |
| Native overlapping-session checks   | Four passed: last unit, remaining demand across different assets, simultaneous identical retry, competing partial batches                                               |
| Chrome browser suite                | Nine passed: five inherited HTTP-mocked foundation flows, one credential-free preview, three workflow flows using actual SQL/PGlite behind synthetic Auth/HTTP adapters |
| Production build                    | Passed TypeScript and Vite; workflow code split, no oversized-chunk warning                                                                                             |
| Foundation fixture integrity        | Passed: two departments, 12 profiles, six assets, nine roles and conserved stock                                                                                        |
| Hosted Supabase                     | Not run: Auth/JWT/PostgREST/RLS integration, account provisioning, hosted migrations/seed, Edge and real browser-to-hosted service acceptance remain pending            |

The database checks include the complete journey, direct table/helper denials,
wrong role/department, requester and Interest-creator self-approval with multiple
roles, stock/specification/condition gates, partial quantities, rejection,
pre-dispatch cancellation, unsafe-state preservation, short/damaged/unknown receipt,
full reconciliation/return, physical versus formal custody, stale versions, changed
operation-key payloads, one-outcome retries and forced-audit-failure rollback.
Terminal privacy, original Interest supplier authority, correct selected leaves and
current-role revocation also have regressions. The seven recipe totals are checked.

The browser walkthrough uses actual SQL rather than mocked successful workflow
responses. One test commits a request then drops its HTTP response, retries the
retained key and verifies one request. Another changes the request version in a
second session and verifies that the form keeps its selection note. Desktop/mobile
screenshots were inspected; mobile has no horizontal overflow.

For genuine concurrency on a **disposable** PostgreSQL cluster:

```powershell
$env:POSTGRES_TEST_ADMIN_URL='postgresql://TEST_USER:TEST_PASSWORD@127.0.0.1:5432/postgres'
npm.cmd run test:db:native
```

This creates two uniquely named empty databases and preserves them for inspection;
never point it at a shared cluster. It runs the 23-check workflow suite and the
four-check race suite. The latter holds a blocking row lock, starts two independent
connections, verifies both are waiting in `pg_stat_activity`, then releases the lock.
This establishes actual transaction overlap. The low-level runners accept
`WORKFLOW_TEST_DATABASE_URL` only for a fresh empty database and refuse nonempty
public/Auth schemas. A missing URL fails explicitly instead of pretending a race
passed. CI has a PostgreSQL 18 service job for the same native command; remote CI
has not been run from this local branch.

Local native verification used the exact temporary npm binary package
`@embedded-postgres/windows-x64@18.6.0-beta.19`, initialized a dedicated cluster under
ignored `.workflow-validation/`, and listened on localhost port 55439. That tool is
not a production/project dependency. Browser outputs use `test-results/browser`
to avoid deleting other verification tools. The temporary PostgreSQL server is
stopped after final verification; data files are retained for inspection.

Failures found and resolved: initial sandbox npm install/registry calls failed on
cache/network permissions; approved dependency installation succeeded. The first native cluster startup was sandbox-blocked;
approved execution succeeded. Initial test helpers had an SQL alias/unauthorized
lookup defect and one browser locator matched both summary and button; corrected
and rerun. Browser cleanup initially removed temporary database support files;
separate validation/output directories resolved the collision. The initial combined
frontend chunk warning was removed by loading the workflow screen separately. No
unresolved test failure is being treated as a pass.

## Practical demonstration

1. Apply migrations, provision synthetic accounts and run both seeds. Sign in as
   `requester-science@demo.example.test` using the locally configured password.
   Open **Requests and transfers**. Show the partial fixture: 10 requested,
   three accepted, two allocated, five remaining. Open Interest-only stock to show
   that selection has not allocated anything.
2. Submit a request for three Good HDMI monitors: category Monitors, specifications
   `{"connector":"HDMI"}`, future required date and a Science destination. Select
   an Engineering listing and record Interest. Explain why stock remains available.
3. Sign in as `representative-engineering@demo.example.test`. Approve a positive
   quantity no greater than selected stock and remaining demand, with a reason.
   Show the separate reservation decision and Pending Approval transfer. Approve
   release and select `Synthetic facilities-Engineering`.
4. Sign in as `facilities-engineering@demo.example.test`. Schedule pickup before
   the required date, enter arrangements/optional costs, then dispatch the full
   approved quantity and record physical location. Show Engineering still owns and
   formally holds custody while Facilities physically holds the stock.
5. Sign in as `representative-science@demo.example.test`. Record full suitable
   accepted receipt, actual holder and location. Show Completed, formal receiving
   department/custodian, increased accepted quantity and actor/time/reason history.
6. Use the disputed fixture to demonstrate full reconciled acceptance or supplier
   full-return confirmation. A short return cannot release demand; unsafe/unknown
   returned stock stays unavailable. Use a pending transfer for pre-dispatch cancel.
   Demonstrate no self-approval with the direct database test output.

For an automated local demonstration without any Supabase credentials:
`npm.cmd run test:browser -- tests/browser/workflows.spec.ts --headed` runs the
actual-SQL browser walkthrough with explicitly synthetic Auth/HTTP adapters.

## Remaining limits and next owner

No hosted credentials were available, so hosted acceptance is the outstanding
environmental blocker. No deployment, push, merge, AI feature, notification,
dashboard, general report, maintenance or end-of-life workflow was performed.
Human owner review, institutional delegation and real physical reconciliation
remain external to the prototype.

The UI currently uses the catalogue's first page of available listings (100 rows);
the existing search RPC supports filters/paging for larger datasets. Mandatory
specifications are exact JSON evidence, not unit conversion or a compatibility
ontology. Operation keys survive retries within a mounted form, not browser refresh.
Optional SRS purchase-basis indication, combined approval UI and the Business
Administrator escalation screen remain deferred; unresolved stock remains allocated.
Unknown returned stock has no reassessment endpoint in this scoped implementation.
These limits are explicit rather than claimed complete as broader project features.

Abi Ali should read the [contracts](../contracts/part-2-workflows.md), retain the
ordinary Interest/approval path and use authoritative remaining demand. Awais can
later calculate accepted units from completed/Accepted records without counting
Disputed/Canceled/Returned stock as accepted outcomes. Both should rerun inherited
checks and record actual provider/hosted results separately.
