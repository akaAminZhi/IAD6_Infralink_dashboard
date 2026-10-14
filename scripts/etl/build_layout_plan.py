"""Extract floor equipment rectangles; boundary/fix are non-rendered controls."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import fitz

try:
    from .build_power_plan import normalize_equipment_key
    from .json_utils import file_metadata, load_records_json, write_json
except ImportError:
    from build_power_plan import normalize_equipment_key
    from json_utils import file_metadata, load_records_json, write_json

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"


def rect_record(rect: fitz.Rect, origin: fitz.Rect) -> dict[str, float]:
    return {
        "x": round(rect.x0 - origin.x0, 3),
        "y": round(rect.y0 - origin.y0, 3),
        "width": round(rect.width, 3),
        "height": round(rect.height, 3),
    }


def build_layout_plan(
    config_path: Path = PROJECT_ROOT / "config" / "layout_plans.json",
    source_dir: Path = PROJECT_ROOT / "raw_data" / "power_plan",
    equipment_path: Path = DATA_DIR / "equipment.json",
    output_path: Path = DATA_DIR / "layout_plan.json",
) -> dict[str, Any]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    equipment_index: dict[str, list[dict[str, Any]]] = {}
    if equipment_path.exists():
        for record in load_records_json(equipment_path):
            key = normalize_equipment_key(record.get("equipment_id"))
            if key:
                equipment_index.setdefault(key, []).append(record)

    floors: list[dict[str, Any]] = []
    fixed_equipment: list[dict[str, Any]] = []
    shared_regions: list[dict[str, Any]] = []
    diagnostics: list[dict[str, Any]] = []
    sources: dict[str, Any] = {}
    floor_ids: set[str] = set()
    for spec in config["floors"]:
        floor_id = spec["floor_id"]
        if floor_id in floor_ids:
            raise ValueError(f"Duplicate layout floor_id: {floor_id}")
        floor_ids.add(floor_id)
        source_path = source_dir / spec["file_name"]
        if not source_path.exists():
            diagnostics.append({"floor_id": floor_id, "reason": "missing_pdf", "file_name": spec["file_name"]})
            continue
        sources[spec["file_name"]] = file_metadata(source_path)
        with fitz.open(source_path) as document:
            page_number = spec.get("page_number", 1)
            if not 1 <= page_number <= len(document):
                raise ValueError(f"Invalid page_number for {source_path.name}: {page_number}")
            page = document[page_number - 1]
            annotations = [
                (annotation, str(annotation.info.get("content") or "").strip(), annotation.rect * page.rotation_matrix)
                for annotation in page.annots() or []
                if annotation.type[0] == fitz.PDF_ANNOT_SQUARE
            ]
            boundaries = [rect for _, label, rect in annotations if label.casefold() == "boundary"]
            if len(boundaries) != 1:
                raise ValueError(f"{source_path.name} page {page_number} needs exactly one boundary rectangle")
            boundary = boundaries[0]
            fixed_regions = [rect for _, label, rect in annotations if label.casefold() == "fix"]
            records = []
            regions = []
            for annotation, label, rect in annotations:
                if label.casefold() in {"boundary", "fix"}:
                    continue
                if not label or not boundary.contains(rect):
                    diagnostics.append({"floor_id": floor_id, "label": label, "reason": "outside_boundary" if label else "missing_comment"})
                    continue
                key = normalize_equipment_key(label)
                is_fixed = any(region.contains(rect) for region in fixed_regions)
                region_kind = (
                    "pod" if re.match(r"^POD(?:\b|\d)", label, re.IGNORECASE)
                    else "room" if re.fullmatch(r"E\d*(?:-\d+){2,}", label, re.IGNORECASE)
                    else None
                )
                if region_kind:
                    region_record = {
                        "annotation_id": f"{floor_id}:{annotation.xref}",
                        "label": label,
                        "kind": region_kind,
                        "rect": rect_record(rect, boundary),
                        "fixed": is_fixed,
                        "source_floor_id": floor_id,
                    }
                    (shared_regions if is_fixed else regions).append(region_record)
                    continue
                candidates = equipment_index.get(key, [])
                matched = candidates[0] if len(candidates) == 1 else None
                match_status = "matched" if matched else "ambiguous" if candidates else "unmatched"
                record = {
                    "annotation_id": f"{floor_id}:{annotation.xref}",
                    "equipment_key": key,
                    "label": label,
                    "rect": rect_record(rect, boundary),
                    "fixed": is_fixed,
                    "source_floor_id": floor_id,
                    "match_status": match_status,
                    "matched_equipment_id": matched.get("equipment_id") if matched else None,
                    "candidate_equipment_ids": [item.get("equipment_id") for item in candidates],
                    "energized_completed_at": matched.get("energized_completed_at") if matched else None,
                    "system_element_status": matched.get("status") if matched else None,
                }
                if match_status != "matched":
                    diagnostics.append({"floor_id": floor_id, "label": label, "reason": match_status, "candidate_equipment_ids": record["candidate_equipment_ids"]})
                (fixed_equipment if is_fixed else records).append(record)
            floors.append({
                "floor_id": floor_id,
                "label": spec["label"],
                "file_name": source_path.name,
                "page_number": page_number,
                "width": round(boundary.width, 3),
                "height": round(boundary.height, 3),
                "equipment": records,
                "regions": regions,
            })
    # Preserve all placements; the UI chooses the first fixed source floor per ID.
    payload = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "selected_input_files": {**sources, "equipment": file_metadata(equipment_path) if equipment_path.exists() else None},
        "floors": floors,
        "fixed_equipment": fixed_equipment,
        "fixed_regions": shared_regions,
        "diagnostics": diagnostics,
    }
    write_json(output_path, payload)
    return payload


def main() -> dict[str, Any]:
    payload = build_layout_plan()
    count = sum(len(floor["equipment"]) for floor in payload["floors"]) + len(payload["fixed_equipment"])
    print(f"Layout plan built: {len(payload['floors'])} floor(s), {count} equipment rectangles, {len(payload['diagnostics'])} diagnostics")
    return payload


if __name__ == "__main__":
    main()
