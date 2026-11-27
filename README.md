# IAD6 Infralink Dashboard

IAD06 engineering dashboard for PDMs, equipment readiness, Infralink NETA
reports, issue evidence, EPS testing, KPR metrics, and power plan, MV and Layout views.

## Quick start

From the repository root in PowerShell, use the conda base Python interpreter.
Install Node.js with npm for the frontend.

```powershell
python -m pip install -r requirements.txt
python -m playwright install chromium
Push-Location frontend
npm install
Pop-Location
```

For a fresh checkout, [generate the dashboard data](#refresh-data) before opening
the dashboard. Start Vite and the local FastAPI service together.

```powershell
python scripts/start_dashboard.py
```

Open [Dashboard](http://127.0.0.1:5173) or
[Data Operations](http://127.0.0.1:5173/data-operations). The API binds to
`127.0.0.1:8765`. See [operator access](docs/DATA_OPERATIONS.md#choose-operator-access)
for Clerk and optional localhost sign-in settings.

Use `python scripts/start_dashboard.py --preview` for a local compiled preview.
The launcher looks for the sibling `IAD6_EPS_Testing_Tracker` repository. To use
another location, set `IAD6_EPS_TRACKER_ROOT` to its absolute path before launching
the dashboard or running ETL.

## Refresh data

For a manual refresh, put the latest workbooks in these directories.

| Source | Directory |
| --- | --- |
| Module list Excel workbook | `raw_data/module/` |
| `SystemElements_*.xlsx` | `raw_data/system_elements/` |
| `Cases_*.xlsx` | `raw_data/cases/` |

```powershell
python scripts/etl/run_etl.py
```

Check the selected sources and any quality findings in `etl_run_metadata.json`
and `data_quality_report.json` under `frontend/public/data/`, then reload the
dashboard. Each PDM groups equipment, and each equipment record carries its
cases. ETL preserves issue and corrective images and flags equipment marked
NETA Complete with a missing report.

Operators can also run **Daily Data Refresh** in
[Data Operations](docs/DATA_OPERATIONS.md#daily-data-refresh). Live CxAlloy
uploads run separately and require explicit confirmation.

## Test and build

Run Python tests from the repository root.

```powershell
python -m pytest scripts/tests
```

Run frontend tests and the static build from `frontend/`.

```powershell
npm test
npm run build
```

The build writes `frontend/dist/`. Static hosting can serve dashboard pages
with the generated data and published files. Data Operations requires the
automation service and the host's Tracker files.

## Documentation

| Topic | Guide |
| --- | --- |
| System boundaries, data flow and configuration | [Architecture](ARCHITECTURE.md) |
| Frontend development and dashboard features | [Frontend README](frontend/README.md) |
| Operator access, logins, daily reports and refresh | [Data Operations](docs/DATA_OPERATIONS.md) |
| NETA previews, duplicate decisions and CxAlloy upload status | [Report operations](docs/REPORT_OPERATIONS.md) |
| Equipment links and identity refresh | [Infralink](docs/INFRALINK_LINKS_HELP.md) and [CxAlloy](docs/CXALLOY_LINKS_HELP.md) |
| Current engineering handoff | [Codex handoff](CODEX_HANDOFF.md) |

Code lives in `frontend/src/`, `scripts/etl/` and `scripts/automation/`.
Keep raw exports, generated datasets, reports, runtime logs, env files and
browser sessions out of Git.
