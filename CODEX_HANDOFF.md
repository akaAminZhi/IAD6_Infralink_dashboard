# Codex Handoff

## Current Status (2026-10-01)

This turn updated only this handoff. The requested PDM energisation feature is
not implemented in the current checkout. No earlier implementation or test run
for that feature is available in this conversation; do not treat the requirements
below as completed work.

The explicit documentation-only instruction takes precedence for this turn.
The existing user modification to `prompt.md` was preserved. No git commit was
created.

## Requested Feature / Remaining Work

Source, relative to the project root:
`../IAD6_EPS_Testing_Tracker/Excel/skid_shipping_testing_energisation_tracker.xlsx`

- Bring the workbook's PDM/skid energisation records into dashboard data.
- Add Offsite Energize and Onsite Energize filtering to the PDMs page.
- Display a yellow lightning marker above Energised Offsite skids on Power plan,
  with a breathing/pulsing animation.
- Expose a color setting/prop so future onsite energisation can use red.
- Preserve existing readiness, testing, issue, and power-plan behavior.

The source workbook exists locally. Its sheets, headers, values, and PDM matching
rules were not inspected in this turn. Inspect those before choosing a schema;
onsite status availability and offsite/onsite precedence remain undecided.

## Current Implementation

- `scripts/etl/build_pdm_dataset.py` builds `pdms.json` and `pdms.csv` from
  equipment, module links, and cases; `scripts/etl/run_etl.py` orchestrates it.
- `frontend/src/hooks/useDashboardData.ts` loads PDM and power-plan datasets;
  PDM records use the existing `unwrapRecords` envelope handling.
- `frontend/src/pages/PdmPage.tsx` owns PDM filter state and filtering.
  `frontend/src/components/pdms/PdmFilters.tsx` exposes search, readiness,
  quick filters, and issue/NETA exception toggles. There is no energisation
  filter in that state.
- `frontend/src/pages/PowerPlanPage.tsx` uses shared power-plan enrichment,
  status colors, and status icons. There is no offsite energisation marker.
- Searching `frontend/src`, `scripts`, and `config` for energisation spellings
  and the source workbook name found no feature integration; the only match
  was unrelated energization wording in an automation API test.

## Implementation Constraints

- Keep the PDM -> equipment -> cases hierarchy and existing tracking rules.
  Energisation must not be inferred from EPS/NETA completion alone.
- Reuse existing PDM matching and JSON envelope helpers. Preserve unmatched or
  ambiguous records for diagnosis, and distinguish missing source data from
  confirmed status when designing the import.
- Update Python builders/schemas, TypeScript contracts/loaders, and targeted
  tests together if the data contract changes. Regenerate local outputs during
  implementation, but do not commit the workbook or generated datasets.
- Use the existing Lucide icon and shared styling patterns. The requested color
  interface has not yet been designed or added.

## Relevant Files for Follow-up

Data pipeline and contracts:

- `scripts/etl/build_pdm_dataset.py`
- `scripts/etl/build_power_plan.py`
- `scripts/etl/run_etl.py`
- `scripts/etl/schemas.py`
- `frontend/src/types/data.ts`
- `frontend/src/hooks/useDashboardData.ts`

UI and shared calculations:

- `frontend/src/pages/PdmPage.tsx`
- `frontend/src/components/pdms/PdmFilters.tsx`
- `frontend/src/utils/pdmUtils.ts`
- `frontend/src/pages/PowerPlanPage.tsx`
- `frontend/src/utils/powerPlanUtils.ts`

Existing tests to extend or run as appropriate during implementation:

- `scripts/tests/test_build_pdm_dataset.py`
- `scripts/tests/test_build_power_plan.py`
- `scripts/tests/test_run_etl.py`
- `scripts/tests/test_schemas.py`
- `frontend/src/utils/pdmUtils.test.ts`
- `frontend/src/utils/powerPlanUtils.test.ts`
- `frontend/src/pages/PowerPlanPage.test.tsx`
- `frontend/src/hooks/useDashboardData.test.ts`

## Verification Actually Performed This Turn

- Read `AGENTS.md`, the previous handoff, both READMEs, and `ARCHITECTURE.md`.
- Inspected git status, relevant PDM/power-plan source, contract/loader references,
  and ETL registration; confirmed the input path exists with `Test-Path`.
- No pytest, Vitest, build, ETL, workbook parsing, or browser checks were run.
  This was a documentation-only update and does not validate the requested UI.
- `git diff --check -- CODEX_HANDOFF.md` passed. The repository-wide check
  reported an existing extra blank line at EOF in user-modified `prompt.md`;
  that file was left unchanged.
- Historical NETA review test results and the previous unrelated completion
  statement were removed from this current-work handoff; they are not evidence
  of energisation feature completion.

## Suggested Commit Message

`docs: update handoff with energisation requirements and verified implementation gaps`
