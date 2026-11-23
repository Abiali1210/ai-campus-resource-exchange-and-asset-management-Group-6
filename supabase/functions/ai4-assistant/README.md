# ai4-assistant — campus assistant (AI #4)

Answers plain-language questions using only records the signed-in user can
already see. It never changes data.

## What it does

| Question type                       | Result                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------- |
| "Any projectors in Engineering?"    | Lists every matching catalogue item (first 10) with **View / Request this** |
| "What's the status of my requests?" | Shows the user's own requests with remaining quantities                     |
| "I need 4 chairs for a lab"         | Returns a **draft** that opens the normal request form                      |
| "Approve my reservation"            | Refused without calling Gemini; links to the workflow page                  |
| Anything the records can't answer   | "I don't know …" with a pointer to search                                   |

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
- **Item searches are deterministic.** For `find_items` Gemini only describes the
  search (`search.keywords`, and `search.departmentName` when the user named a
  department). `handler.ts` filters the whole caller-scoped catalogue (name,
  description, category, tags; singular/plural insensitive), sorts by name, and
  writes the sentence itself, so the count always equals the listed records and
  the same question always lists the same records. A department filter applies
  only when the question names it. The model's own item picks and answer text
  are not shown.
- **Request status.** Gemini selects permitted request references, but its status
  prose is replaced with a neutral introduction. The request cards display the
  database status and quantities. An empty selection cannot claim there are no
  requests when the supplied context contains requests. Failed or malformed
  workspace reads return the existing context error instead of an empty list.
- **No actions.** Imperative commands (approve, reserve, transfer, dispose, …)
  are refused deterministically. Drafts are only pre-filled into the normal form;
  the user reviews and clicks Submit, so normal validation and approval apply.
- **Retry.** A Gemini 5xx (usually `503 UNAVAILABLE`, "model overloaded") is
  retried once after 0.8 s inside the same 20 s budget. Quota (429),
  configuration errors and timeouts are not retried. Retries and final error
  codes are logged (`ai4 provider retry cause=…`, `ai4 provider outcome=error …`).
- **Fallback.** Timeouts (20 s), quota and provider errors return an error code;
  the UI says the assistant is unavailable, offers **Try again** for transient
  codes, and points to the normal screens.

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

Hosted version 4 (checked 22 November) predates `main`: it lacks the 20 November
request-status and lookup-failure fixes as well as the 22 November retry and
deterministic item search (Phase 6 polish). All of them need one redeployment and
hosted verification.
Merging the frontend PR does not update the hosted Edge Function.

```bash
npx supabase functions deploy ai4-assistant --project-ref <project-ref>
```

Set `ALLOWED_ORIGINS` if the frontend runs anywhere other than
`http://localhost:5173` / `http://127.0.0.1:5173`.

## Known limitations

- The catalogue sample sent to Gemini is capped at 60 published items and 30
  requests; item searches run over the whole caller-scoped catalogue (up to 2,000
  records). Keyword matching is literal: a synonym the records never use (for
  example "beamer") finds nothing unless Gemini maps it to a record word.
- No chat memory: each question is answered on its own.
- Policy guidance and sustainability questions (FR-ASSIST-001) are not supported;
  they get "I don't know".
- Live Gemini was checked with five questions on one business-admin account that
  has no requests, so a request-status answer with real requests is still untested.
