"""Benchmark Layout with eight tiled copies of the local ETL dataset.

Start the dashboard preview first, then run ``python scripts/perf_layout.py``.
The expanded manifest is served only to this browser session; no data is written.
"""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
import statistics
import time
from typing import Any

from playwright.sync_api import Browser, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "frontend/public/data/layout_plan.json"


def synthetic_manifest(factor: int) -> dict[str, Any]:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    if factor == 1:
        return source
    result = copy.deepcopy(source)
    base_rows = [*source["fixed_equipment"], *(row for floor in source["floors"] for row in floor["equipment"])]
    min_x = min(row["rect"]["x"] for row in base_rows)
    min_y = min(row["rect"]["y"] for row in base_rows)
    span_x = max(row["rect"]["x"] + row["rect"]["width"] for row in base_rows) - min_x + 35
    span_y = max(row["rect"]["y"] + row["rect"]["height"] for row in base_rows) - min_y + 35

    def clone_record(record: dict[str, Any], index: int) -> dict[str, Any]:
        row = copy.deepcopy(record)
        suffix = f"-SIM{index}"
        for field in ("annotation_id", "equipment_key", "label", "matched_equipment_id"):
            if row.get(field):
                row[field] += suffix
        row["rect"]["x"] += (index % 4) * span_x
        row["rect"]["y"] += (index // 4) * span_y
        return row

    for index in range(1, factor):
        result["fixed_equipment"].extend(clone_record(row, index) for row in source["fixed_equipment"])
        for floor, original in zip(result["floors"], source["floors"]):
            floor["equipment"].extend(clone_record(row, index) for row in original["equipment"])
        for cable in source["cables"]:
            clone = copy.deepcopy(cable)
            clone["cable_id"] += f"-SIM{index}"
            for field in ("source_equipment_key", "target_equipment_key"):
                if clone.get(field):
                    clone[field] += f"-SIM{index}"
            result["cables"].append(clone)
    return result


def run_case(browser: Browser, factor: int, mode: str, dpr: int = 1, zoom_clicks: int = 0, drag_step: int = 3,
             hide_cables: bool = False,
             url: str = "http://127.0.0.1:5173/layout", screenshot: str | None = None,
             mid_drag_screenshot: str | None = None) -> dict[str, Any]:
    payload = json.dumps(synthetic_manifest(factor), separators=(",", ":"))
    page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=dpr)
    page.add_init_script(f"localStorage.setItem('iad6-layout-view-v1', '{mode}');")
    page.route("**/data/layout_plan.json", lambda route: route.fulfill(status=200, content_type="application/json", body=payload))
    start = time.perf_counter()
    page.goto(url, wait_until="domcontentloaded")
    page.locator('[data-layout-layer="equipment"] [data-annotation-id]').first.wait_for(timeout=90000)
    page.wait_for_timeout(500)
    for _ in range(zoom_clicks):
        page.get_by_role("button", name="Zoom in").click()
    if hide_cables:
        page.get_by_role("button", name="Hide all cables").click()
    if zoom_clicks:
        page.wait_for_timeout(300)
    if screenshot:
        page.screenshot(path=screenshot)
    load_seconds = time.perf_counter() - start
    equipment_count = page.locator('[data-layout-layer="equipment"] [data-annotation-id]').count()
    onscreen_equipment = page.locator('svg[aria-label$="equipment layout"]').evaluate("""svg => {
      const map = svg.closest('[aria-label="Layout map"]').getBoundingClientRect();
      return [...svg.querySelectorAll('[data-layout-layer="equipment"] [data-annotation-id]')].filter(node => {
        const box = node.getBoundingClientRect();
        return box.right >= map.left && box.left <= map.right && box.bottom >= map.top && box.top <= map.bottom;
      }).length;
    }""")
    full_detail_count = page.locator('[data-device-detail="full"]').count()
    cable_count = page.locator('[data-layout-layer="cables"] [data-cable-id]').count()
    svg_nodes = page.locator('svg[aria-label$="equipment layout"]').evaluate("el => el.querySelectorAll('*').length")
    widths = page.locator('[data-device-model]').evaluate_all("nodes => nodes.map(node => node.getBoundingClientRect().width).sort((a,b) => a-b)")
    page.evaluate("""() => {
      const svg = document.querySelector('svg[aria-label$="equipment layout"]');
      const metrics = window.__panMetrics = {active:false, frames:[], tasks:[], viewBoxChanges:0};
      new MutationObserver((changes) => { if (metrics.active) metrics.viewBoxChanges += changes.length; })
        .observe(svg, {attributes:true, attributeFilter:['viewBox']});
      new PerformanceObserver((list) => { if (metrics.active) for (const entry of list.getEntries()) metrics.tasks.push(entry.duration); })
        .observe({entryTypes:['longtask']});
      function frame(now) { if (metrics.active) metrics.frames.push(now); requestAnimationFrame(frame); }
      requestAnimationFrame(frame);
    }""")
    box = page.locator('svg[aria-label$="equipment layout"]').bounding_box()
    assert box is not None
    x, y = box["x"] + box["width"] * 0.45, box["y"] + box["height"] * 0.5
    page.mouse.move(x, y)
    page.evaluate("window.__panMetrics.active = true")
    page.mouse.down()
    drag_start = time.perf_counter()
    for index in range(1, 46):
        page.mouse.move(x + index * drag_step, y + index)
        if mid_drag_screenshot and index == 35:
            page.screenshot(path=mid_drag_screenshot)
        time.sleep(0.016)
    page.mouse.up()
    drag_seconds = time.perf_counter() - drag_start
    page.wait_for_timeout(150)
    raw = page.evaluate("""() => { window.__panMetrics.active = false; return window.__panMetrics; }""")
    intervals = [b - a for a, b in zip(raw["frames"], raw["frames"][1:])]
    result = {
        "factor": factor, "mode": mode, "dpr": dpr, "zoom_clicks": zoom_clicks, "drag_step": drag_step,
        "hide_cables": hide_cables,
        "equipment": equipment_count, "onscreen_equipment": onscreen_equipment,
        "full_detail": full_detail_count, "cables": cable_count,
        "svg_nodes": svg_nodes, "ready_s": round(load_seconds, 2), "drag_s": round(drag_seconds, 2),
        "device_width_p50_px": round(widths[len(widths)//2], 1) if widths else None,
        "device_width_p90_px": round(widths[int(0.9*(len(widths)-1))], 1) if widths else None,
        "frames": len(intervals), "frame_p50_ms": round(statistics.median(intervals), 1) if intervals else None,
        "frame_p95_ms": round(sorted(intervals)[int(0.95 * (len(intervals)-1))], 1) if intervals else None,
        "frame_max_ms": round(max(intervals), 1) if intervals else None,
        "long_tasks": len(raw["tasks"]), "long_task_ms": round(sum(raw["tasks"])),
        "view_box_changes": raw["viewBoxChanges"],
    }
    page.close()
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--factor", type=int, default=8, help="Copies per floor, including the original")
    parser.add_argument("--dpr", type=int, default=1, help="Browser device pixel ratio")
    parser.add_argument("--zoom-clicks", type=int, default=0, help="Zoom-in clicks before dragging")
    parser.add_argument("--drag-step", type=int, default=3, help="Horizontal pixels per pointer step")
    parser.add_argument("--mode", choices=("plan", "isometric", "both"), default="both")
    parser.add_argument("--skip-control", action="store_true", help="Skip the one-copy control case")
    parser.add_argument("--hide-cables", action="store_true", help="Hide cables before dragging")
    parser.add_argument("--url", default="http://127.0.0.1:5173/layout")
    parser.add_argument("--screenshot", help="Optional screenshot path for a single case")
    parser.add_argument("--mid-drag-screenshot", help="Visual QA only; changes timing results")
    args = parser.parse_args()
    if args.factor < 1 or args.dpr < 1 or args.zoom_clicks < 0 or args.drag_step < 1:
        parser.error("factor, dpr, and drag-step must be positive; zoom-clicks cannot be negative")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        factors = [args.factor] if args.skip_control else sorted({1, args.factor})
        modes = ("plan", "isometric") if args.mode == "both" else (args.mode,)
        if (args.screenshot or args.mid_drag_screenshot) and len(factors) * len(modes) != 1:
            parser.error("screenshots require --skip-control and one --mode")
        for factor in factors:
            for mode in modes:
                print(json.dumps(run_case(browser, factor, mode, args.dpr, args.zoom_clicks, args.drag_step,
                                          args.hide_cables, args.url, args.screenshot, args.mid_drag_screenshot)), flush=True)
        browser.close()
