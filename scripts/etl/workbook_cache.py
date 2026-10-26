"""Content-addressed normalization cache, enabled only for a full ETL run."""

from __future__ import annotations

import hashlib
import json
import sys
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Iterator

import openpyxl

try:
    from .json_utils import write_json
except ImportError:
    from json_utils import write_json


CACHE_DIR = Path(__file__).resolve().parents[2] / "runtime" / "etl-cache" / "workbooks"
_active: ContextVar[WorkbookCache | None] = ContextVar("workbook_cache", default=None)


def content_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def transformation_version() -> str:
    # Any ETL helper change invalidates prior transformations, including tracking
    # and date rules. Library/interpreter upgrades also rebuild the cache.
    digest = hashlib.sha256()
    digest.update(f"{sys.version_info[:3]}:{openpyxl.__version__}".encode())
    for path in sorted(Path(__file__).parent.glob("*.py")):
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


class WorkbookCache:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.version = transformation_version()
        self.memory: dict[str, str] = {}
        self.hits = 0
        self.misses = 0

    def load(self, source: Path, name: str, build: Callable[[], list[dict]]) -> list[dict]:
        source_hash = content_hash(source)
        identity = json.dumps([str(source.resolve()), source_hash, name, self.version])
        key = hashlib.sha256(identity.encode()).hexdigest()
        cache_path = self.directory / f"{key}.json"
        if key in self.memory:
            self.hits += 1
            # Consumers may mutate records; never share a mutable cached result.
            return json.loads(self.memory[key])
        try:
            payload = json.loads(cache_path.read_text(encoding="utf-8"))
            records = payload["records"]
            if (payload["identity"] == identity and isinstance(records, list)
                    and all(isinstance(record, dict) for record in records)):
                serialized = json.dumps(records)
                if payload["records_sha256"] == hashlib.sha256(serialized.encode()).hexdigest():
                    self.memory[key] = serialized
                    self.hits += 1
                    return records
        except (OSError, ValueError, KeyError, TypeError):
            pass

        self.misses += 1
        records = build()
        # Do not retain a result if Excel was saved while it was being parsed.
        if content_hash(source) == source_hash:
            serialized = json.dumps(records)
            self.memory[key] = serialized
            try:
                write_json(cache_path, {
                    "identity": identity,
                    "records_sha256": hashlib.sha256(serialized.encode()).hexdigest(),
                    "records": records,
                })
            except OSError:
                # The cache is optional; a locked/unwritable cache must not fail ETL.
                pass
        return records


@contextmanager
def workbook_cache(directory: Path | None = None) -> Iterator[WorkbookCache]:
    cache = WorkbookCache(directory if directory is not None else CACHE_DIR)
    token = _active.set(cache)
    try:
        yield cache
    finally:
        _active.reset(token)


def cached_normalizer(function: Callable[[str], list[dict]]) -> Callable[[str], list[dict]]:
    @wraps(function)
    def wrapped(source_path: str) -> list[dict]:
        cache = _active.get()
        if cache is None:
            return function(source_path)
        return cache.load(Path(source_path), function.__name__, lambda: function(source_path))

    return wrapped
