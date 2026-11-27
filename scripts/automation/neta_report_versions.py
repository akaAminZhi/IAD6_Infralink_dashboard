"""Read and resolve Tracker revision conflicts through the operator API."""
from __future__ import annotations

import importlib.util
from functools import lru_cache
from pathlib import Path
import re
import sys


@lru_cache(maxsize=4)
def tracker_module(tracker: Path):
    path = tracker / 'neta_completed_reports.py'
    if not path.is_file():
        raise ValueError('Completed report review requires the current EPS Tracker.')
    sys.path.insert(0, str(tracker))
    try:
        spec = importlib.util.spec_from_file_location('_iad6_completed_reports', path)
        if spec is None or spec.loader is None:
            raise ValueError('Unable to load EPS Tracker report review.')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)


def report_source(tracker):
    return tracker / 'downloads' / 'neta_reports'


def normalized_device(value):
    return re.sub(r'^iad0?6-', '', value.strip().casefold())


def review_matches(tracker, device):
    module = tracker_module(tracker.resolve())
    data = module.read_inventory(module.review_root(report_source(tracker)))
    result = []
    for entry in data['devices'].values():
        if normalized_device(entry['device']) != normalized_device(device):
            continue
        for match in entry.get('conflicts', []):
            choice = data.get('decisions', {}).get(match['id'], {})
            row = {field: match[field] for field in ('id', 'revision', 'device')}
            row['decision'] = choice.get('choice') if choice.get('revision') == match['revision'] else None
            for side in ('current', 'candidate'):
                row[side] = {field: match[side].get(field, '') for field in
                             ('name', 'source', 'uploaded_at', 'identifier', 'verdict', 'sha256')}
            result.append(row)
    return result


def review_pdf(tracker, conflict_id, version, side):
    module = tracker_module(tracker.resolve())
    root = module.review_root(report_source(tracker))
    match = module.find_conflict(module.read_inventory(root), conflict_id)
    if match['revision'] != version:
        raise ValueError('Refresh the conflict before opening the report.')
    return module.blob_path(root, match[side]), match[side]['name']


def decide(tracker, conflict_id, revision, choice, actor):
    tracker_module(tracker.resolve()).save_decision(report_source(tracker), conflict_id, revision, choice, actor)
