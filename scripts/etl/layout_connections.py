"""Resolve feeder IDs to equipment; never infer endpoints from termination IDs."""

from __future__ import annotations

import re
from typing import Any

try:
    from .build_power_plan import normalize_equipment_key
except ImportError:
    from build_power_plan import normalize_equipment_key


def build_layout_connections(
    equipment_index: dict[str, list[dict[str, Any]]],
    layout_keys: set[str],
    mv_test_index: dict[str, list[dict[str, str]]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Keep unresolved cables as records and diagnostics, without invented paths."""
    assets = {
        key for key, rows in equipment_index.items()
        if len(rows) == 1 and not re.search(r"cable|termination", str(rows[0].get("equipment_type") or ""), re.I)
    }
    cables: list[dict[str, Any]] = []
    diagnostics: list[dict[str, Any]] = []
    for key, rows in equipment_index.items():
        record = rows[0]
        equipment_type = str(record.get("equipment_type") or "")
        if not re.search(r"\bcable\b", equipment_type, re.I) or re.search(r"termination", equipment_type, re.I):
            continue
        source = target = None
        reason = None
        # A repeated IAD06 token separates complete IDs, including hyphenated TX IDs.
        parts = re.split(r"-IAD06-", re.sub(r"^FD[^-]*-", "", key), maxsplit=1)
        if len(parts) == 2:
            source, target = map(normalize_equipment_key, parts)
            if target not in equipment_index:
                # Some feeder IDs append a numeric circuit suffix after the asset ID.
                candidates = [asset for asset in assets if target.startswith(f"{asset}-")
                              and re.fullmatch(r"\d+", target[len(asset) + 1:])]
                if len(candidates) == 1:
                    target = candidates[0]
                elif len(candidates) > 1:
                    reason = "ambiguous_target_equipment"
            if any(endpoint in equipment_index and len(equipment_index[endpoint]) != 1 for endpoint in (source, target)):
                reason = "ambiguous_endpoint_equipment"
            elif source not in assets or target not in assets:
                reason = reason or "endpoint_equipment_not_found"
        else:
            reason = "endpoints_not_encoded"
        if len(rows) != 1:
            reason = "ambiguous_cable_id"
        if reason is None and (source not in layout_keys or target not in layout_keys):
            reason = "endpoint_not_on_layout"
        history = mv_test_index.get(key, [])
        latest = history[-1] if history else None
        cables.append({
            "cable_id": str(record.get("equipment_id") or key),
            "equipment_type": equipment_type,
            "source_equipment_key": source,
            "target_equipment_key": target,
            "connection_status": reason or "resolved",
            "system_element_status": record.get("status"),
            "neta_complete": record.get("neta_complete") is True,
            "neta_test_report": record.get("neta_test_report"),
            "mv_daily_test_status": latest["status"] if latest else None,
            "mv_daily_test_date": latest["date"] if latest else None,
        })
        if reason:
            diagnostics.append({"cable_id": str(record.get("equipment_id") or key), "reason": reason,
                                "source_equipment_key": source, "target_equipment_key": target})
    return cables, diagnostics
