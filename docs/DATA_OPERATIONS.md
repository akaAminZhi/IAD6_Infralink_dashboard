# Data Operations

Start the dashboard using the [quick start](../README.md#quick-start), then open
`http://127.0.0.1:5173/data-operations`. The automation API binds to
`127.0.0.1:8765`. The launcher uses the sibling `IAD6_EPS_Testing_Tracker`
repository by default. Set `IAD6_EPS_TRACKER_ROOT` to its absolute path when it
lives elsewhere. Run logs are stored in the gitignored `runtime/automation/`.

```powershell
$env:IAD6_EPS_TRACKER_ROOT = "C:\path\to\IAD6_EPS_Testing_Tracker"
python scripts/start_dashboard.py
```

## Choose operator access

Dashboard pages are viewable without signing in. Remote Data Operations requires
a Clerk session and a backend-authorized operator ID. Local operators can opt in
to loopback-only access. See the [authorization model](../ARCHITECTURE.md#authentication-and-authorization)
for endpoint and session details.

### Optional localhost access without sign-in

Add `VITE_LOCAL_OPERATIONS_BYPASS=true` to `frontend/.env.local` and
`AUTOMATION_LOCAL_AUTH_BYPASS=true` to the root `.env.local`, then restart the
launcher. Open Data Operations using `127.0.0.1:5173` or `localhost:5173`. The
frontend checks direct loopback access on port 8765 before enabling controls.
This mode uses the shared `local_operator` profile. Set both flags to `false`
and use Clerk for individual operator identities on the host.

### Clerk sign-in for remote operators

1. Configure email verification code sign-in and invitation-only access in
   Clerk. Invite the approved operators and copy their `user_...` IDs.
2. Add the publishable key to `frontend/.env.local`.

   ```dotenv
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key
   ```

3. Add the issuer, frontend origins and permitted users to the root `.env.local`.

   ```dotenv
   CLERK_ISSUER=https://your-instance.clerk.accounts.dev
   CLERK_AUTHORIZED_PARTIES=http://127.0.0.1:5173,http://localhost:5173,https://your-host.ngrok-free.app
   CLERK_ALLOWED_USER_IDS=user_first,user_second,user_third
   ```

   Use the issuer for the same Clerk instance as the publishable key. List exact
   origins without paths or trailing slashes. The backend verifies session
   signatures using the instance's public JWKS. Keep both env files out of Git.
4. Restart `python scripts/start_dashboard.py`. The launcher loads root settings
   and Vite loads the frontend settings. For a separately launched Uvicorn service,
   provide the root settings in the environment or use `--env-file .env.local`.
5. For an ngrok trial, forward to port 5173 and open `/data-operations` at the
   tunnel's HTTPS origin. Vite proxies `/api/automation` to the loopback service.
   Remove any old loopback `VITE_AUTOMATION_API_URL` override. When the tunnel
   hostname changes, update `CLERK_AUTHORIZED_PARTIES` and restart the backend.
6. Verify that an authorized operator can open the operations page, an account
   outside the backend list sees access denied, and an anonymous automation
   request receives 401. Live CxAlloy upload requires explicit confirmation.

### Personal JC2 and CxAlloy sessions

In Data Operations, click **Refresh login** for the provider. Click a field in the
browser image to type, or use the masked **Send text** box. Complete the provider's
sign-in and MFA, then wait for its page to load and click **Save my session**.
**Disconnect my account** clears your saved state and pending login window.

The host saves each Clerk user's state under `users/<hash-of-Clerk-user-ID>/`
in its auth directory outside the repository. Browser state contains sensitive
cookies. Each run uses the initiating operator's provider state and exposes its
logs and controls to that operator. Jobs share the host's project files and run
one at a time. A missing provider session produces `auth_required`.

The host needs Playwright Chromium (`python -m playwright install chromium`).
Windows Security and passkey dialogs are outside the browser image. Use a
company-permitted browser sign-in method under **Sign in another way** when
available. If the provider requires a passkey, check supported sign-in methods
with the identity administrator. For host-specific SSO or asset domains, set
`AUTOMATION_LOGIN_ALLOWED_HOSTS` to the required exact hostnames. A Windows host
with an interactive desktop can set `AUTOMATION_LOGIN_HEADLESS=false` if the
provider rejects headless Chromium. Restart the service after configuration changes.

The host stores provider browser state under local app data. Set
`CXALLOY_PROJECT_URL` if the personal login needs a different project entry URL.
The default project URL comes from the Tracker upload script.

If the VM shows an **Invalid hook call** in `ClerkProvider`, stop the dashboard,
sync the Vite configs and lockfile, run `npm ci` in `frontend/`, then restart
and hard-refresh the remote page. Use `npm ls react react-dom @clerk/react` and
the browser console if the error persists.

## Daily Data Refresh

The workflow preflights provider access, refreshes JC2 Excel exports, rebuilds
the daily test summary, downloads NETA reports, Feeder Cable ATP files and issue
attachments, organizes GC report names, and runs Dashboard ETL. Review the run
log and resume a recoverable failure from Data Operations. Use the separate
upload job to [preview or explicitly confirm a live CxAlloy upload](REPORT_OPERATIONS.md#preview-or-run-a-cxalloy-upload).

If the JC2 view changes, update `config/jc2_system_elements_url.txt` in the
Tracker with the current DeviceList URL. `JC2_SYSTEM_ELEMENTS_URL` can override
it for a run. Exports, NETA downloads and Feeder Cable ATP share the setting.

See [auto-sync and run ownership](../ARCHITECTURE.md#automation-backend) for the
behavior after a successful manual refresh.

## Daily test reports

Use **New Onsite Daily Report** or **New Offsite Daily Report** under **Daily Test
Report Entry**. Both accept equipment, MV devices and complete cable IDs in
Tested And Passed, Failed and Retested And Passed. Reports are saved as
`YYYY-MM-DD.md` in `Onsite_Test_Report/` or `Offsite_Test_Report/` in the Tracker.
Replacing a report within one site requires confirmation. The same date in the
other site has its own file. Duplicate lines and cross-section entries are kept.

The latest report appears first. **Browse All** opens pages of five, and **Show
Latest Only** collapses the list. Older `Daily_test_report/` and
`MV_Daily_test_report/` files remain available under **Legacy Reports**. Keep
legacy history in those directories. The summaries ignore Partially Tested,
including entries in old MV reports. Correct invalid or undated reports before
rebuilding the EPS summary.

Both the Tracker wash script and its Excel entry point use `daily_report_sources.py`
to rebuild `daily_tested_equipment.md` from source reports. Use matching Dashboard
and Tracker revisions. Legacy MV records retain their existing map and audit
scope. New site records enter EPS matching and completion, including spaced phase
IDs read from structured evidence. Same-day conflicting outcomes favor failure,
and a later passing result clears it.

After saving, verify the summary rebuild, run Dashboard ETL and reload the browser.
A saved report remains available if the rebuild fails. ETL publishes
`eps_daily_report_audit.json` for EPS Test Execution and equipment/map histories.

**Daily Reports / Repeated Tests** defaults to the most recent seven calendar days
in `America/New_York` and shows ten items per page. Two appearances of the same
complete normalized ID count as a repeat, including duplicate lines, failures and
retests. Different phases, child items and Tracker aliases retain separate IDs.
Filters cover site, source, date, ID and repeat type while retaining the source
filenames and line numbers. **All repeat history** clears the date bounds. A `*`
marks a legacy M-D date whose year came from file modification time. The rebuilt
summary is excluded from the repeat evidence.

## Compiled preview

Run `python scripts/start_dashboard.py --preview` for a local compiled preview on
port 5173. Re-run it when frontend source or frontend env values change. JSON/CSV,
report PDFs, issue attachments and references are served from the live public
directories. Successful ETL updates can be viewed by reloading, without a rebuild.
Keep report files and their Tracker directory links available on the host. See
[frontend data loading](../ARCHITECTURE.md#data-loading) for cache and file serving
behavior.
