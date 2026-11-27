"""Shared case status rule for ETL counts and evidence checks."""

from __future__ import annotations

from typing import Any


_CLOSED_CASE_STATUSES = {
    "closed",
    "complete",
    "completed",
    "cancelled",
    "canceled",
    "void",
    "resolved",
}


def is_closed_case(record: dict[str, Any] | None) -> bool:
    status = record.get("status") if record is not None else None
    return isinstance(status, str) and status.strip().casefold() in _CLOSED_CASE_STATUSES
