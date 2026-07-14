"""Build dashboard summary metrics from normalized PDM-centric data."""

from __future__ import annotations

from collections import Counter
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

PDMS_PATH = DATA_DIR / "pdms.json"
EQUIPMENT_PATH = DATA_DIR / "equipment.json"
CASES_PATH = DATA_DIR / "cases.json"
MODULE_LINKS_PATH = DATA_DIR / "module_equipment_links.json"
SUMMARY_OUTPUT_PATH = DATA_DIR / "summary.json"

OPEN_EXCLUDED_STATUSES = {
    "closed",
    "complete",
    "completed",
    "cancelled",
    "canceled",
    "void",
    "resolved",
}
TOP_LIMIT = 10


def is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def group_label(value: Any) -> str:
    if is_blank(value):
        return "Unknown"
    return str(value).strip()


def sorted_counter(counter: Counter[str]) -> dict[str, int]:
    return dict(sorted(counter.items(), key=lambda item: (-item[1], item[0])))


def is_open_case(case: dict[str, Any]) -> bool:
    status = case.get("status")
    if not isinstance(status, str):
        return True
    return status.strip().casefold() not in OPEN_EXCLUDED_STATUSES


def is_urgent_case(case: dict[str, Any]) -> bool:
    priority = case.get("priority")
    return isinstance(priority, str) and "urgent" in priority.casefold()


def is_high_priority_case(case: dict[str, Any]) -> bool:
    priority = case.get("priority")
    return isinstance(priority, str) and "high" in priority.casefold()


def is_missing_issue_image(case: dict[str, Any]) -> bool:
    return is_blank(case.get("issue_image"))


def is_neta_missing_report(equipment: dict[str, Any]) -> bool:
    return equipment.get("neta_complete") is True and is_blank(
        equipment.get("neta_test_report")
    )


def get_pdm_equipment(pdms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        equipment
        for pdm in pdms
        for equipment in pdm.get("equipment", [])
    ]


def get_pdm_cases(pdm: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        case
        for equipment in pdm.get("equipment", [])
        for case in equipment.get("cases", [])
    ]


def count_pdm_open_cases(pdm: dict[str, Any]) -> int:
    return sum(1 for case in get_pdm_cases(pdm) if is_open_case(case))


def count_pdm_missing_neta_reports(pdm: dict[str, Any]) -> int:
    return sum(
        1
        for equipment in pdm.get("equipment", [])
        if is_neta_missing_report(equipment)
    )


def count_pdm_unmatched_equipment(pdm: dict[str, Any]) -> int:
    return sum(
        1
        for equipment in pdm.get("equipment", [])
        if equipment.get("match_status") != "matched"
    )


def make_top_pdm_summary(
    pdms: list[dict[str, Any]],
    metric_name: str,
    count_function: Any,
) -> list[dict[str, Any]]:
    rows = [
        {
            "pdm_name": pdm.get("pdm_name"),
            "module_type": pdm.get("module_type"),
            metric_name: count_function(pdm),
        }
        for pdm in pdms
    ]
    rows = [row for row in rows if row[metric_name] > 0]
    return sorted(
        rows,
        key=lambda row: (-row[metric_name], group_label(row.get("pdm_name"))),
    )[:TOP_LIMIT]


def make_neta_report_status_by_pdm(pdms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for pdm in pdms:
        counter = Counter(
            group_label(equipment.get("neta_report_status"))
            for equipment in pdm.get("equipment", [])
        )
        rows.append(
            {
                "pdm_name": pdm.get("pdm_name"),
                "module_type": pdm.get("module_type"),
                "not_required_or_not_complete": counter.get(
                    "not_required_or_not_complete", 0
                ),
                "report_available": counter.get("report_available", 0),
                "missing_report": counter.get("missing_report", 0),
                "unknown": counter.get("Unknown", 0),
            }
        )

    return rows


def build_summary(
    pdms: list[dict[str, Any]],
    equipment_records: list[dict[str, Any]],
    cases: list[dict[str, Any]],
    module_links: list[dict[str, Any]],
) -> dict[str, Any]:
    # Read equipment.json as part of the declared input contract. Summary
    # groupings remain PDM-centric by using equipment attached to PDM records.
    _ = equipment_records
    pdm_equipment = get_pdm_equipment(pdms)
    matched_equipment_ids = {
        link.get("matched_equipment_id")
        for link in module_links
        if isinstance(link.get("matched_equipment_id"), str)
        and link.get("match_status") == "matched"
    }

    total_cases = len(cases)
    total_cases_missing_issue_image = sum(1 for case in cases if is_missing_issue_image(case))
    neta_complete_count = sum(
        1 for equipment in pdm_equipment if equipment.get("neta_complete") is True
    )
    neta_incomplete_count = sum(
        1 for equipment in pdm_equipment if equipment.get("neta_complete") is not True
    )
    neta_denominator = neta_complete_count + neta_incomplete_count

    return {
        "generated_at": datetime.now().astimezone().isoformat(),
        "total_pdms": len(pdms),
        "total_pdm_equipment_links": len(pdm_equipment),
        "total_unique_matched_equipment": len(matched_equipment_ids),
        "total_unmatched_module_equipment": sum(
            1 for link in module_links if link.get("match_status") != "matched"
        ),
        "total_cases": total_cases,
        "total_cases_with_issue_image": total_cases - total_cases_missing_issue_image,
        "total_cases_missing_issue_image": total_cases_missing_issue_image,
        "open_cases": sum(1 for case in cases if is_open_case(case)),
        "urgent_cases": sum(1 for case in cases if is_urgent_case(case)),
        "high_priority_cases": sum(1 for case in cases if is_high_priority_case(case)),
        "neta_complete_count": neta_complete_count,
        "neta_incomplete_count": neta_incomplete_count,
        "neta_missing_report_count": sum(
            1 for equipment in pdm_equipment if is_neta_missing_report(equipment)
        ),
        "neta_completion_rate": (
            round(neta_complete_count / neta_denominator, 4)
            if neta_denominator
            else 0
        ),
        "pdms_with_open_cases": sum(1 for pdm in pdms if count_pdm_open_cases(pdm) > 0),
        "pdms_with_missing_neta_reports": sum(
            1 for pdm in pdms if count_pdm_missing_neta_reports(pdm) > 0
        ),
        "cases_by_status": sorted_counter(
            Counter(group_label(case.get("status")) for case in cases)
        ),
        "cases_by_priority": sorted_counter(
            Counter(group_label(case.get("priority")) for case in cases)
        ),
        "pdms_by_module_type": sorted_counter(
            Counter(group_label(pdm.get("module_type")) for pdm in pdms)
        ),
        "top_pdms_by_open_cases": make_top_pdm_summary(
            pdms,
            "open_case_count",
            count_pdm_open_cases,
        ),
        "top_pdms_by_missing_neta_reports": make_top_pdm_summary(
            pdms,
            "missing_neta_report_count",
            count_pdm_missing_neta_reports,
        ),
        "top_pdms_by_unmatched_equipment": make_top_pdm_summary(
            pdms,
            "unmatched_equipment_count",
            count_pdm_unmatched_equipment,
        ),
        "equipment_by_type": sorted_counter(
            Counter(group_label(equipment.get("equipment_type")) for equipment in pdm_equipment)
        ),
        "equipment_by_parent": sorted_counter(
            Counter(group_label(equipment.get("parent")) for equipment in pdm_equipment)
        ),
        "neta_report_status_by_pdm": make_neta_report_status_by_pdm(pdms),
    }


def run_build(input_files: dict[str, str] | None = None) -> dict[str, Any]:
    selected_input_files = input_files or get_input_files()
    pdms = load_records_json(PDMS_PATH)
    equipment_records = load_records_json(EQUIPMENT_PATH)
    cases = load_records_json(CASES_PATH)
    module_links = load_records_json(MODULE_LINKS_PATH)

    summary = build_summary(pdms, equipment_records, cases, module_links)
    write_json_payload(
        SUMMARY_OUTPUT_PATH,
        {
            "selected_input_files": selected_input_files_metadata(selected_input_files),
            **summary,
        },
    )
    return summary


def main() -> None:
    summary = run_build()
    print(f"Wrote summary to {SUMMARY_OUTPUT_PATH}")
    print(f"Total PDMs: {summary['total_pdms']}")
    print(f"Open cases: {summary['open_cases']}")
    print(f"Unmatched module equipment: {summary['total_unmatched_module_equipment']}")


if __name__ == "__main__":
    main()
