from __future__ import annotations

import os
import json
from pathlib import Path

import pytest

from scripts.etl import workbook_cache as cache_module
from scripts.etl.workbook_cache import cached_normalizer, workbook_cache


def make_normalizer():
    calls: list[str] = []

    @cached_normalizer
    def normalize(path: str) -> list[dict]:
        value = Path(path).read_text()
        calls.append(value)
        return [{"equipment_id": value, "issue_image": "evidence", "corrective_images": "fixed"}]

    return normalize, calls


def test_reuses_disk_cache_and_isolates_mutations(tmp_path: Path) -> None:
    source = tmp_path / "source.xlsx"
    source.write_text("first")
    normalize, calls = make_normalizer()
    directory = tmp_path / "cache"
    with workbook_cache(directory) as cache:
        normalize(str(source))[0]["equipment_id"] = "mutated"
        assert normalize(str(source))[0]["equipment_id"] == "first"
        assert (cache.hits, cache.misses) == (1, 1)
    with workbook_cache(directory) as cache:
        assert normalize(str(source))[0] == {
            "equipment_id": "first", "issue_image": "evidence", "corrective_images": "fixed",
        }
        assert (cache.hits, cache.misses) == (1, 0)
    assert calls == ["first"]
    # Independent script calls remain uncached.
    normalize(str(source))
    assert calls == ["first", "first"]


def test_content_change_invalidates_even_with_same_size_and_mtime(tmp_path: Path) -> None:
    source = tmp_path / "source.xlsx"
    source.write_text("first")
    original_stat = source.stat()
    normalize, calls = make_normalizer()
    with workbook_cache(tmp_path / "cache"):
        normalize(str(source))
        source.write_text("other")
        os.utime(source, ns=(original_stat.st_atime_ns, original_stat.st_mtime_ns))
        assert normalize(str(source))[0]["equipment_id"] == "other"
    assert calls == ["first", "other"]


def test_rule_change_invalidates_cache(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "source.xlsx"
    source.write_text("first")
    normalize, calls = make_normalizer()
    with workbook_cache(tmp_path / "cache"):
        normalize(str(source))
    monkeypatch.setattr(cache_module, "transformation_version", lambda: "new-rules")
    with workbook_cache(tmp_path / "cache"):
        normalize(str(source))
    assert calls == ["first", "first"]


@pytest.mark.parametrize("damage", ["invalid json", '[]', '{"identity": "wrong", "records": []}'])
def test_corrupt_cache_rebuilds(tmp_path: Path, damage: str) -> None:
    source = tmp_path / "source.xlsx"
    source.write_text("first")
    directory = tmp_path / "cache"
    normalize, calls = make_normalizer()
    with workbook_cache(directory):
        normalize(str(source))
    next(directory.glob("*.json")).write_text(damage)
    with workbook_cache(directory):
        assert normalize(str(source))[0]["equipment_id"] == "first"
    assert calls == ["first", "first"]


def test_unwritable_cache_is_optional_and_failed_parses_are_not_cached(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "source.xlsx"
    source.write_text("first")
    normalize, calls = make_normalizer()

    def denied(*args, **kwargs):
        raise PermissionError("cache locked")

    monkeypatch.setattr(cache_module, "write_json", denied)
    with workbook_cache(tmp_path / "cache"):
        assert normalize(str(source))[0]["equipment_id"] == "first"
        assert normalize(str(source))[0]["equipment_id"] == "first"
    assert calls == ["first"]

    @cached_normalizer
    def failing(path: str) -> list[dict]:
        raise ValueError("malformed workbook")

    with workbook_cache(tmp_path / "cache") as cache:
        with pytest.raises(ValueError, match="malformed workbook"):
            failing(str(source))
        assert cache.memory == {}
    # Context must reset even after an error.
    assert cache_module._active.get() is None


def test_cached_record_damage_rebuilds_and_source_changes_during_parse_are_not_saved(tmp_path: Path) -> None:
    source = tmp_path / "source.xlsx"
    source.write_text("first")
    directory = tmp_path / "cache"
    normalize, calls = make_normalizer()
    with workbook_cache(directory):
        normalize(str(source))
    cache_path = next(directory.glob("*.json"))
    payload = json.loads(cache_path.read_text())
    payload["records"][0]["issue_image"] = None
    cache_path.write_text(json.dumps(payload))
    with workbook_cache(directory):
        assert normalize(str(source))[0]["issue_image"] == "evidence"
    assert calls == ["first", "first"]

    @cached_normalizer
    def changing(path: str) -> list[dict]:
        Path(path).write_text("changed")
        return [{"equipment_id": "old"}]

    with workbook_cache(tmp_path / "changing-cache") as cache:
        changing(str(source))
        assert cache.memory == {}
    assert not (tmp_path / "changing-cache").exists()
