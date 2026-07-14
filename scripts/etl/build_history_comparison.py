"""Build seven-day comparison metrics from historical raw Excel exports."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

try:
    from .file_discovery import CASES_DIR, SYSTEM_ELEMENTS_DIR, get_input_files
    from .json_utils import file_metadata, selected_input_files_metadata, write_json
    from .normalize_cases import normalize_cases
    from .normalize_equipment import normalize_equipment
except ImportError:
    from file_discovery import CASES_DIR, SYSTEM_ELEMENTS_DIR, get_input_files
    from json_utils import file_metadata, selected_input_files_metadata, write_json
    from normalize_cases import normalize_cases
    from normalize_equipment import normalize_equipment


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
OUTPUT_PATH = DATA_DIR / "history_comparison.json"
LOOKBACK_DAYS = 7

EXPORT_DATE_PATTERN = re.compile(r"_(\d{2})-(\d{2})-(\d{4})_")
CLOSED_CASE_STATUSES = {
    "closed",
    "complete",
    "completed",
    "cancelled",
    "canceled",
    "void",
    "resolved",
}


def parse_export_date(path: str | Path) -> date:
    source_path = Path(path)
    match = EXPORT_DATE_PATTERN.search(source_path.name)
    if match is not None:
        month, day, year = (int(part) for part in match.groups())
        return date(year, month, day)

    return datetime.fromtimestamp(source_path.stat().st_mtime).date()


def find_baseline_excel_file(
    folder: Path,
    pattern: str,
    current_path: str | Path,
    lookback_days: int = LOOKBACK_DAYS,
) -> str | None:
    current = Path(current_path).resolve()
    current_date = parse_export_date(current)
    target_date = current_date - timedelta(days=lookback_days)

    candidates: list[tuple[date, float, str, Path]] = []
    for path in folder.glob(pattern):
        if (
            not path.is_file()
            or path.suffix.casefold() != ".xlsx"
            or path.name.startswith("~$")
            or path.resolve() == current
        ):
            continue

        export_date = parse_export_date(path)
        if export_date <= target_date:
            candidates.append((export_date, path.stat().st_mtime, path.name, path))

    if not candidates:
        return None

    return str(max(candidates)[3].resolve())


def normalize_lookup(value: Any) -> str:
    return " ".join(str(value or "").strip().upper().split())


def is_neta_complete(record: dict[str, Any]) -> bool:
    return record.get("neta_complete") is True


def is_closed_case(record: dict[str, Any] | None) -> bool:
    if not record:
        return False
    status = record.get("status")
    if not isinstance(status, str):
        return False
    return status.strip().casefold() in CLOSED_CASE_STATUSES


def first_by_key(records: list[dict[str, Any]], key: str) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for record in records:
        normalized_key = normalize_lookup(record.get(key))
        if normalized_key and normalized_key not in indexed:
            indexed[normalized_key] = record
    return indexed


def compare_neta_complete(
    current_path: str,
    baseline_path: str | None,
) -> dict[str, Any]:
    current_records = normalize_equipment(current_path)
    current_by_id = first_by_key(current_records, "equipment_id")
    current_complete_ids = {
        normalize_lookup(record.get("equipment_id"))
        for record in current_records
        if is_neta_complete(record) and normalize_lookup(record.get("equipment_id"))
    }

    baseline_records = normalize_equipment(baseline_path) if baseline_path else []
    baseline_complete_ids = {
        normalize_lookup(record.get("equipment_id"))
        for record in baseline_records
        if is_neta_complete(record) and normalize_lookup(record.get("equipment_id"))
    }

    new_ids = sorted(current_complete_ids - baseline_complete_ids)
    new_records = [
        {
            "equipment_id": current_by_id[equipment_key].get("equipment_id"),
            "equipment_type": current_by_id[equipment_key].get("equipment_type"),
            "status": current_by_id[equipment_key].get("status"),
            "parent": current_by_id[equipment_key].get("parent"),
            "neta_completed_at": current_by_id[equipment_key].get("neta_completed_at"),
            "neta_test_report": current_by_id[equipment_key].get("neta_test_report"),
        }
        for equipment_key in new_ids
        if equipment_key in current_by_id
    ]

    return {
        "available": baseline_path is not None,
        "current_date": parse_export_date(current_path).isoformat(),
        "baseline_date": parse_export_date(baseline_path).isoformat() if baseline_path else None,
        "target_days": LOOKBACK_DAYS,
        "current_count": len(current_complete_ids),
        "baseline_count": len(baseline_complete_ids),
        "new_count": len(new_ids),
        "new_equipment_ids": [
            current_by_id[equipment_key].get("equipment_id", equipment_key)
            for equipment_key in new_ids
            if equipment_key in current_by_id
        ],
        "new_equipment_records": new_records,
    }


def compare_cases(current_path: str, baseline_path: str | None) -> dict[str, Any]:
    current_records = normalize_cases(current_path)
    current_by_case_id = first_by_key(current_records, "case_id")
    current_case_ids = set(current_by_case_id)

    baseline_records = normalize_cases(baseline_path) if baseline_path else []
    baseline_by_case_id = first_by_key(baseline_records, "case_id")
    baseline_case_ids = set(baseline_by_case_id)

    new_case_keys = sorted(current_case_ids - baseline_case_ids)
    resolved_case_keys = sorted(
        case_key
        for case_key, current_case in current_by_case_id.items()
        if is_closed_case(current_case) and not is_closed_case(baseline_by_case_id.get(case_key))
    )
    new_cases = [
        {
            "case_id": current_by_case_id[case_key].get("case_id"),
            "status": current_by_case_id[case_key].get("status"),
            "priority": current_by_case_id[case_key].get("priority"),
            "summary": current_by_case_id[case_key].get("summary"),
            "equipment_id": current_by_case_id[case_key].get("equipment_id"),
            "issue_image": current_by_case_id[case_key].get("issue_image"),
            "created_at": current_by_case_id[case_key].get("created_at"),
        }
        for case_key in new_case_keys
    ]
    resolved_cases = [
        {
            "case_id": current_by_case_id[case_key].get("case_id"),
            "status": current_by_case_id[case_key].get("status"),
            "priority": current_by_case_id[case_key].get("priority"),
            "summary": current_by_case_id[case_key].get("summary"),
            "equipment_id": current_by_case_id[case_key].get("equipment_id"),
            "issue_image": current_by_case_id[case_key].get("issue_image"),
            "corrective_images": current_by_case_id[case_key].get("corrective_images"),
            "created_at": current_by_case_id[case_key].get("created_at"),
            "last_updated_at": current_by_case_id[case_key].get("last_updated_at"),
        }
        for case_key in resolved_case_keys
    ]

    return {
        "available": baseline_path is not None,
        "current_date": parse_export_date(current_path).isoformat(),
        "baseline_date": parse_export_date(baseline_path).isoformat() if baseline_path else None,
        "target_days": LOOKBACK_DAYS,
        "current_count": len(current_case_ids),
        "baseline_count": len(baseline_case_ids),
        "new_count": len(new_case_keys),
        "new_case_ids": [
            current_by_case_id[case_key].get("case_id", case_key)
            for case_key in new_case_keys
        ],
        "new_cases": new_cases,
        "resolved_count": len(resolved_case_keys),
        "resolved_case_ids": [
            current_by_case_id[case_key].get("case_id", case_key)
            for case_key in resolved_case_keys
        ],
        "resolved_cases": resolved_cases,
    }


def build_history_comparison(input_files: dict[str, str] | None = None) -> dict[str, Any]:
    selected_input_files = input_files or get_input_files()
    system_baseline_path = find_baseline_excel_file(
        SYSTEM_ELEMENTS_DIR,
        "SystemElements_*.xlsx",
        selected_input_files["system_elements"],
    )
    cases_baseline_path = find_baseline_excel_file(
        CASES_DIR,
        "Cases_*.xlsx",
        selected_input_files["cases"],
    )
    previous_system_baseline_path = (
        find_baseline_excel_file(
            SYSTEM_ELEMENTS_DIR,
            "SystemElements_*.xlsx",
            system_baseline_path,
        )
        if system_baseline_path
        else None
    )
    previous_cases_baseline_path = (
        find_baseline_excel_file(CASES_DIR, "Cases_*.xlsx", cases_baseline_path)
        if cases_baseline_path
        else None
    )

    baseline_input_files = {
        "system_elements": file_metadata(system_baseline_path) if system_baseline_path else None,
        "cases": file_metadata(cases_baseline_path) if cases_baseline_path else None,
    }
    previous_baseline_input_files = {
        "system_elements": file_metadata(previous_system_baseline_path)
        if previous_system_baseline_path
        else None,
        "cases": file_metadata(previous_cases_baseline_path)
        if previous_cases_baseline_path
        else None,
    }
    neta_complete = compare_neta_complete(
        selected_input_files["system_elements"],
        system_baseline_path,
    )
    cases = compare_cases(selected_input_files["cases"], cases_baseline_path)
    previous_neta_complete = (
        compare_neta_complete(system_baseline_path, previous_system_baseline_path)
        if system_baseline_path
        else None
    )
    previous_cases = (
        compare_cases(cases_baseline_path, previous_cases_baseline_path)
        if cases_baseline_path
        else None
    )

    if previous_neta_complete is not None:
        neta_complete["previous_period"] = {
            "available": previous_neta_complete.get("available", False),
            "current_date": previous_neta_complete.get("current_date"),
            "baseline_date": previous_neta_complete.get("baseline_date"),
            "new_count": previous_neta_complete.get("new_count", 0),
        }
    if previous_cases is not None:
        cases["previous_period"] = {
            "available": previous_cases.get("available", False),
            "current_date": previous_cases.get("current_date"),
            "baseline_date": previous_cases.get("baseline_date"),
            "new_count": previous_cases.get("new_count", 0),
            "resolved_count": previous_cases.get("resolved_count", 0),
        }

    return {
        "generated_at": datetime.now().astimezone().isoformat(),
        "lookback_days": LOOKBACK_DAYS,
        "selected_input_files": selected_input_files_metadata(selected_input_files),
        "baseline_input_files": baseline_input_files,
        "previous_baseline_input_files": previous_baseline_input_files,
        "neta_complete": neta_complete,
        "cases": cases,
    }


def run_build(input_files: dict[str, str]) -> dict[str, Any]:
    comparison = build_history_comparison(input_files)
    write_json(OUTPUT_PATH, comparison)
    return comparison


def main() -> None:
    comparison = run_build(get_input_files())
    print(f"Wrote history comparison to {OUTPUT_PATH}")
    print(
        "NETA complete added since baseline: "
        f"{comparison['neta_complete']['new_count']}"
    )
    previous_neta = comparison["neta_complete"].get("previous_period", {})
    if previous_neta:
        print(
            "Previous-period NETA complete added: "
            f"{previous_neta.get('new_count', 0)}"
        )
    print(f"Cases added since baseline: {comparison['cases']['new_count']}")
    print(f"Cases resolved since baseline: {comparison['cases']['resolved_count']}")
    previous_cases = comparison["cases"].get("previous_period", {})
    if previous_cases:
        print(f"Previous-period cases added: {previous_cases.get('new_count', 0)}")
        print(
            "Previous-period cases resolved: "
            f"{previous_cases.get('resolved_count', 0)}"
        )


if __name__ == "__main__":
    main()
