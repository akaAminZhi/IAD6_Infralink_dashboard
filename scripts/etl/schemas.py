"""Normalized dashboard schemas.

The dashboard model is PDM-centric: PDM records own the equipment list,
equipment owns related case issues, and validation records capture data
quality checks that should be surfaced before building user-facing views.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from typing import Any, Literal


DateValue = date | datetime
MatchStatus = Literal[
    "pending_match",
    "matched",
    "unmatched",
    "ambiguous",
    "missing_source_value",
]
NetaReportStatus = Literal["present", "missing", "not_required", "unknown"]
ValidationStatus = Literal["valid", "warning", "error"]


@dataclass(slots=True)
class SchemaRecord:
    """Base helper for serializing dataclass schema records."""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class Equipment(SchemaRecord):
    equipment_id: str | None = None
    equipment_type: str | None = None
    status: str | None = None
    parent: str | None = None
    system: str | None = None
    open_issues_count_from_system_elements: int | None = None
    neta_complete: bool | str | None = None
    neta_completed_at: DateValue | None = None
    neta_test_report: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    updated_at: DateValue | None = None
    updated_by: str | None = None


@dataclass(slots=True)
class ModuleEquipmentLink(SchemaRecord):
    pdm_name: str | None = None
    module_type: str | None = None
    length: float | str | None = None
    width: float | str | None = None
    height: float | str | None = None
    weight: float | str | None = None
    source_equipment_column: str | None = None
    source_equipment_label: str | None = None
    normalized_equipment_id: str | None = None
    matched_equipment_id: str | None = None
    match_status: MatchStatus = "unmatched"


@dataclass(slots=True)
class CaseIssue(SchemaRecord):
    """Issue schema.

    The raw Issue Image field must be preserved in issue_image. During quality
    checks, any issue with a blank issue_image belongs in
    DataQualityReport.cases_missing_issue_image.
    """

    case_id: str | None = None
    category: str | None = None
    status: str | None = None
    priority: str | None = None
    summary: str | None = None
    system_element_raw: str | None = None
    equipment_id: str | None = None
    match_status: MatchStatus = "unmatched"
    issue_image: str | None = None
    corrective_images: str | None = None
    reported_on: DateValue | None = None
    due_date: DateValue | None = None
    assigned_to: str | None = None
    customer: str | None = None
    contract: str | None = None
    created_at: DateValue | None = None
    last_updated_at: DateValue | None = None
    billing_type: str | None = None


@dataclass(slots=True)
class PdmRecord(SchemaRecord):
    pdm_name: str | None = None
    module_type: str | None = None
    length: float | str | None = None
    width: float | str | None = None
    height: float | str | None = None
    weight: float | str | None = None
    equipment_count: int = 0
    matched_equipment_count: int = 0
    unmatched_equipment_count: int = 0
    open_case_count: int = 0
    total_case_count: int = 0
    urgent_case_count: int = 0
    high_priority_case_count: int = 0
    neta_complete_count: int = 0
    neta_incomplete_count: int = 0
    neta_missing_report_count: int = 0
    equipment: list[PdmEquipmentRecord] = field(default_factory=list)


@dataclass(slots=True)
class PdmEquipmentRecord(SchemaRecord):
    equipment_id: str | None = None
    source_equipment_label: str | None = None
    match_status: MatchStatus = "unmatched"
    equipment_type: str | None = None
    status: str | None = None
    parent: str | None = None
    system: str | None = None
    open_issues_count_from_system_elements: int | None = None
    calculated_open_case_count: int = 0
    neta_complete: bool | str | None = None
    neta_completed_at: DateValue | None = None
    neta_test_report: str | None = None
    neta_report_status: NetaReportStatus = "unknown"
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    cases: list[CaseIssue] = field(default_factory=list)


@dataclass(slots=True)
class NetaValidationRecord(SchemaRecord):
    """NETA validation finding.

    If neta_complete or neta_completed_at indicates completion, neta_test_report
    should exist. Completed equipment without a report belongs in
    DataQualityReport.neta_completed_but_missing_test_report.
    """

    equipment_id: str | None = None
    pdm_name: str | None = None
    neta_complete: bool | str | None = None
    neta_completed_at: DateValue | None = None
    neta_test_report: str | None = None
    validation_status: ValidationStatus = "valid"
    message: str | None = None


@dataclass(slots=True)
class DataQualityReport(SchemaRecord):
    """Data quality buckets for the normalized PDM-centric dataset."""

    unmatched_module_equipment: list[ModuleEquipmentLink] = field(default_factory=list)
    unmatched_cases: list[CaseIssue] = field(default_factory=list)
    cases_missing_issue_image: list[CaseIssue] = field(default_factory=list)
    closed_cases_missing_corrective_images: list[CaseIssue] = field(default_factory=list)
    neta_completed_but_missing_test_report: list[NetaValidationRecord] = field(
        default_factory=list
    )
    neta_test_report_present_but_not_complete: list[NetaValidationRecord] = field(
        default_factory=list
    )
    open_issue_count_mismatches: list[dict[str, Any]] = field(default_factory=list)
    duplicate_equipment_ids: list[str] = field(default_factory=list)
    blank_required_fields: list[dict[str, Any]] = field(default_factory=list)


__all__ = [
    "CaseIssue",
    "DataQualityReport",
    "DateValue",
    "Equipment",
    "MatchStatus",
    "ModuleEquipmentLink",
    "NetaReportStatus",
    "NetaValidationRecord",
    "PdmEquipmentRecord",
    "PdmRecord",
    "SchemaRecord",
    "ValidationStatus",
]
