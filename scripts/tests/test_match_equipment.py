from __future__ import annotations

from pathlib import Path

from scripts.etl import match_equipment
from scripts.etl.match_equipment import (
    apply_match,
    build_equipment_indexes,
    match_case,
    match_module_link,
    text_normalize,
)


def test_module_link_matches_terminal_zero_digit_r_suffix_variant() -> None:
    equipment = [
        {
            "equipment_id": "IAD06-TX-INV6-01R",
        }
    ]
    link = {
        "source_equipment_label": "TX-INV6-01-R",
        "normalized_equipment_id": "IAD06-TX-INV6-01-R",
        "matched_equipment_id": None,
        "match_status": "pending_match",
    }

    exact_index, normalized_index, terminal_suffix_index = build_equipment_indexes(equipment)

    matched_link = match_module_link(
        link,
        exact_index,
        normalized_index,
        terminal_suffix_index,
    )

    assert matched_link["match_status"] == "matched"
    assert matched_link["matched_equipment_id"] == "IAD06-TX-INV6-01R"


def test_exact_match_wins_when_both_terminal_suffix_variants_exist() -> None:
    equipment = [
        {
            "equipment_id": "IAD06-TX-INV6-01R",
        },
        {
            "equipment_id": "IAD06-TX-INV6-01-R",
        },
    ]
    link = {
        "source_equipment_label": "TX-INV6-01",
        "normalized_equipment_id": "IAD06-TX-INV6-01-R",
        "matched_equipment_id": None,
        "match_status": "pending_match",
    }

    exact_index, normalized_index, terminal_suffix_index = build_equipment_indexes(equipment)

    matched_link = match_module_link(
        link,
        exact_index,
        normalized_index,
        terminal_suffix_index,
    )

    assert matched_link["match_status"] == "matched"
    assert matched_link["matched_equipment_id"] == "IAD06-TX-INV6-01-R"


def test_text_normalized_ambiguous_and_unmatched_results() -> None:
    equipment = [
        {"equipment_id": "IAD06-EQ-1"},
        {"equipment_id": "iad06-eq-1"},
    ]
    exact_index, normalized_index, terminal_suffix_index = build_equipment_indexes(
        equipment
    )

    assert text_normalize("  iad06-eq-1  ") == "IAD06-EQ-1"
    assert text_normalize(" ") is None
    ambiguous = match_module_link(
        {
            "source_equipment_label": " iad06-eq-1 ",
            "normalized_equipment_id": None,
        },
        exact_index,
        normalized_index,
        terminal_suffix_index,
    )
    assert ambiguous["match_status"] == "ambiguous"
    assert ambiguous["matched_equipment_id"] is None
    assert apply_match({"value": 1}, [])["match_status"] == "unmatched"


def test_case_matching_supports_normalized_suffix_and_unmatched() -> None:
    equipment = [{"equipment_id": "IAD06-TX-INV6-01R"}]
    indexes = build_equipment_indexes(equipment)

    normalized = match_case({"equipment_id": " iad06-tx-inv6-01r "}, *indexes)
    suffix = match_case({"equipment_id": "IAD06-TX-INV6-01-R"}, *indexes)
    unmatched = match_case({"equipment_id": "IAD06-MISSING"}, *indexes)

    assert normalized["match_status"] == "matched"
    assert suffix["match_status"] == "matched"
    assert unmatched["match_status"] == "unmatched"


def test_run_matching_writes_all_debug_outputs(monkeypatch, tmp_path: Path) -> None:
    records_by_path = {
        "equipment": [
            {"equipment_id": "IAD06-EQ-1"},
            {"equipment_id": "IAD06-EQ-2"},
        ],
        "links": [
            {
                "source_equipment_label": "EQ-1",
                "normalized_equipment_id": "IAD06-EQ-1",
            },
            {
                "source_equipment_label": "MISSING",
                "normalized_equipment_id": "IAD06-MISSING",
            },
        ],
        "cases": [
            {"case_id": "CASE-1", "equipment_id": "IAD06-EQ-2"},
            {"case_id": "CASE-2", "equipment_id": "IAD06-MISSING"},
        ],
    }
    equipment_path = tmp_path / "equipment.json"
    links_path = tmp_path / "links.json"
    cases_path = tmp_path / "cases.json"
    monkeypatch.setattr(match_equipment, "EQUIPMENT_PATH", equipment_path)
    monkeypatch.setattr(match_equipment, "MODULE_LINKS_RAW_PATH", links_path)
    monkeypatch.setattr(match_equipment, "CASES_RAW_PATH", cases_path)

    def fake_load(path: Path):
        if path == equipment_path:
            return records_by_path["equipment"]
        if path == links_path:
            return records_by_path["links"]
        return records_by_path["cases"]

    written: dict[str, list[dict]] = {}

    def fake_write(records, path, _input_files):
        written[path.name] = records

    monkeypatch.setattr(match_equipment, "load_records_json", fake_load)
    monkeypatch.setattr(match_equipment, "write_records_json", fake_write)

    links, cases = match_equipment.run_matching(
        {
            "system_elements": "system.xlsx",
            "module_list": "modules.xlsx",
            "cases": "cases.xlsx",
        }
    )

    assert [link["match_status"] for link in links] == ["matched", "unmatched"]
    assert [case["match_status"] for case in cases] == ["matched", "unmatched"]
    assert len(written["unmatched_module_equipment.json"]) == 1
    assert len(written["unmatched_cases.json"]) == 1
