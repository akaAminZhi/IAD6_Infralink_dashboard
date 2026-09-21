"""Publish compact NETA review results for static/remote Equipment views."""

from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path
import sys
from typing import Any

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.automation.neta_report_reviews import list_neta_report_reviews
from scripts.etl.json_utils import write_json


PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = PROJECT_ROOT / "frontend/public/data/neta_report_reviews.json"


def run_build(
    tracker_root: Path | None = None,
    output_path: Path = OUTPUT_PATH,
) -> dict[str, Any]:
    tracker = tracker_root or Path(os.environ.get(
        "IAD6_EPS_TRACKER_ROOT", PROJECT_ROOT.parent / "IAD6_EPS_Testing_Tracker"
    ))
    source = tracker / "NETA_eport_To_GC/test_reports_result.json"
    if source.is_file():
        payload = {**list_neta_report_reviews(source), "available": True}
    else:
        # Replace stale snapshots with an explicit unavailable result, not zero exceptions.
        payload = {"available": False, "reports": [], "total_reports": 0,
                   "summary": {"PASSED": 0, "FAILED": 0, "REVIEW_REQUIRED": 0, "ERROR": 0}}
    payload["published_at"] = datetime.now(timezone.utc).isoformat()
    write_json(output_path, payload)
    return payload


def main() -> None:
    result = run_build()
    print(f"Published NETA reviews: {result['total_reports']} (available={result['available']})")


if __name__ == "__main__":
    main()
