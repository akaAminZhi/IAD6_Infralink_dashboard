"""Resolve feeder IDs to equipment; never infer endpoints from termination IDs."""

from __future__ import annotations

import re
from typing import Any

try:
    from .build_power_plan import L3_STATUS, normalize_equipment_key, split_attachment_names
except ImportError:
    from build_power_plan import L3_STATUS, normalize_equipment_key, split_attachment_names


def build_layout_connections(
    equipment_index: dict[str, list[dict[str, Any]]],
    layout_keys: set[str],
    mv_test_index: dict[str, list[dict[str, str]]],
    feeder_cable_atp_index: dict[str, list[dict[str, Any]]] | None = None,
    eps_daily_test_index: dict[str, list[dict[str, str]]] | None = None,
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
        eps_history = (eps_daily_test_index or {}).get(key, [])
        latest_eps = eps_history[-1] if eps_history else None
        atp_names = split_attachment_names(record.get("feeder_cable_atp"))
        expected_names = {name.casefold() for name in atp_names}
        atp_files = [file_record for file_record in (feeder_cable_atp_index or {}).get(key, [])
                     if file_record["file_name"].casefold() in expected_names]
        atp_required = " ".join(str(record.get("status") or "").strip().upper().split()) == L3_STATUS
        atp_status = ("available" if atp_files else "missing_required" if atp_required
                      else "referenced_file_missing" if atp_names else "not_required")
        cables.append({
            "cable_id": str(record.get("equipment_id") or key),
            "equipment_type": equipment_type,
            "source_equipment_key": source,
            "target_equipment_key": target,
            "connection_status": reason or "resolved",
            "system_element_status": record.get("status"),
            "neta_complete": record.get("neta_complete") is True,
            "neta_test_report": record.get("neta_test_report"),
            "feeder_cable_atp_names": atp_names,
            "feeder_cable_atp_files": atp_files,
            "feeder_cable_atp_required": atp_required,
            "feeder_cable_atp_status": atp_status,
            "mv_daily_test_status": latest["status"] if latest else None,
            "daily_report_history": list({
                (event["source"], event["report_name"], event["line_number"]): event
                for result in [*history, *eps_history] for event in result.get("events", [])
            }.values()),
            "daily_report_conflict": bool((latest and latest.get("conflict")) or (latest_eps and latest_eps.get("conflict"))),
            "mv_daily_test_date": latest["date"] if latest else None,
            "eps_daily_test_status": latest_eps["status"] if latest_eps else None,
            "eps_daily_test_date": latest_eps["date"] if latest_eps else None,
            "eps_daily_report_name": latest_eps["report_name"] if latest_eps else None,
        })
        if reason:
            diagnostics.append({"cable_id": str(record.get("equipment_id") or key), "reason": reason,
                                "source_equipment_key": source, "target_equipment_key": target})
    return cables, diagnostics
