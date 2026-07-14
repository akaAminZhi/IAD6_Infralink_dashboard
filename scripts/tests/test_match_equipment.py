from __future__ import annotations

from scripts.etl.match_equipment import build_equipment_indexes, match_module_link


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
