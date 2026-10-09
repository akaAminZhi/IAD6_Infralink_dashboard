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
- Enter or edit MV daily test reports with Tested And Passed, Partially Tested,
  Failed, and Retested And Passed sections.
- Refresh JC2 browser sessions and Excel exports.
- Download NETA reports, Feeder Cable ATP files, and issue attachments.
- Organize renamed reports for GC.
- Run the dashboard ETL as a resumable daily workflow.
- Preview or explicitly confirm CxAlloy uploads as a separate operation.

EPS reports are stored in the tracker `Daily_test_report/` directory and saving
one rebuilds `daily_tested_equipment.md`. MV reports are stored separately in
`MV_Daily_test_report/`; saving an MV report does not run the EPS wash script.

The automation API listens only on `127.0.0.1:8765`. It uses the sibling
`IAD6_EPS_Testing_Tracker` directory by default. Set `IAD6_EPS_TRACKER_ROOT`
when the tracker repository is stored elsewhere:

```powershell
$env:IAD6_EPS_TRACKER_ROOT = "C:\path\to\IAD6_EPS_Testing_Tracker"
python scripts/start_dashboard.py
```

Run logs are stored under `runtime/automation/` and are not committed.

## Clerk sign-in for Data Operations (free plan)

Data Operations now requires a Clerk session and an authorized operator ID.
Without Clerk configuration remote operations are locked. The local env files
enable optional localhost use without sign-in (described below). Other dashboard
pages remain viewable. The existing read-only MV comments and NETA review
endpoints remain public; all automation operations and all writes require auth.

1. Create a Clerk application and enable **email verification code** sign-in.
   Disable passwords and other sign-in methods if you want email codes only.
2. Set **Restricted / Require invitations** access. Invite only the approved
   email addresses (for example, your three operators). This is included in the
   free plan; Clerk's Allowlist feature is paid and is not used here.
3. After each invite is accepted, copy that user's `user_...` ID from the Clerk
   Dashboard Users page. A new invited account remains unable to operate until
   you add its ID below. Alternatively, manually create the approved users in
   Clerk first and copy their IDs. Remove any existing unwanted accounts.
4. Create `frontend/.env.local` locally:

   ```dotenv
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key
   VITE_LOCAL_OPERATIONS_BYPASS=true
   ```

5. Create `.env.local` at the repository root locally:

   ```dotenv
   CLERK_ISSUER=https://your-instance.clerk.accounts.dev
   CLERK_AUTHORIZED_PARTIES=http://127.0.0.1:5173,http://localhost:5173,https://your-host.ngrok-free.app
   CLERK_ALLOWED_USER_IDS=user_first,user_second,user_third
   AUTOMATION_LOCAL_AUTH_BYPASS=true
   ```

   Use the Frontend API URL / session issuer for the **same Clerk instance** as
   the publishable key. List exact frontend origins, without paths or trailing
   slashes. No Clerk secret key is needed: the backend verifies RS256 signatures
   against the configured instance's public JWKS, issuer, expiration, session
   claims and authorized origin. The operator list is backend-only and can be
   used with the free Clerk plan.
6. Install updated dependencies (`python -m pip install -r requirements.txt`,
   then `npm install` inside `frontend/`), and restart with
   `python scripts/start_dashboard.py`. The launcher loads the root `.env.local`;
   Vite loads the frontend `.env.local`. If starting Uvicorn separately, load
   the root variables yourself or use `--env-file .env.local`.
7. Keep ngrok forwarding to port **5173**. Open `/data-operations` from its HTTPS
   URL. The frontend uses `/api/automation`; Vite forwards that prefix to the
   loopback API on port 8765. A second tunnel is unnecessary. Clear any old
   `VITE_AUTOMATION_API_URL` override pointing to loopback. If the ngrok hostname
   changes, update `CLERK_AUTHORIZED_PARTIES` and restart the backend.

Never commit either environment file. Start with Clerk development keys for a
trial; production uses the production instance's keys, issuer, user IDs and
Clerk's domain setup. The invite restriction controls account creation, while
the backend ID list independently controls operations. Invitation mode does not
by itself promise that Clerk never sends verification emails to other addresses;
check that behavior in your actual Clerk sign-in flow.

To verify remote setup, open the ngrok URL, sign in as an invited, authorized operator and check that
the operations page loads. A signed-in account omitted from the ID list should
see an access-denied message; a direct API request without a token should return
401. CxAlloy live upload still requires its existing explicit confirmation.
JC2/CxAlloy browser logins still happen on the automation host. Keep that host
running and retain its tracker files/sessions for remote operations.

### Optional localhost access without sign-in

Both local env files have now been created in this workspace with blank Clerk
values and local access enabled. They are gitignored. `VITE_CLERK_PUBLISHABLE_KEY`
is Clerk's public frontend application identifier, copied from Clerk Dashboard
**API keys > Publishable key**; it connects the sign-in UI to your Clerk instance.
It is not a secret or a substitute for backend token verification.

With `VITE_LOCAL_OPERATIONS_BYPASS=true` in `frontend/.env.local` and
`AUTOMATION_LOCAL_AUTH_BYPASS=true` in root `.env.local`, opening
`http://127.0.0.1:5173/data-operations` or `http://localhost:5173/data-operations`
does not require Clerk. Local mode connects directly to `127.0.0.1:8765` and
checks backend access before enabling controls, so no Clerk key is needed for
local use. Restart the launcher after changing the files.

Remote browsers still use the `/api/automation` proxy and require Clerk. Vite
overwrites `X-IAD6-Proxied` on forwarded requests; the backend denies local bypass
for any proxied/forwarded request, non-loopback peer/host, or external browser
origin. This prevents a ngrok request from inheriting the proxy's loopback IP.
Keep ngrok pointed at **5173**, and keep the backend bound to loopback. Remove
any old `VITE_AUTOMATION_API_URL` override to use this automatic routing.
Set both bypass switches to `false` and restart to require Clerk locally too.

### VM white screen with "Invalid hook call"

If the browser reports `Invalid hook call` / `useContext` in `ClerkProvider`,
check React resolution and the VM's dependency installation before changing
Clerk authorization settings. Both Vite configs deduplicate `react` and
`react-dom` to the frontend root. On the VM, stop the dashboard, sync the updated
configs and lockfile, run `npm ci` from `frontend/`, then restart the normal
launcher and hard-refresh the browser. `npm ci` replaces the installed dependency
tree and old Vite cache with the lockfile's versions. If the error remains, run
`npm ls react react-dom @clerk/react` on the VM and inspect the actual browser
Console error. Local bypass may hide a Clerk initialization problem because it
does not mount ClerkProvider; always check the ngrok route as well.

The current JC2 SystemElements view URL is stored in the sibling tracker at
`config/jc2_system_elements_url.txt`. Paste the latest DeviceList URL into that
file when the JC2 view changes; Excel, NETA, and Feeder Cable ATP download jobs
all read the same setting. `JC2_SYSTEM_ELEMENTS_URL` can override it temporarily.

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
