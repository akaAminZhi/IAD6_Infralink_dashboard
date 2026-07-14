from __future__ import annotations

from scripts.etl.build_data_quality_report import build_data_quality_report


def test_neta_validation_flags_missing_and_inconsistent_reports() -> None:
    pdms = [
        {
            "pdm_name": "PDM-1",
            "equipment": [
                {
                    "equipment_id": "EQ-1",
                    "neta_complete": True,
                    "neta_completed_at": "2026-06-01T10:00:00",
                    "neta_test_report": None,
                    "open_issues_count_from_system_elements": 0,
                    "calculated_open_case_count": 0,
                    "cases": [],
                },
                {
                    "equipment_id": "EQ-2",
                    "neta_complete": None,
                    "neta_completed_at": None,
                    "neta_test_report": "report.pdf",
                    "open_issues_count_from_system_elements": 0,
                    "calculated_open_case_count": 0,
                    "cases": [],
                },
                {
                    "equipment_id": "EQ-3",
                    "neta_complete": None,
                    "neta_completed_at": "2026-06-01T10:00:00",
                    "neta_test_report": None,
                    "open_issues_count_from_system_elements": 0,
                    "calculated_open_case_count": 0,
                    "cases": [],
                },
            ],
        }
    ]

    report = build_data_quality_report([], [], [], pdms)

    assert [row["equipment_id"] for row in report["neta_completed_but_missing_test_report"]] == [
        "EQ-1",
        "EQ-3",
    ]
    assert report["neta_test_report_present_but_not_complete"][0]["equipment_id"] == "EQ-2"
