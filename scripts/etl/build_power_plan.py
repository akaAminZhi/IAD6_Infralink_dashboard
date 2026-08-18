"""Build browser-friendly power-plan pages and annotation coordinates."""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Any

import fitz

try:
    from .json_utils import file_metadata, load_records_json, write_json
except ImportError:
    from json_utils import file_metadata, load_records_json, write_json


PROJECT_ROOT = Path(__file__).resolve().parents[2]
POWER_PLAN_DIR = PROJECT_ROOT / "raw_data" / "power_plan"
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
OUTPUT_PATH = DATA_DIR / "power_plan.json"
EQUIPMENT_PATH = DATA_DIR / "equipment.json"


def normalize_equipment_key(value: Any) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip().upper())
    if text.startswith("IAD06-"):
        text = text[6:]
    return text


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "power-plan"


def build_equipment_index(equipment_path: Path) -> dict[str, dict[str, Any]]:
    if not equipment_path.exists():
        return {}

    index: dict[str, dict[str, Any]] = {}
    for equipment in load_records_json(equipment_path):
        equipment_id = str(equipment.get("equipment_id") or "").strip()
        key = normalize_equipment_key(equipment_id)
        if key and key not in index:
            index[key] = equipment
    return index


def annotation_record(
    annotation: fitz.Annot,
    annotation_id: str,
    equipment_index: dict[str, dict[str, Any]],
    transform: fitz.Matrix | None = None,
) -> dict[str, Any] | None:
    info = annotation.info
    label = str(info.get("content") or "").strip()
    subject = str(info.get("subject") or "").strip()
    annotation_type = annotation.type[1]
    normalized_annotation_type = annotation_type.lower().replace("-", "_")
    normalized_subject = subject.lower().replace("-", "_").replace(" ", "_")
    if normalized_subject in {"room_line", "room_boundary", "boundary"}:
        kind = "room_boundary"
    elif normalized_subject in {"room", "area", "region"}:
        kind = "region"
    elif normalized_annotation_type in {"line", "polyline", "polygon"}:
        kind = "connection"
    elif "FD" in label.upper():
        kind = "termination"
    else:
        kind = "equipment"
    if not label and kind in {"equipment", "termination", "connection"}:
        return None

    matrix = transform or fitz.Identity
    rect = annotation.rect * matrix
    raw_vertices = annotation.vertices or []
    vertices = []
    for raw_vertex in raw_vertices:
        point = fitz.Point(raw_vertex) * matrix
        vertices.append({"x": round(point.x, 3), "y": round(point.y, 3)})
    equipment_key = normalize_equipment_key(label)
    system_element = equipment_index.get(equipment_key)
    matched_equipment_id = (
        str(system_element.get("equipment_id") or "").strip()
        if system_element
        else None
    )
    matchable = kind in {"equipment", "termination", "connection"}

    record = {
        "annotation_id": annotation_id,
        "kind": kind,
        "annotation_type": annotation_type,
        "label": label,
        "subject": subject or None,
        "author": str(info.get("title") or "").strip() or None,
        "rect": {
            "x": round(rect.x0, 3),
            "y": round(rect.y0, 3),
            "width": round(rect.width, 3),
            "height": round(rect.height, 3),
        },
        "center": {
            "x": round((rect.x0 + rect.x1) / 2, 3),
            "y": round((rect.y0 + rect.y1) / 2, 3),
        },
        "normalized_equipment_key": equipment_key if matchable else None,
        "matched_equipment_id": matched_equipment_id,
        "match_status": (
            "matched"
            if matched_equipment_id
            else "unmatched"
            if matchable
            else "not_applicable"
        ),
        "system_element_status": (
            str(system_element.get("status") or "").strip() or None
            if system_element
            else None
        ),
        "system_element_type": (
            str(system_element.get("equipment_type") or "").strip() or None
            if system_element
            else None
        ),
        "status_match_source": "annotation_id" if system_element else None,
    }
    if vertices:
        record["vertices"] = vertices
    return record


def build_power_plan(
    power_plan_dir: str | Path = POWER_PLAN_DIR,
    equipment_path: str | Path = EQUIPMENT_PATH,
    output_path: str | Path = OUTPUT_PATH,
) -> dict[str, Any]:
    source_dir = Path(power_plan_dir)
    equipment_json_path = Path(equipment_path)
    manifest_path = Path(output_path)
    pdf_paths = sorted(source_dir.glob("*.pdf"), key=lambda path: path.name.lower())
    if not pdf_paths:
        raise FileNotFoundError(f"No PDF power plan found in {source_dir}")

    equipment_index = build_equipment_index(equipment_json_path)
    pages: list[dict[str, Any]] = []

    for pdf_path in pdf_paths:
        document = fitz.open(pdf_path)
        try:
            for page_index, page in enumerate(document):
                annotations = []
                for annotation_index, annotation in enumerate(page.annots() or [], start=1):
                    record = annotation_record(
                        annotation,
                        f"{slugify(pdf_path.stem)}-{page_index + 1}-{annotation_index}",
                        equipment_index,
                        page.rotation_matrix,
                    )
                    if record:
                        annotations.append(record)

                pages.append(
                    {
                        "page_id": f"{slugify(pdf_path.stem)}-{page_index + 1}",
                        "document_name": pdf_path.name,
                        "page_number": page_index + 1,
                        "page_label": f"{pdf_path.stem} / Page {page_index + 1}",
                        "width": round(page.rect.width, 3),
                        "height": round(page.rect.height, 3),
                        "rotation": page.rotation,
                        "annotations": annotations,
                    }
                )
        finally:
            document.close()

    equipment_annotations = [
        annotation
        for page in pages
        for annotation in page["annotations"]
        if annotation["kind"] == "equipment"
    ]
    payload = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "source_directory": str(source_dir.resolve()),
        "source_files": [file_metadata(path) for path in pdf_paths],
        "page_count": len(pages),
        "equipment_annotation_count": len(equipment_annotations),
        "matched_equipment_annotation_count": sum(
            annotation["match_status"] == "matched" for annotation in equipment_annotations
        ),
        "matched_system_element_annotation_count": sum(
            annotation["match_status"] == "matched"
            for page in pages
            for annotation in page["annotations"]
            if annotation["kind"] in {"equipment", "termination", "connection"}
        ),
        "pages": pages,
    }
    write_json(manifest_path, payload)
    return payload


def main() -> dict[str, Any]:
    payload = build_power_plan()
    print(
        "Power plan built: "
        f"{payload['page_count']} page(s), "
        f"{payload['matched_equipment_annotation_count']}/"
        f"{payload['equipment_annotation_count']} equipment annotations matched"
    )
    print(f"Wrote {OUTPUT_PATH}")
    return payload


if __name__ == "__main__":
    main()
