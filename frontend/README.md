# IAD06 Equipment Dashboard Frontend

React + TypeScript + Vite frontend for the IAD06 PDM-centric equipment dashboard.

## Run Locally

The recommended command starts both Vite and the local automation service from
the dashboard repository root:

```powershell
python scripts/start_dashboard.py
```

The dashboard is available at `http://127.0.0.1:5173`. Data Operations uses the
same-origin `/api/automation` proxy, forwarded to `http://127.0.0.1:8765`.
Data Operations requires Clerk sign-in and a backend-authorized operator ID;
see the root README's Clerk setup instructions. Missing Clerk configuration leaves
remote operations locked. Optional localhost access without sign-in is enabled
in the newly created local env files; restart the launcher to use it.

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

## Layout

Layout opens in **2.5D** by default; **2D plan** restores the original rectangle
view. The last view choice is saved in this browser. TX6, Utility, GEN6, and TX
use MV transformer, MV switchgear, generator, and LV transformer models;
other devices use cabinet models. Footprints retain the PDF coordinates;
heights and overhead cable routes are illustrative, not surveyed geometry.
Models use one orthographic 2:1 isometric grid, with filled light top, medium
left and dark right faces. MV transformers include an oil tank, radiator bank,
conservator and brown ceramic bushings; switchgear has separate instrumented
bays; generators have a radiator, roof fans and exhaust; LV transformers use a
ventilated housing; ordinary cabinets have a door, meter and handle. Model
backgrounds are transparent, with restrained outlines and ground shadows.

**Global view** clears equipment/cable focus, search and box selection and restores
the fitted camera. **Escape** does the same outside box
selection. Clicking empty map space or **Clear focus** removes focus/search
without moving the camera. Planning overrides are unaffected. Nearby cables
use low cubic arcs. FIX-to-FIX routes keep taller arcs; longer room routes rise
straight from each cabinet to a rounded overhead band along the cabinet rows.
Tested routes use solid green or blue
lines; failed and unconfirmed routes remain dashed. Room lines are
lighter than FIX lines. Multiple cables between the
same two devices run in separate upward lanes. Selecting a cable or connected
device widens its route.

**Hide all cables / Show all cables** is an explicit visibility control. Hidden
cables stay hidden through Global view, equipment/connection inspection, floor
changes and 2D/2.5D switching until Show all cables is clicked. Connections and
test evidence remain accessible in the side panel. The preference lasts for the
current page visit.

After the first 2.5D visit, visible equipment models stay mounted when switching
to 2D, so repeated view switches can reuse their SVG nodes. Static
models, background regions and cable components are memoized; cable paths and
both fit frames are cached. During a 2.5D drag, a bounded SVG canvas moves with a
temporary compositor transform and the camera commits on release. Only models
and cables near the visible camera are drawn. Small models use simpler 2.5D
enclosures; dense floors reuse shared 2.5D silhouettes instead of repeated
shapes. Selected and inspected equipment keeps its full detail. The 2D view
continues to use its existing camera updates.

For a repeatable dense-floor check, start the dashboard preview and run
`python scripts/perf_layout.py --factor 8 --dpr 2`. The script duplicates the
local Layout manifest in the browser request only, then compares 2D and 2.5D
SVG node counts, drag frames and camera updates. `--zoom-clicks 5 --drag-step 8`
exercises a zoomed view and a longer drag across the culling margin.

The Layout builder reads normalized SystemElements `equipment_type` to include
feeder cables and exclude terminations. FDR IDs with two complete equipment IDs
resolve connections (including IDs containing multiple hyphens). Numeric circuit
suffixes are stripped only if no exact asset exists and a single asset matches.
Single-ended FD IDs, missing assets/positions, duplicate IDs, and ambiguous
endpoints are retained with diagnostics rather than assigned invented routes.
Only connections with one visible placement per endpoint are drawn on a floor.
Select equipment to highlight its connections and see cable IDs, remote equipment
IDs, and test evidence in the side panel; select a cable to highlight its endpoints
and zoom to the connection. The cable toggle hides/shows overhead connections.
Opening a cable from a device's Connected cables list shows its details in a
separate inspector, leaving the list at its current scroll position for browsing.
Terminations are not drawn. Existing search, pan/zoom, floor switching and planning
controls work in both views; 2.5D box selection uses projected device bounds.

Selecting a device shows its NETA PDFs using the same local report preview as
Equipment. Selecting a cable shows Feeder Cable ATP PDFs named in the System
Elements `Feeder Cable ATP` column; only matching downloaded files in that
cable's folder are linked. Missing referenced PDFs remain visible as missing.
Cable NETA PDFs whose filename exactly matches the full FDR ID are also linked
from the local report manifest. Connected cable rows mark available ATP PDFs.
When a linked ATP PDF has the same name as a cable NETA PDF, Layout shows it
once. Equipment reports prefer the GC-renamed PDF link. In 2.5D, selecting
equipment, a cable, or a search result keeps the current camera; the detail
panel's Zoom buttons change it only when clicked.

Cable testing uses the shared cable readiness rule. Layout matches complete FDR
IDs in the EPS `Daily_test_report` Tested, Failed and Retested And Passed sections;
it also keeps MV daily evidence where available. A Feeder Cable ATP filename
listed in System Elements takes first priority as evidence that the test report
is attached in Infralink, even when the lifecycle status has not reached L3.
Without an attached report, the latest dated daily result wins, with a same-day
failure taking precedence; exact `L3: Pre Func Testing & Startup` means tested
and Infralink updated; a passed EPS or MV daily result means tested with
Infralink update pending.
In Layout, partial daily evidence stays visible in the details but uses the
unconfirmed line style until a completed test result is available.
Installation Complete alone does not confirm testing. Green/blue solid and
red/gray dashed lines distinguish these states, with text labels in the
legend and details. NETA completion and missing report evidence are shown
separately. The Layout builder reads raw EPS reports and the same MV daily report
index as Power Plan/MV. Rebuild with `python scripts/etl/build_layout_plan.py`
after EPS/MV daily reports or normalized equipment change; normal ETL also
performs this step. Layout loads the updated generated data on the next page load.

Open `/layout` (Layout in the sidebar) for equipment rectangles extracted from
`raw_data/power_plan/Floor_Layout_Plan.pdf`. Rectangle comments provide
equipment IDs. Only devices fully inside `boundary` are shown; devices fully
inside `fix` remain visible on every floor. The control rectangles are hidden.
Search provides suggestions across floors. Click a suggestion or choose it with
Arrow Up/Down and Enter to select and zoom directly to the device; its floor is
selected automatically. Drag anywhere on the map, including equipment, to pan.
Mouse wheel zooms around the cursor; Fit layout resets the view. Dragging does
not select a device. Select equipment and click Energize today to toggle the
orange animated lightning marker. Clicking again or resetting restores Excel
state, including red Energized lightning. There is no equipment-status dropdown.
Animation respects reduced-motion settings.

Use the pointer button, Box select, to drag a rectangle around multiple devices.
Only fully enclosed devices are selected; Shift + drag adds another group.
Click/Enter/Space toggles individual selection. Energize today (count) applies
the plan to every eligible selected equipment ID once, keeps existing plans,
and skips Energized equipment. Clear selection or Escape clears the selection;
Escape/pointer cancellation abandons an unfinished rectangle. Switching floors,
search confirmation or leaving Box select clears selection. Turn Box select off
to return to panning. All planning remains browser-local and globally resettable.

Energized equipment has a disabled Energize today button. Excel-confirmed
energisation takes priority over previously saved planning overrides.
Hover equipment, or focus it with the keyboard, to see a card with its full ID
in 16px text and its electrical status without zooming. Escape dismisses the card;
dragging/zooming/floor changes also dismiss it. Click/tap for the details panel.

POD rectangles and room comments such as `E6-110-01` or `E-1-2` are reference
areas, not selectable equipment. Room names stay centered near the top inside
each room, in the background below equipment. Their positions do not change
with electrical status. All breathing lightning is drawn in the last SVG layer,
above equipment, room names and the selection rectangle. Energized devices use
a stronger red fill and dark red border/marker for visibility.
PODs within fix remain visible across floors.
Equipment rectangles have a small inset for spacing. Floor alignment translates
equipment and rooms together while preserving device dimensions and spacing.

The default Energized state requires a date in SystemElements' exact
`Energized: Completed` column. N/A, Completed without a date, and the separate
Circuit Energized column do not energize a device. Unmatched/ambiguous IDs stay
visible as Unknown and appear in source diagnostics. Manual changes persist in
this browser only. Reset device or Reset all statuses restores workbook values;
the global reset includes floors not currently displayed.

To add floors, append unique `floor_id`, `label`, `file_name`, and one-based
`page_number` entries to `config/layout_plans.json`. The current two-page PDF
maps page 1 to First Floor and page 2 to Second Floor. New PDF pages must be
registered here and the Layout builder rerun before appearing in the dropdown.
Each configured PDF page needs exactly one boundary rectangle; fix rectangles
are optional. Second Floor has `"align_to_floor_id": "first-floor"`: its room
area's top and right edges align with First Floor by translation, without moving
fixed equipment/PODs. Add this optional field to future floors to align them to
an earlier configured, available floor. When no rooms exist on a floor, its
floor-local equipment/region bounds provide the alignment anchor. Source PDF
geometry and boundary dimensions are retained; generated local coordinates
include the translation. Floors without this field keep boundary-relative
coordinates. Rebuild the Layout dataset after changing alignment settings.
When renaming a layout PDF, update `file_name` in every floor entry using that PDF
in `config/layout_plans.json` to match the file under `raw_data/power_plan/`.
Keep `floor_id`, `label`, and `page_number` unchanged for a filename-only change,
then run `python scripts/etl/build_layout_plan.py` from the root and reload
`/layout`. Python/React source changes are not needed. The general power-plan
builder discovers all PDFs by extension; a normal full ETL refreshes its source
metadata too, or run `python scripts/etl/build_power_plan.py` separately.
Refresh from the repository root after saving/closing the source files:

```powershell
python scripts/etl/normalize_equipment.py
python scripts/etl/build_layout_plan.py
```

The normal ETL also builds this dataset. Reload the browser after rebuilding;
static publication requires building/publishing updated code and data.

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
