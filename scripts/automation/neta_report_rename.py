"""Bridge operator GC report renames to the configured Tracker checkout."""
from __future__ import annotations

import argparse
from functools import lru_cache
import importlib.util
import json
from pathlib import Path
import sys
from types import ModuleType

LOCAL_OPERATOR = "local_operator"


@lru_cache(maxsize=4)
def tracker_module(tracker_root: Path) -> ModuleType:
    # Keep imports within the explicitly configured sibling code checkout.
    path = tracker_root / "neta_report_rename.py"
    if not path.is_file():
        raise ValueError("Tracker GC rename support is unavailable; update Tracker and Dashboard together.")
    sys.path.insert(0, str(tracker_root))
    try:
        spec = importlib.util.spec_from_file_location("_iad6_report_rename", path)
        if spec is None or spec.loader is None:
            raise ValueError("Cannot load Tracker GC rename support.")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)


def validate_rename(tracker_root: Path, report_file: str, new_name: str, expected_sha256: str) -> dict:
    tracker = tracker_root.resolve()
    sys.path.insert(0, str(tracker))
    try:
        return tracker_module(tracker).validate_rename(tracker, report_file, new_name, expected_sha256)
    finally:
        sys.path.pop(0)


def publish(tracker: Path) -> None:
    from scripts.etl.build_neta_report_manifest import OUTPUT_PATH, build_neta_report_manifest
    from scripts.etl.json_utils import write_json
    write_json(OUTPUT_PATH, build_neta_report_manifest(tracker))
    try:
        from scripts.etl.build_neta_report_reviews import run_build
        run_build(tracker)
    except Exception as exc:  # noqa: BLE001 - live API reviews remain authoritative locally.
        print(f"Static NETA review snapshot not refreshed: {exc}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tracker-root", type=Path, required=True)
    parser.add_argument("--report-file", required=True)
    parser.add_argument("--new-name", required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--actor", required=True)
    args = parser.parse_args()
    if args.actor != LOCAL_OPERATOR:
        raise SystemExit("GC report renaming is only available to the local operator.")
    tracker = args.tracker_root.resolve()
    module = tracker_module(tracker)
    sys.path.insert(0, str(tracker))
    try:
        from scripts.etl.build_cxalloy_equipment_links import configured_project_url
        result = module.apply_rename(tracker, args.report_file, args.new_name, args.expected_sha256,
                                     args.actor, configured_project_url(tracker))
    finally:
        sys.path.pop(0)
    print(json.dumps({key: result.get(key) for key in (
        "device", "old_name", "new_name", "will_queue_cxalloy", "queued", "review_migrated")},
        ensure_ascii=False), flush=True)
    try:
        publish(tracker)
    except Exception:
        print("Rename saved, but Dashboard publication failed. Run Refresh NETA Duplicate Evidence; "
              "do not repeat the rename.", flush=True)
        raise
    print("GC report renamed and Dashboard report manifest refreshed.", flush=True)


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    main()
