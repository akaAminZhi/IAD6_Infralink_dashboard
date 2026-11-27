# Codex handoff

## Current status

- **Completed NETA report versions (2026-11-26).** Authorized operators can
  compare staged PDFs in Equipment and record the version to use. The Tracker
  applies the choice during a manual `--completed-reports refresh`. Daily Data
  Refresh runs the standard download workflow. See [report operations](docs/REPORT_OPERATIONS.md#completed-neta-report-versions).
- **CxAlloy evidence after NETA refresh (2026-11-25).** The status builder uses
  current GC rename rows and completed-refresh snapshots to reconstruct verified
  formal hashes. A current PDF must match historical bytes for its equipment.
  A local rebuild restored 177 file badges across 11 devices. The 73 focused ETL
  tests passed during that work.
- **CxAlloy cleanup and UPP6 scope (2026-11-24).** `cleanup_deleted` invalidates
  older upload and cache evidence. Later verified success restores coverage.
  UPP6 and TX-UPP6 are included in the equipment cable review, energization
  readiness and eligible pending uploads.
- **NETA position baselines.** The Equipment drawer and Data Quality use the
  published position check. The local operator confirms baselines in
  `/neta-baselines`. See [NETA baseline architecture](ARCHITECTURE.md#neta-test-position-baselines).
- **Daily Data Refresh auto-sync.** A successful manual refresh starts auto-sync
  for its operator. Restart, failure, auth-required status or cancellation stops
  auto-sync. See [automation backend](ARCHITECTURE.md#automation-backend).

## Open items

- Verify auto-sync against live JC2 when an authorized operator session is
  available. Existing auto-sync tests exercise the scheduler and UI.
- Review the MDB6 row 03 family split or equipment exceptions. It uses FB5/FB6
  where rows 01 and 02 use FB1/FB2.
- Deferred ETL performance work includes the workbook cache stat pre-check,
  redundant daily summary rebuild and daily history snapshots. See the
  2026-11-19 entry in the history below.

## Earlier work

The full handoff through 2026-11-25 is available in Git.

```powershell
git show c917f0fdce6199b6dbe2efa1d48a503b6edf9344:CODEX_HANDOFF.md
```
