# Phase 7 browser and acceptance findings

Executed 27 November 2026. Local source baseline `fb0352c`; the hosted deployment's
exact commit and Edge Function versions were not independently pinned. No test,
application or database migration was changed to make a case pass.

## F1 TC-SYS-12 stale browser assertion

- **Result:** Fail, local Chrome. Other 29 journeys passed.
- The test submitted an unsupported number. The application rejected it with
  `Numeric value “99999” must match the displayed snapshot facts.`
- The assertion at `tests/browser/workflows.spec.ts:597` expected
  `Narrative numbers must match`. The wording assertion failed; later focus,
  viewport and publication assertions in this journey did not execute.
- This is an assertion/validation-message mismatch, not evidence that unsupported
  numbers were saved. The hosted positive report journey is separate evidence.
- **Owner:** Ahmed reviews the assertion against the approved error contract in a
  separate change, then reruns the complete browser journey. Do not relabel this
  recorded run as passing after a later fix.

## F2 TC-ACC-04 no hosted recommendations to accept

- **Result:** Fail to complete the specified acceptance scenario.
- Science submitted `PHASE7-2026-11-27-01 — two HDMI monitors for Science acceptance`,
  quantity two, Good minimum, connector HDMI, required 1 December.
- Get AI recommendations returned `No catalogue matches were found`.
- The ordinary Interest picker offered the remaining two Good Engineering units
  of the earlier labelled DEMO monitor batch. A suitable manual candidate was
  visible, but the matching eligibility/index/provider cause was not established.
- Recommendation acceptance and the AI-created Interest substep could not be
  executed. Manual selection was explicitly labelled as fallback, not AI success.
- **Owner:** Abi checks authorized eligibility, embeddings and index freshness,
  using normal reviewed access. No reset, reseed, backfill, migration or provider
  deployment was performed by this testing task.

## Other observations and scope boundaries

- TC-ACC-03 denied inactive access, but returned to the sign-in gate without a
  persistent explanatory message. Access denial passed; feedback could improve.
- TC-ACC-01 verifies Finance asset value (AED 400 on Rigol). The handoff's broader
  mention of costs is not proof that every finance cost path was checked.
- TC-ACC-05 used a manual Interest after F2. Reservation and release were separate.
  A one-of-two nonaccepted receipt stayed Disputed in Engineering formal custody;
  full reconciliation completed into Science custody. Named actors/times are
  visible in the decision history. Screenshots capture each major state.
- The synthetic pickup was scheduled for 28 November at 10:00 while dispatch and
  receipt were simulated during this test. These are coursework records, not
  assertions of physical campus movement or on-time delivery.
- TC-ACC-06 used live generation and a supported edit. Mark ready was disabled
  while edits were unsaved. The explicitly authorized Published report was then
  read through Sustainability, with zero draft editors and Publish buttons.
- Report facts were 24 requests, 20 open, 4 non-open, 5 completed transfers,
  10 units, 83% open and 2 units/transfer. Existing older reports were untouched.
- The assistant operated the test accounts with explicit user approval. Human
  student/client acceptance sign-off and understanding remain separate.

## Evidence and persistent data

`05-hosted-acceptance.json` records all eight cases. Files `TC-ACC-01.png` through
`TC-ACC-08.png` hold the main screenshots; TC-ACC-05/06 have extra state captures.
The images are actual browser screenshots converted losslessly from JPEG storage
to PNG containers, with no content alteration. Credentials are absent.

The labelled new request is fulfilled and its two units now belong to Science.
The earlier DEMO batch's other two units had already been transferred on 26
November; those records and the older pending Interest were not changed.
The new Published summary is explicitly synthetic and assistant-operated.
