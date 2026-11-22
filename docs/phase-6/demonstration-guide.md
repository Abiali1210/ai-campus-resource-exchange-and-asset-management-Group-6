# Phase 6 team demonstration guide

Prepared 22 November 2026 for C1–C6 and AI 2/5. This is a rehearsal aid, not an additional submission requirement. Allow about 10–12 minutes, adjusted to the lab's allowance. Do not spend demonstration time on deferred modules.

## Before rehearsal

- Use the [hosted prototype](https://ai-campus-exchange-g6.pages.dev/) and existing synthetic accounts. Get the test password privately; exclude passwords and environment settings from screenshots.
- Use separate browser profiles or explicitly sign out between roles. Prepare requester, supplying representative, receiving representative, Facilities and business administrator sessions.
- Preserve the existing `QA-2026-11-20-roles` evidence. For a new run use a unique prefix such as `DEMO-2026-11-22-01`. A new live run creates persistent records and affects report totals; agree labelled test records with the team. Never reset or reseed the shared project.
- Abi recorded migration 202611210001 and hosted note/privacy checks in [issue 23](https://github.com/Abiali1210/ai-campus-resource-exchange-and-asset-management-Group-6/issues/23#issuecomment-7070239791). Do not reapply it because an older task box is unchecked.
- Abi verifies matching and fresh embeddings; Awais checks deployed AI function versions. A frontend deployment does not establish an Edge Function update.

## 1 Abdulrahman shows login and catalogue

**Time:** 2 minutes. **Account:** `rep-eng@demo.test`.

1. Explain React/TypeScript, Supabase/PostgreSQL and Cloudflare. Permissions are enforced by the backend.
2. Register a uniquely labelled synthetic batch: four HDMI displays, Monitors, Good, Engineering, an Engineering demo store and connector HDMI. Use the normal technical specification fields.
3. Save, inspect and publish separately. Show the illustration and compact details. Search the unique name and demonstrate category, condition and department filters.
4. Give the unique asset name to the next presenter.

**Expected:** registration does not automatically publish; only published suitable stock is discoverable to another department.

**Explain:** why publication is separate and why hiding a button cannot enforce permissions.

## 2 Abi shows matching and selection

**Time:** 2 minutes. **Account:** `req-sci@demo.test`.

1. Submit a request for two Good HDMI displays, an actual future required date, Science demo destination and connector HDMI. Use the same unique prefix.
2. Get recommendations. Show up to five eligible results, scores, reasons and missing evidence. A ranking score is not a probability.
3. Reject one suggestion with a reason. Accept another with a valid quantity and selection note. Use the new demo batch if it appears.
4. If it is absent, preserve the actual AI result and select the demo batch using conventional search. Explain that this is manual fallback, not AI acceptance.
5. Show the Interest awaiting approval. Selection alone must not allocate stock.

**Expected:** requester sees their own decision; after role switch the supplier can see the permitted selection note.

**Explain:** suitability before ranking, missing evidence contributing zero and embedding freshness after edits.

## 3 Ahmed shows approval through accepted receipt

**Time:** 3–4 minutes. **Accounts:** `rep-eng@demo.test`, `fac@demo.test`, `rep-sci@demo.test`.

1. As Engineering representative, read the Interest and note, reserve two units, separately approve release and assign Facilities.
2. Show two units remaining. Explain row locks and conserved StockPortions; rapid clicking is not a concurrency test.
3. As assigned Facilities, schedule a future pickup, record a synthetic arrangement and dispatch two.
4. As Science representative, inspect custody before receipt. Formal Engineering custody must remain unchanged by dispatch.
5. Accept the full suitable two unit receipt. Show Completed, Science custody, request accepted 2 / allocated 0 / remaining 0, and actor/time history.

**Expected:** separate approvals, no self approval and formal custody change only on accepted receipt.

**Explain:** Interest versus allocation and physical holder versus formal custodian. Use recorded evidence for disputes/returns if time is short. Identify native concurrency and local return checks as separate evidence, not steps performed live.

## 4 Muhammad Awais shows reporting

**Time:** 2–3 minutes. **Accounts:** `biz-eng@demo.test`, then `sust@demo.test`.

1. Select a period containing the demo and capture facts. Explain frozen database snapshot versus changing live totals.
2. Generate the narrative, compare numbers to facts, make a supported edit and mark Ready.
3. Publish only the labelled synthetic rehearsal report agreed with the team. As Sustainability, show Published without edit or Publish controls.
4. If another persistent publication is unnecessary, show the existing `Role walkthrough summary from synthetic campus records` reader view and state that the new draft was left unpublished.

**Expected:** unsupported numeric claims are rejected and human review precedes publication.

**Explain:** the AI writes prose, the database calculates totals, and number validation does not guarantee every sentence is correct.

## Failures and optional checks

- If AI is unavailable, show ordinary search or calculated facts and the recorded evidence. Do not invent a result or repeatedly create requests.
- If a save/approval fails, inspect the message and reload state before retrying. Do not bypass permissions.
- Optional C9: export synthetic request/transfer CSVs. Open the downloads and compare headers, scope and rows with the table; costs must be absent. Record the real result. The earlier hosted export tool timed out; contents remain unverified.
- Optional assistant: ask for visible items, then ask it to approve a transfer. It should refuse the mutation. Drafting still needs normal form submission.
- Do not test destructive edge cases on unrelated hosted data. Use automated evidence for races and unsafe returns unless a dedicated test is requested.

After rehearsal, record date, participants, app revision, test prefix, actual results and uncompleted checks in the [submission checklist](submission-checklist.md). Each member explains their part. Preparing this guide does not count as rehearsal.
