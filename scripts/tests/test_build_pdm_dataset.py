from __future__ import annotations

from scripts.etl.build_pdm_dataset import build_pdm_dataset


def test_pdm_dataset_groups_by_pdm_keeps_unmatched_and_case_issue_image() -> None:
    equipment = [
        {
            "equipment_id": "IAD06-EQ-1",
            "equipment_type": "PDU",
            "status": "IFC",
            "parent": "PDM-1",
            "system": "IAD06",
            "open_issues_count_from_system_elements": 1,
            "neta_complete": True,
            "neta_completed_at": "2026-06-01T10:00:00",
            "neta_test_report": "report.pdf",
            "manufacturer": "Maker",
            "model": "Model",
            "serial_number": "Serial",
        }
    ]
    module_links = [
        {
            "pdm_name": "PDM-1",
            "module_type": "Type A",
            "length": None,
            "width": None,
            "height": None,
            "weight": None,
            "source_equipment_label": "EQ-1",
            "normalized_equipment_id": "IAD06-EQ-1",
            "matched_equipment_id": "IAD06-EQ-1",
            "match_status": "matched",
        },
        {
            "pdm_name": "PDM-1",
            "module_type": "Type A",
            "length": None,
            "width": None,
            "height": None,
            "weight": None,
            "source_equipment_label": "MISSING",
            "normalized_equipment_id": "IAD06-MISSING",
            "matched_equipment_id": None,
            "match_status": "unmatched",
        },
    ]
    cases = [
        {
            "case_id": "CASE-1",
            "status": "Open",
            "priority": "High (3d)",
            "summary": "Issue",
            "equipment_id": "IAD06-EQ-1",
            "issue_image": "Issue Image-01.jpg",
            "corrective_images": "Corrective-01.pdf",
            "reported_on": None,
            "due_date": None,
            "assigned_to": None,
            "last_updated_at": None,
        }
    ]

    pdms = build_pdm_dataset(equipment, module_links, cases)

    assert len(pdms) == 1
    assert pdms[0]["pdm_name"] == "PDM-1"
    assert pdms[0]["equipment_count"] == 2
    assert pdms[0]["unmatched_equipment_count"] == 1
    assert pdms[0]["equipment"][0]["cases"][0]["issue_image"] == "Issue Image-01.jpg"
    assert pdms[0]["equipment"][0]["cases"][0]["corrective_images"] == "Corrective-01.pdf"


def test_pdm_dataset_uses_system_elements_parent_for_matched_equipment() -> None:
    equipment = [
        {
            "equipment_id": "IAD06-PDU6-01B-1",
            "parent": "IAD06-PDM-E6-110-02-PRIMARY-CDS",
            "neta_complete": None,
            "neta_test_report": None,
        }
    ]
    module_links = [
        {
            "pdm_name": "IAD06-PDM-E6-110-01-PRIMARY-CDS",
            "module_type": None,
            "length": None,
            "width": None,
            "height": None,
            "weight": None,
            "source_equipment_label": "PDU6-01B-1",
            "normalized_equipment_id": "IAD06-PDU6-01B-1",
            "matched_equipment_id": "IAD06-PDU6-01B-1",
            "match_status": "matched",
        }
    ]

    pdms = build_pdm_dataset(equipment, module_links, [])

    assert len(pdms) == 1
    assert pdms[0]["pdm_name"] == "IAD06-PDM-E6-110-02-PRIMARY-CDS"
    assert pdms[0]["equipment"][0]["equipment_id"] == "IAD06-PDU6-01B-1"
