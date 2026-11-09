# AI-Powered Campus Resource Exchange and Asset Management

**COSC 336 — Introduction to Software Engineering · Group 6 · Fall 2026**

Semester project: **Intelligent, AI-Powered Circular Campus Resource Exchange and
Asset Life Cycle Management System**.

The project is an internal university platform for discovering and reusing campus
resources, coordinating authorized transfers, and maintaining asset life-cycle
records. It combines conventional workflows with AI-assisted classification,
matching, recommendations, natural-language assistance, and reporting.

## Start here

- [Read the project brief (PDF)](docs/Project-September2026.pdf)

**Phase 1 — Initial Plan and Requirement Gathering Document, version 1.0**

- [Read the finalized report (PDF)](docs/phase-1/COSC336_Group6_Phase1_v1.0.pdf)
- [Download the editable report (DOCX)](docs/phase-1/COSC336_Group6_Phase1_v1.0.docx)

**Phase 2 — Feasibility Study, version 1.1**

- [Read the finalized report (PDF)](docs/phase-2/COSC336_Group6_Phase2_v1.1.pdf)
- [Download the editable report (DOCX)](docs/phase-2/COSC336_Group6_Phase2_v1.1.docx)

**Phase 3 — Software Requirements Specification, version 1.2**

- [Read the finalized specification (PDF)](docs/phase-3/COSC336_Group6_Phase3_SRS_v1.2.pdf)
- [Download the editable specification (DOCX)](docs/phase-3/COSC336_Group6_Phase3_SRS_v1.2.docx)

**Phases 4–5 — Architecture and Detailed Design, version 1.4**

- [Read the design document (PDF)](docs/phase-4-5/COSC336_Group6_Phase4_5_Design_v1.4.pdf)
- [Download the editable design document (DOCX)](docs/phase-4-5/COSC336_Group6_Phase4_5_Design_v1.4.docx)

PDFs are the reading copies; DOCX files are their editable counterparts.

**Phase 6 — Sequential implementation plan**

Start with [the shared plan](docs/phase-6/README.md), then your assigned task:

1. [Abdulrahman — foundation and catalogue](docs/phase-6/tasks/01-abdulrahman.md)
2. [Ahmed — requests, approval and transfer](docs/phase-6/tasks/02-ahmed.md)
3. [Abi Ali — AI #2 matching and ranking](docs/phase-6/tasks/03-abi-ali.md)
4. [Muhammad Awais — AI #5 generated report and integration](docs/phase-6/tasks/04-muhammad-awais.md)

Each task includes prerequisites, acceptance checks, an AI-assistant starting prompt
and a report/handoff responsibility. [The shared report](docs/phase-6/implementation-report.md)
records the selected scope: C1–C6 and AI #2/#5 only. Other features are deferred.
Part 1 is merged into main; live Supabase acceptance remains pending. Abdulrahman
reported instructor stack approval on 8 November.

## Run the local Parts 1 and 2 implementation

Use Node.js 22 (`npm ci`, then `npm run dev`) and open http://127.0.0.1:5173.
For local database development/testing, start Docker Desktop with WSL integration,
then run `npm run supabase:start`; use `npm run supabase:status`,
`npm run supabase:stop`, or `npm run supabase:reset` as needed. This project-local
Supabase stack is for local development, not deployment. CI validates with GitHub
Actions and does not deploy. No hosted Supabase project is linked or configured, and
no hosted service is deployed. See [setup and verification](docs/phase-6/setup.md).
No Gemini access is needed until the matching/report stages.

Part 2 adds requests, separate reservation/release decisions, scheduling/dispatch,
accepted receipt, disputes/returns and conserved partial quantities. Open **Requests
and transfers** after sign-in. Read [Ahmed's handoff](docs/phase-6/handoffs/02-ahmed.md)
for migrations, synthetic workflow fixtures, native concurrency checks and the
demonstration. Hosted Supabase acceptance remains pending. `npm run test:db` runs
both foundation and workflow checks; `npm run test:db:native` requires a disposable
PostgreSQL test cluster. No shared database reset is needed.

## Repository organization

```text
src/                         React application and shared TypeScript services/types
  assets/branding/           Supplied official logo and source provenance
supabase/
  migrations/                Ordered, additive database schema and business operations
  functions/foundation/      Authenticated account administration gateway
  seed.sql                   Synthetic departments/categories (not login accounts)
scripts/                     Account/workflow seeds, database checks and fixture validation
tests/
  browser/                   Chrome journeys; test adapters are identified in each file
  fixtures/                  Synthetic data and expected workflow quantities
  *.test.ts                  Domain, gateway and workflow client tests
docs/
  phase-1/ ... phase-4-5/     Submitted Word/PDF references, organized by phase
  phase-6/
    README.md                Scope, owner sequence and current progress
    setup.md                 Shared setup and verification commands
    implementation-report.md Shared report with a section for each owner
    tasks/                   Numbered owner assignments
    contracts/               Interfaces and rules later owners must preserve
    handoffs/                What was delivered, tested and left pending
    sources/                 Supplied Phase 6 lab slides
.github/workflows/            Automated formatting, unit/database and build checks
```

Start with `src/App.tsx` and `src/api.ts` for Abdulrahman's foundation, then
`src/WorkflowPanel.tsx` and `src/workflows.ts` for Part 2. Database authority lives
in the two chronological SQL migrations, not in the screen controls. The submitted
documents remain unchanged; earlier revisions remain available in Git history.

`node_modules/`, `dist/`, `test-results/` and `.workflow-validation/` are ignored
local dependencies/outputs, not submission source. Do not put credentials or test
database files in the tracked application folders.

## Formatting and checks

Run `npm run format` to format supported source/configuration/Markdown files and
`npm run format:check` to check them. The check is included in CI. Submitted
Word/PDF/PowerPoint files, credentials, SQL without a configured formatter and
generated/local directories are excluded from automatic formatting.

Run `npm test`, `npm run test:db`, `npm run test:browser` and `npm run build` for
the application checks. Fixture definitions are explained in
[tests/fixtures/README.md](tests/fixtures/README.md); actual execution evidence is
recorded in the owner handoffs, separately from planned test cases.

## Team

- Abi Ali Murtaza Ghadiyali
- Ahmed Mohamed Moustafa Ghandour
- Abdulrahman Feras Junaid
- Muhammad Awais Afzal Mirza
