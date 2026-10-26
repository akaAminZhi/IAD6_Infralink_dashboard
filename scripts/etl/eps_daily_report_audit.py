"""Preserve EPS and MV raw daily evidence for repeat-test review.

An ID repeated on separate dates is a repeat candidate, not proof that the
same test procedure was repeated. Daily reports do not identify procedures.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import Path
import sys
from typing import Any

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.automation.daily_reports import HEADING_MAP, MV_HEADING_MAP, LIST_PREFIX_PATTERN

try:
    from .build_power_plan import mv_report_date, normalize_equipment_key
    from .json_utils import file_metadata
    from .schemas import EpsDailyReportEvent, EpsDailyReportItem
    from .tracking_rules import requires_equipment_test_tracking
except ImportError:
    from build_power_plan import mv_report_date, normalize_equipment_key
    from json_utils import file_metadata
    from schemas import EpsDailyReportEvent, EpsDailyReportItem
    from tracking_rules import requires_equipment_test_tracking

# Shared report vocabulary; unlike the save validators, this reader retains
# duplicate lines and conflicting sections as evidence for review.


def build_daily_report_audit(eps_root: Path) -> dict[str, Any]:
    events_by_key: dict[str, list[EpsDailyReportEvent]] = defaultdict(list)
    sources: dict[str, Any] = {}
    for source, heading_map in (
        ("Daily_test_report", HEADING_MAP),
        ("MV_Daily_test_report", MV_HEADING_MAP),
    ):
        directory = eps_root / source
        files = []
        skipped = []
        event_count = 0
        for path in sorted(directory.glob("*.md"), key=lambda value: value.name.lower()):
            report_date = mv_report_date(path)
            if report_date is None:
                skipped.append(path.name)
                continue
            files.append(file_metadata(path))
            status = None
            for line_number, raw_line in enumerate(
                path.read_text(encoding="utf-8-sig").splitlines(), start=1
            ):
                line = raw_line.strip()
                if line.startswith("#"):
                    status = heading_map.get(line.lstrip("#").strip().lower())
                    if status == "partially_tested":
                        status = None
                    continue
                if status is None:
                    continue
                item = LIST_PREFIX_PATTERN.sub("", line).strip()
                # Reuse the daily workflow's compact-ID acceptance rule.
                if not item or any(c.isspace() for c in item) or "-" not in item or not any(c.isdigit() for c in item):
                    continue
                equipment_key = normalize_equipment_key(item)
                events_by_key[equipment_key].append(EpsDailyReportEvent(
                    date=report_date,
                    source=source,
                    report_name=path.name,
                    line_number=line_number,
                    status=status,
                    date_basis=("filename" if len(path.stem.split("-")) == 3
                                else "filename_month_day_file_year"),
                ))
                event_count += 1
        sources[source] = {
            "available": directory.is_dir(),
            "report_count": len(files),
            "event_count": event_count,
            "files": files,
            "skipped_files": skipped,
        }

    items = []
    for equipment_key, events in sorted(events_by_key.items()):
        events.sort(key=lambda event: (event.date, event.source, event.report_name, event.line_number))
        date_counts = Counter(event.date for event in events)
        items.append(EpsDailyReportItem(
            equipment_key=equipment_key,
            events=events,
            test_dates=sorted(date_counts),
            repeated_on_different_dates=len(date_counts) > 1,
            repeated_on_same_day=any(count > 1 for count in date_counts.values()),
            cross_source=len({event.source for event in events}) > 1,
            test_tracking_required=requires_equipment_test_tracking({"equipment_id": equipment_key}),
        ).to_dict())
    return {
        "sources": sources,
        "item_count": len(items),
        "event_count": sum(len(item["events"]) for item in items),
        "repeated_item_count": sum(item["repeated_on_different_dates"] for item in items),
        "same_day_item_count": sum(item["repeated_on_same_day"] for item in items),
        "items": items,
    }
