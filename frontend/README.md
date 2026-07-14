# IAD06 Equipment Dashboard Frontend

React + TypeScript + Vite frontend for the IAD06 PDM-centric equipment dashboard.

## Run Locally

Run the Python ETL first so the dashboard JSON files exist in `frontend/public/data/`.

```powershell
cd frontend
npm install
npm run dev
```

The frontend reads static JSON directly from `frontend/public/data/`. It does not use a backend, database, or authentication layer.
