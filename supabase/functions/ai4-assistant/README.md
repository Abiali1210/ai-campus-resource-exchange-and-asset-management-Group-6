# ai4-assistant — campus assistant (AI #4)

Answers plain-language questions using only records the signed-in user can
already see. It never changes data.

## What it does

| Question type                       | Result                                                          |
| ----------------------------------- | --------------------------------------------------------------- |
| "Any projectors in Engineering?"    | Lists up to 5 real catalogue items with **View / Request this** |
| "What's the status of my requests?" | Shows the user's own requests with remaining quantities         |
| "I need 4 chairs for a lab"         | Returns a **draft** that opens the normal request form          |
| "Approve my reservation"            | Refused without calling Gemini; links to the workflow page      |
| Anything the records can't answer   | "I don't know …" with a pointer to search                       |

## Safety rules (checked in `handler.ts`, covered by `tests/ai4-assistant.test.ts`)

- **Caller-scoped data.** Reads use the caller's JWT (`search_assets`,
  `workflow_workspace`, `foundation_bootstrap`), so database permissions decide
  what Gemini sees. No service-role key.
- **Data minimization.** Only name, description, category, condition,
  department, location and quantity are sent. No unit values, costs or asset ids.
- **Grounding guard.** Every item/request the model references must be in the
  supplied context. The answer text may not contain identifiers, and its numbers
  must come from the question or the referenced records. Otherwise the reply
  becomes "I don't know" (`grounded: false`).
- **Request status.** Gemini selects permitted request references, but its status
  prose is replaced with a neutral introduction. The request cards display the
  database status and quantities. An empty selection cannot claim there are no
  requests when the supplied context contains requests. Failed or malformed
  workspace reads return the existing context error instead of an empty list.
- **No actions.** Imperative commands (approve, reserve, transfer, dispose, …)
  are refused deterministically. Drafts are only pre-filled into the normal form;
  the user reviews and clicks Submit, so normal validation and approval apply.
- **Fallback.** Timeouts (20 s), quota and provider errors return an error code;
  the UI says the assistant is unavailable and points to the normal screens.

## Request / response

`POST /functions/v1/ai4-assistant` with `{ "question": "..." }` (max 500 chars),
headers `Authorization: Bearer <user JWT>` and `apikey: sb_publishable_…`.

Response: `{ intent, answer, grounded, items[], requests[], draft, model }` or
`{ error: { code } }` where code is `timeout | quota | provider | unconfigured | context`.

## Deploy

Deployed to the shared hosted project on 19 November 2026 (recorded version 4,
`verify_jwt` on). The function logs Gemini's HTTP status, latency and, on failure,
Google's error code (such as `RESOURCE_EXHAUSTED`); it never logs the key, the
prompt or the answer. Uses the same `GEMINI_API_KEY` secret as `ai5-generate`; no new
secret is needed. To redeploy after changes:

The 20 November request-status and lookup-failure fixes have passed local mocked
regression checks; they still need a function redeployment and hosted verification.
Merging the frontend PR does not update the hosted Edge Function.

```bash
npx supabase functions deploy ai4-assistant --project-ref <project-ref>
```

Set `ALLOWED_ORIGINS` if the frontend runs anywhere other than
`http://localhost:5173` / `http://127.0.0.1:5173`.

## Known limitations

- The catalogue context is capped at 60 published items and 30 requests. A larger
  catalogue would need a keyword or embedding pre-filter (AI #2 embeddings could
  be reused).
- No chat memory: each question is answered on its own.
- Policy guidance and sustainability questions (FR-ASSIST-001) are not supported;
  they get "I don't know".
- Live Gemini was checked with five questions on one business-admin account that
  has no requests, so a request-status answer with real requests is still untested.
