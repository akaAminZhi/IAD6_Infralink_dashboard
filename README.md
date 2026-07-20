# IAD6 Infralink Dashboard

React + TypeScript dashboard data project for IAD06 engineering equipment, PDM/module mapping, NETA status, test reports, and related case issues.

The ETL pipeline is PDM-centric:

- PDM Name is the main grouping field.
- Each PDM contains related equipment from the module list.
- Each equipment can contain related cases/issues.
- Every case preserves the `Issue Image` field.
- NETA completion/report inconsistencies are flagged in the data quality report.

## Project Structure

```text
raw_data/
  module/             Latest module list Excel file.
  system_elements/    Weekly SystemElements_*.xlsx exports.
  cases/              Weekly Cases_*.xlsx exports.
scripts/etl/          Python ETL scripts.
scripts/tests/        Pytest tests for ETL logic.
frontend/public/data/ Generated JSON/CSV data consumed by the frontend.
frontend/src/         Future React + TypeScript application source.
```

## Local Dashboard And Data Operations

Install the Python dependencies and Playwright Chromium once:

```powershell
python -m pip install -r requirements.txt
playwright install chromium
```

Install the frontend dependencies once:

```powershell
cd frontend
npm install
cd ..
```

Start the local automation service and Vite together:

```powershell
python scripts/start_dashboard.py
```

Open `http://127.0.0.1:5173/data-operations` to:

- Enter or edit daily EPS test reports.
- Refresh JC2 browser sessions and Excel exports.
- Download NETA reports and issue attachments.
- Organize renamed reports for GC.
- Run the dashboard ETL as a resumable daily workflow.
- Preview or explicitly confirm CxAlloy uploads as a separate operation.

The automation API listens only on `127.0.0.1:8765`. It uses the sibling
`IAD6_EPS_Testing_Tracker` directory by default. Set `IAD6_EPS_TRACKER_ROOT`
when the tracker repository is stored elsewhere:

```powershell
$env:IAD6_EPS_TRACKER_ROOT = "C:\path\to\IAD6_EPS_Testing_Tracker"
python scripts/start_dashboard.py
```

Run logs are stored under `runtime/automation/` and are not committed.

## Manual Weekly Update Workflow

1. Put the latest module list Excel file into:
   `raw_data/module/`

2. Put the latest SystemElements export into:
   `raw_data/system_elements/`

3. Put the latest Cases export into:
   `raw_data/cases/`

4. Run:

   ```powershell
   python scripts/etl/run_etl.py
   ```

5. Confirm the selected files printed in the terminal are correct.

6. Review:
   `frontend/public/data/etl_run_metadata.json`
   `frontend/public/data/data_quality_report.json`

7. Start the frontend after the ETL succeeds.

## ETL Outputs

Key generated outputs:

- `equipment.json`
- `module_equipment_links.json`
- `cases.json`
- `pdms.json`
- `summary.json`
- `data_quality_report.json`
- `etl_run_metadata.json`
- `cxalloy_report_status.json` (current GC report packages compared with successful CxAlloy upload records)

Normalized JSON files include source file metadata so the dashboard can show exactly which weekly exports were used.

## Tests

Run:

```powershell
pytest scripts/tests
```

## Architecture

- React and Vite provide the dashboard UI.
- FastAPI provides a local-only, allowlisted task runner.
- Existing EPS Tracker scripts remain the source of download, cleanup, and upload behavior.
- No database is required; generated datasets remain under `frontend/public/data/`.
