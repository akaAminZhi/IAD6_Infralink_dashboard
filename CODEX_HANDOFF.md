# Codex Handoff

## Current Status (2026-10-01)

Implemented workbook-backed PDM energisation filtering and Power plan lightning
markers. Local PDM outputs were regenerated and the frontend was built. No git
commit or deployment was performed. The worktree was clean at the start of this
implementation turn; generated TypeScript build-info changes were restored.

## Current Implementation

Source, relative to the project root:
`../IAD6_EPS_Testing_Tracker/Excel/skid_shipping_testing_energisation_tracker.xlsx`

- The source is also resolved through `IAD6_EPS_TRACKER_ROOT` when configured.
- The importer locates the header within the first 30 rows of each worksheet.
  The actual `SKID Tracker` sheet has its header on row 4. Required columns:
  `Skid Name`, `Energised Offsite? (Yes/No)`, and
  `Onsite Energisation Performed? (Yes/No)`.
- `energised_offsite` and `energised_onsite` are nullable booleans on each PDM.
  Yes/No are case-insensitive; blank values remain unknown (`null`). Other
  values remain unknown and are listed in diagnostics. Shipping and CxAlloy
  columns do not determine energisation.
- `build_pdm_dataset.run_build()` enriches `pdms.json` and `pdms.csv` and writes
  `pdm_energisation.json` with source metadata, source row numbers, raw values,
  invalid fields, matching methods, candidate PDMs, and match statuses. The
  diagnostic output is registered in ETL output metadata. The workbook is also
  included in the PDM JSON's `selected_input_files` when available.
- The existing typed PDM loader/`unwrapRecords` carries the new fields; no new
  browser request or automation endpoint is needed.
- PDMs has an Energisation dropdown (All / Energised Offsite / Energised Onsite)
  and a sortable Energisation column. The filter combines with existing filters
  and search and is cleared by Reset.
- Power plan shows a yellow Lucide lightning marker above each offsite skid,
  with a 2.2-second breathing animation. Confirmed onsite energisation uses red.
  Both colors are explained in the legend. Reduced-motion preferences disable
  the animation.

## Important Decisions

- Only an explicit Yes creates a positive flag. Unknown, absent, invalid, or
  ambiguous data never creates an energisation marker. EPS/NETA completion is
  independent and readiness calculations are unchanged.
- PDM matching first uses the complete name with case/whitespace normalization.
  A narrowly scoped fallback treats a numbered `...-CDS[-R]` as an alias of
  `...-PRIMARY-CDS[-R]` only when it resolves uniquely. It preserves the `-R`
  suffix and never merges primary and redundant skids. Exact matches win.
- Duplicate source rows or multiple candidate PDMs remain ambiguous and do not
  populate flags. Unmatched rows remain in the diagnostic output.
- Offsite and onsite flags are independent history: a PDM marked Yes in both
  appears in either filter. The table label and map marker prioritize onsite.
- Color extension points: `ENERGISATION_COLORS` in
  `frontend/src/utils/energisation.ts` changes default marker/legend colors;
  `EnergisationMarker` also accepts a `color` prop for a per-instance override.
- Missing workbooks produce unknown flags and an unavailable diagnostic output,
  replacing stale flags during a successful rebuild. Locked or malformed
  workbooks fail explicitly before new PDM outputs are written.
- Raw workbook and generated data remain uncommitted. The source was read only.

## Real Data Verification

- 245 PDMs in the dashboard; 54 source rows, all matched; zero invalid-value rows.
- Offsite: 4 Yes, 1 No, 240 unknown across dashboard PDMs.
- Onsite: no confirmed values; all 245 PDMs remain unknown.
- Confirmed offsite PDMs:
  - `IAD06-PDM-E6-110-01-PRIMARY-CDS`
  - `IAD06-PDM-E6-110-02-PRIMARY-CDS`
  - `IAD06-PDM-E6-110-02-PRIMARY-CDS-R`
  - `IAD06-PDM-E6-120-03-PRIMARY-CDS-R`
- The final entry uses the workbook's `IAD06-PDM-E6-120-03-CDS-R` alias.
- Compared PDM records before/after regeneration with only the two new fields
  excluded: all existing PDM, equipment, and case data were identical.

## Relevant Files

- `scripts/etl/pdm_energisation.py`: import, parsing, matching, diagnostics.
- `scripts/etl/build_pdm_dataset.py`: PDM enrichment, JSON/CSV publication.
- `scripts/etl/run_etl.py`: diagnostic output registration.
- `scripts/etl/schemas.py`, `frontend/src/types/data.ts`: nullable flag contracts.
- `frontend/src/pages/PdmPage.tsx`, `frontend/src/components/pdms/PdmFilters.tsx`,
  `frontend/src/components/pdms/PdmTable.tsx`: filtering and status display.
- `frontend/src/pages/PowerPlanPage.tsx`: markers and legend.
- `frontend/src/components/pdms/EnergisationMarker.tsx`,
  `frontend/src/utils/energisation.ts`, `frontend/src/index.css`: color API,
  onsite precedence, animation, and reduced-motion handling.

## Tests Actually Performed

- `python -m pytest scripts/tests/test_pdm_energisation.py scripts/tests/test_build_pdm_dataset.py scripts/tests/test_schemas.py scripts/tests/test_run_etl.py -q`:
  14 passed; dependency deprecation warnings only. Covers real workbook-shaped
  inputs, Yes/No/unknown, invalid values, missing sources/headers, aliases,
  unmatched/ambiguous records, environment override, and output integration.
- From `frontend/`:
  `npm test -- src/pages/PdmPage.test.tsx src/pages/PowerPlanPage.test.tsx src/components/pdms/EnergisationMarker.test.tsx src/hooks/useDashboardData.test.ts src/utils/pdmUtils.test.ts src/utils/powerPlanUtils.test.ts --maxWorkers=1`:
  32 tests passed across five files; the loader-test fork worker timed out before
  starting. Retried that file with
  `npm test -- src/hooks/useDashboardData.test.ts --pool=threads --maxWorkers=1`:
  all 6 passed. Thus all six targeted files passed across the runs (38 tests).
- `npm run build`: passed after final implementation changes; existing large
  chunk and plugin timing warnings remain.
- Ran the PDM builder against the real local inputs and verified the counts and
  before/after equality above. Did not run the full ETL.
- Local headless Playwright against Vite: offsite filter returned 4 PDMs; onsite
  showed 0; E6-110 had 3 markers and E6-120 had 1. Verified yellow fill, 2.2-second
  animation, and disabled animation under reduced motion. Captured and visually
  reviewed PDM and Power plan screenshots. The first browser attempt used an
  overly strict label locator; the corrected locator passed. The in-app browser
  execution tool was unavailable, so local Playwright was used.
- `git diff --check`: passed. No full test suites or lint command were run.

## Refresh / Follow-up

Save and close the source workbook before refreshing if Excel holds an exclusive
lock. Run `python scripts/etl/build_pdm_dataset.py` from the project root to refresh
only PDM data, or use the normal full ETL. Refresh the browser afterward. Static
hosting requires rebuilding and publishing the updated frontend and datasets.

No feature implementation remains. Real onsite data is currently blank; onsite
filtering, red marker priority, and color overrides are covered by test fixtures.

Suggested commit:
`feat: add PDM energisation filters and animated power plan markers`
