"""Index raw EPS daily report results by exact System Elements ID."""

from __future__ import annotations

from pathlib import Path
import sys

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.automation.daily_reports import parse_report_text

try:
    from .build_power_plan import EPS_TRACKER_ROOT, mv_report_date, normalize_equipment_key
except ImportError:
    from build_power_plan import EPS_TRACKER_ROOT, mv_report_date, normalize_equipment_key


EPS_DAILY_REPORT_DIR = EPS_TRACKER_ROOT / "Daily_test_report"


def build_eps_daily_test_index(
    report_dir: Path,
) -> tuple[dict[str, list[dict[str, str]]], list[Path]]:
    from scripts.etl.daily_report_sources import history_index, read_report_family
    events, files = read_report_family(report_dir, "Daily_test_report")
    index = history_index(events)
    for history in index.values():
        for event in history:
            if event["status"] == "tested_and_passed":
                event["status"] = "tested"
    return index, files
