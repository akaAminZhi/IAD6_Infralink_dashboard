from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.etl.json_utils import load_json_with_metadata, load_records_json


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
