# Part 1 core foundation contracts

Owner: Abdulrahman. Scope: C1–C3 plus C6 audit groundwork. Follow the
[minimum plan](../README.md), not the full semester feature list.
React/TypeScript + Supabase approval was reported by Abdulrahman on 8 November 2026.

## Shared data and rules

- UUID entity IDs, UTC audit timestamps and positive integer quantities.
- Nine role keys are retained from the design; no new specialist screens are added.
  Requester, Representative/Custodian and technical administrator are the primary
  Part 1 paths. Technical authority is not business approval authority.
- Department/Profile/UserRole/Category/Asset/StockPortion/AuditLog are the foundation.
- One Asset has active leaf StockPortions whose quantities sum to totalQty.
  Individual tracking has quantity one. Owner department, custodian, location,
  condition and state live on the portion.
- State names retain the SRS vocabulary for compatibility and safety. Their presence
  does not implement maintenance, disposal or other deferred workflows.
- Current catalogue writes cannot change allocated stock or silently alter existing
  quantity, custody or assessed condition. Ahmed adds workflow-specific transactions.
- Direct table access is denied to ordinary callers. Use authenticated, caller-scoped
  RPCs; do not trust a browser-supplied role/department as authorization.
- Mutations commit audit with source data. Use expected versions and stable operation
  keys to reject stale/duplicate changes. An audit integration event is not a notification.

## Current operations

| RPC or service                                        | Purpose                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| foundation_bootstrap                                  | Active caller, permitted departments/categories and scoped profiles           |
| search_assets(p_filters)                              | Permitted catalogue projection; keyword/category/condition/department filters |
| asset_detail(p_asset_id)                              | Asset plus permitted actor/time/change history                                |
| save_asset(p_input)                                   | Representative's validated conventional registration/metadata update          |
| set_publication(asset,version,publish,operationKey)   | Authorized publish/withdraw with state/quantity guards                        |
| save_department(p_input)                              | Technical administrator department management                                 |
| save_profile(p_input)                                 | Audited technical account/profile/role activation changes                     |
| bootstrap_administrator(p_input)                      | Service-only first-admin setup; no browser access                             |
| foundation Edge adminCreateAccount/adminUpdateAccount | Verified technical admin Auth provisioning/updates with cleanup               |

Typed failures distinguish Unauthorized, Forbidden, Validation and Conflict.
Client forms preserve entered data on failure. Business authorization runs in the
database; hidden buttons are only a convenience.

The current edge gateway has **no AI action**. Part 3 adds matching/model/embedding
records and caller-scoped AI #2; Part 4 adds AI #5 and its calculated report snapshot.
No classification, private-file, assistant, advice, notification or dashboard contract
is implemented in this part.

## Fixtures and handoff

`tests/fixtures/foundation.json` is synthetic domain data, not authentication.
Provisioning creates/maps actual test users without committed passwords.
See [setup](../setup.md) and [progress](../handoffs/01-abdulrahman.md) for current
commands, real verification limits and live work still pending.
