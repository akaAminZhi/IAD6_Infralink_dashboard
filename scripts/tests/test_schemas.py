from __future__ import annotations

from scripts.etl.schemas import (
    CaseIssue,
    DataQualityReport,
    Equipment,
    PdmEquipmentRecord,
    PdmRecord,
)


def test_schema_records_serialize_nested_pdm_data() -> None:
    case = CaseIssue(case_id="CASE-1", issue_image="issue.jpg")
    equipment = PdmEquipmentRecord(
        equipment_id="EQ-1",
        match_status="matched",
        cases=[case],
    )
    pdm = PdmRecord(pdm_name="PDM-1", equipment=[equipment], equipment_count=1)

    payload = pdm.to_dict()

    assert payload["pdm_name"] == "PDM-1"
    assert payload["equipment"][0]["equipment_id"] == "EQ-1"
    assert payload["equipment"][0]["cases"][0]["issue_image"] == "issue.jpg"


def test_data_quality_lists_are_not_shared_between_instances() -> None:
    first = DataQualityReport()
    second = DataQualityReport()
    first.cases_missing_issue_image.append(CaseIssue(case_id="CASE-1"))

    assert second.cases_missing_issue_image == []
    assert Equipment(equipment_id="EQ-1").to_dict()["equipment_id"] == "EQ-1"
