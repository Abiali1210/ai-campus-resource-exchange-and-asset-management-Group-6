# Foundation account administration function

Part 1 implements authenticated technical account creation and profile/role updates.
Catalogue CRUD uses caller-authorized database RPCs. Classification, embeddings,
matching and generated reporting are not actions in this function. Later owners add
only the selected AI 2 matching and AI 5 reporting capabilities in their own parts.

## Server configuration

The authenticated browser client sends its publishable key in the `apikey` header and
its signed-in user's JWT in `Authorization`. The function uses the publishable key only
for caller-authenticated `/auth/v1/user` and profile RPC requests; the JWT is never
replaced by a secret key.

For hosted Edge Functions, Supabase provides `SUPABASE_SECRET_KEYS` as a JSON map. Set
`SUPABASE_SECRET_KEY_NAME=phase6-provisioner` to select that named server secret; when
the selected entry is unavailable, the function falls back to the map's `default`
entry. A locally served function must use a separate ignored environment file, such
as `.env.functions.local`, containing the local stack's `SUPABASE_URL`,
`SUPABASE_SECRET_KEY`, and `ALLOWED_ORIGINS`. Do not pass the hosted provisioning
`.env.local` to local function serving. The secret initializes a server-only Supabase
JS Admin Auth client used only for Auth user creation and compensating deletion. Never
expose a secret key in browser code, responses, logs, or committed files.

Set `ALLOWED_ORIGINS` to a comma-separated exact frontend-origin list. Local defaults:
`http://localhost:5173,http://127.0.0.1:5173`. Set the actual hosted origin before
serving a deployed frontend. CORS does not replace JWT or record authorization.

After applying the migrations and separately configuring the local secret, use the
Supabase CLI to run the function locally:

```text
npx supabase functions serve foundation --env-file .env.functions.local
```

Keep platform JWT verification enabled. The handler validates the incoming
publishable-key header and separately verifies the caller JWT with
`/auth/v1/user`, obtains the active database profile and assigned roles, and requires
System Administrator. Every profile RPC uses the caller JWT and incoming publishable
key. The server secret is used only by the isolated Auth Admin client. Hosted deployment
and secret configuration remain separate user-approved steps; this function is not
deployed by local tests.

## Request contract

POST `{ "action": "...", "payload": { ... } }` with the signed-in bearer token.

| Action             | Payload                                                                      | Success response |
| ------------------ | ---------------------------------------------------------------------------- | ---------------- |
| adminCreateAccount | email, password (12–128 characters), name, departmentId, roles, operationKey | profile (201)    |
| adminUpdateAccount | userId, name, departmentId, roles, active, operationKey                      | profile          |

The request body is limited to 100 KB. Failures have `{error:{code,message}}` and a
non-2xx status. Raw database/Auth diagnostics, secret keys and passwords are never
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
