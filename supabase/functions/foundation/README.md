# Foundation account administration function

Part 1 implements authenticated technical account creation and profile/role updates.
Catalogue CRUD uses caller-authorized database RPCs. Classification, embeddings,
matching and generated reporting are not actions in this function. Later owners add
only the selected AI 2 matching and AI 5 reporting capabilities in their own parts.

## Server configuration

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`. Keep the private service key server-side. Never put it
in a browser `VITE_*` variable or committed file.

Set `ALLOWED_ORIGINS` to a comma-separated exact frontend-origin list. Local defaults:
`http://localhost:5173,http://127.0.0.1:5173`. Set the actual hosted origin before
serving a deployed frontend. CORS does not replace JWT or record authorization.

After applying the migrations, use the Supabase CLI:

```text
supabase functions serve foundation --env-file .env.local
supabase functions deploy foundation
```

Keep platform JWT verification enabled. The handler additionally verifies
`/auth/v1/user`, obtains the active database profile and assigned roles, and requires
System Administrator. Every profile RPC uses the caller JWT/public project key; the
service key is used only for Auth Admin creation and compensating deletion.

## Request contract

POST `{ "action": "...", "payload": { ... } }` with the signed-in bearer token.

| Action             | Payload                                                                      | Success response |
| ------------------ | ---------------------------------------------------------------------------- | ---------------- |
| adminCreateAccount | email, password (12–128 characters), name, departmentId, roles, operationKey | profile (201)    |
| adminUpdateAccount | userId, name, departmentId, roles, active, operationKey                      | profile          |

The request body is limited to 100 KB. Failures have `{error:{code,message}}` and a
non-2xx status. Raw database/Auth diagnostics, service keys and passwords are never
returned or logged. If transactional profile setup fails after Auth creation, the
handler deletes only that just-created user. If cleanup also fails, an operator must
check both Auth and profile records before retrying. A network failure can make the
commit result uncertain; the handler does not claim that no profile was committed.
An account without a linked active profile has no application scope.

Deactivation/role changes are enforced in database calls even if a browser still has
an older token. Technical administration grants no business approval authority.

## Verification boundary

`tests/gateway.test.ts` tests authentication, role scope, validation, private Auth
administration boundaries, rollback, safe failures, body limits and rejection of AI
actions using mocked HTTP dependencies. These are unit tests, not live deployed
Supabase authentication/provisioning tests. The actual project still needs configuration.

Primary reference: [Supabase authenticated functions](https://supabase.com/docs/guides/functions/auth).
