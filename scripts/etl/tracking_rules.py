"""Shared equipment tracking rules used across ETL outputs."""

from __future__ import annotations

from typing import Any, Mapping


TRACKING_EXCLUDED_TOKEN = "BATTERY"
DIRECT_INVERTER_PREFIX = "INV6"
EQUIPMENT_REFERENCE_FIELDS = (
    "equipment_id",
    "source_equipment_label",
    "matched_equipment_id",
    "normalized_equipment_id",
    "module_equipment",
)


def requires_equipment_test_tracking(record: Mapping[str, Any]) -> bool:
    """Return false for batteries and direct INV6 inverter equipment."""
    for field in EQUIPMENT_REFERENCE_FIELDS:
        reference = str(record.get(field) or "").strip().upper()
        if TRACKING_EXCLUDED_TOKEN in reference:
            return False

        without_project_prefix = (
            reference.removeprefix("IAD06-")
            if reference.startswith("IAD06-")
            else reference
        )
        if (
            without_project_prefix == DIRECT_INVERTER_PREFIX
            or without_project_prefix.startswith(f"{DIRECT_INVERTER_PREFIX}-")
        ):
            return False

    return True
