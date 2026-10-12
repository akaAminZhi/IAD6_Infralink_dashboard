from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.etl import json_utils
from scripts.etl.json_utils import load_json_with_metadata, load_records_json, write_json


def test_load_records_json_reads_bare_list(tmp_path: Path) -> None:
    path = tmp_path / "records.json"
    path.write_text(json.dumps([{"id": "A"}]), encoding="utf-8")

    assert load_records_json(path) == [{"id": "A"}]
    assert load_json_with_metadata(path) == {
        "source_file": None,
        "records": [{"id": "A"}],
    }


def test_load_records_json_reads_metadata_wrapped_records(tmp_path: Path) -> None:
    path = tmp_path / "records.json"
    path.write_text(
        json.dumps({"source_file": {"file_name": "source.xlsx"}, "records": [{"id": "A"}]}),
        encoding="utf-8",
    )

    assert load_records_json(path) == [{"id": "A"}]


def test_load_records_json_rejects_invalid_shape(tmp_path: Path) -> None:
    path = tmp_path / "records.json"
    path.write_text(json.dumps({"items": []}), encoding="utf-8")

    with pytest.raises(ValueError):
        load_records_json(path)


def test_write_json_replaces_complete_output(tmp_path: Path) -> None:
    path = tmp_path / "nested" / "output.json"
    write_json(path, {"old": True})
    write_json(path, {"new": "value"})
    assert json.loads(path.read_text(encoding="utf-8")) == {"new": "value"}
    assert list(path.parent.iterdir()) == [path]


def test_write_json_retries_transient_lock(tmp_path: Path, monkeypatch) -> None:
    path = tmp_path / "output.json"
    path.write_text('{"old": true}', encoding="utf-8")
    replace = json_utils.os.replace
    attempts = []

    def temporarily_locked(source, destination):
        attempts.append(destination)
        assert json.loads(path.read_text(encoding="utf-8")) == {"old": True}
        if len(attempts) < 3:
            raise PermissionError(13, "locked", str(destination))
        replace(source, destination)

    monkeypatch.setattr(json_utils.os, "replace", temporarily_locked)
    monkeypatch.setattr(json_utils.time, "sleep", lambda _: None)
    write_json(path, {"new": True})
    assert len(attempts) == 3
    assert json.loads(path.read_text(encoding="utf-8")) == {"new": True}
    assert list(tmp_path.iterdir()) == [path]


def test_write_json_persistent_lock_preserves_output(tmp_path: Path, monkeypatch) -> None:
    path = tmp_path / "output.json"
    path.write_text('{"old": true}', encoding="utf-8")
    attempts = []

    def locked(source, destination):
        attempts.append(destination)
        raise PermissionError(13, "locked", str(destination))

    monkeypatch.setattr(json_utils.os, "replace", locked)
    monkeypatch.setattr(json_utils.time, "sleep", lambda _: None)
    with pytest.raises(PermissionError, match="Check file permissions") as error:
        write_json(path, {"new": True})
    assert error.value.filename == str(path)
    assert len(attempts) == 4
    assert json.loads(path.read_text(encoding="utf-8")) == {"old": True}
    assert list(tmp_path.iterdir()) == [path]
