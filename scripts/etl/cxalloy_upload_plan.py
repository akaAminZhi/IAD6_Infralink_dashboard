"""Verify per-PDF upload evidence against successful CxAlloy package hashes."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    from .build_cxalloy_report_status import COMPLETED_UPLOAD_STATUSES, matches_renamed_upload, valid_upload_history
except ImportError:
    from build_cxalloy_report_status import COMPLETED_UPLOAD_STATUSES, matches_renamed_upload, valid_upload_history

def source_key(value: str) -> str:
    return value.strip().replace("\\", "/")


def filename(value: str) -> str:
    return value.strip().replace("\\", "/").rsplit("/", 1)[-1]


@dataclass
class ReportEvidence:
    source_path: str
    pdf_path: Path
    sha256: str


@dataclass
class UploadPlan:
    aliases: dict[Path, set[str]]
    new_paths: list[Path]
    review_paths: list[Path]


def plan_upload(files: list[Any], history: list[dict[str, str]]) -> UploadPlan:
    """Prove old package hashes before treating any of its PDFs as uploaded."""
    aliases: dict[Path, set[str]] = defaultdict(set)
    by_source: dict[str, list[Any]] = defaultdict(list)
    historical_sources: set[str] = set()
    for item in files:
        by_source[source_key(item.source_path)].append(item)
    for row in valid_upload_history(history):
        if row.get("status", "").strip().casefold() not in COMPLETED_UPLOAD_STATUSES:
            continue
        sources = [source_key(value) for value in row.get("source_path", "").split(";")]
        names = [filename(value) for value in row.get("pdf_path", "").split(";")]
        historical_sources.update(sources)
        if (not all(sources) or len(sources) != len(set(sources))
                or len(names) != len(sources) or not all(names)
                or any(len(by_source.get(source, [])) != 1 for source in sources)):
            continue
        subset = [by_source[source][0] for source in sources]
        rows = [{"source_path": item.source_path} for item in subset]
        hashes = [(item.pdf_path, item.sha256) for item in subset]
        if matches_renamed_upload(rows, hashes, [row]):
            for item, name in zip(subset, names):
                aliases[item.pdf_path].add(name)
    # A second source/name containing identical bytes is still the same PDF.
    by_digest: dict[str, set[str]] = defaultdict(set)
    for item in files:
        by_digest[item.sha256].update(aliases[item.pdf_path])
    for item in files:
        aliases[item.pdf_path].update(by_digest[item.sha256])
    new_paths, review_paths = [], []
    for item in files:
        if aliases[item.pdf_path]:
            continue
        source = source_key(item.source_path)
        if (not source or len(by_source[source]) != 1 or source in historical_sources
                or len({other.sha256 for other in files if other.pdf_path.name == item.pdf_path.name}) > 1):
            review_paths.append(item.pdf_path)
        else:
            new_paths.append(item.pdf_path)
    return UploadPlan(dict(aliases), new_paths, review_paths)


