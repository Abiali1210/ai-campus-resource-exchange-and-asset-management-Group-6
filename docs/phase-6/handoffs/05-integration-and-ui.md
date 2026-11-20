# Phase 6 integration and UI handoff — 20 November 2026

Branch: `codex/phase6-integration-polish`. Based on main after PR #22
(`1e72ba2`). Requested by Abdulrahman. Human/team review remains pending.

**Later verification, 20 November:** Abdulrahman explicitly authorized the hosted
walkthrough, replacing the earlier team-only restriction below. All nine roles
were exercised; a dedicated hosted transfer, real matching and the generated
report/review/publication/reader journey completed. Read the
[hosted role results](../reviews/2026-11-20/hosted-role-walkthrough.md) and
[open audit findings](../reviews/2026-11-20/exploratory-audit.md). Existing bugs
remain open; the audit does not claim exhaustive hosted concurrency, permission
changes or deferred-module coverage. PR #24 and issue #23 carry current merge and
deployment status; the original checklist below is historical context.

## What changed

- `src/AssetArt.tsx` and `src/assetIllustrations.ts`: shared representative SVG
  artwork for 17 recognizable item types plus a neutral resource-box fallback.
  The specific item name takes priority over the category. Existing monitor,
  projector and chair artwork is retained. An extinguisher is no longer rendered
  as a monitor merely because its category is unfamiliar. The illustrations are
  not photos, condition assessments or safety certifications.
- `src/App.tsx` and `src/styles.css`: compact desktop asset records, specifications
  beside the main details and expandable history; mobile and long records still
  scroll. Keyboard focus stays inside the dialog, Escape closes it and focus
  returns to its trigger. The sidebar navigation scrolls on short desktops so
  account controls remain reachable. Avatars no longer shrink beside long names.
  Report navigation icons, the assistant breadcrumb and report introduction are
  consistent with their screens. Card animation respects reduced-motion settings.
- The selected **University plaque** treatment wraps the unchanged official logo in
  a white panel with a subtle double frame and separate `COSC 336 · GROUP 6`
  caption. The screenshot selection supersedes the earlier masthead recommendation.
  The plaque is 5% narrower at Abdulrahman's request; the logo keeps its aspect ratio.
  Mobile spacing reserves room for account controls at 320, 390 and 760 px widths.
- Browser tests now use workflow sections, the New request button and requirement
  rows instead of old controls. Assertions for custody, approval, privacy, retries
  and stock remain in place. Test repair exposed a real sidebar overflow problem;
  the sidebar fix is covered by desktop and mobile sign-out checks.
- New browser coverage exercises AI matching failure followed by manual Interest
  creation without allocation, plus report capture, AI outage, successful generation,
  rejection of unsupported edited numbers, human save/review/publication and a
  requester's read-only published-report view.
- The plan, setup introduction and implementation report distinguish current code
  from historical deployment notes and remaining hosted acceptance.

No migrations, shared accounts, business data, provider secrets or hosted function
versions were changed. No packages were installed for this work. Existing local
dependencies were reused.

## Local checks and evidence

| Check                      | Result                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Unit tests                 | 224 passed, including 25 illustration-selection cases                                      |
| Production typecheck/build | Passed; Vite reports the existing large-main-chunk warning                                 |
| Local SQL suites           | Passed: 16 foundation, 28 workflow, 4 report, 4 outcome/audit and 4 activity-report checks |
| AI #2 SQL text contracts   | Passed; this does not execute native pgvector inference                                    |
| Browser suite              | 18 passed, including all six inherited workflow flows and the new UI/outage/report checks  |
| Formatting and whitespace  | Checked before publishing                                                                  |

The local run used Node 24.11.1 and Chrome; the repository CI targets Node 22.
Database/browser checks use PGlite with synthetic Auth/HTTP adapters. The report
browser check runs the actual AI #5 handler and SQL; Gemini's response is a
deterministic test response. The AI #2 browser check simulates an outage, not
successful embedding inference. These results establish neither live service
acceptance nor AI relevance, accuracy or production performance.

Reproduce from this branch after installing the locked dependencies:

```sh
npm test
npm run test:db
npm run build
npm run test:browser
```

Run the browser suite after the other local suites finish. No hosted credentials,
Docker stack, reseed or database reset is needed for these PGlite/browser checks.
The preview itself can be launched with `npm run dev` without credentials; it stays
explicitly read-only. Follow setup for an authorized connection to a real project.

Browser screenshots are written under ignored `test-results/`, including the
illustration gallery, extinguisher record, university plaque, compact desktop/mobile record,
accepted transfer, mobile workflow and reviewed report. The committed evidence
directory contains selected synthetic screenshots for review. The gallery's extra
item types are test fixtures, not new records on the shared project.

## Team verification and ownership

Abdulrahman explicitly assigned hosted verification to the team. The local
Supabase CLI was signed out and this checkout had no demo environment settings.
Use authorized local environment settings; do not put passwords, tokens or keys
in the issue, screenshots or Git history.

| Owner          | Verify                                                                                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abdulrahman    | Review the UI diff and screenshots; verify name-appropriate illustrations and neutral fallback, compact records, long content, keyboard/Escape, circular avatars and sign-out at desktop/mobile sizes                            |
| Ahmed          | Run the live request → Interest → reservation → release → dispatch → accepted receipt journey; check roles, no self-approval, last-unit competition, partial allocations, disputes and cost privacy                              |
| Abi Ali        | Confirm current AI #2 migrations/functions and fresh `gte-small` asset embeddings; demonstrate up to five suitable ranked results, scores/reasons and accept/reject; acceptance must not allocate stock before supplier approval |
| Muhammad Awais | Confirm AI #5 and corrected AI #4 function versions, deploy reviewed pending updates, and verify real generation, factual validation, human review/publication and assistant fallback                                            |
| Everyone       | Explain your contribution, record actual results and limitations in the report, and rehearse the complete demonstration                                                                                                          |

### Hosted checklist

1. Review this branch/PR and confirm the intended project and production frontend.
   Inspect actual migration history/function versions; old setup notes are not an
   authoritative inventory. Do not reset/reseed or blindly rerun migrations.
2. Merge through the normal review path, then record the main commit and successful
   Cloudflare deployment URL/revision. A frontend deployment does not deploy
   Supabase functions.
3. Using the authorized project owner's local CLI, redeploy the reviewed pending
   `ai5-generate` timeout update and the `ai4-assistant` request-status/error fixes.
   Keep the existing secrets, JWT checks and allowed origins. Check actual versions
   first in case another member already deployed them.
4. Sign in with existing authorized synthetic roles and complete the journey in
   the owner table. Use a clearly identified demo asset/request; record any test
   records created. Verify ownership changes only on accepted receipt.
5. Run successful AI #2 matching with actual embeddings and AI #5 generation with
   the real configured provider. Try no results, rejected suggestions and an
   unavailable/malformed AI response; ordinary workflows must remain usable.
6. Check the assistant against an account that actually has requests. Request status
   must come from the record cards; unknown questions and failed lookups must not
   invent answers or claim there are zero requests.
7. Verify the new UI on a laptop and phone, including the existing extinguisher
   example and a genuinely unfamiliar item. Check financial visibility with
   requester/Facilities versus permitted representatives.
8. Attach sanitized evidence, actual results, deployed versions and remaining
   limitations to the handoff issue. Update the report's remaining owner evidence.
   Close the issue only when these checks are complete or an explicit team decision
   records a deferred item.

The semester-wide classification, action-advice, maintenance, end-of-life,
sustainability dashboard and notification modules remain outside this change.
