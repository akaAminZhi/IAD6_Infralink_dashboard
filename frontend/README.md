# IAD06 Equipment Dashboard Frontend

React + TypeScript + Vite frontend for the IAD06 PDM-centric equipment dashboard.

## Run Locally

The recommended command starts both Vite and the local automation service from
the dashboard repository root:

```powershell
python scripts/start_dashboard.py
```

The dashboard is available at `http://127.0.0.1:5173`. Data Operations uses the
local API at `http://127.0.0.1:8765`.

To run only the frontend:

Run the Python ETL first so the dashboard JSON files exist in `frontend/public/data/`.

```powershell
cd frontend
npm install
npm run dev
```

Most dashboard pages read static JSON directly from `frontend/public/data/`.
Data Operations, MV comments and local NETA review editing use the automation
API; no database is required.

## Remote NETA review viewing

Equipment can display and filter Failed / Review Required reports, including
evidence, using `/data/neta_report_reviews.json` on the website. Remote readers
do not need the local automation service; editing remains local.

The normal ETL generates this snapshot. To update only review results, run from
the repository root before building/publishing:

```powershell
python scripts/etl/build_neta_report_reviews.py
cd frontend
npm run build
```

Publish the updated `dist/` contents, including `data/neta_report_reviews.json`.
For a running Vite server, the generated `public/data/` file is served directly.
The builder honors `IAD6_EPS_TRACKER_ROOT`.

The browser keeps a five-minute in-memory snapshot cache across page navigation
and shares concurrent requests. On the next load after expiration, it revalidates
the file with the server. Reloading the browser also revalidates it. Existing
report matching indexes remain cached. The page shows the snapshot publication
time; local edits appear remotely after regenerating and publishing the data.
