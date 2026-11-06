"""Read MV cable topology from the same PDF annotations as the MV page."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import fitz

try:
    from .build_power_plan import annotation_record, normalize_equipment_key
except ImportError:
    from build_power_plan import annotation_record, normalize_equipment_key


def mv_page_connections(annotations: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Associate each line end with one nearby equipment rectangle on its page.

    MV ports sit about 15 PDF points outside cabinet rectangles. A 24-point
    limit accepts those ports without bridging to the next row. Termination
    labels are deliberately ignored: copied labels can name another cabinet.
    """
    equipment = [item for item in annotations if item["kind"] == "equipment"]
    connections: dict[str, list[dict[str, Any]]] = {}
    for item in annotations:
        if item["kind"] != "connection":
            continue
        vertices = item.get("vertices", [])
        endpoints = []
        for point in ([vertices[0], vertices[-1]] if len(vertices) >= 2 else []):
            candidates = set()
            for asset in equipment:
                rect = asset["rect"]
                distance = math.hypot(
                    max(rect["x"] - point["x"], 0, point["x"] - rect["x"] - rect["width"]),
                    max(rect["y"] - point["y"], 0, point["y"] - rect["y"] - rect["height"]),
                )
                if distance <= 24:
                    candidates.add(normalize_equipment_key(asset["label"]))
            endpoints.append(next(iter(candidates)) if len(candidates) == 1 else None)
        source, target = endpoints if len(endpoints) == 2 else (None, None)
        reason = None if source and target and source != target else "mv_diagram_endpoint_unresolved"
        connections.setdefault(normalize_equipment_key(item["label"]), []).append({
            "source_equipment_key": source,
            "target_equipment_key": target,
            "reason": reason,
            "annotation_id": item["annotation_id"],
        })
    return connections


def read_mv_connections(path: Path) -> dict[str, list[dict[str, Any]]]:
    connections: dict[str, list[dict[str, Any]]] = {}
    if not path.exists():
        return connections
    with fitz.open(path) as document:
        for page_number, page in enumerate(document, 1):
            annotations = [record for annotation in page.annots() or []
                           if (record := annotation_record(
                               annotation, f"electrical-iad6-mv-{page_number}:{annotation.xref}",
                               {}, {}, {}, page.rotation_matrix,
                           )) is not None]
            for key, records in mv_page_connections(annotations).items():
                connections.setdefault(key, []).extend(records)
    return connections
