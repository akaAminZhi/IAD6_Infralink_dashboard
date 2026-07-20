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
Only `/data-operations` uses the local automation API; no database is required.
