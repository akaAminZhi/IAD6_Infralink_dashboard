# Codex Project Instructions

## Project

IAD6 Infralink Dashboard is a PDM-centric engineering dashboard for equipment
readiness, Infralink NETA completion and reports, issues, third-party EPS test
execution, KPR reporting, and power-plan/MV visualization.

## Stack

- Frontend: React 18, TypeScript (strict), Vite, React Router, Tailwind CSS,
  TanStack Table, Nivo/Recharts, ExcelJS, Lucide icons.
- Data pipeline: Python, openpyxl, PyMuPDF, dataclasses, JSON/CSV outputs.
- Local operations: FastAPI/Uvicorn and Playwright; no database.
- Tests: pytest and Vitest/Testing Library.

## Read First

- `README.md` and `frontend/README.md`
- `ARCHITECTURE.md` for system boundaries and data flow
- `CODEX_HANDOFF.md` for current work only
- `scripts/etl/run_etl.py`, `scripts/etl/schemas.py`, and
  `scripts/etl/tracking_rules.py` for data changes
- `frontend/src/types/data.ts` and `frontend/src/hooks/useDashboardData.ts` for
  frontend data contracts
- `scripts/automation/runner.py` before changing Data Operations

## Important Paths

- `raw_data/{module,system_elements,cases,power_plan}/`: local source files
- `scripts/etl/`: ETL, matching, aggregation, manifests, and quality checks
- `scripts/automation/`: local allowlisted task API and daily-report handling
- `scripts/tests/`: Python tests
- `frontend/src/`: application code and colocated `*.test.ts[x]` tests
- `frontend/public/data/`: generated, gitignored dashboard datasets
- `config/equipment_lifecycle.json`: ordered KPR lifecycle mapping
- `runtime/automation/`: local, gitignored run state and logs

## Verified Commands

Run from the repository root unless noted:

```powershell
python -m pip install -r requirements.txt
playwright install chromium
python scripts/etl/run_etl.py
python scripts/start_dashboard.py
python -m pytest scripts/tests
python -m pytest scripts/tests/test_name.py -q
```

Run frontend commands from `frontend/`:

```powershell
npm install
npm run dev
npm run build
npm test
npm test -- src/path/to/file.test.tsx
npm run test:coverage
```

No lint command or ESLint configuration is currently defined. Do not claim a
lint check was run.

## Conventions

- Preserve strict TypeScript, functional React components, typed props, and
  interfaces in `frontend/src/types/`.
- Follow existing Tailwind utility and shared component patterns; use Lucide
  icons rather than custom inline SVG for ordinary controls.
- Python uses type hints, `pathlib.Path`, dataclasses for normalized schemas,
  small pure transformation helpers, and import fallbacks for module/script use.
- Generated JSON may be a list or a `{ selected_input_files, records }`
  envelope; use `load_records_json`/`unwrapRecords` rather than ad hoc parsing.
- Use `snake_case` for Python/data fields, `PascalCase` for React components and
  TypeScript interfaces, and `camelCase` for frontend functions/state.

## Non-Negotiable Rules

- Preserve the PDM-centric hierarchy: PDM -> equipment -> cases.
- Never drop `issue_image` or `corrective_images`; missing evidence belongs in
  the data-quality report.
- NETA complete with a missing report must remain visible as a quality problem.
- Open-case counts exclude closed/complete/cancelled/void/resolved statuses as
  defined by the existing shared helpers; reuse those helpers.
- Equipment references containing `BATTERY`, `UPS6`, or `MBC`, and direct
  `INV6` assets, do not require EPS/NETA tracking. `TX-INV6` remains tracked.
- Preserve unmatched and ambiguous module/case records for debugging.
- Keep lifecycle stage inventory mutually exclusive. Cumulative NETA totals are
  a separate metric from equipment currently in the NETA lifecycle stage.
- Do not expose arbitrary command execution. Data Operations may run only jobs
  registered in `scripts/automation/runner.py`.
- A live CxAlloy upload requires explicit confirmation.

## Database, Auth, and Security

- There is no database and therefore no migration framework. If a data contract
  changes, update Python schemas/builders, TypeScript interfaces/loaders,
  targeted tests, and regenerated outputs together.
- The dashboard has no application authentication. The automation API is
  designed for loopback use and localhost CORS only; do not expose it externally
  without adding authentication, authorization, TLS, and deployment controls.
- Never commit raw exports, generated datasets, downloaded reports, runtime
  logs, browser auth-state files, credentials, tokens, or environment files.

## Change Discipline

- Inspect `git status` first and preserve all user/uncommitted changes.
- Keep changes scoped; do not refactor unrelated code or reformat whole files.
- Preserve existing behavior unless the task explicitly changes it.
- Prefer existing matching, tracking, readiness, issue-status, and date helpers.
- Run the narrowest relevant tests first, then build; run the full suites only
  when risk warrants it or the user requests it.

