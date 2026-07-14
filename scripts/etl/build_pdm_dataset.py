"""Build the PDM-centric dataset consumed by the dashboard."""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path
from typing import Any

try:
    from .file_discovery import get_input_files
    from .json_utils import (
        load_records_json,
        selected_input_files_metadata,
        write_json as write_json_payload,
    )
except ImportError:
    from file_discovery import get_input_files
    from json_utils import (
        load_records_json,
        selected_input_files_metadata,
        write_json as write_json_payload,
    )


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"

EQUIPMENT_PATH = DATA_DIR / "equipment.json"
MODULE_LINKS_PATH = DATA_DIR / "module_equipment_links.json"
CASES_PATH = DATA_DIR / "cases.json"

PDMS_OUTPUT_PATH = DATA_DIR / "pdms.json"
PDMS_CSV_OUTPUT_PATH = DATA_DIR / "pdms.csv"

CLOSED_CASE_STATUSES = {
    "closed",
    "complete",
    "completed",
    "cancelled",
    "canceled",
    "void",
    "resolved",
}

CASE_FIELDS = [
    "case_id",
    "status",
    "priority",
    "summary",
    "issue_image",
    "corrective_images",
    "reported_on",
    "due_date",
    "assigned_to",
    "created_at",
    "last_updated_at",
]

PDM_FIELDS = [
    "pdm_name",
    "module_type",
    "length",
    "width",
    "height",
    "weight",
]

CSV_FIELDS = [
    "pdm_name",
    "module_type",
    "length",
    "width",
    "height",
    "weight",
    "equipment_id",
    "source_equipment_label",
    "match_status",
    "equipment_type",
    "status",
    "parent",
    "system",
    "open_issues_count_from_system_elements",
    "calculated_open_case_count",
    "total_case_count",
    "urgent_case_count",
    "high_priority_case_count",
    "neta_complete",
    "neta_completed_at",
    "neta_test_report",
    "neta_report_status",
    "neta_validation_status",
    "manufacturer",
    "model",
    "serial_number",
]


def write_records_json(
    records: list[dict[str, Any]],
    path: Path,
    input_files: dict[str, str],
) -> None:
    write_json_payload(
        path,
        {
            "selected_input_files": selected_input_files_metadata(input_files),
            "records": records,
        },
    )


def first_present(current_value: Any, candidate_value: Any) -> Any:
    if current_value not in (None, ""):
        return current_value
    if candidate_value in (None, ""):
        return current_value
    return candidate_value


def is_closed_case(case: dict[str, Any]) -> bool:
    status = case.get("status")
    if not isinstance(status, str):
        return False
    return status.strip().casefold() in CLOSED_CASE_STATUSES


def is_urgent_case(case: dict[str, Any]) -> bool:
    priority = case.get("priority")
    if not isinstance(priority, str):
        return False
    return "urgent" in priority.casefold()


def is_high_priority_case(case: dict[str, Any]) -> bool:
    priority = case.get("priority")
    if not isinstance(priority, str):
        return False
    return "high" in priority.casefold()


def make_case_summary(case: dict[str, Any]) -> dict[str, Any]:
    return {field: case.get(field) for field in CASE_FIELDS}


def group_cases_by_equipment(cases: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    cases_by_equipment: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for case in cases:
        equipment_id = case.get("equipment_id")
        if isinstance(equipment_id, str) and equipment_id.strip():
            cases_by_equipment[equipment_id].append(make_case_summary(case))
    return dict(cases_by_equipment)


def determine_neta_report_status(equipment: dict[str, Any]) -> str:
    neta_complete = equipment.get("neta_complete")
    neta_test_report = equipment.get("neta_test_report")

    if neta_complete is not True:
        return "not_required_or_not_complete"
    if isinstance(neta_test_report, str) and neta_test_report.strip():
        return "report_available"
    return "missing_report"


def determine_neta_validation_status(equipment: dict[str, Any]) -> str:
    neta_report_status = determine_neta_report_status(equipment)
    if neta_report_status == "missing_report":
        return "error"
    if equipment.get("neta_complete") is not True and not is_blank(
        equipment.get("neta_test_report")
    ):
        return "warning"
    return "valid"


def is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def is_pdm_name(value: Any) -> bool:
    return isinstance(value, str) and value.strip().casefold().startswith(("iad06-pdm-", "iad6-pdm-"))


def get_effective_pdm_name(
    link: dict[str, Any],
    equipment_by_id: dict[str, dict[str, Any]],
) -> str | None:
    """Prefer SystemElements Parent when a matched equipment row exposes a PDM parent.

    The module list can contain occasional row-level PDM typos. Once an equipment
    link is matched to SystemElements, Parent is the more reliable PDM association.
    """
    link_pdm_name = link.get("pdm_name")
    matched_equipment_id = link.get("matched_equipment_id")
    equipment = equipment_by_id.get(matched_equipment_id, {}) if matched_equipment_id else {}
    parent = equipment.get("parent")

    if is_pdm_name(parent):
        return str(parent).strip()
    if isinstance(link_pdm_name, str) and link_pdm_name.strip():
        return link_pdm_name.strip()
    return None


def make_pdm_equipment_record(
    link: dict[str, Any],
    equipment_by_id: dict[str, dict[str, Any]],
    cases_by_equipment: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    match_status = link.get("match_status")
    matched_equipment_id = link.get("matched_equipment_id")
    output_equipment_id = matched_equipment_id or link.get("normalized_equipment_id")
    equipment = equipment_by_id.get(matched_equipment_id, {}) if matched_equipment_id else {}
    related_cases = cases_by_equipment.get(matched_equipment_id, []) if matched_equipment_id else []
    neta_report_status = determine_neta_report_status(equipment)

    return {
        "equipment_id": output_equipment_id,
        "source_equipment_label": link.get("source_equipment_label"),
        "match_status": match_status,
        "equipment_type": equipment.get("equipment_type"),
        "status": equipment.get("status"),
        "parent": equipment.get("parent"),
        "system": equipment.get("system"),
        "open_issues_count_from_system_elements": equipment.get(
            "open_issues_count_from_system_elements"
        ),
        "calculated_open_case_count": sum(
            1 for case in related_cases if not is_closed_case(case)
        ),
        "neta_complete": equipment.get("neta_complete"),
        "neta_completed_at": equipment.get("neta_completed_at"),
        "neta_test_report": equipment.get("neta_test_report"),
        "neta_report_status": neta_report_status,
        "neta_validation_status": determine_neta_validation_status(equipment),
        "manufacturer": equipment.get("manufacturer"),
        "model": equipment.get("model"),
        "serial_number": equipment.get("serial_number"),
        "cases": related_cases,
    }


def make_empty_pdm(link: dict[str, Any]) -> dict[str, Any]:
    return {
        "pdm_name": link.get("pdm_name"),
        "module_type": link.get("module_type"),
        "length": link.get("length"),
        "width": link.get("width"),
        "height": link.get("height"),
        "weight": link.get("weight"),
        "equipment_count": 0,
        "matched_equipment_count": 0,
        "unmatched_equipment_count": 0,
        "open_case_count": 0,
        "total_case_count": 0,
        "urgent_case_count": 0,
        "high_priority_case_count": 0,
        "neta_complete_count": 0,
        "neta_incomplete_count": 0,
        "neta_missing_report_count": 0,
        "equipment": [],
    }


def recalculate_pdm_counts(pdm: dict[str, Any]) -> None:
    equipment_records = pdm["equipment"]
    all_cases = [
        case
        for equipment in equipment_records
        for case in equipment["cases"]
    ]

    pdm["equipment_count"] = len(equipment_records)
    pdm["matched_equipment_count"] = sum(
        1 for equipment in equipment_records if equipment.get("match_status") == "matched"
    )
    pdm["unmatched_equipment_count"] = (
        pdm["equipment_count"] - pdm["matched_equipment_count"]
    )
    pdm["open_case_count"] = sum(1 for case in all_cases if not is_closed_case(case))
    pdm["total_case_count"] = len(all_cases)
    pdm["urgent_case_count"] = sum(1 for case in all_cases if is_urgent_case(case))
    pdm["high_priority_case_count"] = sum(
        1 for case in all_cases if is_high_priority_case(case)
    )
    pdm["neta_complete_count"] = sum(
        1 for equipment in equipment_records if equipment.get("neta_complete") is True
    )
    pdm["neta_incomplete_count"] = sum(
        1 for equipment in equipment_records if equipment.get("neta_complete") is not True
    )
    pdm["neta_missing_report_count"] = sum(
        1
        for equipment in equipment_records
        if equipment.get("neta_report_status") == "missing_report"
    )


def build_pdm_dataset(
    equipment_records: list[dict[str, Any]],
    module_links: list[dict[str, Any]],
    cases: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    equipment_by_id = {
        equipment["equipment_id"]: equipment
        for equipment in equipment_records
        if isinstance(equipment.get("equipment_id"), str)
    }
    cases_by_equipment = group_cases_by_equipment(cases)
    pdms_by_name: dict[str, dict[str, Any]] = {}

    for link in module_links:
        pdm_name = get_effective_pdm_name(link, equipment_by_id)
        if not isinstance(pdm_name, str) or not pdm_name.strip():
            continue

        effective_link = dict(link)
        effective_link["pdm_name"] = pdm_name

        if pdm_name not in pdms_by_name:
            pdms_by_name[pdm_name] = make_empty_pdm(effective_link)
        else:
            pdm = pdms_by_name[pdm_name]
            for field in PDM_FIELDS:
                pdm[field] = first_present(pdm.get(field), effective_link.get(field))

        pdms_by_name[pdm_name]["equipment"].append(
            make_pdm_equipment_record(effective_link, equipment_by_id, cases_by_equipment)
        )

    pdms = [pdms_by_name[pdm_name] for pdm_name in sorted(pdms_by_name)]
    for pdm in pdms:
        recalculate_pdm_counts(pdm)

    return pdms


def write_pdm_csv(pdms: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=CSV_FIELDS)
        writer.writeheader()

        for pdm in pdms:
            for equipment in pdm["equipment"]:
                writer.writerow(
                    {
                        "pdm_name": pdm.get("pdm_name"),
                        "module_type": pdm.get("module_type"),
                        "length": pdm.get("length"),
                        "width": pdm.get("width"),
                        "height": pdm.get("height"),
                        "weight": pdm.get("weight"),
                        "equipment_id": equipment.get("equipment_id"),
                        "source_equipment_label": equipment.get("source_equipment_label"),
                        "match_status": equipment.get("match_status"),
                        "equipment_type": equipment.get("equipment_type"),
                        "status": equipment.get("status"),
                        "parent": equipment.get("parent"),
                        "system": equipment.get("system"),
                        "open_issues_count_from_system_elements": equipment.get(
                            "open_issues_count_from_system_elements"
                        ),
                        "calculated_open_case_count": equipment.get(
                            "calculated_open_case_count"
                        ),
                        "total_case_count": len(equipment.get("cases", [])),
                        "urgent_case_count": sum(
                            1 for case in equipment.get("cases", []) if is_urgent_case(case)
                        ),
                        "high_priority_case_count": sum(
                            1
                            for case in equipment.get("cases", [])
                            if is_high_priority_case(case)
                        ),
                        "neta_complete": equipment.get("neta_complete"),
                        "neta_completed_at": equipment.get("neta_completed_at"),
                        "neta_test_report": equipment.get("neta_test_report"),
                        "neta_report_status": equipment.get("neta_report_status"),
                        "neta_validation_status": equipment.get(
                            "neta_validation_status"
                        ),
                        "manufacturer": equipment.get("manufacturer"),
                        "model": equipment.get("model"),
                        "serial_number": equipment.get("serial_number"),
                    }
                )


def run_build(input_files: dict[str, str] | None = None) -> list[dict[str, Any]]:
    selected_input_files = input_files or get_input_files()
    equipment_records = load_records_json(EQUIPMENT_PATH)
    module_links = load_records_json(MODULE_LINKS_PATH)
    cases = load_records_json(CASES_PATH)

    pdms = build_pdm_dataset(equipment_records, module_links, cases)
    write_records_json(pdms, PDMS_OUTPUT_PATH, selected_input_files)
    write_pdm_csv(pdms, PDMS_CSV_OUTPUT_PATH)
    return pdms


def main() -> None:
    pdms = run_build()
    equipment_count = sum(len(pdm["equipment"]) for pdm in pdms)
    case_count = sum(
        len(equipment["cases"])
        for pdm in pdms
        for equipment in pdm["equipment"]
    )

    print(f"Wrote {len(pdms)} PDM records to {PDMS_OUTPUT_PATH}")
    print(f"Wrote {equipment_count} PDM equipment rows to {PDMS_CSV_OUTPUT_PATH}")
    print(f"Attached {case_count} case references")


if __name__ == "__main__":
    main()
