# Codex Handoff

## Current update (2026-10-20): Infralink login and refresh help

- Added Chinese operator guide `docs/INFRALINK_LINKS_HELP.md` and a README link.
  Covers existing-session refresh, login/MFA and pressing Enter to save the
  explicit auth-state file, new-device import/ETL order, Chrome versus automation
  login, personal Data Operations state paths, and common troubleshooting.
- Checked commands against the current refresh builder and sibling NETA login
  script. Documentation-only follow-up; no login, refresh, ETL, build, tests or
  service changes. The guide and Infralink implementation are committed together;
  generated build-info remains uncommitted. Earlier test/build results below
  apply to the implementation; documentation paths and diff checks passed.

## Current update (2026-10-19): Fix Infralink links in signed-out browsers

- User's screenshot showed Device 1297197950 blank with repeated Session 401.
  Reproduced four Session 401 responses in a clean browser context. The first
  implementation linked the embedded Angular details directly and its live test
  reused saved authentication, so it missed the signed-out behavior.
- Shared URL generation now uses JC2's native main-app route:
  `https://jc2.mcdean.com/#:DeviceFullPage;viewModelId=<numeric-id>`.
  This comes from JC2's own full-page action. The main application handles login
  and hosts `/imms-js-webapp/#/details/Device/<id>?fullPage=true` after login.
  Every existing Equipment/PDM/Power Plan/MV/Layout link receives this fix through
  the shared index; cached IDs and equipment data do not need regeneration.
- Real browser checks verified a signed-out click from dashboard port 5173
  displays **Sign in to Job Connect** and the MCDEAN enterprise-account button,
  rather than the embedded app's blank 401 screen. With the saved session,
  screenshot target IAD06-PDU6-02A-2 opens its exact device details without Session
  401. No interactive SSO/MFA login was performed; the signed-out login-page and
  signed-in detail behaviors were tested separately. Automation storage state
  is never copied into ordinary user-browser links.
- Updated all six relevant frontend tests to require the main-app URL. All 60
  tests passed and the preview production build passed with the existing size
  warning. Updated README/architecture and ignored login/browser smoke scripts;
  screenshot `runtime/automation/infralink-signed-out-login.png` reviewed.
  No ETL, Python/data changes, vendor writes, auth-state edits, commit or service
  restart. The original generated build-info bytes from before this fix were
  restored. Refresh the dashboard to load the rebuilt links.

## Current update (2026-10-19): Direct Infralink equipment links

- Added a shared **Open in Infralink** link at the top of Equipment, nested PDM
  equipment (also used by Overview/KPR), Power Plan, MV Equipment and Layout
  equipment details. Layout cable details link to the cable's own Device record.
  New tabs use `noopener noreferrer`; missing/ambiguous identities stay visibly
  unavailable. Exact full equipment IDs are used, with no endpoint/suffix guesses.
- Inspected the sibling EPS Tracker's NETA downloader and its JC2 view config.
  A `DeviceList;dna=...` URL did not reliably apply the filter on first load, and
  search also returned related cable/termination rows. Used the actual detail
  iframe route `/imms-js-webapp/#/details/Device/<numeric-id>` instead. Verified
  IAD06-PDU6-01E-2 opens Device 1301515161 with the matching device heading.
- `scripts/etl/build_infralink_equipment_links.py` adds a local offline builder
  and explicit `--refresh --auth-state` mode. Refresh reads the tracker view's
  contract scope, captures the app's anti-CSRF header only in memory, and queries
  the read-only Device/entities grid. Its HTTP POST is the provider's read query;
  no vendor records, exports, reports or auth-state files are modified. Only
  names and internal IDs enter the ignored cache. Auth errors, incomplete/repeated
  pagination, changed totals and invalid IDs abort before cache replacement.
- Normal ETL registers this offline output and preserves published IDs if the
  host has no local cache. Missing/ambiguous IDs remain in manifest diagnostics.
  Refresh the snapshot for newly added devices. README documents the command and
  deployment requirement to include generated `infralink_equipment_links.json`.
  `InfralinkEquipmentLinksProvider` loads this optional dataset independently and
  reloads when ETL metadata changes; existing equipment/readiness schemas and
  global dashboard loaders retain their behavior.
- Real saved JC2 session read 40,069 project device identities. Generated links
  for all 18,950 current normalized equipment records, zero missing/ambiguous.
  Snapshot: ignored `runtime/automation/infralink_equipment_ids.json`; published
  link dataset is also gitignored. No full ETL or unrelated dataset regeneration.
- Validation: 14 Python tests (mapping, ambiguity, offline reuse, paginated read
  scope, error handling, ETL registration and schemas); 70 frontend tests across
  the common link/provider, nested PDM detail, Equipment, Power Plan, MV, Layout
  and App. Final preview-mode production build passed; existing large-chunk
  warning remains. `git diff --check` passed. No lint or full suites were run.
- Compiled preview browser QA passed on temporary loopback port 5187, covering
  all five detail entry points, Layout cable identity, desktop/mobile visibility,
  actual new-tab navigation to the sample's live Infralink page and no page errors.
  Screenshots visually reviewed: ignored `runtime/automation/infralink-equipment-
  {desktop,mobile}.png`; repeatable checks in `infralink_links_smoke.py`.
  Temporary preview/browser closed afterward; user services were not restarted.
- Per the user's checkpoint request, the prior CxAlloy changes were committed
  first as `6e872a5`. The Infralink feature and operator guide are committed
  together in the following feature commit. The already
  modified generated `frontend/tsconfig.tsbuildinfo` remains uncommitted.

## Current update (2026-10-19): Revoke invalid CxAlloy history

- Fixed TX-HTP6-01E's false equipment Uploaded status. Its sole historical site
  success (2026-06-30) named ATS-TX-HTP6-01E's PDF; subsequent manifest skips
  repeated that assumption, followed by equipment_not_found on Oct 12, 13 and 19.
  No actual uploaded row exists for this target in the local manifest.
- Shared `valid_upload_history` rejects wrong-filename legacy site checks and
  discards earlier target successes on a later equipment_not_found. Manifest
  skips cannot reconfirm them. New successful uploads/site checks can restore
  coverage; auth/upload failures alone preserve valid earlier evidence.
- Status package hashes, per-PDF planning, and guarded uploader completion
  checks now use this filter. Affected targets also discard cached dashboard
  package/file hashes, preventing previous false Uploaded states from returning
  after reload or repeated status builds. Raw valid later successes are rebuilt.
- 49 targeted Python status/guard tests passed, including stale aggregate/file
  caches, repeated builds, wrong Windows-path answer filenames, lookup revocation,
  recovery and upload dry-run/guard regressions. Original append-only upload
  history is preserved; no actual CxAlloy uploads or vendor-source edits.
- Regenerated only CxAlloy status JSON: TX-HTP6-01E's equipment and two cable
  reports are Pending, retaining its Oct 19 07:21:52 equipment_not_found error.
  Same-class false site checks also corrected ATS-TX-INV6-01R (wrong TX-INV6 PDF)
  and HTP6-02E (wrong ATS-TX-HTP6-02E PDF). Overall uploaded/pending is now 417/12.
  Preview production build passed with existing size/timing warnings; generated
  tracked build-info restored. No service restart or full ETL.
- Desktop/mobile fixture smoke and the real TX-HTP6-01E page passed with no page
  errors, showing no equipment Uploaded badge and retaining two Pending cables.
  The user's 5173 service was stopped during QA, so verification used a temporary
  loopback preview on 5187, terminated afterward. Screenshot updated at ignored
  `runtime/automation/cxalloy-report-panel-real.png`.

## Current update (2026-10-19): Separate equipment and cable CxAlloy status

- Equipment detail's CxAlloy panel now separates Equipment Reports from Cable
  Reports. Equipment status is independent of cable additions. Uploaded equipment
  files are collapsed by default; each downloaded cable PDF remains listed with
  its own Uploaded/Pending/Missing local PDF/Review required status. No expected
  total, completion ratio, or assumption that all cables have been downloaded.
- `build_cxalloy_report_status.py` adds `reports` with filename, equipment/cable
  kind, content hash and per-file status. Classification uses LV_CABLE/MV_CABLE
  rename metadata rather than filenames; physical PDFs shared by several source
  references appear once. Existing package verification and the shared upload
  planner prove successful uploads; failed attempts never prove coverage. Prior
  per-file hashes preserve proven contents across renames and later downloads.
  Legacy data without file details prompts a status refresh instead of guessing.
- Regenerated only `frontend/public/data/cxalloy_report_status.json`; overall
  uploaded/pending equipment was 419/10 before the history correction above.
  TX-HTP6-01E's initial Uploaded display was later traced to invalid history.
  No live CxAlloy connection, upload, full ETL, source
  report edits, service restart or commit.
- Validation: 37 targeted Python status/upload-guard tests; 16 frontend panel,
  equipment utility and EquipmentPage tests passed. Initial combined fork run
  passed the four panel tests but timed out starting the other two workers;
  isolated thread retry passed the remaining 12. Preview production build passed
  with existing chunk-size/plugin-timing warnings; generated tracked build-info
  restored. Desktop/mobile browser fixtures passed with no page errors; screenshots
  and repeatable smoke script live in ignored `runtime/automation/` as
  `cxalloy-report-panel-{desktop,mobile}.png` and `cxalloy_report_panel_smoke.py`.
  Real-data smoke now expects TX-HTP6-01E equipment and cables Pending after the
  history correction; screenshot `cxalloy-report-panel-real.png`.

## Current update (2026-10-19): External 2.5D room labels

- 2.5D room names now sit beyond the back edge with 8-unit horizontal text,
  white badges and thin leaders to their rooms, avoiding cabinet roofs. The 2D
  room-label positions and POD labels are unchanged. Shared all-floor fit bounds
  include the projected callouts. Status changes do not move room names.
- Geometry lives in `projectedLayoutRoomLabel`; background rendering and camera
  fitting use the same helper. No equipment geometry, data or ETL changes.
- Ignored browser QA: `runtime/automation/layout_room_labels_smoke.py` checks both
  real floors for label/equipment overlap and 2D restoration, and saves overview
  and detail screenshots as `layout-room-labels-{floor}-{overview,detail}.png`.
- Validation: 14 geometry tests and 38 Page tests passed; the combined run hit
  a Page fork-worker startup timeout, then the isolated Page rerun passed.
  Preview production build passed. Rebuilt 5173 browser check found zero device
  overlaps for all six room labels, verified 2D restoration and no page errors;
  first-floor detail screenshot visually reviewed. No ETL or service restart.

## Current update (2026-10-19): 2.5D electrical hazard visibility

- Energize today and Energized share a 9-unit lightning regardless of equipment
  footprint. User follow-up removed the yellow warning triangles and restored
  the original 2.2-second scale/opacity breathing animation. Reduced motion stops it.
  Unrelated search/connection focus retains 75% marker opacity. 2D keeps its
  existing markers and animation.
- Shared status palettes now color visible roofs and enclosure faces across all
  five device types and full/simple/compact models. Detailed lids previously
  covered the colored body with a neutral top. Doors also follow status shading.
- A map warning key and selected-device hazard card explain energized versus
  scheduled-today equipment; plans remain pending confirmation. Source status,
  browser-local overrides, camera, connections and data contracts are unchanged.
- Browser QA uses ignored `runtime/automation/layout_hazard_smoke.py`, with
  browser-only fixtures for 15 models (five kinds x three states), plus real-data
  loading. Screenshots: `layout-hazard-{models,fixture,real}.png`. No dataset edits.
- Validation: 51 targeted frontend tests passed using one fork worker; the first
  thread run passed 13 model tests but timed out starting the Page worker. Final
  preview production build and rebuilt 5173 browser smoke passed, including
  equal sizes, warning opacity during search, reduced motion and no page errors.
  Existing large-chunk warning remains. No ETL, Python suites, commit or service
  restart; the running local preview reads the rebuilt assets on refresh.
- Triangle-removal follow-up: 38 Layout page tests, the preview build and updated
  browser smoke passed. Verified 10 enlarged breathing bolts, zero triangle icons,
  reduced motion and real-data loading; screenshots regenerated without triangles.

## Current update (2026-10-16): Room cable drops

- Long 2.5D room branches now share a tray-height baseline on each side of a
  hub. Farther branches occupy higher lanes so they clear nearer cabinet drops.
  Rounded bends follow the sloping tray, with their controls included in bounds.
- Real first-floor CDS6-01R-8 / ATS6-01B fan: sampled crossings fell from 6 to 0;
  before/after screenshots are under ignored `runtime/automation/` as
  `layout-room-cables-{before,after}.png`. No ETL or data contract changes.
- Validation: geometry tests 14 passed, Layout page tests 35 passed, and the
  preview production build passed. Geometry required a forks retry after thread
  worker startup timeouts; the Layout tests passed in the combined thread run.
- Rebuilt 5173 preview smoke passed: four updated paths, both floors, 2D/2.5D
  switching and cable visibility, with no page errors. Temporary 5185 stopped.

## Current update (2026-10-15): 2.5D Layout and overhead cable tracing

- Cable readiness follow-up: a System Elements `Feeder Cable ATP` report
  reference now takes precedence as evidence of testing and Infralink update,
  even when the lifecycle status remains Pre-Installation Complete. EPS/MV
  daily reports still determine readiness when no ATP report is attached.
- EPS daily cable follow-up: the Layout builder now reads raw EPS
  `Daily_test_report/*.md` sections by exact full cable ID, stores the latest
  Tested/Failed/Retested And Passed status, date and source filename, and lists
  source-file metadata in `layout_plan.json`. The frontend compares dated EPS
  and MV outcomes; the latest wins and a same-day failure takes precedence.
  Power Plan's equipment logic is unchanged. EPS cable results update when
  Layout data is regenerated by ETL after the daily report changes.
- Report-link follow-up: Layout equipment records now carry `neta_test_report`
  and use Equipment's `NetaReportChips` PDF preview. Cable records carry the
  System Elements `Feeder Cable ATP` filenames and exact downloaded matches
  from Power Plan's ATP index; the Layout cable detail previews matched PDFs
  and identifies referenced PDFs missing locally. Exact full FDR filenames in
  the shared NETA report manifest provide additional cable NETA links. Cable
  readiness and missing-report quality flags remain independent from file
  availability. First-floor real data has 77 placed cables listing ATP files,
  with 56 linked locally; across all 4,326 cable records, 404 list ATP and 356
  have linked local PDFs. Targeted checks passed: 19 Python, 30 frontend; the
  production preview built and real-data browser smoke opened an equipment
  NETA PDF, a cable ATP PDF and a cable NETA PDF with HTTP 200 and no page errors.
- Layout follow-up: duplicate linked ATP/NETA cable filenames appear once,
  equipment PDFs prefer GC-renamed links, and sidebar reports use compact
  single-column rows. In 2.5D, selecting a device, cable, or search result
  preserves the camera. Clear focus reserves its toolbar space so the map does
  not shift vertically; explicit Zoom buttons still change the view. Layout's
  30 frontend tests and a production build passed, and a browser check confirmed
  identical map position and viewBox before and after device selection.
- Performance/visibility follow-up: current-floor 2.5D models remain mounted but
  hidden in 2D after the first 2.5D visit. Static model geometry is memoized
  separately from selection overlays; equipment, cable and background components
  use stable callbacks/memoization. Cable paths, fit frames, lookup indexes and
  diagnostic summaries are cached. `useFrameState.ts` coalesces camera updates
  per animation frame, flushes final drags and cancels pending motion on explicit
  camera commands/unmount. Geometry/appearance and test evidence are unchanged.
- Added explicit Hide all cables / Show all cables controls. Hiding removes line
  marks and hit targets, clears cable focus and stays in effect through Global
  view, searches/connection inspection and floor/view changes. Only Show all
  cables restores lines; the choice lasts for the page visit.
- Follow-up checks: 54 targeted tests passed across the Layout page (27), model
  rendering (6), frame scheduler (4) and existing geometry/selection tests (17).
  One thread-worker startup timed out before Page tests began; the isolated
  rerun passed all 27 Page tests. Real-data smoke verified retained model identity,
  20 wheel events -> 1 camera mutation, final drag position and cable visibility
  across global/search/inspection/floor/view/show actions, without page errors.
  Runtime scripts: `layout_optimized_smoke.py`, `layout_performance_check.py`.
  Before/after performance outputs are ignored `layout-performance-*.json` files.
- Final compiled-preview comparison (same real floor, eight switches each way,
  twelve hover updates, headless Chromium 1600x1100): 2.5D switch median 66.7 ->
  52.8 ms; script CPU across sixteen switches 299.4 -> 135.1 ms; script CPU for
  twelve hover updates 110.3 -> 13.9 ms. Two-frame timings include browser frame
  scheduling and are local measurements, not an FPS guarantee. Retaining models
  increases SVG DOM count (6708 -> 7746) to avoid rebuilding it on view changes.
  Final preview build and optimized real-data smoke passed on port 5173 with
  no page errors. Temporary port 5185 development server was stopped; existing
  preview/automation services remain running. No ETL/Python/data changes in this
  performance follow-up; Python suites were not rerun.

- Visual revision after user feedback: replaced the oblique cuboids with a shared
  orthographic 2:1 grid and five distinct industrial illustrations. Closed shaded
  faces fix the missing side. TX6 includes oil tank/radiators/conservator/brown
  bushings; Utility has instrumented bays; GEN6 has radiator/fans/exhaust; TX has
  a vented housing; ordinary cabinets have doors/meters. Transparent models have
  subtle shadows, restrained outlines and smaller labels.
- Added the always-visible Global view action: clears device/cable/search/box
  focus and restores fitted camera without altering planning or cable visibility
  overrides. Escape does the same outside selection mode; blank map clicks and
  Clear focus cancel focus/search while retaining the camera. Nearby cable runs
  are low cubic arcs, long runs have rounded corners; widths are 3px / 4.5px.
  Connection bends are included in fit/zoom bounds and equipment is depth-sorted
  on the new grid. Room labels follow the same projection.
- Revision QA: targeted model/geometry/Layout tests and a real-data UI smoke in
  `runtime/automation/layout_isometric_restyle_smoke.py`; screenshots use
  `layout-isometric-v2-{overview,models,connection}.png`. The models image is a
  comparison of actual rendered SVG models. Runtime data was refreshed by the
  user since the earlier counts below; this revision did not rerun ETL.
- Final revision checks: 47 frontend tests passed (Layout, model faces/features,
  projection/curve bounds and existing selection helpers) using a single thread
  worker; default fork startup hit an environment timeout before tests ran.
  TypeScript/production preview build passed. No Python/data code changed in
  this visual revision, and Python suites were not rerun for it.
  The final smoke passed on the rebuilt 5173 preview with no page errors; the
  temporary 5185 development server was stopped. Existing local preview stays up.

- `/layout` now defaults to 2.5D with a browser-persisted 2D/2.5D switch. Original
  planar rendering, search, camera, energisation overrides and planning remain
  available. Both views preserve PDF footprints; heights and overhead paths are
  illustrative. 2.5D box selection uses projected device bounds.
- Models: TX6 = MV transformer, Utility = MV switchgear, GEN6 = generator,
  TX = LV transformer, other equipment = cabinet. Room/POD geometry remains a
  reference layer; lightning remains the final, pointer-free SVG layer.
- `scripts/etl/layout_connections.py` derives feeder connections from normalized
  equipment Type and complete endpoint IDs in FDR names. Terminations are excluded.
  Missing, ambiguous and single-ended FD connections remain in the dataset with
  diagnostics, without invented positions. Numeric circuit suffixes are removed
  only when no exact asset exists and a unique asset matches.
- `build_layout_plan.py` adds equipment_type, optional cables/cable_diagnostics
  and MV daily source metadata. It reuses Power Plan's MV daily report parser.
  Existing normalized equipment schemas and global initial requests are unchanged.
- `frontend/src/utils/cableTestUtils.ts` shares MV cable readiness with Layout:
  latest daily failure, then exact L3 updated status, then daily pass/pending,
  partial, or unconfirmed. NETA completion/report quality remains separate.
- Select equipment to highlight connections and see cable IDs/remote endpoints/
  test evidence. Select a line or list item to inspect it, highlight both endpoints
  and zoom to the connection. Cable visibility can be toggled. Cable/termination
  Type records are never rendered as cabinet models.
- Real Layout rebuilt from the existing Oct 15 normalized equipment, without raw
  source edits or full ETL: 3,152 feeder records retained; 232 distinct cable IDs
  have both endpoints on Layout. 2,920 retained diagnostics include 2,833 missing
  Layout endpoints, 59 single-ended IDs and 28 missing source assets. First Floor
  displays 143 connections; Second Floor displays 128, including shared fixed
  connections. Equipment remains 173/171 placements on the respective floors.
- Validation: 21 targeted Python tests, 52 targeted frontend tests and the final
  production build passed. Real-data Playwright verified five model kinds, connection
  IDs/endpoints, tracing opacity, evidence, wheel zoom, projected box selection,
  both floors and plan switching with no page errors. No lint command was run.
- Ignored smoke/screenshots: `runtime/automation/layout_isometric_smoke.py`,
  `layout-2p5d-overview.png`, `layout-2p5d-connection.png` and
  `layout-2p5d-second-floor.png`, plus `layout-2p5d-tested-cable.png` showing a green
  tested connection. Final real-data smoke also passed against the rebuilt 5173
  preview. The temporary 5185 development server was stopped. Use
  `IAD6_PREVIEW_BUILD=1` when building for this
  preview to avoid copying large live public datasets/reports.

## Previous status (2026-10-15): Layout route, two PDF floors

Implemented `/layout`, with a Layout sidebar entry and lazy-loaded route. It
renders equipment rectangle annotations from
`raw_data/power_plan/Floor_Layout_Plan.pdf` as rounded SVG rectangles using
their PDF geometry, with a small visual inset for spacing. PODs and numbered
rooms are shown as noninteractive reference regions. Boundary and fix control rectangles are never drawn, and
the underlying PDF/background drawing is not included. Existing Power Plan,
PDM hierarchy, readiness, tracking exclusions and case evidence were unchanged.

### Current implementation and decisions

- `config/layout_plans.json` is the extension interface: each floor has a unique
  `floor_id`, display `label`, PDF `file_name`, and one-based `page_number`.
  Currently it contains First Floor (page 1) and Second Floor (page 2) of
  `Floor_Layout_Plan.pdf`. The second page was previously absent from this
  config, so rebuilding only generated the first floor. Additional PDF pages
  must be registered here before rebuilding. Additional
  floors can use separate PDFs or additional pages of one PDF.
  The source PDF was renamed to `Floor_Layout_Plan.pdf`; `file_name` in this
  config is the runtime filename setting. Future renames need that field changed
  in every floor entry using the renamed PDF, the Layout builder rerun, and the browser reloaded. Keep the
  floor ID/label/page mapping unchanged for a filename-only rename.
- Second Floor now sets `align_to_floor_id: "first-floor"`. The builder
  translates floor-local equipment and regions together so the room area's
  top/right edges match the reference floor. Room bounds are the anchor; without
  rooms, use all floor-local equipment/regions. References must name an earlier
  configured, available floor; invalid references or empty geometry fail before
  writing output. No scaling occurs. Fixed equipment and POD regions are never
  translated. Floors without this optional config field keep their old geometry.
  The generated manifest contract is unchanged: rectangles contain the final
  display coordinates, while floor width/height remain source boundary sizes.
- `scripts/etl/build_layout_plan.py` emits `frontend/public/data/layout_plan.json`.
  It is registered after equipment normalization in the normal ETL and its
  output is included in ETL output metadata. It also runs independently from
  the project root. Missing PDFs create diagnostics and unavailable floors;
  invalid page numbers, duplicate floor IDs, and missing/multiple boundary
  rectangles fail explicitly rather than publishing misleading geometry.
- Only Square/rectangle annotations with nonempty comments fully contained in
  the page's single boundary are included. Boundary/fix names are trimmed and
  compared case-insensitively. PDF rotation is applied to both controls and
  devices, then coordinates are translated relative to the boundary origin.
- `POD` / numbered POD comments and `E6-110-01` / `E-1-2` room comments are
  region records, excluded from equipment matching, status, search and counts.
  Optional `regions` on floors and `fixed_regions` on the manifest keep older
  generated manifests readable. All 14 real POD regions are inside fix and
  persist across floors. Matching fixed-region geometry copied on later floors
  uses its first source floor; distinct POD placements are retained.
- Region SVG layers have no equipment role, tab stop or selection handler and
  disable pointer events. PODs use pale blue dashed outlines; rooms use neutral
  outlines. Room names now have a fixed centered position near the top inside
  each room, drawn in the background below all equipment. `layoutRoomLabels`
  depends only on region geometry; planning/energisation never moves names.
- Equipment source dimensions and relative spacing are preserved; configured
  alignment translates only floor-local display coordinates. A visual inset
  of up to 0.8 PDF units per edge (bounded to 12% for small devices) creates
  separation. Labels, hit areas and lightning follow the inset rectangles.
- Devices fully inside a fix rectangle form a shared layer visible on every
  floor. The updated real PDF contains one fix rectangle on page 1; page 2
  has its own boundary and no fix control. A common SVG frame
  across floors preserves fixed positions; optional floor alignment handles
  different local boundary origins for floor equipment. All distinct rectangles for repeated equipment IDs are
  retained. If an ID is fixed on multiple source floors, the first configured
  source floor supplies all its fixed placements; later floor copies do not
  duplicate that equipment. Fixed placements take precedence over floor-local
  copies of the same ID.
- Matching reuses Power Plan's case/whitespace/project-prefix normalization.
  Only unique SystemElements matches populate dates and source status.
  Unmatched/ambiguous equipment stays visible as Unknown, with candidate IDs
  retained in the generated source diagnostics. Outside-boundary/empty-comment
  rectangles are also diagnosed, rather than silently discarded.
- Equipment normalization adds nullable `energized_completed_at` to JSON/CSV,
  Python `Equipment`, and the TypeScript equipment contract. It parses only the
  optional exact `Energized: Completed` column using the existing date helper.
  A valid completed date gives Energized/red lightning. N/A, blanks, plain
  Completed, booleans, the separate Circuit Energized column, EPS/NETA state,
  and PDM energisation flags do not determine this state. Older workbooks without
  the column remain supported.
- The Equipment status dropdown was removed per the follow-up request. A single
  Energize today toggle sets/removes that manual override for the selected ID;
  a pressed button indicates the planned state. Excel determines the default
  red Energized marker. Previously saved overrides remain readable and resettable.
  Latest rule: effective Energized status disables the button, with a matching
  click-handler guard. This includes retained manual Energized flags. Shared
  `layoutEquipmentStatus` gives a valid Excel energisation date precedence over
  old browser planning overrides, so they cannot hide confirmed red markers.
  Energize today shows orange lightning; Energized shows red. Both use the
  existing 2.2-second breathing class and reduced-motion rule. Translation is
  on an outer SVG group so breathing does not move the marker away from its
  device. Markers are positioned above rectangles.
- All lightning is now rendered by `EquipmentLightning` in the final SVG
  layer, after all device bodies and the marquee. The layer disables pointer
  events, so flashes cannot block selecting/panning equipment underneath.
  Search dimming is preserved for markers despite separating them from bodies.
  Room backgrounds/PODs, room labels, equipment, selection marquee, lightning
  are drawn in that order. Both orange and red flashes retain breathing and
  reduced-motion support. Energized bodies now use `#f87171` fill, `#b91c1c`
  border/marker and a stronger border width; text remains dark and readable.
- Box select is a MousePointer2 button switching the map from pan to marquee
  mode. Fully enclosed inset device bodies are selected by equipment ID, with
  repeated placements sharing selection. Shift + drag adds another group;
  click/Enter/Space toggles an individual ID. Blue outlines/counts show selection.
  The bulk Energize today (count) action sets all eligible IDs together, skips
  effective Energized states and leaves existing plans intact (idempotent).
  Clear selection/Escape remove selection; Escape/pointer cancellation abandons
  an unfinished marquee. Floor changes, search focus or exit clear selection.
  Existing persistence and global reset handle bulk plans. Selection does not
  move the camera. Canvas focus uses preventScroll to avoid page jumps changing
  pointer coordinates when the canvas extends below the browser viewport.
- Manual overrides are browser-local, keyed by normalized equipment ID, and
  apply to every placement of that ID. They persist through refresh and floor
  navigation until reset; Energize today does not automatically expire at
  midnight. Reset device removes one override; Reset all statuses clears all
  overrides, including hidden floors, and restores Excel defaults. Neither
  changes the source workbook nor shared server state. Invalid stored values
  are ignored; unavailable browser storage falls back to this visit's state.
- The page fetches its own typed layout manifest on mount using `fetchJson`;
  it does not add another dataset to global initial loading or request global
  equipment/case detail data. It provides search, selectable/keyboard-accessible
  rectangles, a details/status panel, zoom, focus on device, fit, and source
  diagnostics. The fixed-size SVG canvas pans by changing its viewBox, using
  pointer capture and a four-pixel movement threshold. Dragging can start on
  equipment and does not select it; clicks and Enter/Space still select.
  A non-passive wheel handler prevents page scrolling and zooms at the cursor,
  accounting for SVG letterboxing. Buttons zoom about the view center, with
  bounded zoom; Fit layout restores the common frame. Manual floor switching
  retains the current camera so fixed equipment stays in place.
  Find equipment offers up to 12 unique ID/floor suggestions from all floors,
  prioritizing exact/prefix matches. Click or Arrow Up/Down + Enter confirms,
  switches floor when required, selects and immediately zooms to the device.
  Escape/blur closes suggestions. Dense original geometry is preserved;
  zoom/search/detail selection provide readable access to small equipment.
- Latest small-device readability: hover or keyboard focus opens a single HTML
  inspection card with a full equipment ID in fixed 16px text, status and fixed
  layer context. Its size is independent of SVG zoom and its position is bounded
  within the map. It has tooltip semantics/aria-describedby and no pointer
  interception. Escape, blur/leave, panning, zooming and floor switching dismiss
  it. Click/tap still opens the details panel. Device rectangles/geometry and
  camera remain unchanged when inspecting.

### Real local data

Latest two-floor manifest was generated on 2026-10-15 against the user's updated
two-page PDF and the existing local equipment dataset.

- Latest alignment rebuild: translated all 83 Second Floor equipment placements
  and 3 rooms by x +657.700, y +400.157 PDF units. The two room areas now share
  top y 430.766 and right x 1222.898. First Floor geometry, 88 fixed equipment
  placements, 14 fixed POD regions and all matching diagnostics were verified
  identical to the pre-alignment manifest. Source PDFs were not edited.
- Page 1: 192 rectangle annotations, comprising 85 floor-specific equipment
  placements, 88 fixed placements, 14 fixed POD regions, 3 rooms, boundary/fix.
- Page 2: 87 rectangle annotations, comprising 83 floor-specific equipment
  placements, 3 rooms and boundary. All device/region annotations are inside
  their respective page boundary. Rooms are `E6-210-01`, `E6-210-02`, `E6-210-03`.
- Generated 256 equipment placements across both floors/shared layer, 255
  distinct IDs. The browser displays 173 placements on First Floor and 171 on
  Second Floor, with the same 88 fixed placements and 14 POD regions on both.
- Four page-2 IDs are unmatched: `CUPP6-01R-3A`, `CDS6-01F-7`, `TX-`,
  `CRAH6-210-03-2`. They remain visible as Unknown and are diagnosed; no ambiguous
  matches. No completed energisation dates are present in this regenerated
  manifest from the current local equipment dataset. Prior snapshot counts and
  the previously confirmed CDS date below describe earlier verification only.
- Rebuilt Layout and Power Plan only. Power Plan now has 5 pages across its
  discovered PDFs, 382/409 equipment annotations matched, 37 ATP links and zero
  missing required ATP files. Equipment normalization was not rerun this turn.
- No raw PDF or workbook was modified by Codex. Generated datasets, screenshots
  and browser smoke scripts remain gitignored. Full ETL was not run; unrelated
  dashboard datasets/header ETL metadata retain their previous refresh time.

### Relevant files

- `config/layout_plans.json`: floor/PDF/page configuration.
- `scripts/etl/build_layout_plan.py`: annotation geometry, fixed layer, matching
  and diagnostics; `scripts/etl/run_etl.py`: orchestration/output registration.
- `scripts/etl/normalize_equipment.py`, `scripts/etl/schemas.py`,
  `frontend/src/types/data.ts`: completed-date and layout contracts.
- `frontend/src/pages/LayoutPlanPage.tsx`,
  `frontend/src/utils/layoutPlanUtils.ts`: map, search, camera interaction,
  regions, fixed background room labels, spacing, electrical status/persistence.
- `frontend/src/App.tsx`, `frontend/src/components/layout/Sidebar.tsx`: route/nav.
- `scripts/tests/test_build_layout_plan.py`,
  `scripts/tests/test_normalize_equipment.py`, `scripts/tests/test_run_etl.py`,
  `frontend/src/pages/LayoutPlanPage.test.tsx`,
  `frontend/src/utils/layoutPlanUtils.test.ts`, `frontend/src/App.test.tsx`: tests.
- `frontend/README.md`, `ARCHITECTURE.md`: operation and architecture notes.

### Tests actually performed

Latest floor-position alignment:

- `python -m pytest scripts/tests/test_build_layout_plan.py scripts/tests/test_run_etl.py -q`:
  15 passed (12 builder, 3 ETL). Coverage includes different room widths/origins,
  right/top alignment, translation of equipment with rooms, equipment-only
  fallback, unchanged shared fixed equipment/PODs, invalid/self references,
  and prior extraction/ETL integration. PyMuPDF deprecation warnings only.
- `python scripts/etl/build_layout_plan.py`: rebuilt the real two-floor dataset
  successfully (256 placements, 4 existing unmatched diagnostics). Compared
  pre/post manifests: only second-floor local positions and generation time
  changed; all translated rectangles share exactly the same x/y displacement.
- Local Playwright against Vite verified room-area top/right screen positions
  match within 0.01 px on both floors, including after panning and wheel zoom.
  Switching retains the viewBox and all fixed device screen bounds. Rechecked
  floor-specific IDs/counts, shared PODs, Unknown devices and second-floor search;
  no page errors. Updated ignored `runtime/automation/layout_two_floors_smoke.py`;
  captured and visually inspected `runtime/automation/layout-aligned-second-floor.png`.
- From `frontend/`, `npm run build` with `IAD6_PREVIEW_BUILD=1`: passed;
  existing large-chunk/plugin timing warnings only. Preserved the previously
  modified `tsconfig.tsbuildinfo` bytes across the build. No React runtime code
  changed, so frontend unit tests were not rerun. No full ETL, commit or deploy.
- Scoped `git diff --check` passed; temporary Vite server closed. Pre-existing
  prompt and other uncommitted edits preserved. README documents the optional
  alignment config, reference ordering and geometry fallback.

Latest second-floor fix:

- `python -m pytest scripts/tests/test_build_layout_plan.py -q`: 7 passed.
  Added a real two-page fixture with different floor-specific equipment/rooms,
  page-specific coordinates and a fixed layer sourced only from page 1. An
  initial expected-coordinate error in the new fixture was corrected to account
  for annotation border expansion on the boundary as well as on equipment;
  the final complete targeted file passed. PyMuPDF deprecation warnings only.
- `python scripts/etl/build_layout_plan.py` and
  `python scripts/etl/build_power_plan.py`: both succeeded against real inputs;
  inspected page numbers, record counts, shared layer and unmatched diagnostics.
- Local headless Playwright against temporary Vite on port 5185 verified the
  real two-floor manifest: dropdown options, 173/171 visible placements, exact
  second-floor annotation IDs, second-floor room names replacing first-floor
  names, unchanged fixed device/POD markup and camera frame, unmatched devices
  visible as Unknown, and first-to-second-floor search confirmation for MDB6-01R.
  No page errors. Script: `runtime/automation/layout_two_floors_smoke.py` (ignored).
  Temporary Vite server closed after verification. Scoped `git diff --check`
  passed for all four changed config/test/documentation files.
- No Python builder/React runtime logic changed; frontend build, frontend unit
  tests and full ETL were not rerun. Existing prompt/build-info edits preserved.

Previous PDF filename rename: updated `config/layout_plans.json`, current README,
handoff and task-note filename references to `Floor_Layout_Plan.pdf`. Ran the real
Layout and Power Plan builders from the project root; both succeeded. Verified
the new source name in both generated manifests, no old name in the Power Plan
manifest, and identical Layout geometry/matching/status payload hashes before
and after the rename (173 device rectangles, zero diagnostics). Source PDF was
already renamed by the user. No Python/React logic changed, so no tests/frontend
build/full ETL were rerun. Scoped diff check passed; unrelated prompt changes
and its existing whitespace were retained.

Latest layering/bulk-selection update:

- `npm test -- src/pages/LayoutPlanPage.test.tsx --pool=threads --maxWorkers=1`:
  19 passed, rerun successfully after the final focus/scroll fix.
- `npm test -- src/utils/layoutPlanUtils.test.ts --pool=threads --maxWorkers=1`:
  6 passed. Initial cold page/utility workers timed out before starting; isolated
  retries passed. Total 25 targeted tests, covering fixed room labels, layer
  order/red styling, fully-contained/reversed-direction selection, deduplicated
  IDs, planning exclusions/idempotence, keyboard/clear/Escape, unchanged camera,
  batch/global reset and clearing selection on floor changes.
- Preview-mode npm build passed (including strict TypeScript). Existing large
  chunk/timing warnings remain. No Python tests/full suites/lint were rerun;
  this change is frontend-only and needs no data regeneration.
- Real Chromium on temporary Vite 5185: selected the confirmed Energized device
  alone (bulk disabled), then Shift-added its room. Selected 30 IDs and planned
  29, leaving the date-confirmed ID red. Verified unchanged viewBox and room-label
  markup, final lightning layer, stronger red fill/border, no page errors,
  browser-refresh persistence and global reset. The first attempts exposed
  canvas focus scrolling the page and disrupting marquee coordinates; fixed
  with preventScroll, then the complete browser check passed.
- Captured and visually reviewed
  `runtime/automation/layout-bulk-top-lightning.png`, showing the actual room
  with all flashes above device bodies and the name fixed in the background.

Earlier checks from this conversation:

Latest Energized lock and readability change: targeted page/geometry run passed
the 4 utility tests but the page worker timed out before starting. Isolated
`npm test -- src/pages/LayoutPlanPage.test.tsx --pool=threads --maxWorkers=1`
passed all 16 page tests (20 targeted tests across runs). Covers source and
retained manual Energized button locks, stale planning flags losing to confirmed
dates, available planning on unenergized devices, and full-ID hover/focus cards
without camera changes. Preview-mode build passed; `npx tsc -b` passed again
after the final parameterized test change. No Python tests were rerun because
this follow-up changed only frontend status/display logic and documentation.
A focused Chromium check passed for a real small device: full-ID card computes
to 16px with an unchanged viewBox, hover/keyboard focus and Escape work, planning
still toggles on unenergized equipment, and confirmed Energized stays locked
even after reloading a stale browser plan. Captured/reviewed
`runtime/automation/layout-small-device-card.png`. Initial automatic SVG clicks
timed out on breathing animation stability; clicking the observed rectangle
center completed the actual interaction check. No app change was needed for
that browser-test locator issue.

Latest room-name correction: reran
`npm test -- src/utils/layoutPlanUtils.test.ts --pool=threads --maxWorkers=1`;
all 4 passed, including centered labels inside the upper third and occupied-band
avoidance. Preview-mode `npm run build` passed again. A focused real Chromium
check verified all three room-name rectangles stay inside the upper third,
their text uses centered anchoring, and none intersects device rectangles.
Captured/reviewed `runtime/automation/layout-room-names-inside.png`.
No data regeneration was needed for this frontend-only placement change.

- `python -m pytest scripts/tests/test_build_layout_plan.py scripts/tests/test_normalize_equipment.py scripts/tests/test_schemas.py scripts/tests/test_run_etl.py -q`:
  latest run **23 passed**, dependency deprecation warnings only. Covers actual
  annotated PDF fixtures, rotated coordinates, boundary filtering, fix regions,
  multiple floors, uncertain matches, missing PDF/boundary, duplicate floor IDs,
  POD/room classification and exclusion from equipment diagnostics,
  completed-date parsing and exact-column isolation, optional old exports,
  schemas and ETL registration. Initial fixture expectations were corrected for
  PyMuPDF's annotation border expansion; final run passed.
- From `frontend/`, targeted Layout page, geometry utilities and App route
  tests: **26 passed across runs** (12 page, 4 utilities, 10 App tests).
  The initial three-file threads run passed App/utilities (13 tests) but the
  Layout worker timed out before starting. Its isolated retry passed all 12.
  Added fixed-region deduplication coverage and reran the 4 utility tests.
  Final page/utilities run after selector typing fixes passed all 16 tests.
  Commands:
  `npm test -- src/pages/LayoutPlanPage.test.tsx src/utils/layoutPlanUtils.test.ts src/App.test.tsx --pool=threads --maxWorkers=1`,
  `npm test -- src/pages/LayoutPlanPage.test.tsx --pool=threads --maxWorkers=1`,
  `npm test -- src/utils/layoutPlanUtils.test.ts --pool=threads --maxWorkers=1`,
  `npm test -- src/pages/LayoutPlanPage.test.tsx src/utils/layoutPlanUtils.test.ts --pool=threads --maxWorkers=1`.
  Covers retained placements, cross-floor hints/keyboard/automatic focus,
  pointer dragging from equipment without selection, wheel event prevention,
  cursor anchoring with letterboxing and zoom limits, reference-region roles,
  room-label clearance, spacing/center preservation, Energize today toggling,
  persistence/reset, default red markers, retries and lazy route loading.
- `$env:IAD6_PREVIEW_BUILD='1'; npm run build`: final build passed, including
  strict TypeScript. Existing large-chunk warning remains. Preview build omits
  copying large public datasets/reports; this is not a static publishing build.
- Latest local Chromium/Playwright on temporary Vite port 5185: verified 175
  rounded device rectangles/90 fixed, 14 PODs, 3 rooms and their nonoverlapping
  name bands. Regions have no button role/tab stop. Verified drag from equipment
  without selection, cursor-anchored wheel zoom without page scroll, suggestions
  and Enter confirmation directly zooming to the device, removed dropdown,
  workbook-derived red lightning, manually set
  orange lightning, 2.2-second breathing, marker bounds above the device,
  refresh persistence, global reset, and disabled animation with reduced motion.
  No page errors. A browser-only synthetic second-floor dataset verified that
  all 90 fixed placements and 14 PODs keep screen coordinates/manual status while
  85 floor devices and the three rooms disappear. No second-floor PDF exists yet.
- Captured and visually reviewed `runtime/automation/layout-plan-v2-overview.png`
  and `runtime/automation/layout-plan-v2-device.png` (initial screenshots also
  retained). The in-app browser execution
  tool was unavailable; standalone local Playwright was used. The browser
  check caught unintended deduplication of repeated PDF IDs, which was fixed
  and covered by a regression test before the final browser/test/build runs.
- No full suites or lint command were run. No commit, deployment, live vendor
  operation, credential change, or existing user service restart was performed.
  The user's pre-existing `prompt.md` changes were preserved.
- `git diff --check -- . ':(exclude)prompt.md'` passed. The unrestricted check
  reported existing whitespace in the user's modified prompt, which was left
  intact. Restored the build-generated tracked TypeScript build-info file and
  stopped the temporary Vite server after verification.

### Refresh and follow-up

Save/close the sources, then run from the root:

```powershell
python scripts/etl/normalize_equipment.py
python scripts/etl/build_layout_plan.py
```

Reload `/layout`. Normal full ETL also refreshes this dataset. For a compiled
preview, rebuild/restart once to load the new route; subsequent data rebuilds
use the existing live-data service. For static hosting, use an ordinary build
and publish its code/data. Add future floors to the config and regenerate;
multi-floor behavior has fixture coverage, while real geometry alignment needs
verification when those PDFs are supplied. Current source matching is complete;
no unmatched-ID follow-up remains from the latest drawing.

## Previous Status (2026-10-13)

Remote Microsoft login: user screenshots showed an unrendered Windows Security
passkey dialog on the VM and blocked aadcdn.msauthimages.net assets. Added
Microsoft image-CDN suffixes with boundary checks. Browser contexts now install
an init script on the three exact Microsoft login origins to reject WebAuthn
get/create public-key requests with NotAllowedError and report platform and
conditional authenticators unavailable. Non-public-key requests still delegate;
no credentials are fabricated and MFA is not bypassed. Microsoft must offer a
company-permitted alternative; passkey-only policy remains unsupported by this
screenshot-based remote flow. UI and README explain Other ways to sign in.

20 targeted Python tests passed, including real Chromium local fixtures for
pages/frames/popups, API delegation, MFA/save and owner isolation. Four existing
frontend dialog tests passed. Preview-mode npm build (IAD6_PREVIEW_BUILD=1)
passed with existing chunk/timing warnings; diff check passed. No real Microsoft
account sign-in, VM deployment, service restart or commit performed. Sync source
to the VM, restart dashboard services, and open a new personal login window;
real tenant fallback behavior still needs a VM trial.

CxAlloy duplicate-report fix: local 291 pending comprised 278 previously
uploaded equipment packages with 499 added LV cable PDFs and 13 without
completed history. The old uploader dry-run selected 292: PDU6-03F-5's
unchanged reports had new filename suffixes. Added dashboard-owned guarded
upload adapter and shared per-PDF evidence planner. Registered upload job now
invokes the adapter with EPS root and personal auth state; Force is unsupported.
Verified old package hashes recover original site filenames. Whole unchanged
packages are skipped; changed packages send only new attachments and retain
the original equipment answer. Unverifiable history/changed files, missing
historical site aliases or unknown site PDFs fail closed. Successful manifests
record actual site filenames/hashes. Exceptions become failed rows so earlier
successful groups can still be persisted. Original sibling uploader unchanged.

58 targeted planner/status/runner/personal-session/API tests passed. Native
uploader import and real-files dry-run verified PDU6-03F-5 skips all 15 PDFs.
One extra identical-content source is also covered, making current totals
93 uploaded / 290 needing additions, with 556 candidate new PDFs before site
filename checks. Status output regenerated, no live CxAlloy connection/upload,
credentials, upload-manifest or Excel changes. No frontend changes/build needed.
Local inspection took roughly 10 seconds for 2187 PDFs; not a VM benchmark.
Use Data Operations or scripts/automation/cxalloy_upload.py, not the original
standalone vendor command, to get these safeguards. Runtime services not
manually restarted. No commit made.

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
