"""Load the Tracker's shared daily-report reader without importing its jobs."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import sys
from typing import Any

_default_root = Path(__file__).resolve().parents[3] / "IAD6_EPS_Testing_Tracker"
_configured_root = Path(os.environ.get("IAD6_EPS_TRACKER_ROOT", str(_default_root)))
_module_path = _configured_root / "daily_report_sources.py"
if not _module_path.is_file():
    _module_path = _default_root / "daily_report_sources.py"
if not _module_path.is_file():
    raise ImportError("Update EPS Tracker with daily_report_sources.py alongside the Dashboard.")
_spec = importlib.util.spec_from_file_location("iad6_tracker_daily_report_sources", _module_path)
assert _spec is not None and _spec.loader is not None
_shared = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = _shared
_spec.loader.exec_module(_shared)

SOURCES = _shared.SOURCES
EPS_SOURCES = _shared.EPS_SOURCES
MV_SOURCES = _shared.MV_SOURCES
clean_item = _shared.clean_item
equipment_key = _shared.equipment_key
report_date = _shared.report_date
parse_events = _shared.parse_events
read_events = _shared.read_events
daily_results = _shared.daily_results
history_index = _shared.history_index
rebuild_summary = _shared.rebuild_summary


def read_report_family(report_dir: Path, legacy_source: str) -> tuple[list[dict[str, Any]], list[Path]]:
    """Honor explicitly supplied legacy directories and include adjacent site reports."""
    events = []
    files = []
    for path in sorted(report_dir.glob("*.md"), key=lambda p: p.name.lower()):
        day = report_date(path)
        if day:
            files.append(path)
            events.extend(parse_events(path.read_text(encoding="utf-8-sig"),
                          source=legacy_source, report_name=path.name, day=day))
    site_events, metadata = read_events(report_dir.parent, ("Onsite_Test_Report", "Offsite_Test_Report"))
    events.extend(site_events)
    files.extend(path for details in metadata.values() for path in details["files"])
    events.sort(key=lambda e: (e["date"], e["source"], e["report_name"].lower(), e["line_number"]))
    return events, sorted(files, key=lambda p: (report_date(p), str(p)))
