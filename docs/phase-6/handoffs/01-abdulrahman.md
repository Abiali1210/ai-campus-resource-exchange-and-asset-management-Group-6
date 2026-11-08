# Part 1 progress — Abdulrahman

Branch: `codex/phase6-01-foundation`. Status: source narrowed to C1–C3 and audit
groundwork; local checks passed; live configuration/human review pending.
The implementation is shared on this branch for draft review; it is not merged
into main or an accepted live-service handoff.
Instructor stack approval was reported by Abdulrahman on 8 November 2026.

## Scope

Login/accounts/roles/departments, conventional registration, publication/withdrawal,
keyword/category/condition/department filtering, guarded portions and actor/time/change
history. Server authorization and technical/business separation remain enforced.

Classification, embeddings, uploaded files, assistant, sustainable-action advice,
maintenance, end-of-life, notifications, dashboards and reports were removed from the
active Part 1 after the user's scope correction. Earlier work was preserved in a
local, unpublished snapshot under `.design-build/`; do not use it as the active task.

## Setup and evidence

See [setup](../setup.md), [contracts](../contracts/part-1-foundation.md) and the task.
The user has no configured Supabase project yet. Actual Auth provisioning and hosted
deployment are pending. No Gemini setup is needed for this part.

Run:
```text
npm ci
npm run dev
npm test
npm run test:db
npm run test:browser
npm run build
python scripts/validate-foundation-fixture.py
```

Observed narrowed-scope results: production build passed; 20 unit tests passed
(8 domain, 12 account gateway); 16 core PostgreSQL integration checks passed;
6 Chrome flows passed (5 mocked service flows and 1 credential-free preview).
The fixture integrity check also passed. Local HTTP mocks and the PostgreSQL Auth
adapter are not live-service evidence. No removed AI/file tests are counted.

## Next handoff

Before Ahmed starts: configure the project, apply the core migration, provision
synthetic accounts and verify real sign-in, deactivation/role changes, unauthorized
direct requests, catalogue operations and audit. Record tested revision/reviewer.

Ahmed adds C4–C6 via additive migrations and ordinary workflows, preserving
quantity conservation, no self-approval, distinct release and accepted-receipt custody.
Abi Ali implements AI #2 only. Awais implements AI #5 only and final integration.
