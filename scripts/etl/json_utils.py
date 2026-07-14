"""JSON loading and metadata helpers for ETL outputs."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any


def load_records_json(path: str | Path) -> list[dict[str, Any]]:
    """Load records from either a bare-list JSON file or a metadata wrapper."""

    json_path = Path(path)
    root = json.loads(json_path.read_text(encoding="utf-8"))

    if isinstance(root, list):
        return root

    if isinstance(root, dict) and "records" in root:
        records = root["records"]
        if isinstance(records, list):
            return records
        raise ValueError(f"JSON records value must be a list: {json_path}")

    raise ValueError(
        f"Expected JSON root to be a list or an object with records: {json_path}"
    )


def load_json_with_metadata(path: str | Path) -> dict[str, Any]:
    """Load JSON and normalize old bare-list files into a metadata wrapper."""

    json_path = Path(path)
    root = json.loads(json_path.read_text(encoding="utf-8"))

    if isinstance(root, dict):
        return root

    if isinstance(root, list):
        return {
            "source_file": None,
            "records": root,
        }

    raise ValueError(f"Expected JSON root to be an object or list: {json_path}")


def file_metadata(path: str | Path) -> dict[str, str]:
    source_path = Path(path).resolve()
    modified_at = datetime.fromtimestamp(source_path.stat().st_mtime).astimezone()
    return {
        "path": str(source_path),
        "file_name": source_path.name,
        "modified_at": modified_at.isoformat(),
    }


def selected_input_files_metadata(
    input_files: dict[str, str],
) -> dict[str, dict[str, str]]:
    return {
        key: file_metadata(path)
        for key, path in input_files.items()
    }


def write_json(path: str | Path, payload: Any) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
