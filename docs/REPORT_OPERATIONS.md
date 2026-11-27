# Report operations

## NETA report viewing and refresh

Download and organize reports in [Data Operations](DATA_OPERATIONS.md), then run
Dashboard ETL and reload the browser. To refresh the report index alone, run
`python scripts/etl/build_neta_report_manifest.py` from the repository root.
The builder uses `IAD6_EPS_TRACKER_ROOT` and creates the configured public
directory links when the Tracker source directories are available.

Reports are served from `frontend/public/neta-reports/` and
`frontend/public/neta-reports-gc/`, including linked Tracker directories. Keep
both directories and their report files available on the serving host. Static
deployments need the refreshed manifest and the corresponding PDFs.

Reports under `_temporary/<equipment>/` show a **Temporary** label and support
Original and GC previews. For the same equipment, source and original name,
ready formal files take precedence. Tracker lifecycle gates formal Original and
GC files on `download_ready` and `formal_ready`, respectively. Legacy formal
files without lifecycle entries retain their existing eligibility. Temporary
files remain viewable during an unsuccessful promotion and their presence is
independent of NETA/EPS completion and readiness. Reload after reindexing to
see the latest paths when temporary files are cleaned up.

## NETA duplicate report review

Use the Equipment filters **All duplicate alerts**, **Possible duplicates**
and **Confirmed duplicates**. The counts represent groups. Shared report
details in Equipment, PDM, Power Plan, MV and Layout show the two copies,
Original and GC previews, and confirmation source and time. Invalid evidence
appears separately from duplicate groups. An unavailable audit means the
duplicate count is unknown.

Authorized operators can review both copies and use **Confirm Duplicate** or
**Revoke Confirmation**. Confirmation keeps both local files and can suppress a
duplicate equipment attachment in a later CxAlloy upload. Cable confirmations
serve as evidence only. Revoking a manual decision restores possible-duplicate
status. Automatic confirmations from identical bytes or render evidence require
the Tracker audit. Saving a decision leaves existing CxAlloy attachments as-is.

Decisions require current evidence, explicit confirmation and operator access.
If the decision saves and publication fails, use **Refresh duplicate evidence**
to republish the saved result. Changed or missing PDFs require another Tracker
duplicate audit. Update both Dashboard and Tracker, including Tracker's
`neta_duplicate_decisions.py`, and restart the automation backend for writes.
See [NETA evidence and decisions](../ARCHITECTURE.md#neta-duplicate-evidence-and-decisions)
for the validation and publishing flow.

## Completed NETA report versions

Authorized operators can open unresolved version conflicts in the Equipment
report section, compare both PDFs and choose whether to keep the current file
or adopt the candidate. The next manually triggered Tracker
`--completed-reports refresh` verifies the decision and publishes eligible
formal reports. Refresh Dashboard ETL afterward so the active filenames and
PDF links reflect the published batch.

## CxAlloy upload status

Refresh from local evidence with `python scripts/etl/build_cxalloy_report_status.py`
or the standard ETL. Equipment details show equipment and cable reports separately.
The Equipment table counts eligible PDFs by uploaded, pending, review-required
or missing-local status. Hover over a count to see its equipment/cable split.
Supporting images and legacy PDFs derived from them are excluded. Cable PDFs use
LV/MV metadata from the GC rename manifest, including shared PDFs and filenames
without a cable prefix. Legacy package-only records show status without file counts.

**Pending CxAlloy Upload** on Overview and Equipment requires an eligible,
tracked asset with explicit NETA completion and at least one pending local PDF.
For older records without file-level evidence, it requires a pending package
with a positive available-PDF count. Previously uploaded equipment can qualify
when another PDF is pending. Individual PDF status is independent of NETA
completion, so a verified temporary upload can display **Uploaded** while the
device's NETA status is incomplete or unknown.

An `equipment_not_found` or `cleanup_deleted` record invalidates older coverage.
Available PDFs return to pending until later successful evidence verifies them.
Record out-of-band deletions in Tracker upload history so the offline builder
can see them. Login failures and failed cable attempts preserve prior coverage.
Site checks for a different PDF are ignored. The current file must match verified
historical bytes, including for legacy package and lifecycle hashes. Completed
refresh snapshots can restore verified coverage for matching bytes.

## Preview or run a CxAlloy upload

From the repository root, preview with the Tracker compatibility entry point.

```powershell
python scripts/automation/cxalloy_upload.py --dry-run
python scripts/automation/cxalloy_upload.py --dry-run --only IAD06-PDU6-03F-5
```

Data Operations invokes the sibling Tracker's `upload_cxalloy_reports.py`
directly. Tracker owns upload selection, lifecycle, replacement and verification.
Advanced Force passes through to the Tracker. The status builder reports local
evidence independently of upload selection. Keep the upload manifest with the
report PDFs when moving the installation. Live uploads require explicit
confirmation, an authorized operator and a provider session.
