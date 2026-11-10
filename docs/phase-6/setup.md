# Parts 1 and 2 Phase 6 setup

Scope: Part 1 C1–C3 and Part 2 C4–C6 on `codex/phase6-02-workflows`.
This guide distinguishes the existing shared hosted foundation, the pending Part 2
database upgrade and isolated local tests. AI #2/#5 remain later-owner work.
Commands run from the repository root. This merge updates the feature branch only;
it does not merge the feature branch into main or deploy its database changes.

## Shared hosted project

The user-created Free project is `campus-exchange-group6-dev` (ref
`gcctwsxullabhkddbzgo`), on PostgreSQL 17.11. The initial migration
`202611080001` is already applied. Synthetic provisioning has already created 12 Auth
users/profiles, 2 departments, 3 categories, 6 assets/stock portions, and 23 audit
rows, according to the incoming Part 1 provisioning record. The workflow migration
`202611090001` and its financial redaction correction `202611090002` have not been
applied or verified on the hosted project by this work. Do not rerun the
foundation migration or account provisioning for a new checkout. The project owner
selected the Free plan; collaborators should review current usage and plan terms with
the owner rather than assume limits or upgrade the project.

## Run the app

Use Node 22, run `npm ci`, copy `.env.example` to ignored `.env.local`, set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then run `npm run dev` and
open http://127.0.0.1:5173. The browser uses only the publishable key. Never put a
secret key in a `VITE_` variable, browser code, or a client build. `.env.local` is
git-ignored; do not commit or share its contents.

`npm run seed:accounts` reads `.env.local`; its `SUPABASE_URL` selects the database it
will write to. The current file targets the shared hosted project, so this command is
a hosted Auth/data mutation—not a local test. Do not rerun it for this project or use
`.env.local` with a locally served Edge Function.

All synthetic accounts use the same synthetic demo password. It is not recorded in
this repository; obtain it through an approved private channel and keep it out of Git.
Short sign-in aliases are:

| Synthetic role/department            | Sign-in email        |
| ------------------------------------ | -------------------- |
| System administrator — Engineering   | `admin@demo.test`    |
| Requester — Engineering              | `req-eng@demo.test`  |
| Requester — Science                  | `req-sci@demo.test`  |
| Representative — Engineering         | `rep-eng@demo.test`  |
| Representative — Science             | `rep-sci@demo.test`  |
| Business administrator — Engineering | `biz-eng@demo.test`  |
| Maintenance — Engineering            | `maint@demo.test`    |
| Facilities — Engineering             | `fac@demo.test`      |
| Procurement — Engineering            | `proc@demo.test`     |
| Finance — Engineering                | `fin@demo.test`      |
| Sustainability — Engineering         | `sust@demo.test`     |
| Inactive requester                   | `inactive@demo.test` |

To verify the alias locally, sign out and sign in again as `admin@demo.test` using the
same shared synthetic demo password. Successful local sign-in and provisioning checks
are not full live acceptance.

## Part 2 upgrade and workflow fixtures

The feature branch adds `202611090001_workflows.sql` and the additive security fix
`202611090002_workflow_financial_redaction.sql`; both preserve the already
applied foundation migration and existing data. The correction removes restricted
cost fields from transfer/history responses without rewriting stored audit records.
Apply it after the workflow migration, including on databases that already have
workflow data. Before using **Requests and transfers** against the shared project,
the project owner must review the pending migrations and
their exact target. A schema-cache/missing-RPC error means the workflow upgrade is
not yet available; it is not an instruction to reset or reseed the shared project.

```sh
npx supabase db push --dry-run --remote
```

After separately approved review, the owner can apply the pending migration with
`npx supabase db push --remote`. Do not apply schema changes as part of resolving
Git conflicts. This merge does not perform hosted writes.

For an explicitly authorized synthetic fixture run after that migration, configure
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, the existing `DEMO_ACCOUNT_PASSWORD` and
`CONFIRM_SYNTHETIC_SEED=yes`, then run `npm run seed:workflows`. This signs into the
existing `rep-eng`, `rep-sci`, `req-sci` and `fac` aliases and creates demonstration
business records through ordinary RPCs. It does not need a secret key or reprovision
accounts. Existing recipes are preserved; interrupted recipes need manual review.
Never treat a hosted workflow seed as a read-only test.

See [Part 2 contracts](contracts/part-2-workflows.md) and
[handoff](handoffs/02-ahmed.md) for operation inputs, test evidence and the four-role
walkthrough. Without backend configuration the app still offers only its read-only
catalogue preview. Test-only Auth adapters are not real sign-in sessions.

## Local Supabase only

Docker Desktop with WSL integration is needed only for the local stack. The project
CLI is installed locally; use `npm run supabase:start`, `npm run supabase:status`, and
`npm run supabase:stop`. Local CLI config targets PostgreSQL 17. This stack is separate
from the shared hosted project and is not deployment. `npm run supabase:reset` is
destructive to local database state; do
not use reset or destructive seed operations casually, and never point a reset at a
shared project.

## Fresh project only: migrations and provisioning

The commands below are **not needed for the shared project**. Use them only for a
separate, fresh project explicitly intended for synthetic coursework. Confirm the
project ref and plan with its owner. After user CLI login and linking the exact target,
review the remote dry-run before any schema change:

```sh
npx supabase login
npx supabase link --project-ref YOUR_FRESH_PROJECT_REF
npx supabase db push --dry-run --remote
```

Only after separate migration review and approval, apply migrations with
`npx supabase db push --remote`. Never reset the shared project. For provisioning on
that separately approved fresh project, set `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, and private `SUPABASE_SECRET_KEY` in ignored `.env.local`,
plus `DEMO_ACCOUNT_PASSWORD` (at least 12 characters) and
`CONFIRM_SYNTHETIC_SEED=yes`; then run `npm run seed:accounts` only for that fresh
project. This creates Auth accounts and fixture data using real hosted writes. The
script preserves existing accounts/records; it is not a routine checkout or test
command. The publishable key is public; the secret key is server-only and must never
be exposed or committed.
After all three migrations and account provisioning on that fresh project, explicitly
authorized workflow sample creation uses `npm run seed:workflows` as described above.

## Edge Function and Cloudflare

The account-administration Edge Function is deployed to the shared project.
The authenticated browser sends its publishable key in `apikey` and its user JWT in
`Authorization`; the function keeps them separate. Hosted Edge runtime reads
`SUPABASE_SECRET_KEYS`. The shared project has a Secret API key named `default`, which
the function selects by default; no selector environment variable is required for this
project. `SUPABASE_SECRET_KEY_NAME` is an optional override for projects deliberately
using a different named secret, and the code falls back to `default`. Locally, serve
the function only with a separate ignored environment file (for example,
`.env.functions.local`) whose `SUPABASE_URL` and `SUPABASE_SECRET_KEY` both belong to
the local Supabase stack; set the local `ALLOWED_ORIGINS` there too. Never pass the
hosted `.env.local` to local function serving. The server secret is used only by the
function's Supabase JS Admin Auth client. The current hosted origins are configured.
Any future secret/origin changes or function redeployment require separate review and
explicit approval.

Cloudflare Pages remains the frontend deployment target. Supabase URL and publishable
key variables are configured for Production; Preview remains synthetic and unconfigured.
Only the project URL and publishable key belong in frontend build settings—never the
secret key. GitHub Actions performs validation only; it does not deploy.

## Checks

Run `npm test`, `npm run test:db`, `npm run test:browser`, `npm run build`,
`npm run format:check`, and
`python3 scripts/validate-foundation-fixture.py`. Browser tests require Chrome; database
checks use PGlite with a minimal Auth adapter, not the hosted project. Hosted schema,
Auth, function, and frontend acceptance remains distinct from local checks.
For native workflow/concurrency checks, use a disposable PostgreSQL cluster with
`POSTGRES_TEST_ADMIN_URL` and `npm run test:db:native`; never use the shared hosted
project as a test-runner database.
