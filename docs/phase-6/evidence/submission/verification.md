# Submitted Phase 6 archive verification

Recorded 23 November 2026. User-confirmed submission baseline: report v2.0 and
the attached presentation. Each repository file matches its corresponding
Downloads attachment byte for byte. Submitted content was not edited.

## File identities

- **COSC336_Group6_Phase6_Implementation_Report_v2.0.docx**
  - Size: 12193813 bytes.
  - SHA-256: `138b6b1625519f2611328264a28e31f6ee0e5a4cf685f7c1038d60b2460604d8`.
- **COSC336_Group6_Phase6_Presentation.pptx**
  - Size: 3933988 bytes.
  - SHA-256: `5e94e28f42b8cf4d5b7471a9010a4e6eee85010ccb320aa2b114795104b8d051`.

## Relationship to current main

This PR was updated from main `b7c93ee`. Application, schema, tests, CI and package
files are preserved from main. The older report v1.0 DOCX/PDF remain unchanged as
historical files. The presentation at the existing path is replaced with the exact
submitted attachment; its previous bytes remain in Git history.

The unmerged six-page draft builder and duplicate screenshot excerpts were removed
from this PR. The Markdown report is an archive index, not a generator input.

## Verification boundaries

Archival checks passed: 46 local documentation links resolved; both Office files
passed ZIP integrity checks and matched their supplied attachments exactly;
earlier main v1.0 DOCX/PDF files were unchanged; application, backend, tests,
scripts, package files and CI matched the current main baseline. Changed Markdown
passed formatting and whitespace checks. No merge conflicts remain.

File identities, archive links, document structure and documentation formatting
are checked for this change. No application, hosted database, credentials or
permission changes are part of the archival task. The report was not regenerated
and its typos or claims were not silently changed.

Recorded 22 November results (270 unit / 58 PGlite / 30 browser) agree with the
polish handoff. They are historical evidence, not tests rerun for this archival
change. The current CI workflow does not run Playwright; browser results are local.
The earlier hosted CSV timeout is not evidence that hosted file contents passed.

The submitted files were reviewed in the preceding task. The report rendered to
32 pages; slides 1–9 form the main talk and 10–16 support technical questions.
Minor reference-pagination and CI-wording issues are preserved in the archive.
Human understanding and rehearsal are tracked separately in the checklist.
