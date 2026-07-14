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

## Weekly Update Workflow

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

Normalized JSON files include source file metadata so the dashboard can show exactly which weekly exports were used.

## Tests

Run:

```powershell
pytest scripts/tests
```

## Scope

- No backend.
- No database.
- No frontend build in this task.
- `frontend/package.json` will be created later when the frontend is initialized.
