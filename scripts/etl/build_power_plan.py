"""Build browser-friendly power-plan pages and annotation coordinates."""

from __future__ import annotations

import re
from datetime import date, datetime
import os
from pathlib import Path
from typing import Any
from urllib.parse import quote

import fitz

try:
    from .json_utils import file_metadata, load_records_json, write_json
except ImportError:
    from json_utils import file_metadata, load_records_json, write_json


PROJECT_ROOT = Path(__file__).resolve().parents[2]
EPS_TRACKER_ROOT = Path(
    os.environ.get(
        "IAD6_EPS_TRACKER_ROOT",
        str(PROJECT_ROOT.parent / "IAD6_EPS_Testing_Tracker"),
    )
)
POWER_PLAN_DIR = PROJECT_ROOT / "raw_data" / "power_plan"
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
OUTPUT_PATH = DATA_DIR / "power_plan.json"
EQUIPMENT_PATH = DATA_DIR / "equipment.json"
MV_REPORT_DIR = EPS_TRACKER_ROOT / "MV_Daily_test_report"
FEEDER_CABLE_ATP_DIR = EPS_TRACKER_ROOT / "downloads" / "feeder_cable_atp"
FEEDER_CABLE_ATP_URL_BASE = "/feeder-cable-atp"
L3_STATUS = "L3: PRE FUNC TESTING & STARTUP"

MV_SECTION_NAMES = {
    "tested and passed": "tested_and_passed",
    "partially tested": "partially_tested",
    "failed": "failed",
    "retested and passed": "retested_and_passed",
}
MV_SECTION_PRIORITY = (
    "retested_and_passed",
    "tested_and_passed",
    "failed",
    "partially_tested",
)


def normalize_equipment_key(value: Any) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip().upper())
    if text.startswith("IAD06-"):
        text = text[6:]
    return text


def split_attachment_names(value: Any) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for part in re.split(r"[;\r\n]+", str(value or "")):
        name = " ".join(part.strip().split())
        key = name.casefold()
        if name and key not in {"n/a", "na", "none", "null"} and key not in seen:
            names.append(name)
            seen.add(key)
    return names


def feeder_cable_atp_url(relative_path: Path) -> str:
    return f"{FEEDER_CABLE_ATP_URL_BASE}/{'/'.join(quote(part) for part in relative_path.parts)}"


def build_feeder_cable_atp_index(
    download_dir: Path,
) -> dict[str, list[dict[str, Any]]]:
    if not download_dir.exists():
        return {}

    index: dict[str, list[dict[str, Any]]] = {}
    for file_path in sorted(
        download_dir.rglob("*.pdf"), key=lambda path: str(path).lower()
    ):
        if not file_path.is_file():
            continue
        relative_path = file_path.relative_to(download_dir)
        if len(relative_path.parts) < 2:
            continue
        equipment_key = normalize_equipment_key(relative_path.parts[0])
        if not equipment_key:
            continue
        index.setdefault(equipment_key, []).append(
            {
                "file_name": file_path.name,
                "relative_path": relative_path.as_posix(),
                "url": feeder_cable_atp_url(relative_path),
                "bytes": file_path.stat().st_size,
                "modified_at": datetime.fromtimestamp(file_path.stat().st_mtime)
                .astimezone()
                .isoformat(),
            }
        )
    return index


def mv_report_date(path: Path) -> str | None:
    parts = path.stem.split("-")
    try:
        if len(parts) == 3 and len(parts[0]) == 4:
            return date(int(parts[0]), int(parts[1]), int(parts[2])).isoformat()
        if len(parts) == 2:
            modified_year = datetime.fromtimestamp(path.stat().st_mtime).year
            return date(modified_year, int(parts[0]), int(parts[1])).isoformat()
    except (OSError, ValueError):
        return None
    return None


def parse_mv_report(path: Path) -> dict[str, list[str]]:
    raw_sections = {name: [] for name in MV_SECTION_NAMES.values()}
    current_section: str | None = None
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if line.startswith("#"):
            current_section = MV_SECTION_NAMES.get(line.lstrip("#").strip().lower())
            continue
        if current_section is None:
            continue
        item = re.sub(r"^\s*(?:(?:[-*+])|(?:\d+[.)]))\s+", "", raw_line).strip()
        if item and " " not in item and "-" in item and any(char.isdigit() for char in item):
            raw_sections[current_section].append(item)

    kept_keys: set[str] = set()
    sections = {name: [] for name in raw_sections}
    for section_name in MV_SECTION_PRIORITY:
        seen_in_section: set[str] = set()
        for item in raw_sections[section_name]:
            key = normalize_equipment_key(item)
            if not key or key in kept_keys or key in seen_in_section:
                continue
            kept_keys.add(key)
            seen_in_section.add(key)
            sections[section_name].append(item)
    return sections


def build_mv_test_index(
    report_dir: Path,
) -> tuple[dict[str, list[dict[str, str]]], list[Path]]:
    if not report_dir.exists():
        return {}, []

    dated_reports = [
        (report_date, path)
        for path in report_dir.glob("*.md")
        if (report_date := mv_report_date(path)) is not None
    ]
    dated_reports.sort(key=lambda item: (item[0], item[1].name.lower()))
    index: dict[str, list[dict[str, str]]] = {}
    for report_date, path in dated_reports:
        for status, items in parse_mv_report(path).items():
            for item in items:
                key = normalize_equipment_key(item)
                index.setdefault(key, []).append(
                    {
                        "date": report_date,
                        "status": status,
                        "report_name": path.name,
                    }
                )
    return index, [path for _, path in dated_reports]


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
    mv_test_index: dict[str, list[dict[str, str]]],
    feeder_cable_atp_index: dict[str, list[dict[str, Any]]],
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
    mv_test_history = list(mv_test_index.get(equipment_key, [])) if matchable else []
    latest_mv_test = mv_test_history[-1] if mv_test_history else None
    mv_tested_dates = [
        entry["date"]
        for entry in mv_test_history
        if entry["status"] in {"tested_and_passed", "retested_and_passed"}
    ]
    feeder_cable_atp_names = (
        split_attachment_names(system_element.get("feeder_cable_atp"))
        if system_element
        else []
    )
    expected_atp_names = {name.casefold() for name in feeder_cable_atp_names}
    feeder_cable_atp_files = [
        file_record
        for file_record in feeder_cable_atp_index.get(equipment_key, [])
        if file_record["file_name"].casefold() in expected_atp_names
    ]
    feeder_cable_atp_required = (
        kind == "connection"
        and " ".join(str(system_element.get("status") or "").strip().upper().split())
        == L3_STATUS
        if system_element
        else False
    )
    if feeder_cable_atp_files:
        feeder_cable_atp_status = "available"
    elif feeder_cable_atp_required:
        feeder_cable_atp_status = "missing_required"
    elif feeder_cable_atp_names:
        feeder_cable_atp_status = "referenced_file_missing"
    else:
        feeder_cable_atp_status = "not_required"

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
        "mv_daily_test_status": latest_mv_test["status"] if latest_mv_test else None,
        "mv_daily_test_date": latest_mv_test["date"] if latest_mv_test else None,
        "mv_daily_tested_dates": list(dict.fromkeys(mv_tested_dates)),
        "mv_daily_test_history": mv_test_history,
        "feeder_cable_atp_names": feeder_cable_atp_names,
        "feeder_cable_atp_files": feeder_cable_atp_files,
        "feeder_cable_atp_required": feeder_cable_atp_required,
        "feeder_cable_atp_status": feeder_cable_atp_status,
    }
    if vertices:
        record["vertices"] = vertices
    return record


def build_power_plan(
    power_plan_dir: str | Path = POWER_PLAN_DIR,
    equipment_path: str | Path = EQUIPMENT_PATH,
    output_path: str | Path = OUTPUT_PATH,
    mv_report_dir: str | Path = MV_REPORT_DIR,
    feeder_cable_atp_dir: str | Path = FEEDER_CABLE_ATP_DIR,
) -> dict[str, Any]:
    source_dir = Path(power_plan_dir)
    equipment_json_path = Path(equipment_path)
    manifest_path = Path(output_path)
    mv_report_path = Path(mv_report_dir)
    feeder_atp_path = Path(feeder_cable_atp_dir)
    pdf_paths = sorted(source_dir.glob("*.pdf"), key=lambda path: path.name.lower())
    if not pdf_paths:
        raise FileNotFoundError(f"No PDF power plan found in {source_dir}")

    equipment_index = build_equipment_index(equipment_json_path)
    mv_test_index, mv_report_files = build_mv_test_index(mv_report_path)
    feeder_atp_index = build_feeder_cable_atp_index(feeder_atp_path)
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
                        mv_test_index,
                        feeder_atp_index,
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
    missing_required_atp_by_equipment: dict[str, dict[str, Any]] = {}
    for page in pages:
        for annotation in page["annotations"]:
            if annotation.get("feeder_cable_atp_status") != "missing_required":
                continue
            equipment_id = (
                annotation.get("matched_equipment_id")
                or annotation.get("label")
                or annotation.get("annotation_id")
            )
            missing_required_atp_by_equipment.setdefault(
                str(equipment_id),
                {
                    "equipment_id": annotation.get("matched_equipment_id"),
                    "label": annotation.get("label"),
                    "system_element_status": annotation.get("system_element_status"),
                    "expected_files": annotation.get("feeder_cable_atp_names", []),
                },
            )
    payload = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "source_directory": str(source_dir.resolve()),
        "source_files": [file_metadata(path) for path in pdf_paths],
        "mv_daily_report_directory": str(mv_report_path.resolve()),
        "mv_daily_report_files": [file_metadata(path) for path in mv_report_files],
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
        "mv_daily_tested_annotation_count": sum(
            annotation.get("mv_daily_test_status")
            in {"tested_and_passed", "retested_and_passed"}
            for page in pages
            for annotation in page["annotations"]
            if annotation["kind"] in {"equipment", "termination", "connection"}
        ),
        "feeder_cable_atp_download_directory": str(feeder_atp_path.resolve()),
        "feeder_cable_atp_public_link": {
            "status": "served_by_vite",
            "target": str(feeder_atp_path.resolve()),
            "url_base": FEEDER_CABLE_ATP_URL_BASE,
            "pdf_only": True,
        },
        "feeder_cable_atp_linked_annotation_count": sum(
            bool(annotation.get("feeder_cable_atp_files"))
            for page in pages
            for annotation in page["annotations"]
        ),
        "feeder_cable_atp_missing_required_count": len(
            missing_required_atp_by_equipment
        ),
        "feeder_cable_atp_missing_required": list(
            missing_required_atp_by_equipment.values()
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
    print(
        "Feeder Cable ATP: "
        f"{payload['feeder_cable_atp_linked_annotation_count']} annotation(s) linked, "
        f"{payload['feeder_cable_atp_missing_required_count']} required file(s) missing"
    )
    print(f"Wrote {OUTPUT_PATH}")
    return payload


if __name__ == "__main__":
    main()
