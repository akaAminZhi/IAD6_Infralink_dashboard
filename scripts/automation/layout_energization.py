"""Host-local Layout records read by both the automation API and the ETL."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import re
from threading import Lock
from typing import Any

from scripts.etl.json_utils import load_records_json, write_json
from scripts.etl.schemas import LayoutManualEnergization


_STORE_FILE = "layout_energizations.json"
_WRITE_LOCK = Lock()


class LayoutEnergizationConflict(ValueError):
    pass


def layout_energization_equipment_id(placement: dict[str, Any]) -> str | None:
    equipment_id = placement.get("matched_equipment_id")
    if (
        placement.get("match_status") == "matched"
        and isinstance(equipment_id, str) and equipment_id.strip()
        and not re.search(r"cable|termination", placement.get("equipment_type") or "", re.IGNORECASE)
    ):
        return equipment_id
    return None


def read_layout_energizations(runtime_root: Path) -> dict[str, LayoutManualEnergization]:
    path = runtime_root / _STORE_FILE
    try:
        rows = load_records_json(path)
    except FileNotFoundError:
        return {}

    records: dict[str, LayoutManualEnergization] = {}
    for row in rows:
        if (
            not isinstance(row, dict)
            or not all(isinstance(row.get(field), str) and row[field].strip()
                       for field in ("equipment_id", "updated_at", "updated_by"))
            or type(row.get("energized")) is not bool
            or type(row.get("revision")) is not int or row["revision"] < 1
            or row["equipment_id"] in records
        ):
            raise ValueError(f"Invalid manual energization record in {path}")
        record = LayoutManualEnergization(
            equipment_id=row["equipment_id"], energized=row["energized"], revision=row["revision"],
            updated_at=row["updated_at"], updated_by=row["updated_by"],
        )
        records[record.equipment_id] = record
    return records


def save_layout_energization(
    runtime_root: Path, equipment_id: str, energized: bool, expected_revision: int, user_id: str,
) -> LayoutManualEnergization:
    with _WRITE_LOCK:
        records = read_layout_energizations(runtime_root)
        current = records.get(equipment_id)
        revision = current.revision if current else 0
        if revision != expected_revision:
            raise LayoutEnergizationConflict("This record has changed. Review its current status and try again.")
        if current and current.energized == energized:
            return current

        record = LayoutManualEnergization(
            equipment_id=equipment_id, energized=energized, revision=revision + 1,
            updated_at=datetime.now(timezone.utc).isoformat(), updated_by=user_id,
        )
        # Keep a revoked record's revision so stale requests cannot restore it.
        records[equipment_id] = record
        write_json(runtime_root / _STORE_FILE, {"records": [item.to_dict() for item in records.values()]})
        return record
