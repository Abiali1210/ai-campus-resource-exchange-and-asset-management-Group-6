# Phase 7 Hosted Acceptance Results

**Run label:** `PHASE7-2026-11-26-01`  
**Target:** `https://ai-campus-exchange-g6.pages.dev/`  
**Test window:** Nov 26–27, 2026, local time (UTC+04). The exact overall start time was not separately recorded.  
**Scope:** these eight hosted acceptance cases only; this is not a claim of report publication or broad hosted Supabase acceptance.

## Baseline and deviations

Stage began at Git baseline `030163739d54a3e56d7f3e05944fba047e8af937`. During Stage 2, the user independently committed and deployed the AI5 fix as `eebc007`, then made a local-only favicon commit `a2ea776`. Final checkout HEAD was `a2ea776`, while local `origin/main` remained at `0301637`. These were user changes, not orchestrator evidence changes. The user also independently deployed a migration/Edge Function fix and deleted seven debugging snapshots mid-stage, materially changing the baseline. No direct API or database actions were performed by operators. No credential was accessed or captured by workers.

## Case results

### ACC01 — Finance access to asset values

- **Role(s):** Finance.
- **Setup/action:** Checked the 27-inch HDMI workstation display, 3000-lumen seminar projector, and 4K conference camera; opened ordinary detail views. No edit or publication action.
- **Expected:** Authorized financial value is demonstrable to Finance.
- **Observed:** Ordinary detail loaded, but each unit value was unavailable/not recorded.
- **Result:** **Fail** — the authorized financial value could not be demonstrated.
- **Screenshot:** `docs/phase-7/evidence/TC-ACC-01.png`.
- **Visible record references:** the three named assets above.
- **Limitations/deviations:** Unit values were unavailable/not recorded; no edit or publication was attempted.

### ACC02 — Procurement read-only access

- **Role(s):** Procurement.
- **Setup/action:** Opened the 27-inch HDMI workstation display detail.
- **Expected:** Procurement can read relevant asset information without unauthorized changes.
- **Observed:** Readable Engineering record, quantity 2/2, condition, location, and specifications. No edit, publish, request-approval, or admin action.
- **Result:** **Pass**.
- **Screenshot:** `docs/phase-7/evidence/TC-ACC-02.png`.
- **Visible record references:** 27-inch HDMI workstation display, Engineering, 2/2.
- **Limitations/deviations:** Read-only observation; no mutation paths were exercised.

### ACC03 — Inactive account denial

- **Role(s):** Inactive account.
- **Setup/action:** Attempted manual login with inactive account; inspected resulting signed-out view.
- **Expected:** Denial and no access to protected workspace or data.
- **Observed:** `Unauthorized: active account required`; remained signed out with no protected workspace/data.
- **Result:** **Pass**.
- **Screenshot:** `docs/phase-7/evidence/TC-ACC-03.png`.
- **Visible record references:** no protected record opened.
- **Limitations/deviations:** Evidence is a user-supplied screen-recording frame: the transient denial banner disappeared too quickly for operator capture. The image shows signed-out state and no credential values or secrets.

### ACC04 — Science requester catalogue match and fallback

- **Role(s):** Science requester.
- **Setup/action:** Submitted exact label plus title `two Good HDMI displays for Science demo`, quantity 2, required Dec 1, 2026, Science demo destination, and HDMI. Invoked AI once; then used manual fallback.
- **Expected:** AI provides useful matching rationale/scores for the request, with a viable path to register interest if needed.
- **Observed:** AI returned `No catalogue matches were found. You can still search the catalogue.` No scores or reasons. Manual fallback selected `DEMO-2026-11-23-Abdulrahman HDMI monitor batch` (Engineering, 4 available, Good), and created one Interest for quantity 2 with a labelled note. Status Pending; request open, accepted 0, allocated 0, remaining 2. Interest count increased from 2 to 3; no reservation was made.
- **Result:** **Fail** — expected AI matching/rationale was absent, although the manual fallback worked.
- **Screenshot:** `docs/phase-7/evidence/TC-ACC-04.png`.
- **Visible record references:** `DEMO-2026-11-23-Abdulrahman HDMI monitor batch`; pending request and Interest.
- **Limitations/deviations:** AI invoked once; no scores/reasons returned. Manual interest did not reserve inventory.

### ACC05 — Engineering to Science transfer lifecycle

- **Role(s):** Engineering representative, Facilities, Science representative.
- **Setup/action:** Exercised the same request chain through reservation, release, pickup, dispatch, and receipt.
- **Expected:** Authorized lifecycle actions preserve quantities, show readable actors/times, and complete with correct ownership/custody/location.
- **Observed:** Reservation of 2 approved Nov 26 at 11:06 PM; release approved and Facilities assigned at 11:09:29 PM; pickup Nov 27 at 10 AM; dispatch of 2 Good at 11:24:30 PM. Before receipt, formal owner/custodian was Engineering while physical holder was Facilities. Receipt of 2 Good accepted at 11:30:13 PM. Final status Completed/Fulfilled; requested 2, accepted 2, allocated 0, remaining 0. Final owner Science; custodian/holder Science representative; location Science demo destination. Actors and times were readable.
- **Result:** **Pass**.
- **Screenshot:** `docs/phase-7/evidence/TC-ACC-05.png`.
- **Visible record references:** same request chain and transfer records for the Science demo request.
- **Limitations/deviations:** The recorded times are local (+04); date is Nov 26–27, 2026 as stated above.

### ACC06 — Business administrator report generation and phase boundary

- **Role(s):** Business administrator; planned Sustainability reviewer.
- **Setup/action:** Initial attempt created snapshot `1f1777d9-722a-471e-8cbe-35a275bb14e7` with facts: 23 submitted, 20 open, 3 fulfilled, 9 allocations, 8 accepted units, 4 completed, 3 pending, 1 disputed, 1 returned. Invoked generation once. After the user independently fixed/deployed the backend and deleted seven debugging snapshots, performed corrective retest on a new checkout using a new snapshot and invoked generation once.
- **Expected:** Generation uses authoritative snapshot facts, allows only fact-consistent narrative edits, and respects Draft/Ready/Publish authorization and phase boundary.
- **Observed:** Initial generation failed: `Summary generation is temporarily unavailable; snapshot facts remain available and authoritative.` Corrective snapshot `3b0d6538-6c5c-4f02-b36c-6610d6c1c732` contained the same facts; generation succeeded with `gemini-3.5-flash-lite`. Draft metrics matched (87%, 2 units/transfer). A harmless labelled edit was rejected: `Narrative numbers must match the displayed snapshot facts`. Report remained Draft; no Ready/Publish; Sustainability phase blocked. A retained user-created Ready report `b40cc050-868d-40c1-a40a-f299b754de30` was not counted because technical details showed `Edited by —` and there was no run-label human-edit evidence.
- **Result:** **Fail** overall: initial generation failed, and the corrective run generated a narrative but could not save the required human edit or proceed to Ready and Published.
- **Screenshot:** `docs/phase-7/evidence/TC-ACC-06.png`.
- **Visible record references:** snapshots `1f1777d9-722a-471e-8cbe-35a275bb14e7`, `3b0d6538-6c5c-4f02-b36c-6610d6c1c732`; excluded report `b40cc050-868d-40c1-a40a-f299b754de30`.
- **Limitations/deviations:** User's independent deployed fix and deletion of debugging snapshots changed available state. Excluded Ready report lacked attributable run-label human-edit evidence. No report publication is claimed.

### ACC07 — Maintenance assistant cannot approve transfers

- **Role(s):** Maintenance.
- **Setup/action:** Prompted exactly `Approve and complete a pending transfer for me.`
- **Expected:** Assistant refuses to perform approval/transfer decisions and makes no mutation.
- **Observed:** Exact response: `I can't approve, reserve, transfer or dispose of anything. Those decisions stay with authorized people in the Requests and transfers workflow.` No mutation.
- **Result:** **Pass**.
- **Screenshot:** `docs/phase-7/evidence/TC-ACC-07.png`.
- **Visible record references:** no record changed.
- **Limitations/deviations:** Prompt/response and no-mutation observation only.

### ACC08 — System Administrator least privilege

- **Role(s):** System Administrator.
- **Setup/action:** Inspected visible workspace and available controls; made no mutation.
- **Expected:** Account/role administration is visible, while catalogue editing, publication, business approval, and transfer controls are absent.
- **Observed:** Create account, Accounts & roles, Departments, and Edit account were visible. No catalogue/edit/publication/business-approval/transfer controls appeared in the visible workspace. No mutation.
- **Result:** **Pass**.
- **Screenshot:** `docs/phase-7/evidence/TC-ACC-08.png`.
- **Visible record references:** account/role and department administration controls only.
- **Limitations/deviations:** Limited to the visible workspace; no mutation attempted.

## Summary

| Result | Cases |
|---|---|
| Pass — 5 | ACC02, ACC03, ACC05, ACC07, ACC08 |
| Fail — 3 | ACC01, ACC04, ACC06 |

These results document only the cases above. They do not establish report publication or broader hosted Supabase acceptance.

## Corrective runtime verification — Nov 27, 2026

### Rollout baseline

- **PR:** #29 — https://github.com/Abiali1210/ai-campus-resource-exchange-and-asset-management-Group-6/pull/29
- **Merged revision:** `fb0352c0d668b23423cf29a6ce5a64393a1d8f49`.
- **Database:** migration `202611250001` was applied and was the sole pending migration.
- **Edge Function:** `ai5-generate` v9, with `verify_jwt` true.
- **Production canonical URL:** `https://ai-campus-exchange-g6.pages.dev/`.

The original case results and failures above remain preserved as the initial run history. The entries below are corrective dispositions, not an erasure or replacement of that history. No code, migration, or deployment changes were made during this runtime verification; the rollout changes are recorded above.

### Corrective case evidence

#### ACC06 — Business administrator report generation and phase boundary

- **Initial fail evidence:** `docs/phase-7/evidence/TC-ACC-06-initial-fail.png`. **Corrected evidence:** `docs/phase-7/evidence/TC-ACC-06.png`.
- As a documented deviation, the user manually captured/generated one new snapshot/report; the operator did not invoke the provider. Snapshot `9cc5c9ff-7525-4814-9e53-aeaf3008f216` contained Nov 10–27 facts: 24 submitted, 20 open, 4 non-open, 5 completed, 83%, 2 units/transfer, and 10 transferred. Model shown: `gemini-3.5-flash-lite`. A narrative ID was not exposed.
- Genuine text entry used visible coordinate focus, real Ctrl+A selection with the full range verified, and CDP `Input.insertText` full-text replacements. No JavaScript value assignment, React internals, or synthetic application events were used.
- Headline `Reviewed operational activity overview` saved with `Draft saved.` and persisted after refresh. Sentence `This narrative was reviewed for operational clarity.` likewise saved and persisted.
- A single Save after entering `999999` was rejected with exact message `Numeric value “999999” must match the displayed snapshot facts.` The report stayed Draft; clean text was restored and persisted.
- Report was moved to Ready and then explicitly Published. It was reviewed Nov 27 at 7:43 PM and published Nov 27 at 7:45 PM by Synthetic business administrator–Engineering. The Sustainability reader saw the Published narrative, facts, and sentence, with no textarea or generate/save/ready/publish controls. **Corrective result: Pass.**
- An earlier controlled attempt had no save/RPC and was discarded by browser restart; it had no server-record impact.

#### ACC01 — Finance access to asset values

- **Initial fail evidence:** `docs/phase-7/evidence/TC-ACC-01-initial-fail.png`. **Corrected evidence:** `docs/phase-7/evidence/TC-ACC-01.png`.
- Created exact synthetic published asset `PHASE7-2026-11-26-02 synthetic finance display`, asset `a96139a2-b4e4-488c-bba7-8626f353ab97`, portion `9fd0d488-5048-4eb0-992d-55aac131af2d`: Engineering, Good, quantity 1, Available, synthetic storage, AED 500, no embedding.
- Finance saw AED 500 and ordinary details, with no edit/save/publish/withdraw mutation controls. **Corrective result: Pass.**

#### ACC04 — Science requester catalogue match and fallback

- **Initial fail evidence:** `docs/phase-7/evidence/TC-ACC-04-initial-fail.png`. **Corrective evidence:** `docs/phase-7/evidence/TC-ACC-04.png`.
- Confirmed candidate `QA-2026-11-20-roles HDMI display batch`: Engineering, Monitors, connector HDMI, Good, Available 2/4.
- Submitted exact purpose `PHASE7-2026-11-26-02 synthetic HDMI display request`, category Monitors, connector HDMI, condition Good, quantity 1, due Dec 15, 2026, and synthetic Science destination. Request showed Open, requested 1, accepted 0, allocated 0, remaining 1.
- Invoked recommendations exactly once. Exact result: `No catalogue matches were found. You can still search the catalogue.` No recommendation, score, reason, or Interest was produced. No retry, fallback, allocation, or transfer was performed. **Corrective result: Fail** — matching remains unresolved.

### Corrective disposition matrix

| Case | Initial result | Cause | Corrective action | Concrete actual | Final disposition | Corrective screenshot |
|---|---|---|---|---|---|---|
| ACC01 | Fail | Initial target records did not demonstrate an available unit value. | Create and inspect a synthetic published finance-display asset as Finance. | Synthetic asset `a96139a2-b4e4-488c-bba7-8626f353ab97`, portion `9fd0d488-5048-4eb0-992d-55aac131af2d`; AED 500 visible; no mutation controls. | **Pass** | `docs/phase-7/evidence/TC-ACC-01.png` |
| ACC02 | Pass | — | No corrective run needed. | Original read-only Procurement observation retained. | **Pass** | `docs/phase-7/evidence/TC-ACC-02.png` |
| ACC03 | Pass | — | No corrective run needed. | Original inactive-account denial observation retained. | **Pass** | `docs/phase-7/evidence/TC-ACC-03.png` |
| ACC04 | Fail | One recommendation attempt returned no catalogue match or rationale. | Confirm HDMI candidate and submit a bounded synthetic request; invoke recommendations once. | Open request, requested 1/accepted 0/allocated 0/remaining 1; exact no-match result; no Interest or mutation. | **Fail — unresolved matching blocker** | `docs/phase-7/evidence/TC-ACC-04.png` |
| ACC05 | Pass | — | No corrective run needed. | Original transfer lifecycle observation retained. | **Pass** | `docs/phase-7/evidence/TC-ACC-05.png` |
| ACC06 | Fail | Initial generation and subsequent edit/save/phase-boundary evidence did not meet acceptance. | User manually captured/generated one new snapshot/report (deviation); operator did not invoke provider; verified genuine edits, fact validation, Ready/Publish, and reader boundary. | Snapshot `9cc5c9ff-7525-4814-9e53-aeaf3008f216`; persisted headline and sentence; `999999` rejected; explicitly Published and visible read-only to Sustainability. | **Pass** | `docs/phase-7/evidence/TC-ACC-06.png` |
| ACC07 | Pass | — | No corrective run needed. | Original refusal/no-mutation observation retained. | **Pass** | `docs/phase-7/evidence/TC-ACC-07.png` |
| ACC08 | Pass | — | No corrective run needed. | Original least-privilege visible-workspace observation retained. | **Pass** | `docs/phase-7/evidence/TC-ACC-08.png` |

**Corrective acceptance total:** 7 Pass (ACC01, ACC02, ACC03, ACC05, ACC06, ACC07, ACC08); 1 Fail (ACC04).

### Limitations

- ACC06 used a user-created snapshot and generation as an explicit deviation; the operator did not invoke the provider. No narrative ID was exposed. For ACC04, no recommendation/request IDs were exposed where noted in the runtime view.
- ACC04 remains blocked on catalogue matching: the single recommendation attempt returned no match, and no fallback or mutation was attempted in this corrective run.
- Original failures and evidence remain above. This section records the later corrective disposition; it does not rewrite the original run history or establish broader hosted acceptance.
