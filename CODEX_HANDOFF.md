# Codex Handoff

## Current Status

The NETA report-review feature requested for `/equipment` is implemented and
verified. The changes are uncommitted on branch `master`.

The worktree was clean except for a pre-existing user change in `prompt.md` at
the start of this work. That file was not modified by this task and must be
preserved.

## Current Implementation

### Equipment filters and summary cards

- `/equipment` loads compact NETA review results on mount using a 30-second
  in-memory API cache shared across route visits. Concurrent reads share one
  request; errors are not cached, and successful edits invalidate the cache.
- Report matching uses WeakMap-cached alias/review indexes instead of scanning
  all manifest and review records per report. New immutable response/manifest
  objects rebuild the corresponding index. Equipment states are memoized and
  shared by counts and filters.
- The backend caches compact results by resolved path, modification/change
  timestamps and file size (up to four entries). External file changes and API
  edits invalidate cached results; missing files still report an error.
- Two cards were added to Equipment Readiness & Exceptions:
  - `Failed NETA Reports`
  - `NETA Review Required`
- Card counts are unique equipment counts, not raw report counts. Clicking a
  card filters the equipment table to the corresponding equipment cohort;
  clicking the active card again clears the filter.
- Equivalent toggles are available in the Equipment filter panel.
- If the local API is unavailable, the two cards show `--` and are disabled
  rather than incorrectly reporting zero exceptions. Existing Equipment
  behavior remains available.

### Equipment detail review status

- Each NETA report in the equipment detail drawer shows its review result at a
  glance:
  - failed: red
  - review required or scan error: orange
  - passed: green
  - no matching result: neutral
- Each matched report has a review-result selector. `REVIEW_REQUIRED`,
  `FAILED`, or `PASSED` records can be set directly to `PASS` or `FAILED`.
- A successful edit updates the detail color, card totals, and active Equipment
  filters immediately without a page reload.
- Original and GC report-name display modes and PDF preview behavior are
  preserved.
- Result selectors sit at the top right beside each report's status. Failed,
  review-required and error reports display an Evidence section at the bottom,
  with page numbers, source evidence, review notes and exception numeric-check
  values/limits. Duplicate lines are removed; missing evidence is explicit.
- Changing a report to PASS hides its Evidence section; source page evidence
  remains preserved in JSON.

### Review-result API and persistence

- Source file:
  `../IAD6_EPS_Testing_Tracker/NETA_eport_To_GC/test_reports_result.json`
- `GET /api/automation/neta-report-reviews` returns the report path, status,
  pass flag, manual-review metadata, compact exception evidence, and recalculated
  summary. Passing numeric-check details are omitted. Evidence uses the same
  cached response and does not require additional per-report requests.
- `PUT /api/automation/neta-report-reviews` accepts an exact report path and a
  status of only `PASSED` or `FAILED`.
- Updates preserve all existing report/page evidence, update `status` and
  `is_passed`, add `manual_review.status` and `manual_review.reviewed_at`, and
  recalculate the top-level summary, total, and `all_reports_passed` fields.
- Writes are serialized in-process and use a temporary file plus atomic replace
  so concurrent local requests cannot lose an update or leave partial JSON.
- Missing files/reports and malformed requests return explicit HTTP errors.

## Important Decisions

- Equipment data normally contains original NETA report names while the review
  JSON uses GC-renamed relative paths. Matching therefore uses the existing
  `neta_report_manifest.json` mapping rather than guessing equipment IDs from
  filenames.
- An equipment review state uses severity precedence: any `FAILED` report makes
  the equipment failed; otherwise any `REVIEW_REQUIRED` or `ERROR` report makes
  it require review; otherwise matched `PASSED` reports make it passed.
- `ERROR` is treated as requiring manual review and is shown in orange.
- The source JSON remains the persistence layer; no generated dashboard dataset
  or database was added.
- The API remains loopback-only under the existing local automation service.

## Relevant Files

Backend:

- `scripts/automation/neta_report_reviews.py` — validation, compact reads,
  serialized atomic updates, and summary recalculation.
- `scripts/automation/api.py` — NETA review GET/PUT endpoints and request model.
- `scripts/automation/runner.py` — configured review-results path.
- `scripts/tests/test_automation_api.py` — API round-trip and persistence test.

Frontend:

- `frontend/src/pages/EquipmentPage.tsx` — loading, counts, filtering, and local
  state updates.
- `frontend/src/components/equipment/EquipmentSummaryCards.tsx` — two new
  clickable cards and API-unavailable state.
- `frontend/src/components/equipment/EquipmentFilters.tsx` — matching filter
  toggles.
- `frontend/src/components/equipment/EquipmentDetailDrawer.tsx` — colored
  per-report status and editable review selector.
- `frontend/src/utils/netaReportReviews.ts` — original-name/GC-path matching and
  equipment-level status aggregation.
- `frontend/src/types/automation.ts` and
  `frontend/src/utils/automationApi.ts` — frontend contracts and API client.
- `frontend/src/pages/EquipmentPage.test.tsx`,
  `frontend/src/utils/netaReportReviews.test.ts`, and
  `frontend/src/utils/automationApi.test.ts` — targeted frontend coverage.

## Known Issues and Limitations

- Editing requires `python scripts/start_dashboard.py`; a frontend-only/static
  deployment cannot read or update the sibling tracker file.
- A future rerun of the external report-checking script may rewrite
  `test_reports_result.json` and discard manual-review overrides unless that
  script is changed to preserve `manual_review` values.
- Manual review metadata records a timestamp but not a reviewer identity. The
  dashboard has no authentication or user model.
- Only review records connected to Equipment NETA report fields through the
  current manifest are surfaced in Equipment. As of 2026-09-18, all 1,315
  review-result paths match a GC manifest record, with zero missing paths.
- The real sibling JSON was read only during verification; no production review
  status was changed by the tests in this task.

## Remaining Work

- No code work remains for the requested behavior.
- Recommended manual smoke test: start the combined local service, open
  `/equipment`, exercise both cards, open one review-required item, and confirm
  a deliberately chosen PASS/FAILED edit after backing up the sibling JSON.
- If automated report scanning is rerun regularly, update that external scanner
  to merge/preserve manual review overrides.

## Tests Actually Performed

Evidence display follow-up:

- Anaconda targeted Python API/cache/evidence tests: 8 passed on rerun. The
  initial run had one existing daily-report subprocess wait exceed 5 seconds.
- `npm run build`: passed with existing large-chunk warnings.
- Default frontend run failed to start fork workers. Retrying with
  `--pool=threads --maxWorkers=1` passed the two utility files (8 tests), but
  the EquipmentPage worker still timed out before executing tests. The new
  evidence rendering/hide-after-PASS assertions therefore remain unverified.
- `git diff --check`: passed. No browser visual validation was performed.

Performance follow-up:

- Anaconda Python: `C:\anaconda3\python.exe -m pytest scripts/tests/test_automation_api.py scripts/tests/test_neta_report_review_cache.py -q`:
  7 passed. Default Python lacked FastAPI, so its initial collection attempt
  failed; the existing Anaconda environment completed the tests.
- Targeted frontend command below: 12 passed after adding cache isolation
  between page tests. Coverage includes request deduplication, TTL expiry,
  retry after failure, invalidation on edits, and rebuilt matching indexes.
- `npm run build`: passed with large-chunk warnings.
- Read-only backend timing on 1,315 real reports: cold read 43.59 ms; average
  of 20 cached reads 0.14 ms. This is not an end-to-end browser timing.

Original feature verification:

- `python -m pytest scripts/tests/test_automation_api.py -q`: 6 passed; one
  Starlette/httpx deprecation warning.
- `npm test -- src/utils/netaReportReviews.test.ts src/utils/automationApi.test.ts src/pages/EquipmentPage.test.tsx`:
  3 files passed, 9 tests passed.
- `python -m py_compile scripts/automation/api.py scripts/automation/neta_report_reviews.py scripts/automation/runner.py`:
  passed.
- `npm run build`: passed. Vite reported the existing large-chunk warning.
- `git diff --check`: passed; Git printed only LF-to-CRLF working-copy warnings.
- Read-only real-data validation: all 1,315 review report paths matched the
  current GC NETA manifest; 0 were missing.

No lint command was run because this repository does not define one.
