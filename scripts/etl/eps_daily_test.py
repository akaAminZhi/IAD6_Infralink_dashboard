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
    if not report_dir.exists():
        return {}, []

    dated_reports = [
        (report_date, path)
        for path in report_dir.glob("*.md")
        if (report_date := mv_report_date(path)) is not None
    ]
    dated_reports.sort(key=lambda item: (item[0], item[1].name.lower()))
    index: dict[str, list[dict[str, str]]] = {}
    for report_date, path in dated_reports:
        sections = parse_report_text(path.read_text(encoding="utf-8-sig"))
        for status, items in sections.items():
            for item in items:
                key = normalize_equipment_key(item)
                if key:
                    index.setdefault(key, []).append({
                        "date": report_date,
                        "status": status,
                        "report_name": path.name,
                    })
    return index, [path for _, path in dated_reports]
