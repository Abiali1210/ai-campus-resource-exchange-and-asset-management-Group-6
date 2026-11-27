# AI Circular Campus Resource Exchange

Campus departments often have usable equipment that another department needs, but no shared way to find it and coordinate its handoff. This project provides a role-based campus resource catalogue and AI-assisted workflows for requesting, approving, transferring, and tracking assets.

[Open the live prototype](https://ai-campus-exchange-g6.pages.dev/)

## What it does

- **Discover:** Register and publish assets, browse the catalogue, and track condition and availability.
- **Coordinate:** Submit requests and manage interest, approvals, reservations, dispatch, receipt, disputes, and returns.
- **Assist:** AI supports resource matching, campus questions, and report summaries. Its output is advisory; it does not authorize users, approve transfers, or calculate authoritative report values.
- **Account for activity:** Review asset and transfer history, role-scoped reports, and CSV exports.

PostgreSQL policies, migrations, and database operations are authoritative for permissions, quantities, workflow transitions, and audit history. Human users make approval and review decisions. Interface visibility and AI suggestions do not replace those decisions.

## Stack

| Area              | Technology                                                    |
| ----------------- | ------------------------------------------------------------- |
| Frontend          | React, TypeScript, Vite                                       |
| Data and identity | Supabase PostgreSQL and Auth; Supabase Edge Functions         |
| AI                | Gemini; `gte-small` embeddings                                |
| Hosting           | Cloudflare Pages                                              |
| Tests             | Vitest, Playwright, PostgreSQL (including PGlite test suites) |

## Quick start

Requires Node.js 22.

```bash
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. With no environment configuration, the app starts in a local read-only synthetic preview. To connect a local frontend to Supabase, copy `.env.example` to `.env.local` and configure only browser-safe values. Never put service-role keys, database passwords, provider keys, or other secrets in `VITE_` variables or commit them. See the [setup guide](docs/phase-6/setup.md) before configuring services or running database operations.

Useful checks:

```bash
npm test              # Vitest unit and component tests
npm run test:db       # PGlite database suites
npm run test:db:native # Native PostgreSQL checks; requires the documented setup
npm run test:browser  # Playwright journeys; requires the documented setup
npm run build         # Type check and production build
```

## Project documents

| Phase | Document                            | Files                                                                                                                                                                                       |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Initial project plan                | [PDF](docs/phase-1/COSC336_Group6_Phase1_v1.0.pdf) · [Editable DOCX](docs/phase-1/COSC336_Group6_Phase1_v1.0.docx)                                                                          |
| 2     | Feasibility study                   | [PDF](docs/phase-2/COSC336_Group6_Phase2_v1.1.pdf) · [Editable DOCX](docs/phase-2/COSC336_Group6_Phase2_v1.1.docx)                                                                          |
| 3     | Software Requirements Specification | [PDF](docs/phase-3/COSC336_Group6_Phase3_SRS_v1.2.pdf) · [Editable DOCX](docs/phase-3/COSC336_Group6_Phase3_SRS_v1.2.docx)                                                                  |
| 4–5   | Architecture and detailed design    | [PDF](docs/phase-4-5/COSC336_Group6_Phase4_5_Design_v1.4.pdf) · [Editable DOCX](docs/phase-4-5/COSC336_Group6_Phase4_5_Design_v1.4.docx)                                                    |
| 6     | Implementation                      | [Report](docs/phase-6/COSC336_Group6_Phase6_Implementation_Report_v2.0.docx) · [Presentation](docs/phase-6/COSC336_Group6_Phase6_Presentation.pptx)                                         |
| 7     | Testing                             | [Report PDF](docs/phase-7/COSC336_Group6_Phase7-testing-report-v1.2.pdf) · [Editable DOCX](docs/phase-7/COSC336_Group6_Phase7-testing-report-v1.2.docx) · [Results](docs/phase-7/README.md) |


## Repository map

```text
.
├── .github/workflows/       # CI/CD automated validation and database checks
├── docs/
│   ├── phase-1/             # Initial plan and requirements
│   ├── phase-2/             # Feasibility study
│   ├── phase-3/             # Software Requirements Specification
│   ├── phase-4-5/           # Architecture and detailed design
│   ├── phase-6/             # Implementation report and presentation
│   └── phase-7/             # Testing report and evidence overview
├── scripts/                 # Database checks and explicit data utilities
├── src/                     # React application and domain helpers
│   ├── assets/              # Branding and interface artwork
│   ├── api.ts               # Supabase client operations
│   └── App.tsx              # Application shell and role workspaces
├── supabase/
│   ├── functions/           # Authenticated Edge Functions
│   ├── migrations/          # Ordered schema and business operations
│   └── seed.sql             # Synthetic departments and categories
├── tests/
│   ├── browser/             # Playwright user journeys
│   ├── fixtures/            # Synthetic fixtures and expected quantities
│   └── *.test.ts            # Unit, component, and gateway tests
├── package.json             # npm Commands and dependencies
└── README.md                # Project entry point
```