# AI-Powered Campus Resource Exchange and Asset Management

**COSC 336 - Introduction to Software Engineering, Group 6, Fall 2026**

An internal university platform for discovering and reusing campus resources,
coordinating authorized transfers, and maintaining auditable asset life-cycle
records. Deterministic business rules protect inventory and permissions while AI
assists with matching, campus questions, and report summaries.

[Open the live prototype](https://ai-campus-exchange-g6.pages.dev/)

## Phase 7 testing follow-up

**27 November: browser 29/30 passed; hosted scenarios 7/8 passed.**
The current [testing report and findings](docs/phase-7/README.md) include the
unresolved validation-message assertion and empty AI matching result. These are
recorded failures, not an all-pass or human acceptance sign-off.

## Submitted Phase 6 deliverables — start here

**Submitted versions confirmed by Abdulrahman on 23 November 2026.**

| Open this                                                                                              | Purpose                                                  |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| **[Submitted report v2.0 — Word](docs/phase-6/COSC336_Group6_Phase6_Implementation_Report_v2.0.docx)** | Exact submitted report; supersedes earlier report drafts |
| **[Submitted presentation](docs/phase-6/COSC336_Group6_Phase6_Presentation.pptx)**                     | Exact submitted slide deck                               |
| **[Four-person demo guide](docs/phase-6/demonstration-guide.md)**                                      | Rehearsal steps and explanations for each teammate       |
| **[Submission record and rehearsal checklist](docs/phase-6/submission-checklist.md)**                  | What is archived and what the team should practise       |

The submitted files are preserved without content changes. Supporting Markdown
notes are not the source of the submitted Word report. Older v1.0 DOCX/PDF files
remain as earlier repository versions and are **not** the submitted v2.0 report.
See the [archive verification record](docs/phase-6/evidence/submission/verification.md)
for exact file checksums and evidence boundaries.

## Current Prototype

The application includes:

- Authentication, departments, roles, and server-side authorization.
- Asset registration, publication, catalogue search, and condition tracking.
- Requests, supplier interest, approval, reservation, dispatch, receipt, disputes,
  returns, and append-only workflow history.
- AI-assisted resource matching with deterministic eligibility and human approval.
- Database-calculated reports with reviewed AI-written summaries.
- A caller-scoped campus assistant and activity reporting with CSV export.

The shared environment contains synthetic accounts and catalogue data. AI features
are advisory: they do not bypass authorization, approve transfers, or calculate
authoritative report facts.

## Quick Start

Use Node.js 22:

```bash
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. Without environment configuration, the application
opens an explicitly read-only synthetic preview.

For a configured frontend, copy `.env.example` to an ignored local environment file
and set only the browser-safe values:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Never place a service-role key, database password, provider key, or other server
secret in a `VITE_` variable or commit it to Git.

### Local Supabase

Docker Desktop with WSL integration is required for the disposable local stack:

```bash
npm run supabase:start
npm run supabase:status
npm run supabase:stop
```

`npm run supabase:reset` is for the disposable local stack only. Never reset or
reseed the shared hosted project. Read the [Phase 6 setup guide](docs/phase-6/setup.md)
and [Supabase notes](supabase/README.md) before migrations, account provisioning,
seeding, or Edge Function deployment.

Cloudflare deploys the frontend separately from Supabase migrations and Edge
Functions. A successful frontend build does not establish that backend changes are
deployed.

## Checks

```bash
npm test                 # TypeScript unit and component tests
npm run test:db          # PGlite database suites
npm run test:db:native   # Disposable native PostgreSQL checks
npm run test:browser     # Playwright journeys
npm run build            # Type checking and production build
npm run format:check     # Formatting verification
```

Native database and browser checks have additional environment requirements. See
the [Phase 6 setup guide](docs/phase-6/setup.md) and
[fixture documentation](tests/fixtures/README.md).

## Repository Map

```text
.
|-- src/                         React application and domain helpers
|   |-- assets/                  Branding and interface artwork
|   |-- App.tsx                  Application shell and role workspaces
|   `-- api.ts                   Supabase client operations
|-- supabase/
|   |-- migrations/              Ordered schema and business operations
|   |-- functions/               Authenticated Edge Functions
|   `-- seed.sql                 Synthetic departments and categories
|-- scripts/                     Database checks and explicit data utilities
|-- tests/
|   |-- browser/                 Playwright user journeys
|   |-- fixtures/                Synthetic fixtures and expected quantities
|   `-- *.test.ts                Unit, component, and gateway tests
|-- docs/
|   |-- phase-1/                 Initial plan and requirements
|   |-- phase-2/                 Feasibility study
|   |-- phase-3/                 Software Requirements Specification
|   |-- phase-4-5/               Architecture and detailed design
|   `-- phase-6/                 Implementation report and presentation
|-- .github/workflows/           Automated validation and database checks
|-- package.json                 Commands and dependencies
`-- README.md                    Project entry point
```

PostgreSQL migrations and RPCs are authoritative for permissions, quantities, state
transitions, and audit evidence. UI visibility is not an authorization boundary.

## Project Documents

- **Submitted Phase 6 report:** [Word v2.0](docs/phase-6/COSC336_Group6_Phase6_Implementation_Report_v2.0.docx).
- **Submitted Phase 6 presentation:** [PowerPoint](docs/phase-6/COSC336_Group6_Phase6_Presentation.pptx).
- [Demo guide](docs/phase-6/demonstration-guide.md) and [submission record](docs/phase-6/submission-checklist.md).
- [Phase 6 scope and historical planning](docs/phase-6/README.md).

The older v1.0 report and PDF are retained for history. A PDF of submitted v2.0
has not been generated or assumed equivalent to the older PDF.
