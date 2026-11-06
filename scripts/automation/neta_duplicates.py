"""Bridge fixed Tracker duplicate APIs without exposing arbitrary paths or commands."""
from __future__ import annotations

import argparse
from functools import lru_cache
import importlib.util
from pathlib import Path
import sys
from types import ModuleType


@lru_cache(maxsize=4)
def tracker_module(tracker_root: Path) -> ModuleType:
    # Keep imports within the explicitly configured sibling code checkout.
    path = tracker_root / 'neta_duplicate_decisions.py'
    if not path.is_file():
        raise ValueError('Tracker duplicate decision support is unavailable; update Tracker and Dashboard together.')
    sys.path.insert(0, str(tracker_root))
    try:
        spec = importlib.util.spec_from_file_location('_iad6_duplicate_decisions', path)
        if spec is None or spec.loader is None:
            raise ValueError('Cannot load Tracker duplicate support.')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)


def read_snapshot(tracker_root: Path) -> dict:
    try:
        return tracker_module(tracker_root.resolve()).read_snapshot(tracker_root / 'NETA_eport_To_GC')
    except (OSError, ValueError, KeyError, TypeError, ImportError) as exc:
        return {'available': False, 'matches': [], 'errors': [str(exc)]}


def validate_decision(tracker_root: Path, match_id: str, revision: str, action: str) -> dict:
    return tracker_module(tracker_root.resolve()).validate_decision(
        tracker_root / 'NETA_eport_To_GC', match_id, revision, action)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tracker-root', type=Path, required=True)
    parser.add_argument('--match-id', required=True)
    parser.add_argument('--expected-revision', required=True)
    parser.add_argument('--action', choices=('confirm', 'revoke'), required=True)
    parser.add_argument('--actor', required=True)
    args = parser.parse_args()
    tracker = args.tracker_root.resolve()
    module = tracker_module(tracker)
    # Deferred dependency imports in Tracker run with the configured checkout on sys.path.
    sys.path.insert(0, str(tracker))
    try:
        from scripts.etl.build_cxalloy_equipment_links import configured_project_url
        module.apply_decision(tracker / 'NETA_eport_To_GC', args.match_id,
                              args.expected_revision, args.action, args.actor,
                              configured_project_url(tracker))
    finally:
        sys.path.pop(0)
    try:
        from scripts.etl.build_neta_report_manifest import build_neta_report_manifest, OUTPUT_PATH
        from scripts.etl.json_utils import write_json
        write_json(OUTPUT_PATH, build_neta_report_manifest(tracker))
    except Exception:
        print('Decision saved, but Dashboard publication failed. Retry Refresh duplicate evidence; do not repeat the decision.', flush=True)
        raise
    print('Duplicate decision and Dashboard report manifest refreshed.', flush=True)


if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    main()
