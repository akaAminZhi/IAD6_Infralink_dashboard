# Codex Handoff

## Current Status (2026-10-12)

Local ETL reported PermissionError for eps_history/snapshots/2026-06-05.json.
The builder rewrites historical snapshots via shared write_json. Changed that
helper to write a sibling temporary file and atomically replace the output,
retrying PermissionError four times with bounded delays. Persistent errors
identify the output and suggest checking permissions/read-only/OneDrive locks;
the old output survives failed replacement and temporary files are cleaned up.
28 JSON helper/EPS builder/ETL orchestration tests passed. Subsequent local
inspection confirmed Windows sharing violation 32; Restart Manager and psutil
identified orphaned `node ... vite.js build` PID 13100 (parent no longer present)
holding this exact snapshot. Stopped only that stale build, verified write
access without changing contents, and ran the real EPS builder successfully.
Full real local ETL then completed all 16 steps with exit code 0 and regenerated
dashboard outputs. No ACL changes or dashboard service restarts were needed.

Remote JC2 login trial reached company SSO `idp.mcdean.com`, which the new
network allowlist blocked. Added that exact host to the built-in allowlist;
other company subdomains and lookalike suffixes remain blocked. Restart the
backend and open a new login window after syncing this fix to the VM.

Latest personal-account remote-login implementation: Windows VM; user requires
individual JC2 accounts with Microsoft phone MFA and individual CxAlloy accounts
with username/password. Added `browser_login.py`, `user_sessions.py` and
BrowserLoginDialog. Refresh login opens an owner-bound web-controlled Chromium
page (screenshot/click/type/keys/scroll), not the old VM-only login task. No
additional service/tunnel/dependency is required beyond existing Playwright.

State is saved only after returning to the provider origin with no visible
password fields/auth routes and some browser state. Per-user auth files are
outside the repo, hashed by verified Clerk ID. All five external job types get
explicit personal --auth-state paths; missing states never use old VM states.
Run IDs/metadata are owner-bound, and other users cannot read logs, resume,
cancel, view/control/close browser sessions or delete another user's auth state.
Global job serialization is retained and its reservation made atomic. API JSON
responses use no-store; browser inputs/screenshots are not persisted or logged.

Old /logins/{provider} endpoints return 410. CLI maintenance paths remain;
remote clients must use new browser-logins endpoints. Existing shared auth files
are kept but not migrated to users. Each user must connect once after deployment.
Disable local bypass for strict personal identity on localhost; otherwise the
anonymous local operator has its own profile. Clerk tokens take precedence even
with bypass enabled. Optional additional SSO hosts / headless override are
documented in README. Browser lifetime is 20 minutes, cap six active contexts.

Verification so far: 66 Python auth/API/runner/personal-isolation tests passed.
A real Windows Chromium fixture test exercised remote typing, simulated phone
MFA, guarded save and cross-user rejection; passed after increasing fixture
startup wait from 15 to 45 seconds for cold Chromium startup. It did not contact
real vendor accounts and the saved fixture state contained no entered password.
Frontend dialog tests 4 passed; DataOperationsPage tests 5 passed (including the
new web-login trigger), automationApi tests 6 passed. Preview build passed;
real Microsoft tenant MFA and provider policy must be trialed by the user on VM.
No live uploads, ETL, real provider login, credential inspection or service
restart was performed. No commit was made.

Latest Equipment report-preview fix: reproduced a real report URL returning
200 text/html (dashboard SPA) in compiled preview when the PDF existed in the
live public junction but not dist. Locally, live report counts were 1666 original
and 1871 GC PDFs versus 1613/1810 built copies. Added `liveReportsPlugin.js` in
both Vite configs to serve PDF-only reads from the two live report roots, support
HEAD/byte ranges, and block missing reports with 404 before SPA fallback. Root
junctions are supported; path/realpath checks prevent escaping their configured
targets. Existing file/link data and equipment UI were not modified.

16 Node file-service tests passed (8 live-data + 8 report/attachment tests), including actual
preview, junctions, encoded names, hot file changes, stale/missing files, ranges,
methods and traversal. Real report smoke after the fix returned 206,
application/pdf and `%PDF-` for the same missing-in-dist report; a nonexistent
PDF returned 404. Report files were read only; fixtures/temporary servers cleaned
up. Sync the new plugin/declaration/configs to the host and restart preview.
This requires live report files/junctions on that host; git does not carry them.
Issue images and reference drawings are also served live from their existing
public roots. Preview launcher builds set `IAD6_PREVIEW_BUILD=1` for the build
subprocess to omit public-file copying; regular npm builds retain copying for
static publication. The ordinary full build was stopped after prolonged local
public-file copying. A temporary code-only build passed, then the actual
preview-mode `npm run build` passed in 2.41s (including TypeScript). Compiled dist
was regenerated successfully; existing size warning remains. No raw reports,
datasets or user services were changed/restarted.
Final actual-config smoke verified ordinary builds still copy public files,
preview builds omit them, compiled entry and live summary return 200, and a real
live PDF range returns 206 with `%PDF-`. Launcher CLI help and diff check passed.

Latest compiled-preview live-data change: new `frontend/liveDataPlugin.js` is
registered in both Vite configs. It intercepts `/data/` JSON/CSV reads before
static/SPA middleware and streams current `frontend/public/data/` files with
`Cache-Control: no-store`. Compiled application JS/CSS are still served from
dist. Missing live files return 404 rather than stale dist copies; method,
extension, path and realpath containment checks limit access. `fetchJson` uses
`cache: no-cache` to revalidate any previously cached data. Data Operations'
existing successful-ETL detection invokes dashboard reload, so updated JSON
appears without restarting or rebuilding preview. Other open browser sessions
need their own refresh; this does not add a broadcast/background refresh system.

Verification: 8 Node HTTP tests passed, including actual Vite preview with live
file replacement while retaining compiled assets, missing-live/stale-dist
behavior, HEAD/CSV, methods, traversal, and escaping directory links. Loader
tests passed all 5. Data Operations' worker timed out before starting in the
combined run; an isolated retry passed all 4 tests, including successful-ETL
dashboard reload (9 targeted frontend tests total). Build passed with the same ~338 KB
entry and existing size/timing warnings. No real ETL or user service restart was
performed; fixture files/temporary servers were cleaned up. Re-run the normal
`--preview` launcher once to load the new plugin; future ETL refreshes need no
code build. Source/frontend env changes still require restart/rebuild.

Latest first-load optimization: all route pages now use React.lazy with a shared
Suspense boundary; simultaneous `fetchJson` reads of one URL share a pending
request (settled results are not cached). Added launcher `--preview` to build
once before serving compiled frontend assets on the existing port 5173, retaining
the Vite API proxy and Clerk settings. Ordinary launch remains development mode.
Local build entry fell from 972.23 KB to 338.39 KB; this is bundle-size evidence,
not a measured VM page-load speedup. Initial JSON loading remains unchanged:
16 datasets total 14,875,986 bytes locally. Further route-specific data loading
would need careful handling of Overview's PDM drawers and summary metrics.
Build and compiled-preview HTTP smoke passed (HTML/entry 200, API proxy retained).
Data loader tests: 5 passed; App route/loading tests: 9 passed. The data-hook
worker timed out before starting in the combined run; the isolated retry passed
all 6 tests (20 targeted frontend tests passed across the runs).
README documents preview use; no running user services were restarted.

Latest VM troubleshooting: browser Console reported Invalid hook call and
`useContext` failing inside ClerkProvider, causing a white screen. Added
`resolve.dedupe: ['react', 'react-dom']` to both Vite configs. Local dependency
inspection shows React/ReactDOM 18.3.1, shared Clerk/application React path, and
active dedupe in the JS config; production build passed. The VM dependency tree
and cache were not accessible or reproduced locally. Sync the configs and
lockfile, stop the VM services, run `npm ci` in frontend, restart and hard-refresh;
if it persists inspect `npm ls` on that VM. README includes these recovery steps.

Implemented a first Clerk authentication version for Data Operations using the
free-plan invitation workflow. It is ready for user configuration, not a live
Clerk rollout. No Clerk application, keys, invitations or user IDs were provided,
so real email delivery/sign-in has not been exercised. No commit or deployment
was performed. Worktree was clean at the start of this implementation turn.

- Frontend: `@clerk/react`, a sign-in gate around `/data-operations`, account
  controls, token attachment to API calls, and a backend access check before
  mounting operations. Missing publishable key leaves remote operations locked.
  Optional localhost mode skips Clerk and checks the direct loopback API first.
- Backend: `scripts/automation/auth.py` validates RS256 sessions against an
  explicitly configured issuer/JWKS, expiry/not-before, authorized origin, active
  session status and `CLERK_ALLOWED_USER_IDS`. Missing config denies remote access.
  User-requested opt-in localhost bypass requires a direct loopback peer/host,
  local browser origin, and no forwarded/proxy headers. All remote writes and
  operational reads require auth. Only MV
  comments and NETA review GETs retain public dashboard viewing.
- Free-plan setup: Clerk Restricted / Require invitations, invite approved email
  addresses, then add their Clerk user IDs to the backend operator list. This
  intentionally avoids the paid Clerk Allowlist feature. Invite mode does not
  guarantee that every non-invited email is blocked before verification email
  delivery; that exact behavior needs a real-instance trial.
- `/api/automation` now defaults to a relative URL. Both Vite configs proxy this
  prefix to `127.0.0.1:8765` for dev/preview, so the existing ngrok tunnel to 5173
  can carry authenticated API calls. Preserve the JS config's ATP middleware.
- `scripts/start_dashboard.py` loads root `.env.local`; Vite reads frontend
  `.env.local`. See README's Clerk section for exact values and trial steps.
- Created both gitignored `.env.local` files with blank Clerk values and
  `AUTOMATION_LOCAL_AUTH_BYPASS=true` / `VITE_LOCAL_OPERATIONS_BYPASS=true`.
  Restart the launcher to use them. Local pages use the direct API on 8765;
  remote pages retain the Vite proxy. Both Vite configs overwrite
  `X-IAD6-Proxied: 1`, which explicitly prevents the proxy's loopback IP from
  qualifying for backend local bypass. Turn both flags off to require local auth.
- Node TS config now uses Bundler resolution and emits config build artifacts
  into `node_modules/.cache/tsconfig-node`. Previously `tsc -b` overwrote the
  hand-maintained `vite.config.js` and failed resolution against installed Vite
  8/plugin-react 6. Existing JS ATP behavior was restored and verified.

Verification completed:

- Python auth/API tests: 45 passed after the localhost update. Signed RSA fixtures cover valid operators,
  invalid signatures/algorithms, issuer, expiration, not-before, origin, pending
  sessions, non-operators, missing claims/config and unauthenticated operations.
  Local-bypass checks cover direct loopback, opt-in behavior, non-loopback peers,
  proxy/forwarded headers, external hosts/origins and cross-site requests. After
  correcting localhost-to-127.0.0.1 browser-origin handling, all 39 auth tests
  passed again.
- Frontend: 19 passed across OperationsAuth, automationApi, DataOperationsPage
  and EquipmentPage. EquipmentPage needed a retry after its old loopback URL
  mock was updated for the relative API path; all targeted files passed.
- `npm run build`: passed; existing large-chunk/plugin timing warnings remain.
- Temporary Vite/probe-backend smoke check: actual config is `vite.config.js`,
  ATP plugin present, proxy target correct, Authorization forwarded, simulated
  anonymous/authorized responses 401/200. This is a proxy test, not a live Clerk
  verification. Temporary servers closed after the test.
- Local-mode integration check against a temporary real Uvicorn backend and
  actual Vite proxy: direct localhost access 200, ngrok-host proxy access 401,
  spoofed local Origin/proxy-marker access 401. Both temporary servers closed.
- Latest localhost-update frontend checks: OperationsAuth, localOperations and
  automationApi passed all 14 tests. DataOperationsPage's worker timed out before
  starting in that combined run; an isolated retry passed all 4 tests (18 total).
  The updated production build and `git diff --check` also passed.
- New npm/Python dependencies installed. No raw data or generated datasets were
  intentionally modified. Generated tracked TS build artifacts restored.

Next step: configure Clerk email-code sign-in and Restricted access, provision
the approved users, fill local env values, restart dashboard services, and test
from the actual ngrok URL. Keep the exact ngrok origin in authorized parties.
The automation host still owns JC2/CxAlloy browser sessions and file access;
live CxAlloy upload continues to require explicit confirmation.

## Previous Completed Work (2026-10-01)

Implemented workbook-backed PDM energisation filtering and Power plan lightning
markers. Local PDM outputs were regenerated and the frontend was built. No git
commit or deployment was performed. The worktree was clean at the start of this
implementation turn; generated TypeScript build-info changes were restored.

## Current Implementation

Source, relative to the project root:
`../IAD6_EPS_Testing_Tracker/Excel/skid_shipping_testing_energisation_tracker.xlsx`

- The source is also resolved through `IAD6_EPS_TRACKER_ROOT` when configured.
- The importer locates the header within the first 30 rows of each worksheet.
  The actual `SKID Tracker` sheet has its header on row 4. Required columns:
  `Skid Name`, `Energised Offsite? (Yes/No)`, and
  `Onsite Energisation Performed? (Yes/No)`.
- `energised_offsite` and `energised_onsite` are nullable booleans on each PDM.
  Yes/No are case-insensitive; blank values remain unknown (`null`). Other
  values remain unknown and are listed in diagnostics. Shipping and CxAlloy
  columns do not determine energisation.
- `build_pdm_dataset.run_build()` enriches `pdms.json` and `pdms.csv` and writes
  `pdm_energisation.json` with source metadata, source row numbers, raw values,
  invalid fields, matching methods, candidate PDMs, and match statuses. The
  diagnostic output is registered in ETL output metadata. The workbook is also
  included in the PDM JSON's `selected_input_files` when available.
- The existing typed PDM loader/`unwrapRecords` carries the new fields; no new
  browser request or automation endpoint is needed.
- PDMs has an Energisation dropdown (All / Energised Offsite / Energised Onsite)
  and a sortable Energisation column. The filter combines with existing filters
  and search and is cleared by Reset.
- Power plan shows a yellow Lucide lightning marker above each offsite skid,
  with a 2.2-second breathing animation. Confirmed onsite energisation uses red.
  Both colors are explained in the legend. Reduced-motion preferences disable
  the animation.

## Important Decisions

- Only an explicit Yes creates a positive flag. Unknown, absent, invalid, or
  ambiguous data never creates an energisation marker. EPS/NETA completion is
  independent and readiness calculations are unchanged.
- PDM matching first uses the complete name with case/whitespace normalization.
  A narrowly scoped fallback treats a numbered `...-CDS[-R]` as an alias of
  `...-PRIMARY-CDS[-R]` only when it resolves uniquely. It preserves the `-R`
  suffix and never merges primary and redundant skids. Exact matches win.
- Duplicate source rows or multiple candidate PDMs remain ambiguous and do not
  populate flags. Unmatched rows remain in the diagnostic output.
- Offsite and onsite flags are independent history: a PDM marked Yes in both
  appears in either filter. The table label and map marker prioritize onsite.
- Color extension points: `ENERGISATION_COLORS` in
  `frontend/src/utils/energisation.ts` changes default marker/legend colors;
  `EnergisationMarker` also accepts a `color` prop for a per-instance override.
- Missing workbooks produce unknown flags and an unavailable diagnostic output,
  replacing stale flags during a successful rebuild. Locked or malformed
  workbooks fail explicitly before new PDM outputs are written.
- Raw workbook and generated data remain uncommitted. The source was read only.

## Real Data Verification

- 245 PDMs in the dashboard; 54 source rows, all matched; zero invalid-value rows.
- Offsite: 4 Yes, 1 No, 240 unknown across dashboard PDMs.
- Onsite: no confirmed values; all 245 PDMs remain unknown.
- Confirmed offsite PDMs:
  - `IAD06-PDM-E6-110-01-PRIMARY-CDS`
  - `IAD06-PDM-E6-110-02-PRIMARY-CDS`
  - `IAD06-PDM-E6-110-02-PRIMARY-CDS-R`
  - `IAD06-PDM-E6-120-03-PRIMARY-CDS-R`
- The final entry uses the workbook's `IAD06-PDM-E6-120-03-CDS-R` alias.
- Compared PDM records before/after regeneration with only the two new fields
  excluded: all existing PDM, equipment, and case data were identical.

## Relevant Files

- `scripts/etl/pdm_energisation.py`: import, parsing, matching, diagnostics.
- `scripts/etl/build_pdm_dataset.py`: PDM enrichment, JSON/CSV publication.
- `scripts/etl/run_etl.py`: diagnostic output registration.
- `scripts/etl/schemas.py`, `frontend/src/types/data.ts`: nullable flag contracts.
- `frontend/src/pages/PdmPage.tsx`, `frontend/src/components/pdms/PdmFilters.tsx`,
  `frontend/src/components/pdms/PdmTable.tsx`: filtering and status display.
- `frontend/src/pages/PowerPlanPage.tsx`: markers and legend.
- `frontend/src/components/pdms/EnergisationMarker.tsx`,
  `frontend/src/utils/energisation.ts`, `frontend/src/index.css`: color API,
  onsite precedence, animation, and reduced-motion handling.

## Tests Actually Performed

- `python -m pytest scripts/tests/test_pdm_energisation.py scripts/tests/test_build_pdm_dataset.py scripts/tests/test_schemas.py scripts/tests/test_run_etl.py -q`:
  14 passed; dependency deprecation warnings only. Covers real workbook-shaped
  inputs, Yes/No/unknown, invalid values, missing sources/headers, aliases,
  unmatched/ambiguous records, environment override, and output integration.
- From `frontend/`:
  `npm test -- src/pages/PdmPage.test.tsx src/pages/PowerPlanPage.test.tsx src/components/pdms/EnergisationMarker.test.tsx src/hooks/useDashboardData.test.ts src/utils/pdmUtils.test.ts src/utils/powerPlanUtils.test.ts --maxWorkers=1`:
  32 tests passed across five files; the loader-test fork worker timed out before
  starting. Retried that file with
  `npm test -- src/hooks/useDashboardData.test.ts --pool=threads --maxWorkers=1`:
  all 6 passed. Thus all six targeted files passed across the runs (38 tests).
- `npm run build`: passed after final implementation changes; existing large
  chunk and plugin timing warnings remain.
- Ran the PDM builder against the real local inputs and verified the counts and
  before/after equality above. Did not run the full ETL.
- Local headless Playwright against Vite: offsite filter returned 4 PDMs; onsite
  showed 0; E6-110 had 3 markers and E6-120 had 1. Verified yellow fill, 2.2-second
  animation, and disabled animation under reduced motion. Captured and visually
  reviewed PDM and Power plan screenshots. The first browser attempt used an
  overly strict label locator; the corrected locator passed. The in-app browser
  execution tool was unavailable, so local Playwright was used.
- `git diff --check`: passed. No full test suites or lint command were run.

## Refresh / Follow-up

Save and close the source workbook before refreshing if Excel holds an exclusive
lock. Run `python scripts/etl/build_pdm_dataset.py` from the project root to refresh
only PDM data, or use the normal full ETL. Refresh the browser afterward. Static
hosting requires rebuilding and publishing the updated frontend and datasets.

No feature implementation remains. Real onsite data is currently blank; onsite
filtering, red marker priority, and color overrides are covered by test fixtures.

Suggested commit:
`feat: add PDM energisation filters and animated power plan markers`
