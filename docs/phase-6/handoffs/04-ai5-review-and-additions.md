# AI #5 review of the merged implementation, and additions

Branch `claude/ai5-implementation-msoct6`, based on main `acdc08b` (PR #18). A separate
AI #5 draft written before PR #18 was seen was superseded; only the parts below that fill
gaps were carried over. AI assistance: Claude Code. Human review and hosted checks pending.

## Review of PR #18 (checked, not changed unless listed below)

Strengths: immutable snapshots, snapshot-bound narratives, Draft → Ready → Published
lifecycle, database-side narrative validation (final authority) plus gateway checks,
idempotent generation, writes under the caller's JWT (no service key), 173 unit and
all database checks passing on main.

Gaps against `tasks/04-muhammad-awais.md`, and what was done:

| Gap                                                                                                              | Action                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No period/department filter; no approved allocations; completed/pending/canceled/disputed/returned not separated | Added `ai5_outcome_breakdown(start,end,department)` (business administrator only) and an **Outcome breakdown** card in the Reports panel. Deliberately separate from narrative facts, so the narrative validator and frozen snapshots are untouched and the model never sees or writes these figures. |
| No audit trail for capture/generate/edit/ready/publish                                                           | Added triggers writing `report.*` rows to `audit_logs` (actor, ids, status, text hash; never narrative text). Existing RPCs unchanged; replays do not duplicate rows.                                                                                                                                 |
| Gemini fetch had no abort (the race timeout left the request running)                                            | `AbortSignal.timeout(20000)` in `ai5-generate/index.ts`.                                                                                                                                                                                                                                              |

Noted, not changed (product decisions for the team):

- `ai5_published_narratives()` returns institution-wide published reports to **every** active
  user (requesters included). Confirm that is intended, or restrict by role/department.
- `ai5_edit_narrative` has no expected-version check, so two admins editing a Draft is last-write-wins.
- Snapshots stay all-time; the new breakdown is current-state for a period, not frozen.
- Narrative validation is several large regexes rewritten across three migrations; a
  consolidated test table of accepted/rejected strings would make future changes safer.
- Model id `gemini-3.5-flash-lite` is hard-coded in the function and a DB check constraint.

## Checks run (local, 17 Nov 2026)

`npm test` 173 pass; `npm run test:db` pass including 4 new checks
(`scripts/test-ai5-outcomes.mjs`: exact outcome counts, filters, authorization,
validation, audit lifecycle); `tsc`, build, format check pass. PGlite only; no native
PostgreSQL, hosted, browser or real-Gemini run. Apply
`202611170001_ai5_outcomes_audit.sql` after the earlier AI5 migrations; no function redeploy
is needed for the DB change, but `ai5-generate` must be redeployed for the timeout.
