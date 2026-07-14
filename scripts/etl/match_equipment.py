"""Match raw module and case equipment references to SystemElements equipment."""

from __future__ import annotations

import re
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
MODULE_LINKS_RAW_PATH = DATA_DIR / "module_equipment_links_raw.json"
CASES_RAW_PATH = DATA_DIR / "cases_raw.json"

MODULE_LINKS_OUTPUT_PATH = DATA_DIR / "module_equipment_links.json"
CASES_OUTPUT_PATH = DATA_DIR / "cases.json"
UNMATCHED_MODULE_OUTPUT_PATH = DATA_DIR / "unmatched_module_equipment.json"
UNMATCHED_CASES_OUTPUT_PATH = DATA_DIR / "unmatched_cases.json"


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


def text_normalize(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = re.sub(r"\s+", " ", value.strip().upper())
    if normalized == "":
        return None
    return normalized


def terminal_suffix_normalize(value: str | None) -> str | None:
    """Treat trailing 0x-R and 0xR equipment ID suffixes as equivalent."""

    normalized = text_normalize(value)
    if normalized is None:
        return None

    return re.sub(r"-(0\d)-([A-Z])$", r"-\1\2", normalized)


def add_unique(values: list[str], value: str) -> None:
    if value not in values:
        values.append(value)


def build_equipment_indexes(
    equipment_records: list[dict[str, Any]],
) -> tuple[dict[str, list[str]], dict[str, list[str]], dict[str, list[str]]]:
    exact_index: dict[str, list[str]] = defaultdict(list)
    normalized_index: dict[str, list[str]] = defaultdict(list)
    terminal_suffix_index: dict[str, list[str]] = defaultdict(list)

    for equipment in equipment_records:
        equipment_id = equipment.get("equipment_id")
        if not isinstance(equipment_id, str) or equipment_id.strip() == "":
            continue

        exact_index[equipment_id].append(equipment_id)

        normalized_id = text_normalize(equipment_id)
        if normalized_id is not None:
            normalized_index[normalized_id].append(equipment_id)

        terminal_suffix_id = terminal_suffix_normalize(equipment_id)
        if terminal_suffix_id is not None:
            terminal_suffix_index[terminal_suffix_id].append(equipment_id)

    return dict(exact_index), dict(normalized_index), dict(terminal_suffix_index)


def match_from_exact_index(
    value: str | None,
    exact_index: dict[str, list[str]],
) -> list[str]:
    if value is None:
        return []
    return exact_index.get(value, [])


def match_from_normalized_index(
    values: list[str | None],
    normalized_index: dict[str, list[str]],
) -> list[str]:
    matches: list[str] = []

    for value in values:
        normalized_value = text_normalize(value)
        if normalized_value is None:
            continue
        for equipment_id in normalized_index.get(normalized_value, []):
            add_unique(matches, equipment_id)

    return matches


def match_from_terminal_suffix_index(
    values: list[str | None],
    terminal_suffix_index: dict[str, list[str]],
) -> list[str]:
    matches: list[str] = []

    for value in values:
        normalized_value = terminal_suffix_normalize(value)
        if normalized_value is None:
            continue
        for equipment_id in terminal_suffix_index.get(normalized_value, []):
            add_unique(matches, equipment_id)

    return matches


def apply_match(record: dict[str, Any], matches: list[str]) -> dict[str, Any]:
    matched_record = dict(record)

    if len(matches) == 1:
        matched_record["matched_equipment_id"] = matches[0]
        matched_record["match_status"] = "matched"
    elif len(matches) > 1:
        matched_record["matched_equipment_id"] = None
        matched_record["match_status"] = "ambiguous"
    else:
        matched_record["matched_equipment_id"] = None
        matched_record["match_status"] = "unmatched"

    return matched_record


def match_module_link(
    link: dict[str, Any],
    exact_index: dict[str, list[str]],
    normalized_index: dict[str, list[str]],
    terminal_suffix_index: dict[str, list[str]],
) -> dict[str, Any]:
    source_equipment_label = link.get("source_equipment_label")
    normalized_equipment_id = link.get("normalized_equipment_id")

    exact_matches = match_from_exact_index(source_equipment_label, exact_index)
    if exact_matches:
        return apply_match(link, exact_matches)

    normalized_id_matches = match_from_exact_index(normalized_equipment_id, exact_index)
    if normalized_id_matches:
        return apply_match(link, normalized_id_matches)

    text_matches = match_from_normalized_index(
        [source_equipment_label, normalized_equipment_id],
        normalized_index,
    )
    if text_matches:
        return apply_match(link, text_matches)

    terminal_suffix_matches = match_from_terminal_suffix_index(
        [source_equipment_label, normalized_equipment_id],
        terminal_suffix_index,
    )
    return apply_match(link, terminal_suffix_matches)


def match_case(
    case: dict[str, Any],
    exact_index: dict[str, list[str]],
    normalized_index: dict[str, list[str]],
    terminal_suffix_index: dict[str, list[str]],
) -> dict[str, Any]:
    matched_case = dict(case)
    equipment_id = case.get("equipment_id")

    exact_matches = match_from_exact_index(equipment_id, exact_index)
    if not exact_matches:
        exact_matches = match_from_normalized_index([equipment_id], normalized_index)
    if not exact_matches:
        exact_matches = match_from_terminal_suffix_index([equipment_id], terminal_suffix_index)

    if len(exact_matches) >= 1:
        matched_case["match_status"] = "matched"
    else:
        matched_case["match_status"] = "unmatched"

    return matched_case


def match_module_links(
    links: list[dict[str, Any]],
    exact_index: dict[str, list[str]],
    normalized_index: dict[str, list[str]],
    terminal_suffix_index: dict[str, list[str]],
) -> list[dict[str, Any]]:
    return [
        match_module_link(link, exact_index, normalized_index, terminal_suffix_index)
        for link in links
    ]


def match_cases(
    cases: list[dict[str, Any]],
    exact_index: dict[str, list[str]],
    normalized_index: dict[str, list[str]],
    terminal_suffix_index: dict[str, list[str]],
) -> list[dict[str, Any]]:
    return [
        match_case(case, exact_index, normalized_index, terminal_suffix_index)
        for case in cases
    ]


def run_matching(
    input_files: dict[str, str] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    selected_input_files = input_files or get_input_files()
    equipment_records = load_records_json(EQUIPMENT_PATH)
    module_links_raw = load_records_json(MODULE_LINKS_RAW_PATH)
    cases_raw = load_records_json(CASES_RAW_PATH)

    exact_index, normalized_index, terminal_suffix_index = build_equipment_indexes(
        equipment_records
    )

    module_links = match_module_links(
        module_links_raw,
        exact_index,
        normalized_index,
        terminal_suffix_index,
    )
    cases = match_cases(cases_raw, exact_index, normalized_index, terminal_suffix_index)

    unmatched_module_links = [
        link for link in module_links if link.get("match_status") != "matched"
    ]
    unmatched_cases = [
        case for case in cases if case.get("match_status") != "matched"
    ]

    write_records_json(module_links, MODULE_LINKS_OUTPUT_PATH, selected_input_files)
    write_records_json(cases, CASES_OUTPUT_PATH, selected_input_files)
    write_records_json(
        unmatched_module_links,
        UNMATCHED_MODULE_OUTPUT_PATH,
        selected_input_files,
    )
    write_records_json(unmatched_cases, UNMATCHED_CASES_OUTPUT_PATH, selected_input_files)

    return module_links, cases


def main() -> None:
    module_links, cases = run_matching()
    unmatched_module_count = sum(
        1 for link in module_links if link.get("match_status") != "matched"
    )
    unmatched_case_count = sum(
        1 for case in cases if case.get("match_status") != "matched"
    )

    print(f"Wrote {len(module_links)} module equipment links to {MODULE_LINKS_OUTPUT_PATH}")
    print(f"Wrote {len(cases)} case records to {CASES_OUTPUT_PATH}")
    print(
        f"Wrote {unmatched_module_count} unmatched or ambiguous module links to "
        f"{UNMATCHED_MODULE_OUTPUT_PATH}"
    )
    print(f"Wrote {unmatched_case_count} unmatched cases to {UNMATCHED_CASES_OUTPUT_PATH}")


if __name__ == "__main__":
    main()
