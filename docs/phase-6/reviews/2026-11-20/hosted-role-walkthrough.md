# Hosted walkthrough of all nine roles — 20 November 2026

## Result and authorization

All nine role classes were signed into and exercised on the real hosted application at <https://ai-campus-exchange-g6.pages.dev/>. Both Engineering and Science requester/representative accounts were used where relevant. The inactive test account was also checked and rejected.

Abdulrahman explicitly replaced the earlier team-only hosted-verification restriction and authorized labelled synthetic asset/request and transfer tests. He separately authorized publishing the prepared synthetic report after its contents and visibility were explained. No database reset, account provisioning, role changes, credential changes, migrations, function deployment or application-source changes were performed.

This extends the [earlier local exploratory audit](exploratory-audit.md). It covers the current hosted prototype, not the full semester system. Specialist workflows that Phase 6 deliberately defers are identified below. Logging into those roles does not prove their deferred modules exist or work.

The hosted UI still has the old university logo layout, illustrative fallbacks and sidebar behavior. [PR #24](https://github.com/Abiali1210/ai-campus-resource-exchange-and-asset-management-Group-6/pull/24) was verified open, draft and unmerged during this walkthrough. Its newer UI must not be confused with the deployed screen. The exact deployed frontend commit/function versions were not independently established.

## Role-by-role results

| Role and account                               | Actions actually exercised                                                                                                                                              | Observed result and limits                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requester — `req-sci@demo.test`                | Submitted a new two-unit HDMI request; ran live AI matching; searched/opened the dedicated supplier asset; recorded Interest with quantity and reason                   | Created request successfully. Matching returned five ranked eligible resources with compatibility/ranking scores, reasons, uncertainty and accept/reject controls. Interest stayed Pending until supplier action. The accept/reject controls themselves were not submitted in this run; the transfer used manual selection of the dedicated asset |
| Requester — `req-eng@demo.test`                | Opened its loaded request tracking after the Science workflow                                                                                                           | Five Engineering requests were visible; the new Science request was absent. A stale selected-resource banner persisted across sessions, consistent with the earlier client-state finding                                                                                                                                                          |
| Representative/Custodian — `rep-eng@demo.test` | Registered a four-unit batch, published it, reviewed the new Interest, approved reservation and release, assigned Facilities                                            | New asset and publication saved. Two units allocated, two left available. Formal custody stayed with Engineering before receipt. Supplier could not see the requester's required selection reason: confirmed hosted defect A4                                                                                                                     |
| Representative/Custodian — `rep-sci@demo.test` | Recorded one-of-two short receipt, then explicitly accepted the reconciled full two-unit receipt                                                                        | Short receipt became Disputed and remained allocated; formal custody stayed with Engineering. Full acceptance completed the transfer, changed formal department/custodian/location to Science and fulfilled the request                                                                                                                           |
| Facilities — `fac@demo.test`                   | Opened its assigned transfer; scheduled pickup using native date/time controls; entered handling/transport arrangements and costs; dispatched both units                | Scheduled and In Transit states saved. Physical holder/location changed at dispatch while formal ownership stayed unchanged. Recorded costs were absent from the Facilities transfer read view; the receiving representative later saw AED 10 handling / AED 15 transport                                                                         |
| Business Administrator — `biz-eng@demo.test`   | Captured report facts, generated a real hosted AI summary, attempted unsupported-number edit, saved valid human edit, marked Ready and published with explicit approval | All stages completed. Invented 999999 total rejected. Supported edit saved. Published report is locked to read-only for ordinary users                                                                                                                                                                                                            |
| System Administrator — `admin@demo.test`       | Loaded Accounts & roles and Departments; opened Finance account editor; inspected existing role/department/active values; cancelled unchanged                           | Thirteen accounts and two departments loaded. Finance-only role and active status prefilled correctly. No business transfer/approval navigation. Account creation, role assignment and department activation were intentionally not executed because this audit preserves access settings                                                         |
| Finance — `fin@demo.test`                      | Searched for oscilloscope; opened its details; opened activity report; reopened dedicated test batch after transfer                                                     | Correct single search result; AED 400 unit value visible; no edit/approval controls. Activity report loaded zero permitted rows for this account and explicitly excluded costs. Remaining Engineering portion displayed 2 / 4 units at AED 125. No finance transaction, budgeting or finance-specific dashboard exists in this milestone          |
| Procurement — `proc@demo.test`                 | Searched/opened same oscilloscope and used live assistant catalogue search                                                                                              | Item details loaded without Finance's unit-value field. Assistant returned five real visible monitor cards with View actions and no Request action. No purchase/ordering workflow exists in this milestone                                                                                                                                        |
| Maintenance — `maint@demo.test`                | Signed in; inspected catalogue and available navigation; asked assistant to “Approve all transfers”                                                                     | No assigned visible assets in this account. Assistant explicitly refused approval/reservation/transfer/disposal. Repair jobs, assessment and maintenance tracking are deferred, so they could not be functionally verified                                                                                                                        |
| Sustainability — `sust@demo.test`              | Read existing published report; checked no draft/capture/publish controls; later read the newly published test report                                                   | Published-only reader view worked. The new summary and its exact facts were visible; draft-editor and Publish button counts were both zero. Sustainability dashboard/calculation workflows remain deferred                                                                                                                                        |
| Inactive account — `inactive@demo.test`        | Attempted sign-in                                                                                                                                                       | Rejected with “Unauthorized: active account required”; no workspace granted                                                                                                                                                                                                                                                                       |

The table has extra rows for departments and the inactive account; it covers all nine defined role classes. Credentials are deliberately excluded from these files and evidence.

## Completed hosted business scenario

Dedicated request: **QA-2026-11-20-roles — two HDMI displays for role walkthrough**.

Dedicated asset: **QA-2026-11-20-roles HDMI display batch**, quantity four, Good condition, connector HDMI, Engineering / QA test store, estimated unit value AED 125. Description explicitly identifies synthetic test data and no real equipment.

1. Science requester submitted quantity two, minimum Good, required 10 December, destination Science / QA test lab.
2. Live AI matching returned five results. Scores were ranking indicators, not probabilities. The test then used its dedicated new asset through ordinary search and Interest.
3. Engineering representative approved reservation of two and separately approved release to the assigned Facilities account.
4. Facilities scheduled pickup for 21 November at 10:30, recorded the synthetic trolley arrangements and AED 10 / AED 15 costs, then dispatched two. This is a simulation record, not a claim of physical campus movement.
5. Science representative recorded only one observed unit. Transfer became Disputed; formal department/custodian stayed Engineering. Physical tracking reflected the receiving observation, with an explicit missing-units warning.
6. Science representative reconciled and accepted both units. Transfer became Completed; formal owner/custodian/assigned location became Science / Science representative / Science QA test lab.
7. Linked request displayed **Fulfilled: requested 2, accepted 2, allocated 0, remaining 0**.
8. Finance in Engineering could still inspect the remaining Engineering portion: **2 / 4 units**, Available, unit value AED 125. Existing inventory was not used to fulfil the test.

The native date controls were successfully operated using their keyboard segments. This resolves the date-entry limitation recorded in the earlier local audit for the hosted new-request and scheduling steps.

Evidence: [request and live matching](hosted-evidence/08-request-and-ai-matching.jpg), [dedicated asset publication](hosted-evidence/09-test-asset-published.jpg), [disputed custody](hosted-evidence/11-disputed-custody.jpg), [accepted custody](hosted-evidence/12-completed-custody.jpg), [remaining Finance portion](hosted-evidence/18-finance-remaining-portion.jpg).

## Hosted report generation and reader verification

The new report appears inside the live site's **Deterministic reports** screen after sign-in:

- Period: **Report · Nov 10, 2026 – Nov 20, 2026**.
- Headline: **Role walkthrough summary from synthetic campus records.**
- Status: **Published**.
- Facts: **19 submitted requests, 17 open, 2 non-open, 3 completed transfers, 6 units transferred, 89% open request rate, 2 units per completed transfer**.
- Limitation: **“This is a coursework test report from synthetic records.”**

The figures are a campus-wide snapshot of the existing synthetic database plus this walkthrough, not counts of test steps performed in this audit. The previous snapshot showed 18 requests, two completed transfers and four transferred units; the new request and completed two-unit transfer explain the observed increase.

Live generation produced a structured narrative with supported numbers. A deliberately incorrect 999999 requests was rejected. A corrected human edit was saved and marked Ready. After Abdulrahman's explicit approval, the report was published. The Sustainability account read the resulting Published narrative with no draft textboxes and no Publish controls. This verifies the actual hosted reader path, not a local mock.

Publishing here creates a report record visible to signed-in users inside this application. It does not submit coursework, modify a Word document or publish a GitHub change.

Evidence: [live generated draft](hosted-evidence/13-live-report-draft.jpg), [reviewed Ready report](hosted-evidence/14-reviewed-report-ready.jpg), [ordinary user's Published reader view](hosted-evidence/19-published-reader-view.jpg).

## Additional isolated return check

Separately from hosted data, the disposable localhost simulation was used to complete the previously untested supplier-confirmed return branch:

- Receiver observed both fixture units in Poor condition; they stayed Disputed and were not accepted into formal custody.
- Engineering supplier selected Confirm physical return, recorded both units physically back in Engineering / Quarantine, and assessed Poor condition.
- Transfer became Returned. SQL inspection confirmed the active portion retained quantity two and became **Unfit / Poor**, with formal assigned location Engineering / Store and physical location Engineering / Quarantine.

This is **local SQL/browser evidence**, not a claim that a new hosted return was performed. [Local return screenshot](hosted-evidence/16-local-confirmed-return.jpg).

## Confirmed issues and practical priorities

The [five findings in the exploratory audit](exploratory-audit.md#priority-and-ownership-proposal) remain open; this walkthrough does not implement fixes.

1. **Fix the assistant's stale-session response acceptance first (A1).** Previously reproduced locally with two departments. This hosted run also confirmed stale selections/success notices survive account changes, but did not deliberately reproduce the delayed assistant disclosure again against the live provider.
2. **Preserve typed asset specifications (A2).** Previously reproduced locally and confirmed in stored SQL values. No shared hosted asset specifications were deliberately corrupted during this run.
3. **Fix supplier selection-note visibility (A4).** Reproduced on the hosted dedicated Interest: requester saw their reason; supplier saw “Not available in this view” before approving. Project only the permitted Interest reason; do not expose unrelated audit or financial data.
4. **Deploy/review the existing sidebar fix.** On the hosted representative screen, Sign out had a bounding rectangle starting at y=788 with a viewport roughly 712px tall. Pointer interaction failed because the fixed sidebar placed it offscreen. Keyboard activation allowed the audit to continue. The newer UI branch already addresses sidebar reachability; verify it after merge/deployment. [Hosted screenshot](hosted-evidence/10-hosted-signout-below-viewport.jpg).
5. **Improve failure/draft handling (A3/A5).** Distinct catalogue unavailable state and retry; retain or warn about unsaved requests. These were reproduced in the earlier isolated audit and not injected into the live service.

Small copy improvements observed on the hosted build: the assistant breadcrumb still says Resource catalogue; report introduction says “Four snapshot facts” while seven metrics are displayed; Maintenance's empty catalogue says to broaden filters rather than explaining assigned-asset scope; history identifies actors by UUID; old success notices persist after logout. Matching's “Weak match” label beside strong semantic compatibility could more clearly explain how missing cost/timing/emissions evidence lowers the final score.

## Deferred functionality and verification boundaries

The current Phase 6 plan deliberately defers maintenance/repair, end-of-life, procurement transactions, specialist finance workflows, sustainability dashboard, notifications, classification and action-advice. This run did not implement those modules. If the team now expects fully functioning specialist workflows for these roles, that expectation exceeds the current selected milestone and requires a separate scope decision.

This is a completed walkthrough across the existing nine role surfaces and the end-to-end paths above, not an exhaustive certification of every possible branch. In particular:

- Account/password/role changes were not executed; existing assignments were inspected and the editor cancelled unchanged.
- CSV file contents remain unverified because download permission was declined in the earlier run. This audit did not retry or circumvent that decision.
- Simultaneous last-unit transactions, exhaustive cross-department API attacks, provider outages/malformed outputs on the live service and broad AI relevance/performance evaluation were not performed on the shared project. Earlier local tests cover some of these separately. No green local result is presented as a hosted concurrency result.
- AI recommendation results and their explanations were observed live; their accept/reject controls were not submitted here. Manual Interest and the supplier approval path were exercised completely.
- The hosted unsafe-return branch was not modified; the new supplier-confirmed return check was isolated locally.
- No claim is made about backups, restore, production readiness or future deferred modules.

## Persistent test records and handoff

The labelled hosted asset, fulfilled request, related audited Interest/reservation/transfer/receipt records and published synthetic report remain as reviewable test evidence. Two units remain Available in Engineering and two accepted units belong to Science. No records were reset or deleted. They will affect later snapshot totals; teammates should recognize the `QA-2026-11-20-roles` prefix.

The published summary is explicitly labelled as synthetic coursework data. Existing unrelated draft/Ready reports were left untouched. Existing accounts and permissions were preserved. The disposable local database can be discarded by stopping the local audit server; it is separate from hosted records.

No application source changes, merge or deployment were made by the testing task itself. New deliverables are this walkthrough, its role-result notes/screenshots, and the earlier exploratory audit. See PR #24 and issue #23 for subsequent publication, merge and deployment status.

Selected evidence: [Finance](hosted-evidence/01-finance-value.jpg), [Procurement](hosted-evidence/02-procurement-read-only.jpg), [real Procurement assistant result](hosted-evidence/03-procurement-assistant.jpg), [Maintenance](hosted-evidence/04-maintenance-workspace.jpg), [Maintenance refusal](hosted-evidence/05-maintenance-assistant-refusal.jpg), [System Administrator](hosted-evidence/06-system-administration.jpg), [inactive rejection](hosted-evidence/07-inactive-denied.jpg), [Sustainability published-only](hosted-evidence/15-sustainability-published-only.jpg), [Engineering requester isolation](hosted-evidence/17-engineering-request-isolation.jpg). The compact [role-result notes](hosted-evidence/role-results.json) supplement the full table above; they are not a list of automated assertions.
