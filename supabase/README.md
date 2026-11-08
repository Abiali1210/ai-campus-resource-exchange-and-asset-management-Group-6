# Supabase core foundation

Part 1 implements accounts, role enforcement, departments, assets, publication,
keyword/category/condition/department search and auditable catalogue changes. The
foundation migration supports C1–C3. The additive
`202611090001_workflows.sql` implements C4–C6 requests, approvals, transfers,
receipt/dispute/return, quantities and history. See
[Part 2 contracts](../docs/phase-6/contracts/part-2-workflows.md).

AI feature 2 (matching/ranking) belongs to Abi Ali's later part and AI feature 5
(generated reports) belongs to Awais. No classification, assistant, sustainable-action,
embedding/vector, uploaded-file or notification implementation is included here.

`seed.sql` inserts synthetic departments and categories only. It contains no login
passwords or fake authentication sessions. Use the repository's explicit synthetic
account provisioning instructions after applying the migration to the intended project.

## Setup boundary

Apply the migration using the team's reviewed Supabase CLI workflow. A separately
installed CLI plus Docker can run a disposable local project with `supabase start`
and `supabase db reset`. Never reset a shared/live project. Hosted migration and
Edge deployment require an explicitly selected authorized project. See the root
README for application configuration and synthetic account provisioning.

## Access and data rules

- Ordinary clients have no direct table access. RPCs return caller-scoped projections,
  so marketplace users cannot obtain financial fields from raw asset rows.
- Every callable business RPC checks the authenticated subject, active profile,
  department and assigned roles. Hiding a button is not authorization.
- Nine existing SRS role keys remain distinct. The required requester, custodian and
  technical administrator functions are implemented. Technical administration grants
  no implicit business approval or asset-publication authority.
- `save_asset` registers assets and edits metadata. `set_publication` publishes or
  withdraws eligible stock without central preapproval. Ordinary catalogue editing
  cannot rewrite tracked quantity, formal custody or assessed condition.
- Deferred constraints preserve total active stock and homogeneous leaf portions.
  Part 2 must split stock and update allocations in one transaction, preserving the
  same conservation rules rather than granting direct mutations to browser clients.
- Operation keys are unique per caller; retrying the same operation returns its
  result while reusing a key for different input is a conflict. Expected versions
  prevent stale edits and lost updates.
- Mutations and actor/time/before/after audit evidence commit together. Ordinary
  roles cannot alter audit records. Committed events are retained as workflow
  evidence without implementing notifications.
- `bootstrap_administrator` is service-role-only and atomically establishes the
  initial administrator profile, role and audit record. Later account changes use
  the authenticated technical administrator's `save_profile` RPC. Service credentials
  must never be placed in browser/Vite configuration.

## RPC contract

The application calls `foundation_bootstrap`, `search_assets(p_filters)`,
`asset_detail(p_asset_id)`, `save_asset(p_input)`,
`set_publication(p_asset_id,p_expected_version,p_publish,p_operation_key)`,
`save_department(p_input)`, `save_profile(p_input)` and `list_asset_audit(p_asset_id)`.
`asset_access(p_asset_id,p_write)` provides caller-scoped permission checks. The
provisioning script alone uses service-only `bootstrap_administrator(p_input)`.

## Verification

Run `npm run test:db`. Sixteen foundation and 23 workflow PostgreSQL/PGlite checks execute
the actual migrations with a minimal Auth schema adapter. They cover scoped grants and
roles, protected financial projection, validation, optimistic versions/idempotency,
conserved batch quantities, immutable audit and supported synthetic seed payloads.
`npm run test:db:native` runs the 23 workflow checks and four true overlapping-session
checks against fresh databases in a disposable native PostgreSQL cluster. See the
[handoff](../docs/phase-6/handoffs/02-ahmed.md) for configuration and actual results.

These are not live Supabase tests. Actual JWT verification, Auth Admin provisioning
and hosted Edge account administration require configured services and separate
integration evidence. The suite does not claim hosted deployment or measured capacity.
