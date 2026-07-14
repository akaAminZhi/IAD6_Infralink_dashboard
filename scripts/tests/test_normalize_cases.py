from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook

from scripts.etl.normalize_cases import normalize_cases


HEADERS = [
    "Item #",
    "Category",
    "Status",
    "Priority",
    "Summary",
    "System Elements",
    "Reported On",
    "Due",
    "Assigned to",
    "Customer",
    "Contract",
    "Created",
    "Last Updated",
    "Billing Type",
    "Issue Image",
    "Corrective Images",
]


def write_cases_workbook(path: Path) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "EXPORT"
    sheet.append(HEADERS)
    sheet.append(
        [
            "CASE-1",
            "Issue",
            "Open",
            "High (3d)",
            "Line one\nLine two",
            "IAD06-PDU-1",
            "2026-06-13T16:48:00",
            None,
            "Owner",
            "Customer",
            "Contract",
            None,
            None,
            "TM",
            " Issue Image-01.jpg ",
            " Corrective-01.pdf ",
        ]
    )
    sheet.append(
        [
            "CASE-2",
            "Issue",
            "Open",
            "Urgent (24h)",
            "No image",
            "IAD06-PDU-2",
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            " ",
            " ",
        ]
    )
    workbook.save(path)


def test_normalize_cases_preserves_issue_image_and_multiline_summary(tmp_path: Path) -> None:
    workbook_path = tmp_path / "Cases_test.xlsx"
    write_cases_workbook(workbook_path)

    records = normalize_cases(str(workbook_path))

    assert records[0]["issue_image"] == "Issue Image-01.jpg"
    assert records[0]["corrective_images"] == "Corrective-01.pdf"
    assert records[1]["issue_image"] is None
    assert records[1]["corrective_images"] is None
    assert records[0]["summary"] == "Line one\nLine two"
