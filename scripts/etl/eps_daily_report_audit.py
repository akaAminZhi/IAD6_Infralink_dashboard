"""Preserve every repeated complete test ID across legacy and site reports."""

from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import Path
import sys
from typing import Any

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

try:
    from .json_utils import file_metadata
    from .schemas import EpsDailyReportEvent, EpsDailyReportItem
    from .tracking_rules import requires_equipment_test_tracking
except ImportError:
    from json_utils import file_metadata
    from schemas import EpsDailyReportEvent, EpsDailyReportItem
    from tracking_rules import requires_equipment_test_tracking

# Shared report vocabulary; unlike the save validators, this reader retains
# duplicate lines and conflicting sections as evidence for review.


def build_daily_report_audit(eps_root: Path) -> dict[str, Any]:
    from scripts.etl.daily_report_sources import read_events
    raw_events, source_metadata = read_events(eps_root)
    events_by_key: dict[str, list[EpsDailyReportEvent]] = defaultdict(list)
    for event in raw_events:
        equipment_key = event["equipment_key"]
        events_by_key[equipment_key].append(EpsDailyReportEvent(
            **{name: value for name, value in event.items() if name != "equipment_key"}
        ))
    sources = {
        source: {
            "available": info["available"], "report_count": len(info["files"]),
            "event_count": info["event_count"], "files": [file_metadata(p) for p in info["files"]],
            "skipped_files": info["skipped_files"],
        } for source, info in source_metadata.items()
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
            repeated=len(events) > 1,
            cross_site={"onsite", "offsite"}.issubset({event.site for event in events}),
            test_tracking_required=requires_equipment_test_tracking({"equipment_id": equipment_key}),
        ).to_dict())
    return {
        "sources": sources,
        "item_count": len(items),
        "event_count": sum(len(item["events"]) for item in items),
        "repeated_item_count": sum(item["repeated"] for item in items),
        "same_day_item_count": sum(item["repeated_on_same_day"] for item in items),
        "cross_site_item_count": sum(item["cross_site"] for item in items),
        "items": items,
    }
