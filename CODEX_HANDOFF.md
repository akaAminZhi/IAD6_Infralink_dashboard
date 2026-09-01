# Codex Handoff

## Current Status

The repository currently implements the React dashboard, Python ETL, local Data
Operations service, EPS execution views, KPR reporting, power-plan interaction,
and MV equipment/test evidence. The active branch is `master`; the latest commit
observed during this documentation task is `329f0f8 filter battery and inv6`.

The worktree was already dirty before these documentation files were added. Do
not reset or overwrite those changes.

## Implemented During the Conversation

Major completed areas include:

- PDM-centric normalization, equipment/case matching, summaries, data-quality
  reporting, history snapshots, and a complete ETL runner.
- Dashboard routes for Overview, KPR, PDMs, Equipment, Issues, EPS Test
  Execution, Power Plan, MV Equipment, Data Quality, and Data Operations.
- Equipment readiness and NETA-report browsing, issue/corrective attachment
  viewing, professional Excel exports, and URL-driven cross-page filters.
- EPS daily-report parsing, tracker reconciliation, failure/fixed history,
  seven-day comparisons, per-test-item views, and PDM/module execution details.
- Local FastAPI automation with allowlisted jobs, logs, cancellation/resume,
  login continuation, EPS/MV daily report editing, and the daily refresh pipeline.
- NETA/GC report manifests, CxAlloy upload status, Feeder Cable ATP evidence,
  power-plan selection/export, and MV annotation/test visualization.
- Monthly KPR metrics separated by PDM, equipment, test-item, and issue units.

## Current Uncommitted Implementation

At inspection time, these pre-existing files were modified:

- `frontend/src/components/pdms/PdmTable.tsx`
- `frontend/src/pages/EquipmentPage.tsx` and its test
- `frontend/src/pages/KprPage.tsx` and its test
- `frontend/src/pages/MvEquipmentPage.tsx`
- `frontend/src/pages/PowerPlanPage.tsx`
- `frontend/src/types/data.ts`
- `frontend/src/utils/equipmentTrackingUtils.ts` and its test
- `frontend/src/utils/pdmUtils.ts` and its test
- `scripts/etl/build_kpr_summary.py`
- `scripts/etl/tracking_rules.py`
- `scripts/tests/test_build_kpr_summary.py`
- `scripts/tests/test_build_pdm_dataset.py`
- `scripts/tests/test_tracking_rules.py`

The current diff includes these relevant behaviors:

- EPS/NETA tracking exclusions for `BATTERY`, `UPS6`, `MBC`, and direct `INV6`;
  `TX-INV6` remains tracked.
- KPR NETA cumulative metrics use all qualifying equipment with report evidence,
  while lifecycle cards remain mutually exclusive stage inventory.
- KPR Changed Paths persist exact equipment IDs; clicking a colored transition
  count opens Equipment filtered to that cohort.
- PDM/Equipment views and power-plan/MV detail handling have related updates.

Generated files under `frontend/public/data/` are gitignored and may have been
rebuilt locally; they are not the source of truth for code review.

## Important Decisions

- The lifecycle `NETA Complete` stage means equipment currently in that stage,
  not all equipment that has ever completed NETA. This preserves stage movement
  and makes lifecycle stages additive.
- Cumulative "NETA complete with report" is a separate all-equipment metric and
  is not limited to module-linked PDM equipment.
- Lifecycle transition colors indicate direction: green is forward in the
  configured order; red is backward. A backward transition may be a data/status
  correction and is not automatically a physical regression.
- Changed Path count drill-down is exact: ETL stores the transition equipment
  IDs, and Equipment resolves the URL filter against that list.
- The central tracking exclusion rule must be used consistently across ETL and
  frontend readiness calculations.
- Data Operations remains local and unauthenticated; do not expose it remotely
  as-is.

## Known Bugs and Unresolved Issues

- `frontend/src/utils/exportPowerPlanSelection.test.ts` exceeded Vitest's
  20-second timeout when run in the full suite and again in an isolated rerun.
  Functional export failure was not proven; investigate runtime cost or test
  timeout before treating it as a product bug.
- **Needs verification:** Confirm whether the recent uncommitted
  `MvEquipmentPage.tsx` and `PowerPlanPage.tsx` edits are complete and visually
  approved; they were present in the worktree at documentation time.
- **Needs verification:** Verify all tracker-dependent ETL builders honor
  `IAD6_EPS_TRACKER_ROOT`; several manifest modules still show a fixed sibling
  path.
- **Needs verification:** Confirm the intended Vite and Tailwind configuration
  source because both `.js` and `.ts` files exist with differing content.
- **TODO:** Design authentication, authorization, TLS, and deployment controls
  before external Data Operations access.
- **Unknown:** Production deployment and CI/CD ownership/configuration are not
  represented in the repository.

## Work in Progress

No automation process was intentionally left running by this documentation
task. The uncommitted application changes listed above are the current work in
progress and should be reviewed as a unit before commit.

## Verification Already Performed

Before this documentation-only task, the following results were observed after
the recent KPR work:

- `python -m pytest scripts/tests -q`: 101 passed, with dependency deprecation
  warnings.
- Targeted KPR Python tests after transition drill-down: 9 passed.
- Targeted KPR and Equipment frontend tests after transition drill-down: 12
  passed.
- `npm run build`: passed; Vite reported large chunk warnings.
- A full frontend run reported 123 passed and two Excel-export test timeouts.
  Isolated rerun passed `exportIssues.test.ts`; the Power Plan export test still
  timed out.

No tests or builds were run for this documentation-only task.

## Recommended Next Steps

1. Review the current diff and manually verify KPR lifecycle stage counts,
   Changed Path drill-down, PDM tracking exclusions, and Power Plan/MV details
   against the latest generated data.
2. Resolve or explicitly adjust the slow Power Plan Excel export test.
3. Run targeted tests for any files changed during review, then `npm run build`.
4. Run full Python/frontend suites before committing if time permits.
5. Commit application changes separately from documentation if a clean history
   is desired.

## Assumptions to Verify Next Time

- **Needs verification:** The sibling `IAD6_EPS_Testing_Tracker` repository is
  available at the default relative location or via `IAD6_EPS_TRACKER_ROOT`.
- **Needs verification:** The latest raw workbooks and plan PDFs are the intended
  sources before running ETL; discovery selects by modification time.
- **Needs verification:** Browser auth-state files for JC2/CxAlloy are current
  before running download/upload automation.
- **Unknown:** Whether generated datasets and downloaded evidence are deployed
  by copying local artifacts or rebuilt on the target host.
