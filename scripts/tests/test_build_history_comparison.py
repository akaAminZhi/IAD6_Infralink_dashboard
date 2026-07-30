from __future__ import annotations

from scripts.etl import build_history_comparison as history


def test_compare_neta_complete_reports_only_newly_completed_equipment(monkeypatch) -> None:
    current_path = "SystemElements_07-08-2026_05-00-AM.xlsx"
    baseline_path = "SystemElements_07-01-2026_05-00-AM.xlsx"
    records = {
        current_path: [
            {"equipment_id": "EQ-1", "neta_complete": True},
            {
                "equipment_id": "EQ-2",
                "neta_complete": True,
                "equipment_type": "PDU",
                "neta_test_report": "report.pdf",
            },
        ],
        baseline_path: [{"equipment_id": "eq-1", "neta_complete": True}],
    }
    monkeypatch.setattr(history, "normalize_equipment", lambda path: records[path])

    result = history.compare_neta_complete(current_path, baseline_path)

    assert result["available"] is True
    assert result["current_count"] == 2
    assert result["baseline_count"] == 1
    assert result["new_equipment_ids"] == ["EQ-2"]


def test_compare_cases_counts_new_and_newly_resolved_cases(monkeypatch) -> None:
    current_path = "Cases_07-08-2026_05-00-AM.xlsx"
    baseline_path = "Cases_07-01-2026_05-00-AM.xlsx"
    records = {
        current_path: [
            {"case_id": "CASE-1", "status": "Resolved"},
            {"case_id": "CASE-2", "status": "Open"},
        ],
        baseline_path: [{"case_id": "CASE-1", "status": "Open"}],
    }
    monkeypatch.setattr(history, "normalize_cases", lambda path: records[path])

    result = history.compare_cases(current_path, baseline_path)

    assert result["new_case_ids"] == ["CASE-2"]
    assert result["resolved_case_ids"] == ["CASE-1"]
    assert result["new_count"] == 1
    assert result["resolved_count"] == 1
