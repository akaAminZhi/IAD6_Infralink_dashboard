from __future__ import annotations

from scripts.etl.pdm_assignment import choose_effective_pdm_name, get_pdm_scope


def test_get_pdm_scope_handles_electrical_and_idf_names() -> None:
    assert get_pdm_scope("IAD06-PDM-E6-110-01-PRIMARY-CDS") == "E6-110"
    assert get_pdm_scope("IAD06-PDM-IDF6-201-A") == "IDF6-201"


def test_same_scope_prefers_system_elements_parent() -> None:
    assert choose_effective_pdm_name(
        "IAD06-PDM-E6-110-01-PRIMARY-CDS",
        "IAD06-PDM-E6-110-02-PRIMARY-CDS",
    ) == "IAD06-PDM-E6-110-02-PRIMARY-CDS"


def test_cross_scope_conflict_keeps_module_list_pdm() -> None:
    assert choose_effective_pdm_name(
        "IAD06-PDM-IDF6-201-A",
        "IAD06-PDM-E6-110-EAST GALLERY-A",
    ) == "IAD06-PDM-IDF6-201-A"
