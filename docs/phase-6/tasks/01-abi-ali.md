# Part 1 — Abi Ali — foundation, catalogue and classification

**Order: first.** Read [the shared plan](../README.md) before implementation.
Status: not started. Intended owner: Abi Ali Murtaza Ghadiyali.

## Start here

Use the current remote main on a task branch, preserving unrelated local edits.
Read the SRS role matrix and design v1.4 Sections 3–7 and 10–11. Check TBD-001
language approval first. If confirmation is missing, record it and ask the member;
continue stack-independent data/contracts/test-data preparation while waiting.
Do not claim a previous report grade establishes language approval.

## Build

- [ ] Reproducible application setup and dependency lockfile; layered service/domain
      classes and reusable screens/navigation without implementing later modules.
- [ ] Supabase identity and nine-role/department assignments; administrator-created
      accounts, edit/deactivate, sign in/out, protected routes and account-change audit.
- [ ] Backend/database default-deny scope and private file access. Technical admin
      cannot automatically approve business actions; no browser-only authorization.
- [ ] Categories, Asset, StockPortion and Attachment schema; foundation for audit,
      model versions and AI interactions. Do not create unused placeholder tables for
      every later feature. Record planned keys/statuses/contracts before Ahmed starts.
- [ ] Asset registration/editing with SRS fields, individual/batch tracking, preserved
      validation input, eligible surplus publication/withdrawal and asset detail/history.
- [ ] Keyword/category/condition/department filtering. Show only eligible cross-department
      marketplace information; protect unrelated operational and financial fields.
- [ ] Permitted sample photo/document uploads and authorized downloads.
- [ ] Task-scoped server-side AI gateway with secret-only provider credentials. Trial
      representative text, image/document input and an embedding call early; document
      actual supported models/dimensions and errors rather than assuming availability.
- [ ] AI classification suggestions from supplied evidence; accept/edit/reject before
      applying them. Validate taxonomy/structured output and retain human/model/run data.
- [ ] Save assets before optional embedding work; implement ready/pending/failed status,
      content/model version tracking and explicit retry hooks for part 3 retrieval.
- [ ] Seed two departments, all role assignments needed for later demonstrations,
      quantity-one equipment, a divisible batch, unsafe/unknown-condition assets,
      missing inputs and permitted sample files. Keep secrets out of seeds/Git.
- [ ] Record shared IDs, enums and proposed operation signatures in the handoff,
      aligned with design Section 11. Prepare audit/committed-event conventions for Ahmed.

Do not add transfers, maintenance, assistant, ranking or report screens in this part.
Avoid empty "working" buttons that suggest unimplemented capabilities are complete.

## Acceptance evidence

- [ ] Clean setup from documented instructions and reproducible seeds.
- [ ] Login/logout, account deactivation and role-change behavior agree with the SRS.
- [ ] Authorized catalogue operations pass; wrong-role/department and direct unauthorized
      database/file requests fail, including attempted role escalation.
- [ ] Individual and batch quantities persist correctly; invalid publication is blocked.
- [ ] Filters work with seeded records and unknown/unsafe states are clearly identified.
- [ ] Classification correction, malformed output and provider outage are demonstrated.
      Manual save/search still work; failed embeddings do not remove saved assets.
- [ ] Available build/type checks and meaningful permission/validation tests pass.
      State what required real services and what was simulated.

## Documentation and handoff

Complete report Section 1 and initialize the feature-status table. Add actual setup,
environment-variable names, migrations/seeding instructions and a developer start
command to the repository README. Create `docs/phase-6/handoffs/01-abi-ali.md` using
the shared template. Ahmed must be able to run the catalogue before adding workflows.

Suggested branch: `codex/phase6-01-foundation`.
Requirement focus: FR-USER-001–005, FR-ASSET-001–008, FR-SEARCH-001–004,
FR-AI-CLASS-001–004, supporting security/privacy/audit requirements. Mark partial
coverage where later workflow guards are not implemented yet.

## Prompt for the member's AI assistant

> Implement my assigned Part 1 in docs/phase-6/tasks/01-abi-ali.md. Read the shared
> plan and current repository sources first. Explain the approach, honor applicable
> user/AGENTS instructions, work in small verified steps, and update my report and
> handoff. Do not implement the other members' parts or claim unrun checks passed.
