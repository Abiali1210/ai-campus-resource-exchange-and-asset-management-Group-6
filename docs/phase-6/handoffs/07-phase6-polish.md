# Instructions for Claude Code — Group 6 Phase 6 polish

Prepared 22 November 2026 for Muhammad Awais (COSC 336, Group 6).

**Claude Code: this whole file is your task.** Muhammad will send you only this file.
You are responsible for the full setup (finding or cloning the repository, pulling the
latest code, installing dependencies, connecting Supabase, running the checks) and then
for fixing the issues and making the improvements below. Do as much as you can yourself.
Only stop to ask Muhammad when you need something only a person can do (a browser login,
a password, an approval) — and when you do, tell him exactly what to click or type.

## Project in brief

Circular Campus: React 19 + TypeScript + Vite frontend (Cloudflare Pages, auto-deploys
from `main`), Supabase backend (Auth, PostgreSQL with row-level security and
transaction functions in `supabase/migrations/`, Edge Functions in
`supabase/functions/`), AI via gte-small + pgvector (AI #2) and Gemini
`gemini-3.5-flash-lite` (AI #4 assistant, AI #5 report).

- Live site: https://ai-campus-exchange-g6.pages.dev
- Repository: https://github.com/Abiali1210/ai-campus-resource-exchange-and-asset-management-Group-6
- Hosted Supabase project ref: `gcctwsxullabhkddbzgo` (shared by the whole team)
- Public project URL: https://gcctwsxullabhkddbzgo.supabase.co (the publishable key is
  in the deployed frontend bundle; it is not a secret)

Phase 6 scope (C1–C6, AI #2, AI #5, plus extras C9 and AI #4) is implemented and
working. The Phase 6 report and presentation are already finished. Tell Muhammad
before changing any behaviour they describe.

## Part A — Setup (do this yourself, in order)

1. **Find the repository.** Muhammad's clone was previously at
   `C:\Users\pc\OneDrive - ku.ac.ae\Projects\ai-campus-resource-exchange-and-asset-management`.
   If you are not already in it, look there. If it isn't there, ask Muhammad where it
   is, or clone it into a folder he chooses:
   `git clone https://github.com/Abiali1210/ai-campus-resource-exchange-and-asset-management-Group-6.git`
2. **Save this file** into the repository root as `CLAUDE_CODE_HANDOFF.md`. Do not
   commit it yet (see Part D).
3. **Update the code safely.** Run `git status` first. If there are uncommitted
   changes, list them for Muhammad and ask before stashing or discarding anything.
   Then `git checkout main` and `git pull`, and confirm that local `main` matches
   `origin/main`.
4. **Check the tools.** Node.js 22 (`node -v`; see `.nvmrc`), Git, and the GitHub CLI
   (`gh auth status`). If `gh` is missing or signed out, tell Muhammad the exact
   command to install it or sign in (`gh auth login`). Do not paste tokens into chat.
5. **Install dependencies:** `npm ci`. If Playwright browser tests need Chrome, use the
   project's existing `playwright.config.ts` (it uses the installed Chrome channel).
6. **Connect Supabase (read-only).** Check what is already configured with
   `claude mcp list`. If there is no Supabase server that is scoped to this project and
   read-only, add one:
   `claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=gcctwsxullabhkddbzgo&read_only=true"`
   Authentication needs a browser login, so ask Muhammad to type `/mcp`, choose
   **supabase**, then **Authenticate**, and log in. If the login works but the project
   is not visible, his Supabase account is not yet a member of the team's project.
   Tell him to ask the project owner (probably Abi) to invite him under Organization →
   Team. If the Supabase plugin's own unscoped server is also installed, use the scoped
   read-only one above for this work.
7. **Verify the connection without changing anything.** List the tables and the applied
   migrations, and compare them with the 13 files in `supabase/migrations/`. Report any
   difference to Muhammad. Do not fix it on the hosted project yourself.
8. **Confirm a green baseline** before editing: `npm test`, `npm run test:db`,
   `npm run test:browser`, `npm run build`, `npm run format:check`.
   Expected on 22 November: 227 unit tests, 57 database checks and 24 browser journeys,
   all passing (the build shows one bundle-size warning).
9. **Create the branch** `fix/phase6-polish` from the updated `main`.
10. **Report the setup result** to Muhammad in a few lines, with your plan for Part C,
    then continue with the work. Ask for his go-ahead only before the actions in
    Part B rule 2.

## Part B — Ground rules (from the team)

1. **The hosted Supabase database is shared and was carefully designed.** Never run
   ad-hoc SQL that changes data or schema on the hosted project. Every database change
   goes into a new, additive file in `supabase/migrations/` and is tested locally with
   `npm run test:db`.
2. **Ask Muhammad first, and wait for a clear yes, before you:** apply a migration to
   the hosted project, deploy an Edge Function, push to `main`, merge a PR, or switch
   the Supabase connection to write access. For deployment you will need
   `npx supabase login` and `npx supabase link --project-ref gcctwsxullabhkddbzgo`;
   both need Muhammad (browser login and the database password). After an approved
   deployment, switch back to read-only.
3. Never reset or reseed the hosted database. All data is synthetic; keep it that way.
4. Keep credentials out of Git (`.env.local` is ignored). Never write the shared demo
   password into any file. If you need to sign in to the live site to check a fix, ask
   Muhammad to do it.
5. Make small, meaningful commits on `fix/phase6-polish`, then open one PR to `main`.
6. Before every commit, run the checks from Part A step 8 and fix anything you broke.
7. Frontend fixes go live when the PR merges to `main` (Cloudflare). Edge Function and
   migration changes need the approved deployment from rule 2.

## Part C — The work

### Issues found in live testing on 22 November (fix these first)

| #   | Issue                                                                                                                                                                                                                                                     | Where to look                                                                                                                                                  | Suggested fix                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Assistant often shows "The assistant is unavailable right now" (3 of the first 4 questions). The function returned `{"error":{"code":"provider"}}` with HTTP 200; retrying worked.                                                                        | `supabase/functions/ai4-assistant/handler.ts` (provider call around line 429, error mapping around 468); `src/ai4.ts` `askAssistant`; `src/AssistantPanel.tsx` | Retry the Gemini call once on a transient provider error (with a short back-off), log the underlying provider status, and add a "Try again" button on the failed message. Needs a function redeploy after approval.                     |
| 2   | Assistant answers vary in completeness: "Any projectors in Engineering?" listed 1 item once and 4 another time; "Any chairs in Science?" listed 3 of 5 chair items; one reply said "a projector" while listing 4.                                         | `supabase/functions/ai4-assistant/handler.ts` (how items are chosen and how the answer is built)                                                               | Build the item list deterministically from the scoped database search; let the model only phrase the sentence, with the count taken from the list. Add unit tests for both examples.                                                    |
| 3   | Every AI #2 recommendation is labelled "Weak match". Ranking = 0.60F + 0.15T + 0.10K + 0.10W + 0.05E, and T, K, W, E are always 0 (no evidence recorded), so the maximum is 60 and the weak threshold is `< 60`.                                          | `src/ai2.ts` (`isWeakRecommendation`, line 66); `src/WorkflowPanel.tsx` (~line 507); `supabase/functions/ai2-match/handler.ts`                                 | Keep the formula (it is in the design doc). Change the label logic to judge strength on compatibility, or relative to the maximum achievable with the available evidence, and show compatibility more prominently. Document the change. |
| 4   | Asset history in the asset record pop-up shows raw event codes (`asset.published`, `asset.saved`) and actor UUIDs instead of names; a transferred batch shows "Asset history (0)" there while its full trail is only in Requests and transfers → History. | `src/App.tsx` (~line 970); `asset_detail` in `supabase/migrations/202611080001_foundation.sql`                                                                 | Map event codes to plain labels and show actor names (as the workflow History tab already does). Consider including the asset's transfer events. A name lookup may need a new additive migration.                                       |
| 5   | AI #5 validation error ("Narrative numbers must match the displayed snapshot facts.") appears at the top of the Reports page, far from the Save edit button, so it looks like nothing happened.                                                           | `src/Ai5ReportPanel.tsx` (error state, lines ~29–59)                                                                                                           | Show the error inside the report card next to the editor and buttons, and scroll/focus it.                                                                                                                                              |
| 6   | Two Supabase clients are created, causing a "Multiple GoTrueClient instances" console warning.                                                                                                                                                            | `src/ai2.ts` line 40 and `src/api.ts` line 25                                                                                                                  | Export one shared client from `src/api.ts` and reuse it in `src/ai2.ts`.                                                                                                                                                                |

### Inconveniences (do after the issues)

| #   | Inconvenience                                                                                                                                    | Where                                                    | Suggested improvement                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Registration form keeps the hint "Individual assets always contain one unit." after choosing a batch.                                            | `src/App.tsx` line 484                                   | Show the hint only when tracking mode is individual.                                                                                                 |
| 2   | The owning department's representative sees "Request this resource" on their own items.                                                          | `src/App.tsx` lines ~772–821                             | Hide it for the owning department (the server already blocks self-approval).                                                                         |
| 3   | Items in Unknown condition appear as available and can be picked in Interests, but can never be approved (`workflow_suitable` rejects them).     | `src/WorkflowPanel.tsx` (~line 1433, "Published item")   | Exclude unsuitable/Unknown items from the picker or label them "needs assessment".                                                                   |
| 4   | The "Published item" picker lists all ~68 items with portion ID suffixes (e.g. `· 990c3faf`).                                                    | `src/WorkflowPanel.tsx` (~line 1433)                     | Searchable picker filtered to the request's category; hide IDs.                                                                                      |
| 5   | Request cards are long and cannot be collapsed; the catalogue hero banner pushes results below the first screen.                                 | `src/WorkflowPanel.tsx`, `src/App.tsx`, `src/styles.css` | Collapsible request cards; smaller hero after sign-in.                                                                                               |
| 6   | Menu label "Deterministic reports" is technical.                                                                                                 | `src/App.tsx` lines 1560, 1629                           | Rename to "Reports" (update browser tests that use the label).                                                                                       |
| 7   | Test records with technical names (`[Part 2 fixture v1 …]`, `LIVE-TEST-…`, `QA-2026-11-20-roles …`) appear first in the catalogue and transfers. | Hosted data                                              | Do **not** edit hosted data. Option: a UI filter that hides records whose names start with `[Part 2 fixture` unless a "show test data" toggle is on. |
| 8   | Production build warns the main bundle is over 500 kB.                                                                                           | `vite.config.ts`, `src/main.tsx`                         | Add `manualChunks` for vendor code (React, supabase-js).                                                                                             |

### Priority and order of work (Muhammad's instruction)

**The six issues are the priority.** Muhammad's usage is limited. Finish and open the PR
for the issues before starting any inconvenience. Muhammad runs this main session at
**High** effort and explicitly asks you to use subagents with the effort levels below,
passing the `effort` parameter for each invocation (needs Claude Code v2.1.292 or later;
if your version cannot, tell him and do that step in this session instead).

1. Issues 3, 5 and 6 (frontend only, quickest), each with tests. **This session, High.**
2. Issues 1 and 2 (assistant Edge Function), with unit tests. Ask before deploying.
   **This session, High.**
3. Issue 4 (asset history). **Run it in one subagent at `xhigh` effort.** Give the
   subagent the issue 4 row, the relevant files and all of Part B. Instruct it to:
   (a) first replace event codes with plain labels in the website code only;
   (b) if showing people's names needs a database change, write it as one new additive
   migration that only adds or replaces the needed function, test it locally with
   `npm run test:db`, and **not** apply it to the hosted project. Then review its work
   yourself and show Muhammad the migration SQL. Apply it to the hosted project only
   after his clear yes.
4. **Checkpoint:** run all checks, commit, push and open the PR (Part D). Tell
   Muhammad the issues are done and what still needs his approval to deploy. Ask him
   whether to continue with the inconveniences. You cannot see his usage, so let him
   decide.
5. Only if Muhammad says to continue, do the inconveniences in subagents and add them to
   the same PR:
   - **`low` effort:** inconveniences 1 (hint text) and 6 (menu rename).
   - **`medium` effort:** inconveniences 2, 3, 4, 5 and 8.
   - Inconvenience 7 last, `medium`, UI option only.
     If Muhammad says usage is tight, do only the `low` ones and stop.

Review every subagent's changes yourself before committing them. Subagents follow
Part B: no hosted-database changes, deployments or merges without Muhammad's yes.

To save usage: run the targeted test file while you work on a fix, and run the full
check list from Part A step 8 once before each commit, not after every small edit.

## Part D — Finish

1. Run all checks again and record the actual numbers.
2. Move this file into `docs/phase-6/handoffs/` as the next numbered handoff (for example
   `07-phase6-polish.md`). Add a short "Results" section: what changed, the check
   numbers, what was deployed and what still needs approval.
3. Push the branch and open one PR to `main`. Include a plain-language summary, the
   check results and before/after screenshots where the UI changed. Do not merge it.
4. Give Muhammad a short final summary: the PR link, what is live, and anything still
   waiting for his approval (migrations, function deployments).

---

## Results (22 November 2026)

Branch `fix/phase6-polish`, 11 commits on top of `main` (514048c). All commits
are authored by LasiWala. Setup found local `main` equal to `origin/main`, and
hosted Supabase matching the repository: 13 migrations, 21 public tables and 5
Edge Functions.

### What changed

| Item                                                          | Change                                                                                                                                                                                                                                                                | Commit                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Issue 1: assistant unavailable                                | Hosted logs showed Gemini `503 UNAVAILABLE` within 1–3 s. `ai4-assistant` retries a 5xx once after 0.8 s inside the 20 s budget. Quota, configuration and timeout failures are not retried. The chat offers **Try again**, which replaces the failed answer in place. | `fix(ai4): retry busy Gemini once…`                        |
| Issue 2: inconsistent item answers                            | Gemini only describes the search. The function filters the whole caller-scoped catalogue, sorts it and writes the sentence, so the count always equals the list. A department filter applies only when the question names it.                                         | same                                                       |
| Issue 3: every match "Weak"                                   | Formula unchanged. Strength = rank as a percentage of the rank the recorded evidence allows (equal to compatibility while T/K/W/E are missing). Compatibility is shown first, with the cap ("48.6 of 60 possible"). **Departs from the wording of design §12.1.**     | `fix(ai2): judge match strength…`                          |
| Issue 4: asset history codes/UUIDs, empty split-batch history | Shared plain labels and "By ‹name›". New additive migration `202611220001_asset_history_names.sql`: `actorName`, plus this asset's reservation/transfer trail for participants who already see it in `workflow_workspace` (same cost redaction).                      | `fix(assets): plain-language asset history…`               |
| Issue 5: AI #5 error far from the button                      | Card actions report inside the card, under the buttons. Errors take focus.                                                                                                                                                                                            | `fix(ai5): show report action results…`                    |
| Issue 6: two Supabase clients                                 | `src/ai2.ts` reuses the client exported by `src/api.ts`.                                                                                                                                                                                                              | `fix(supabase): share one browser client…`                 |
| Review condition: AI4 logging                                 | Logs and response codes come from fixed categories only. Google status is allow-listed and error text is never logged.                                                                                                                                                | `fix(ai4): log provider failures as fixed categories only` |
| Inconveniences 1 and 6                                        | Batch-aware quantity hint; "Reports" menu label.                                                                                                                                                                                                                      | `fix(ui): batch-aware quantity hint…`                      |
| Inconveniences 2, 3, 4, 5, 8                                  | No request button for the owning department. The Interest picker hides portions the server can never approve and gains search, with no ID suffixes. Request cards can be collapsed. Compact hero after sign-in. Vendor chunks (main chunk 68 kB, no >500 kB warning). | `feat(workflows): cleaner request flows…`                  |
| Inconvenience 7                                               | "Show test data" toggle hides `[Part 2 fixture`, `LIVE-TEST-` and `QA-2026-` records in the UI only. Hosted data is untouched.                                                                                                                                        | `feat(ui): hide technical test records…`                   |

Issues 1–4 and inconvenience 7 were delegated to subagents as the handoff
asked (issue 4 at xhigh effort, inconveniences at low/medium). Every change was
reviewed in the main session before commit. Screenshots are in
`docs/phase-6/evidence/2026-11-22-*.png`.

### Checks (local, final branch)

- `npm test`: 270 passed across 23 files (227 on the 22 November baseline).
- `npm run test:db`: 58 PGlite checks passed (16 core, 30 workflow including
  the new asset-history check, 4 AI5, 4 AI5 outcomes, 4 C9) plus the AI #2
  SQL contract assertions (57 on the baseline).
- `npm run test:browser`: 30 journeys passed (24 on the baseline).
- `npm run build`: passed. Largest chunks are supabase 225 kB and react 222 kB;
  main 70 kB. The previous >500 kB warning is gone.
- `npm run format:check`: passed with `--end-of-line auto` (Windows CRLF
  checkout).
- Not runnable locally: CI's `test:db:native` (real PostgreSQL 17). It runs
  on the PR.

### Deployment status

- **Frontend:** goes live when the PR merges to `main` (Cloudflare Pages).
- **Migration `202611220001_asset_history_names.sql`:** approved by Abi and
  Muhammad on 22 November, with conditions (target check, fresh backup,
  migration-history check, dry run, sole pending migration, tracked
  `db push`). To be applied from the merged `main` commit.
- **Edge Function `ai4-assistant`:** approved on the same conditions. Hosted
  version before this work: 4, which also predates the 20 November
  request-status and lookup-failure fixes. To be deployed from the merged
  `main` commit. The rollback target is a specific known-good commit that
  contains those fixes, not "the previous version".
- Hosted acceptance results are recorded in the PR after deployment.

### Notes for the team

- Design §12.1 says "Rank below 60 is labeled Weak match". The threshold now
  applies to the evidence-adjusted rank (see issue 3). Mention this if the
  report or slides quote §12.1.
- Windows checkouts with `core.autocrlf=true` fail a plain `npm run
format:check`. Use `--end-of-line auto` locally; CI checks LF.
- The Interest picker still lists own-department portions in the
  non-hand-off path. The server allows another representative of the same
  department to approve them, so they are not hidden.
