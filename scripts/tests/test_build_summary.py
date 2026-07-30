from __future__ import annotations

from scripts.etl.build_summary import build_summary


def test_build_summary_is_pdm_centric_and_uses_closed_case_rules() -> None:
    pdms = [
        {
            "pdm_name": "PDM-1",
            "module_type": "MDB",
            "equipment": [
                {
                    "equipment_id": "EQ-1",
                    "equipment_type": "PDU",
                    "parent": "PDM-1",
                    "match_status": "matched",
                    "neta_complete": True,
                    "neta_test_report": None,
                    "neta_report_status": "missing_report",
                    "calculated_open_case_count": 1,
                    "cases": [
                        {
                            "case_id": "CASE-1",
                            "status": "Acknowledged",
                            "priority": "Urgent (24h)",
                            "issue_image": None,
                        },
                        {
                            "case_id": "CASE-2",
                            "status": "Resolved",
                            "priority": "High",
                            "issue_image": "fixed.jpg",
                        },
                    ],
                }
            ],
        }
    ]
    cases = [
        {
            "case_id": "CASE-1",
            "status": "Acknowledged",
            "priority": "Urgent (24h)",
            "issue_image": None,
        },
        {
            "case_id": "CASE-2",
            "status": "Resolved",
            "priority": "High",
            "issue_image": "fixed.jpg",
        },
    ]
    links = [
        {
            "match_status": "matched",
            "matched_equipment_id": "EQ-1",
        },
        {
            "match_status": "unmatched",
            "matched_equipment_id": None,
        },
    ]

    summary = build_summary(pdms, [], cases, links)

    assert summary["total_pdms"] == 1
    assert summary["total_pdm_equipment_links"] == 1
    assert summary["total_unique_matched_equipment"] == 1
    assert summary["total_unmatched_module_equipment"] == 1
    assert summary["open_cases"] == 1
    assert summary["urgent_cases"] == 1
    assert summary["high_priority_cases"] == 1
    assert summary["total_cases_missing_issue_image"] == 1
    assert summary["neta_complete_count"] == 1
    assert summary["neta_missing_report_count"] == 1
    assert summary["pdms_with_open_cases"] == 1
    assert summary["cases_by_status"] == {"Acknowledged": 1, "Resolved": 1}
