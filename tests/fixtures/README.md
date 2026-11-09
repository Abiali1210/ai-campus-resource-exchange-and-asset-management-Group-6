# Synthetic foundation and workflow fixtures

Synthetic UUIDs, two departments, nine role keys, twelve profiles, six assets and
conserved portions for C1–C3/audit checks. Fixture profiles are not real Auth sessions.
The provisioning script maps them to actual synthetic accounts without public passwords.

| File                         | Purpose                                                                                                                    | How it is checked or used                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `foundation.json`            | Two departments, nine roles, 12 profiles, six assets and conserved stock                                                   | `python scripts/validate-foundation-fixture.py`; catalogue preview and synthetic account seed                                          |
| `foundation-acceptance.json` | Planned Part 1 acceptance cases                                                                                            | A checklist of expectations, not evidence that hosted acceptance ran                                                                   |
| `workflows.json`             | Seven recipes: open request, Interest, pending release, scheduled transfer, partial fulfillment, dispute and unsafe return | `npm run test:db` and native database checks verify totals; `npm run seed:workflows` creates records in a configured synthetic project |

Seeds create demonstration records; tests check behavior. Neither fixture profiles
nor planned cases establish real authentication, measured savings or AI accuracy.
Account and workflow seed commands require the explicit setup described in
[the Part 2 handoff](../../docs/phase-6/handoffs/02-ahmed.md). Existing records are
preserved. Do not add passwords, service keys or real university inventory here.

No AI, uploaded-file, notification, dashboard or maintenance feature is included.
