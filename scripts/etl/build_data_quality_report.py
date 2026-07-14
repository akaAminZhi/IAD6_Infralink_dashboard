"""Build a non-blocking data quality report for weekly ETL refreshes."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime
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
PDMS_PATH = DATA_DIR / "pdms.json"
REPORT_OUTPUT_PATH = DATA_DIR / "data_quality_report.json"

EQUIPMENT_REQUIRED_FIELDS = ["equipment_id"]
MODULE_LINK_REQUIRED_FIELDS = ["pdm_name", "source_equipment_label"]
CASE_REQUIRED_FIELDS = ["case_id", "equipment_id", "status", "summary"]
PDM_REQUIRED_FIELDS = ["pdm_name"]
CLOSED_CASE_STATUSES = {
    "closed",
    "complete",
    "completed",
    "cancelled",
    "canceled",
    "void",
    "resolved",
}


def is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def is_closed_case(case: dict[str, Any]) -> bool:
    status = case.get("status")
    return isinstance(status, str) and status.strip().casefold() in CLOSED_CASE_STATUSES


def make_pdm_lookup(pdms: list[dict[str, Any]]) -> dict[str, list[str]]:
    lookup: dict[str, list[str]] = defaultdict(list)

    for pdm in pdms:
        pdm_name = pdm.get("pdm_name")
        if not isinstance(pdm_name, str) or not pdm_name.strip():
            continue

        for equipment in pdm.get("equipment", []):
            equipment_id = equipment.get("equipment_id")
            if not isinstance(equipment_id, str) or not equipment_id.strip():
                continue
            if pdm_name not in lookup[equipment_id]:
                lookup[equipment_id].append(pdm_name)

    return dict(lookup)


def format_pdm_names(equipment_id: Any, pdm_lookup: dict[str, list[str]]) -> str | None:
    if not isinstance(equipment_id, str):
        return None
    pdm_names = pdm_lookup.get(equipment_id, [])
    if not pdm_names:
        return None
    return "; ".join(pdm_names)


def build_unmatched_module_equipment(
    module_links: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [
        {
            "pdm_name": link.get("pdm_name"),
            "module_type": link.get("module_type"),
            "source_equipment_label": link.get("source_equipment_label"),
            "normalized_equipment_id": link.get("normalized_equipment_id"),
            "match_status": link.get("match_status"),
        }
        for link in module_links
        if link.get("match_status") != "matched"
    ]


def build_unmatched_cases(cases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "case_id": case.get("case_id"),
            "equipment_id": case.get("equipment_id"),
            "system_element_raw": case.get("system_element_raw"),
            "status": case.get("status"),
            "priority": case.get("priority"),
            "summary": case.get("summary"),
            "issue_image": case.get("issue_image"),
            "corrective_images": case.get("corrective_images"),
        }
        for case in cases
        if case.get("match_status") != "matched"
    ]


def build_cases_missing_issue_image(
    cases: list[dict[str, Any]],
    pdm_lookup: dict[str, list[str]],
) -> list[dict[str, Any]]:
    return [
        {
            "case_id": case.get("case_id"),
            "equipment_id": case.get("equipment_id"),
            "pdm_name": format_pdm_names(case.get("equipment_id"), pdm_lookup),
            "status": case.get("status"),
            "priority": case.get("priority"),
            "summary": case.get("summary"),
        }
        for case in cases
        if is_blank(case.get("issue_image"))
    ]


def build_closed_cases_missing_corrective_images(
    cases: list[dict[str, Any]],
    pdm_lookup: dict[str, list[str]],
) -> list[dict[str, Any]]:
    return [
        {
            "case_id": case.get("case_id"),
            "equipment_id": case.get("equipment_id"),
            "pdm_name": format_pdm_names(case.get("equipment_id"), pdm_lookup),
            "status": case.get("status"),
            "priority": case.get("priority"),
            "summary": case.get("summary"),
            "corrective_images": case.get("corrective_images"),
        }
        for case in cases
        if is_closed_case(case) and is_blank(case.get("corrective_images"))
    ]


def build_neta_completed_but_missing_test_report(
    pdms: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []

    for pdm in pdms:
        for equipment in pdm.get("equipment", []):
            has_completion_value = (
                equipment.get("neta_complete") is True
                or not is_blank(equipment.get("neta_completed_at"))
            )
            if not has_completion_value:
                continue
            if not is_blank(equipment.get("neta_test_report")):
                continue
            findings.append(
                {
                    "equipment_id": equipment.get("equipment_id"),
                    "pdm_name": pdm.get("pdm_name"),
                    "neta_complete": equipment.get("neta_complete"),
                    "neta_completed_at": equipment.get("neta_completed_at"),
                    "neta_test_report": equipment.get("neta_test_report"),
                }
            )

    return findings


def build_neta_test_report_present_but_not_complete(
    pdms: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []

    for pdm in pdms:
        for equipment in pdm.get("equipment", []):
            if is_blank(equipment.get("neta_test_report")):
                continue
            if equipment.get("neta_complete") is True:
                continue
            findings.append(
                {
                    "equipment_id": equipment.get("equipment_id"),
                    "pdm_name": pdm.get("pdm_name"),
                    "neta_complete": equipment.get("neta_complete"),
                    "neta_completed_at": equipment.get("neta_completed_at"),
                    "neta_test_report": equipment.get("neta_test_report"),
                }
            )

    return findings


def build_open_issue_count_mismatches(pdms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []

    for pdm in pdms:
        for equipment in pdm.get("equipment", []):
            source_count = equipment.get("open_issues_count_from_system_elements")
            calculated_count = equipment.get("calculated_open_case_count")
            if source_count is None:
                continue
            if source_count == calculated_count:
                continue
            findings.append(
                {
                    "equipment_id": equipment.get("equipment_id"),
                    "pdm_name": pdm.get("pdm_name"),
                    "open_issues_count_from_system_elements": source_count,
                    "calculated_open_case_count": calculated_count,
                }
            )

    return findings


def build_duplicate_equipment_ids(
    equipment_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    counter = Counter(
        equipment.get("equipment_id")
        for equipment in equipment_records
        if not is_blank(equipment.get("equipment_id"))
    )
    return [
        {
            "equipment_id": equipment_id,
            "count": count,
        }
        for equipment_id, count in sorted(counter.items())
        if count > 1
    ]


def add_blank_required_field_findings(
    findings: list[dict[str, Any]],
    dataset_name: str,
    records: list[dict[str, Any]],
    required_fields: list[str],
    id_field: str,
) -> None:
    for index, record in enumerate(records, start=1):
        missing_fields = [
            field
            for field in required_fields
            if is_blank(record.get(field))
        ]
        if not missing_fields:
            continue

        findings.append(
            {
                "dataset": dataset_name,
                "row_number": index,
                "record_id": record.get(id_field),
                "blank_fields": missing_fields,
            }
        )


def build_blank_required_fields(
    equipment_records: list[dict[str, Any]],
    module_links: list[dict[str, Any]],
    cases: list[dict[str, Any]],
    pdms: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    add_blank_required_field_findings(
        findings,
        "equipment",
        equipment_records,
        EQUIPMENT_REQUIRED_FIELDS,
        "equipment_id",
    )
    add_blank_required_field_findings(
        findings,
        "module_equipment_links",
        module_links,
        MODULE_LINK_REQUIRED_FIELDS,
        "source_equipment_label",
    )
    add_blank_required_field_findings(
        findings,
        "cases",
        cases,
        CASE_REQUIRED_FIELDS,
        "case_id",
    )
    add_blank_required_field_findings(
        findings,
        "pdms",
        pdms,
        PDM_REQUIRED_FIELDS,
        "pdm_name",
    )
    return findings


def build_data_quality_report(
    equipment_records: list[dict[str, Any]],
    module_links: list[dict[str, Any]],
    cases: list[dict[str, Any]],
    pdms: list[dict[str, Any]],
) -> dict[str, Any]:
    pdm_lookup = make_pdm_lookup(pdms)

    return {
        "generated_at": datetime.now().astimezone().isoformat(),
        "unmatched_module_equipment": build_unmatched_module_equipment(module_links),
        "unmatched_cases": build_unmatched_cases(cases),
        "cases_missing_issue_image": build_cases_missing_issue_image(
            cases,
            pdm_lookup,
        ),
        "closed_cases_missing_corrective_images": (
            build_closed_cases_missing_corrective_images(cases, pdm_lookup)
        ),
        "neta_completed_but_missing_test_report": (
            build_neta_completed_but_missing_test_report(pdms)
        ),
        "neta_test_report_present_but_not_complete": (
            build_neta_test_report_present_but_not_complete(pdms)
        ),
        "open_issue_count_mismatches": build_open_issue_count_mismatches(pdms),
        "duplicate_equipment_ids": build_duplicate_equipment_ids(equipment_records),
        "blank_required_fields": build_blank_required_fields(
            equipment_records,
            module_links,
            cases,
            pdms,
        ),
    }


def run_build(input_files: dict[str, str] | None = None) -> dict[str, Any]:
    selected_input_files = input_files or get_input_files()
    equipment_records = load_records_json(EQUIPMENT_PATH)
    module_links = load_records_json(MODULE_LINKS_PATH)
    cases = load_records_json(CASES_PATH)
    pdms = load_records_json(PDMS_PATH)

    report = build_data_quality_report(equipment_records, module_links, cases, pdms)
    write_json_payload(
        REPORT_OUTPUT_PATH,
        {
            "selected_input_files": selected_input_files_metadata(selected_input_files),
            **report,
        },
    )
    return report


def main() -> None:
    report = run_build()
    print(f"Wrote data quality report to {REPORT_OUTPUT_PATH}")
    print(f"Unmatched module equipment: {len(report['unmatched_module_equipment'])}")
    print(f"Unmatched cases: {len(report['unmatched_cases'])}")
    print(f"Cases missing issue image: {len(report['cases_missing_issue_image'])}")
    print(
        "Closed cases missing corrective images: "
        f"{len(report['closed_cases_missing_corrective_images'])}"
    )
    print(
        "NETA completed but missing test report: "
        f"{len(report['neta_completed_but_missing_test_report'])}"
    )


if __name__ == "__main__":
    main()
