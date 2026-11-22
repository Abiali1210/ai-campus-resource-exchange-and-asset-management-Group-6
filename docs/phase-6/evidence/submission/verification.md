# Phase 6 deliverable verification

Prepared 22 November 2026. Application baseline: main
`514048c49be1302fb5253f9767a317f1bd771163`. Documentation work is isolated on
`codex/phase6-deliverables`; no application, schema or hosted data changes are part
of this package. Installed locked dependencies were reused without installation.

## Refreshed local checks

- `npm test`: 227 tests passed in 19 files.
- `npm run test:db`: 16 foundation, 29 workflow, four AI 5 report, four
  outcome/audit and four C9 checks passed, totalling 57; AI 2 SQL contract
  assertions also passed. PGlite uses synthetic Auth; this is not a hosted test or
  real overlapping PostgreSQL transaction test.
- `npm run build`: TypeScript check and Vite production build passed. The existing
  main chunk warning remains (513.74 kB minified); no unrelated optimization was
  introduced into documentation work.
- Unit/build startup initially hit a Windows child process permission error.
  Retrying with the required local process permission passed; application source
  was not changed to work around it.
- The 24 browser journeys are recorded results from 21 November, not a new run.
  Native workflow/race/pgvector evidence is the existing separate CI suite, not a
  new native run or a claim about concurrent hosted users.

## Current hosted evidence

On 22 November the GitHub issue API reported issue 23 closed/completed. Abi's
[closure comment](https://github.com/Abiali1210/ai-campus-resource-exchange-and-asset-management-Group-6/issues/23#issuecomment-7070239791)
states migration 202611210001 is applied, migration history aligned, wrapper/helper
security and grants checked, and unchanged Edge Function versions. It records
manual hosted acceptance for requester/supplier note visibility, outsider denial,
restricted costs/history and normal workflow loading. It reports no reset,
reseed or function deployment. This is attributed teammate evidence, not a new
independent hosted inspection by the document preparation task.

The full 20 November role walkthrough remains the source for historical hosted
scenarios. Its warning that fixes were outstanding described that earlier date;
PR 25 and Abi's closure comment supersede that status. Closing the issue does not
prove every outstanding optional acceptance case or human review.

## Screenshot provenance

The report uses cropped excerpts for readability; displayed facts are unchanged.
Originals are committed under `reviews/2026-11-20/hosted-evidence/`. Coordinates are
pixels `(left, top, right, bottom)` in the originals.

| Report image             | Original                       | Crop                    |
| ------------------------ | ------------------------------ | ----------------------- |
| 01-matching.png          | 08-request-and-ai-matching.jpg | (300, 8280, 1220, 8715) |
| 02-completed-receipt.png | 12-completed-custody.jpg       | (300, 4710, 1220, 5145) |
| 03-published-report.png  | 19-published-reader-view.jpg   | (32, 545, 719, 1200)    |

The first two views are authorized requester/receiving-representative excerpts.
The third is a Published reader excerpt. They show the older hosted frontend and
synthetic data. No screenshot is labelled as evidence of an action not performed;
in particular recommendation controls were observed, not submitted in that run.

## Document acceptance

Completed checks: six rendered pages inspected individually, with readable
figures, tables, headings and footers; 54 local Markdown links resolved; all nine
Word references checked against local repository targets or the fetched GitHub
issue; four team IDs and three embedded screenshots verified. Changed Markdown
files pass Prettier and the tracked diff passes whitespace checking.

The packaged renderer could not find LibreOffice on this Windows machine. The
report was exported with Microsoft Word in the background, then rasterized using
the canonical `render_docx.py` image pipeline with that native export supplied as
its PDF input. No desktop LibreOffice installation or package install was used.

The Markdown source, generated DOCX and final layout are checked together. Render
outputs remain local QA artifacts; only the Word file is a submission artifact.
Human team review, rehearsal, portal instructions and upload remain unchecked in
the submission checklist. No new presentation, video or PDF submission is assumed.
