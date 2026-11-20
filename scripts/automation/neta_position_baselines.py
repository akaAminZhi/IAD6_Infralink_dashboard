"""Operator-confirmed NETA test-position baselines (config/neta_position_baselines.json).

Each save carries the revision the editor read; a different on-disk revision
means someone else saved first and the request fails instead of overwriting.
"""

from __future__ import annotations

from datetime import datetime
import json
import os
from pathlib import Path
import re
import threading
import time
from typing import Any
from uuid import uuid4


FAMILY_RE = re.compile(r"^[A-Z0-9][A-Z0-9-]*\|[A-Z0-9-]+(?:\|sub)?$")
KEY_RE = re.compile(r"^[A-Z0-9][A-Z0-9&().\-]{0,79}$")
EQUIPMENT_RE = re.compile(r"^[A-Z0-9][A-Z0-9-]{2,79}$")
_LOCK = threading.Lock()


class RevisionConflict(Exception):
    """The baselines changed since the editor loaded them."""


def empty_baselines() -> dict[str, Any]:
    return {"version": 1, "revision": 0, "families": {}}


def read_baselines(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return empty_baselines()
    payload = json.loads(path.read_text(encoding="utf-8"))
    if (not isinstance(payload, dict) or payload.get("version") != 1
            or not isinstance(payload.get("families"), dict)):
        raise ValueError(f"Invalid NETA position baselines: {path}")
    payload["revision"] = int(payload.get("revision") or 0)
    return payload


def _key(value: object, what: str) -> str:
    key = str(value or "").strip().upper()
    if not KEY_RE.fullmatch(key):
        raise ValueError(f"Invalid {what}: {value!r}")
    return key


def _positions(items: object, what: str) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        raise ValueError(f"{what} must be a list.")
    positions: list[dict[str, Any]] = []
    names: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError(f"Each {what} entry must be an object.")
        key = _key(item.get("key"), "position key")
        aliases = sorted({_key(alias, "alias") for alias in item.get("aliases") or []} - {key})
        for name in (key, *aliases):
            if name in names:
                raise ValueError(f"Position or alias {name} is used twice.")
            names.add(name)
        count = int(item.get("count") or 1)
        if not 1 <= count <= 20:
            raise ValueError(f"Expected count for {key} must be 1-20.")
        positions.append({"key": key, "count": count, "optional": bool(item.get("optional")),
                          "aliases": aliases, "form": str(item.get("form") or "")[:20]})
    return sorted(positions, key=lambda position: position["key"])


def validate_family(family: str, body: dict[str, Any]) -> dict[str, Any]:
    if not FAMILY_RE.fullmatch(family):
        raise ValueError(f"Invalid family key: {family}")
    positions = _positions(body.get("positions"), "positions")
    if not positions:
        raise ValueError("A confirmed baseline needs at least one position.")
    exceptions: dict[str, Any] = {}
    raw_exceptions = body.get("exceptions") or {}
    if not isinstance(raw_exceptions, dict):
        raise ValueError("exceptions must be an object keyed by equipment.")
    baseline_keys = {position["key"] for position in positions}
    for equipment_id, exception in raw_exceptions.items():
        equipment = str(equipment_id).strip().upper()
        if not EQUIPMENT_RE.fullmatch(equipment) or not isinstance(exception, dict):
            raise ValueError(f"Invalid exception for {equipment_id!r}.")
        waived = sorted({_key(key, "waived position") for key in exception.get("waived_positions") or []})
        unknown = set(waived) - baseline_keys
        if unknown:
            raise ValueError(f"{equipment}: waived positions are not in the baseline: {sorted(unknown)}")
        extra = _positions(exception.get("extra_positions") or [], "extra positions")
        clash = {position["key"] for position in extra} & baseline_keys
        if clash:
            raise ValueError(f"{equipment}: extra positions already in the baseline: {sorted(clash)}")
        note = str(exception.get("note") or "").strip()[:500]
        if waived or extra or note:
            exceptions[equipment] = {"waived_positions": waived, "extra_positions": extra, "note": note}
    return {"status": "confirmed", "positions": positions, "exceptions": exceptions}


def _write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    try:
        for delay in (0.0, 0.05, 0.2, 0.5):
            if delay:
                time.sleep(delay)
            try:
                os.replace(temporary, path)
                return
            except PermissionError:
                continue
        raise PermissionError(f"NETA position baselines are temporarily locked: {path}")
    finally:
        temporary.unlink(missing_ok=True)


def _update(path: Path, expected_revision: int, change) -> dict[str, Any]:
    with _LOCK:
        payload = read_baselines(path)
        if payload["revision"] != expected_revision:
            raise RevisionConflict(
                f"Baselines changed (revision {payload['revision']}, you edited {expected_revision}). "
                "Reload and apply your changes again.")
        change(payload)
        payload["revision"] += 1
        _write(path, payload)
        return payload


def save_family(path: Path, family: str, body: dict[str, Any], expected_revision: int,
                confirmed_by: str) -> dict[str, Any]:
    entry = validate_family(family, body)
    entry["confirmed_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
    entry["confirmed_by"] = confirmed_by

    def change(payload: dict[str, Any]) -> None:
        payload["families"][family] = entry

    return _update(path, expected_revision, change)


def delete_family(path: Path, family: str, expected_revision: int) -> dict[str, Any]:
    def change(payload: dict[str, Any]) -> None:
        if family not in payload["families"]:
            raise KeyError(f"No confirmed baseline for {family}.")
        del payload["families"][family]

    return _update(path, expected_revision, change)
