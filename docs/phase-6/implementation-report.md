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

Local verification after the PR #13 privacy correction: **31 unit tests, 16 inherited plus 28 workflow PGlite checks,
the same 28 workflow checks on native PostgreSQL, four genuinely overlapping native
transaction races, eleven Chrome flows, production build, fixture integrity and formatting passed**.
Browser evidence comprises five inherited HTTP-mocked foundation flows, a read-only
preview, and five workflow/integration flows running actual SQL with synthetic Auth/HTTP
adapters. These are local checks, not hosted Supabase acceptance. The initial run used
Node 24.15.0. A follow-up review reran all suites, native concurrency and the build
on the documented Node 22 runtime (22.23.4), including the split/mixed-owner catalogue
action regression. The inherited foundation checks pass with all three migrations installed.

PR review reproduced a financial privacy defect: Requesters and assigned Facilities
could read handling/transport costs directly and inside raw audit snapshots. An
additive migration now enforces design Section 6.1 on every read, using current
explicit financial roles and immutable transfer departments. Workspace, asset audit
and both detail paths omit restricted costs while retaining operational history.
The UI distinguishes omitted fields from authorized null/zero values. Five database
regression groups and a browser flow cover this correction. A populated-schema
upgrade check preserved existing costs/audits while immediately redacting restricted
reads. Sign-in and backend configuration behavior are unchanged.

A read-only independent reviewer examined requirements, implementation and checks,
independently reproduced defects, and verified fixes for unsafe cancellation,
observer/holder separation, terminal tracking privacy and immutable Interest supplier
authority. Regression checks cover those findings. Seven synthetic workflow recipes
provide ordinary inputs for the later matching/report owners; no AI or report module
was added. See [Part 2 handoff](handoffs/02-ahmed.md) for tested revision, commands,
contracts, demonstration and resolved failures.

Part 2 was merged in PR #13. The paragraphs above record checks performed for that
implementation; they are not a claim that the current hosted deployment has been
independently rechecked. See the integration handoff for the newer browser results
and the team's outstanding hosted walkthrough.

## 3 Matching and ranking — Abi Ali

Merged into main in PR #17. For a request, the `ai2-match` Edge Function returns up
to five eligible surplus items, each with a score and a one-line reason, ranked from
pgvector embeddings. Embeddings use the local `gte-small` model in the Supabase
Edge Runtime (384 dimensions); Gemini is used for generated prose elsewhere. The
requester accepts or rejects each suggestion, and accepting
one still goes through the normal supplier approval. Abi Ali's write-up of checks,
human selection and fallback evidence is still to come.

## 4 Generated report and integration — Muhammad Awais

Merged into main in PR #18. The database captures a frozen snapshot of calculated
facts. The `ai5-generate` Edge Function asks Gemini for a short narrative, and the
database rejects any text that adds numbers of its own. A business administrator
edits the draft, marks it ready and publishes it.

PR #19 added a period and department outcome breakdown calculated by the database,
audit rows for each report step, and a 20-second timeout on the Gemini request. Its
migration was applied to the shared hosted project on 17 November 2026. The
`ai5-generate` function still has to be redeployed for the timeout to take effect.
Muhammad Awais's write-up of checks and the integrated demonstration is still to come.

## 5 Basic report (C9) — Ahmed

Added after the lab minimum. The **Activity report** screen shows a table of requests
and a table of their linked transfers for a chosen period and department, and each
table exports to CSV. One read-only database function, `c9_activity_report`, returns
the rows. It reuses the Part 2 visibility rules, so a user only sees records they can
already open in Requests and transfers. Business administrators see every department.
Handling and transport costs are left out entirely. The CSV is built in the browser and
guards against spreadsheet formula injection.

Checks run locally on 17 November 2026: 179 unit tests (6 new for CSV), all PGlite
database suites including 4 new C9 checks (fields, per-role visibility, filters,
validation and anonymous denial), type check, build and format. A Playwright flow for
the screen and CSV download was added but not run, because no Chrome is installed on
the machine used.

Merged into main in PR #20. On 17 November 2026 the migration was applied to the shared
hosted project and recorded as `202611170002`. Signed-in users can call the function
and anonymous users cannot. A read-only call as a hosted business administrator over
the past year returned 18 requests and 7 transfers, with no cost fields. The screen has
not independently rechecked against the hosted project in a browser by this integration review.

## 6 Campus assistant (AI #4) — Ahmed

Added after the lab minimum, on branch `feat/ai4-assistant`. A **Campus assistant**
screen answers plain-language questions through a new `ai4-assistant` Edge Function
that calls Gemini. It handles three kinds of question: finding catalogue items,
checking your own requests, and drafting a new request. Reads run with the
caller's own session, so the assistant only sees what the user can already open,
and costs and values are never sent to Gemini. The function checks every answer:
records it mentions must be ones it was given, and numbers must come from those
records or the question. Anything else becomes "I don't know". Commands such as
"approve" or "transfer" are refused without calling Gemini. A draft only pre-fills
the normal request form, and the user submits it.

Checks run locally on 19 November 2026: 193 unit tests (14 new for AI #4, using
mocked Gemini responses), type check, build and format. The function was deployed
to the shared hosted project the same day. Hosted calls without a signed-in user are
refused with 401, and the browser preflight from the local frontend is allowed. On
19 November 2026 five signed-in questions were tried against the hosted function
with live Gemini (about 1.5–2.5 s each): an item search returned real listings, a
request-status question matched the Requests page, "I need 4 chairs for a lab"
produced an unsubmitted draft, "Approve my reservation" was refused without calling
Gemini, and "Who is the dean?" got "I don't know". Earlier the same day Gemini
calls from the project failed for both AI #4 and AI #5 for a while and then
recovered on their own; the function now logs Google's error code (never the key,
prompt or answer) so a repeat can be diagnosed.
PR #22 was merged on 20 November after regression tests confirmed and corrected
unchecked status prose and failed request lookups being presented as empty lists.
The corrected function still needs redeployment and hosted verification. See
[the function README](../../supabase/functions/ai4-assistant/README.md).

## Status

| Required feature                                       | Owner          | Status                                                                              |
| ------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------- |
| C1 accounts/roles/departments                          | Abdulrahman    | Implemented; latest hosted acceptance/human review pending                          |
| C2 assets/status; C3 publication/search                | Abdulrahman    | Implemented; latest hosted acceptance/human review pending                          |
| C4 requests; C5 approval/transfer; C6 workflow/history | Ahmed          | Implemented; latest hosted acceptance/human review pending                          |
| AI #2 matching/ranking                                 | Abi Ali        | Merged (PR #17); owner write-up and live relevance evidence pending                 |
| AI #5 generated report                                 | Muhammad Awais | Merged (PR #18, #19); hosted migration applied; function redeploy pending           |
| C9 requests/transfers table with CSV export            | Ahmed          | Merged (PR #20); local SQL/browser CSV check passed; hosted browser check pending   |
| AI #4 campus assistant                                 | Ahmed          | Merged (PR #22); earlier hosted trial recorded; corrected function redeploy pending |

Deferred now: C7 and C8, AI #1/#3, maintenance and end-of-life.
No synthetic data establishes actual campus savings/adoption or general AI accuracy.
Each member records their actual AI assistance, human review and executed checks.

## 7 Integration and UI review — 20 November 2026

The integration branch adds representative vector illustrations for common campus
items and a neutral resource-box fallback. It reuses the same illustration in cards
and records. A compact desktop asset record shows artwork, key details and technical
specifications together; history is expandable, and small screens/long records
retain scrolling. The sidebar keeps account controls reachable on short screens,
and avatar dimensions stay equal beside long names.

The workflow browser tests now follow the current section navigation and editable
requirement rows. Further browser checks exercise AI matching outage/manual
selection and the report capture/generation/edit/review/publication path. The report
check uses the real function handler and SQL with synthetic Auth and Gemini; it is
not a trial of hosted Gemini. The screenshot catalogue contains synthetic test
examples, not newly provisioned campus inventory.

The final local checks passed: **224 unit tests, 56 PGlite integration checks,
AI #2 SQL text-contract assertions, 18 Chrome browser journeys, typecheck and
production build**. Inherited browser failures were reproduced and corrected by
updating obsolete navigation/form selectors and repairing sidebar account-control
reachability. Native pgvector inference and hosted Gemini were not exercised by
these local checks.

See [the integration handoff](handoffs/05-integration-and-ui.md) for exact results,
reproduction commands and the owner checklist. Hosted verification was explicitly
left to the team. These changes do not establish full semester completion, model
accuracy, live performance or actual sustainability benefits.
