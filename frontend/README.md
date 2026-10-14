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

Open `/layout` (Layout in the sidebar) for equipment rectangles extracted from
`raw_data/power_plan/First_Floor_Layout_Plan.pdf`. Rectangle comments provide
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
Equipment rectangles have a small inset for spacing while their source centers
and stored PDF coordinates are preserved.

The default Energized state requires a date in SystemElements' exact
`Energized: Completed` column. N/A, Completed without a date, and the separate
Circuit Energized column do not energize a device. Unmatched/ambiguous IDs stay
visible as Unknown and appear in source diagnostics. Manual changes persist in
this browser only. Reset device or Reset all statuses restores workbook values;
the global reset includes floors not currently displayed.

To add floors, append unique `floor_id`, `label`, `file_name`, and one-based
`page_number` entries to `config/layout_plans.json`. Each configured PDF page
needs exactly one boundary rectangle; fix rectangles are optional. Keep boundary
origins aligned between floor drawings so the shared fixed layer aligns.
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
