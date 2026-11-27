# Phase 7 testing report and evidence

The submitted [Testing Report v1.2 — Word](COSC336_Group6_Phase7-testing-report-v1.2.docx)
and [PDF](COSC336_Group6_Phase7-testing-report-v1.2.pdf) are the final report.
This page summarizes results and links supporting records; it does not claim
every test passed.

## Results at a glance

| Evidence set      | Result                              | Context                                                                                                                                                                                    |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit              | 328/328 passed                      | Historical local run                                                                                                                                                                       |
| PGlite            | 59/59 passed                        | Historical local run                                                                                                                                                                       |
| Native PostgreSQL | 61/61 passed                        | Historical CI run                                                                                                                                                                          |
| Browser, earlier  | 30/30 passed                        | Earlier local run; [raw output](results/04-browser-playwright.txt)                                                                                                                         |
| Browser, later    | 29/30 passed                        | One assertion mismatch; [raw output](results/06-browser-playwright-later.txt)                                                                                                              |
| Hosted acceptance | 7/8 passed; one unresolved no-match | Corrected local disposition (initial run: 5/8); separate teammate run: 7/8. [Local record](results/05-hosted-acceptance.md); [teammate record](results/07-hosted-acceptance-teammate.json) |

The hosted 7/8 result describes both the corrected local disposition and the
separate teammate run; the initial local run was 5/8. These are distinct runs;
do not combine totals. Each 7/8 result has one unresolved catalogue no-match.
The teammate record is assistant-operated evidence, not student sign-off.
Screenshots for the local hosted run are in [evidence/](evidence/); historical
unit, PGlite, and native records are in [results/](results/).

## Scope and limitations

The report covers selected requirements, not exhaustive validation. Hosted
observations were assistant-operated, not independent client or student
sign-off. The later browser run has one assertion mismatch; hosted catalogue
matching remains unresolved. See the report and linked records for scope and
case-level details.
