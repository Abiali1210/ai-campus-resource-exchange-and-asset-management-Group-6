# Phase 6 audit fixes — 21 November 2026

Implements the five confirmed bugs from issue #23. This is a focused correction of
existing Phase 6 behavior, not an implementation of deferred semester modules.
GitHub PR/checks and issue #23 record the current publication/deployment status.

## Changes and evidence

| Finding                                           | Change                                                                                                                                                                                                                                                                                                                            | Verification                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1: old assistant response crosses login boundary | App invalidates the account generation before awaiting logout and on Supabase identity changes, including another tab. Old success/error callbacks, lookups and metadata completions cannot update the new session. Account-bound selections/notices/drafts are cleared; same-user token refresh does not clear the conversation. | Browser regressions release old success/error responses after account switch, wait for their completion and confirm absence alongside a valid current-account reply. A separate two-tab regression verifies broadcast identity switching. Independent source review challenged and rechecked these paths. |
| A2: unrelated edit corrupts specifications        | Editor retains original JSON values for unchanged rows, including renamed keys. Explicit changes to existing non-text values use JSON validation; new ordinary fields remain text. Invalid/overflowing JSON is rejected.                                                                                                          | Unit checks cover numbers, booleans, null, arrays, nested objects, rename/removal, explicit edits, invalid JSON, overflow and duplicate/incomplete fields. Browser description-only save preserves the typed payload.                                                                                     |
| A3: catalogue outage looks like zero matches      | Dedicated unavailable state and Retry catalogue control; failed loads do not render the successful-empty state or a zero result count.                                                                                                                                                                                            | Browser regression injects failure, verifies the unavailable state and recovers through Retry.                                                                                                                                                                                                            |
| A4: supplier cannot see selection note            | Additive SQL migration projects only each already-permitted Interest's recorded selection reason. Existing private request-history/financial filters remain intact; the internal original workspace function cannot be called by API users. UI reads the explicit field with a backward-compatible fallback.                      | SQL checks cover creator/supplier equality, unrelated-role denial, private-history exclusion and direct-helper denial. Full workflow browser journey asserts supplier note visibility. **Hosted application of this migration belongs to Abi.**                                                           |
| A5: navigation loses unfinished request           | App retains a user-scoped request form in memory across panel navigation. Successful submission resets it; logout/account switching clears it.                                                                                                                                                                                    | Browser regression checks purpose, quantity and requirement restoration; submit clearing; a second user's blank form after logout.                                                                                                                                                                        |

## Checks

- 227 unit tests passed across 19 files.
- 57 local PGlite SQL checks passed: 16 foundation, 29 workflow, four report, four
  outcome/audit and four activity-report checks; AI #2 text contracts passed too.
- All 24 browser journeys passed, including six new audit regressions. These use
  the repository's synthetic Auth/HTTP or PGlite adapters, not hosted credentials.
- Production typecheck/build passed. The existing large-main-chunk warning remains.
- Prettier passed with `--end-of-line auto` for the Windows checkout. Default local
  checking flags CRLF in untouched files; CI checks the repository's normalized LF
  checkout. Unrelated files were not reformatted to conceal that distinction.
- The privacy patch received a separate read-only review; the review's cross-tab
  and test-synchronization concerns were addressed before final checks.

Existing workflows, financial redaction, quantity accounting and receipt-controlled
custody retain their assertions. No authentication/authorization checks were
weakened to pass tests. Draft persistence is within the current page session;
refreshing the browser is not advertised as an autosaved-draft feature.

## Abi's remaining hosted action

Abdulrahman explicitly selected **“Leave the database update to Abi”** on
21 November. No hosted database migration was applied by this work.

Apply and verify **`supabase/migrations/202611210001_selection_reasons.sql`** after
checking the actual target/history and reviewed dry-run. Exact commands and
verification cases are at the top of [Abi's task file](../tasks/03-abi-ali.md).
There is no reset, reseed, Vault update or provider function deployment in that fix.

The frontend remains compatible before the SQL update, but the supplier's note
can still be unavailable on the hosted site. Do not mark A4's live check complete
or close issue #23 until Abi records the applied migration and successful hosted
supplier/outsider/cost-privacy verification. Other historical acceptance items must
be recorded as passed or explicitly deferred rather than silently checked off.
