# Parts 1 and 2 minimum-scope setup

Scope: C1–C6. Part 1 is merged into main; Part 2 is on
`codex/phase6-02-workflows` for review. Commands run from the repository root.

## Get the implementation branch

For a new checkout:

```sh
git clone https://github.com/Abiali1210/ai-campus-resource-exchange-and-asset-management-Group-6.git
cd ai-campus-resource-exchange-and-asset-management-Group-6
```

Main contains Part 1. Part 2 is currently the local review branch
`codex/phase6-02-workflows`; in this checkout use
`git switch codex/phase6-02-workflows`. A fresh clone of main includes only the
merged work until Part 2 is explicitly published/merged. Preserve local edits
before switching branches. Review the matching handoff before applying migrations.

## Preview

With Node.js 22, run `npm ci` then `npm run dev` from the repository root. Open
http://127.0.0.1:5173. Without credentials this is an explicitly read-only,
synthetic catalogue, not simulated authentication or successful writes.

For local Supabase development/testing, start Docker Desktop with WSL integration,
then run `npm run supabase:start`. The project-local CLI and stack are for local use;
they are not deployment. No hosted Supabase project is currently linked/configured.

## Actual Supabase setup

1. Create a synthetic coursework Supabase project; no paid upgrade is required by
   this guide. Copy `.env.example` to untracked `.env.local`.
2. Set the public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values. Separately
   set `SUPABASE_URL`, `SUPABASE_ANON_KEY` and private `SUPABASE_SERVICE_ROLE_KEY`
   for provisioning. Never prefix a service secret with VITE_.
3. Use your own Supabase CLI account and review the selected project before changes:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

   Apply pending core/workflow migrations from the reviewed branch. Do not reset a shared project. Local Docker/Supabase
   is available for development/testing using `npm run supabase:start`; it is not a
   substitute for hosted acceptance checks.

4. Set a strong local-only `DEMO_ACCOUNT_PASSWORD` of at least 16 characters and
   `CONFIRM_SYNTHETIC_SEED=yes`, then run `npm run seed:accounts`.
   This script creates real synthetic Auth accounts, maps profile IDs, provisions
   the first technical administrator and seeds the catalogue. It prints emails and
   roles, not passwords. Existing records are preserved. It is written but has not
   been executed against a hosted project.
5. Set the server `ALLOWED_ORIGINS` to the exact frontend origins, then run
   `npx supabase functions deploy foundation`. Keep JWT verification enabled.
   The current function is **account administration only**. Supabase supplies its
   server connection/service secrets; do not upload a mixed browser/server environment
   file blindly or expose the service key in the frontend.
6. Restart the frontend after editing its environment. Sign in using the provisioned
   synthetic accounts and your local demo password.
7. For Part 2 demonstration records, run `npm run seed:workflows` after applying
   the workflow migration and provisioning accounts. Existing records are preserved.
   Follow [Part 2's handoff](handoffs/02-ahmed.md) for native race tests, fixture
   limitations, contracts and the full four-role walkthrough.

Part 1 needs **no Gemini key, embedding model, pgvector, file bucket or provider trial**.
Abi Ali adds the configuration/migration for AI #2 later; Awais adds AI #5 later.

## Verification

Run `npm test`, `npm run test:db`, `npm run test:browser`, `npm run build`,
and `python3 scripts/validate-foundation-fixture.py`.
Browser tests require an installed Chrome. Database checks use actual PostgreSQL
functions/constraints in PGlite with a minimal Auth adapter, not hosted Supabase.

Before handing off, verify actual login/logout, inactive and wrong-role/department
denials, registration, publication/withdrawal, the four filters and audited changes.
No hosted Auth, account provisioning, cloud deployment or live service result is
claimed by local tests.

Primary references:
[Supabase functions authentication](https://supabase.com/docs/guides/functions/auth),
[database migrations](https://supabase.com/docs/guides/deployment/database-migrations).
