from __future__ import annotations

from datetime import datetime

import pytest
from openpyxl import Workbook

from scripts.etl.normalize_equipment import (
    SOURCE_COLUMNS,
    normalize_equipment,
    parse_neta_complete,
    parse_open_issues,
)


def make_workbook(path, headers=SOURCE_COLUMNS, rows=None) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "EXPORT"
    sheet.append(headers)
    for row in rows or []:
        sheet.append(row)
    workbook.save(path)


def test_parse_neta_complete_handles_null_incomplete_complete_and_dates() -> None:
    assert parse_neta_complete(None) == (None, None)
    assert parse_neta_complete("N/A") == (None, None)
    assert parse_neta_complete("Not Completed") == (False, None)
    assert parse_neta_complete("Completed") == (True, None)
    assert parse_neta_complete(datetime(2026, 7, 1, 8, 30)) == (
        True,
        "2026-07-01T08:30:00",
    )


def test_parse_open_issues_converts_blank_numeric_and_text_values() -> None:
    assert parse_open_issues(None) == 0
    assert parse_open_issues("1,234") == 1234
    assert parse_open_issues(2.9) == 2


def test_normalize_equipment_reads_and_trims_workbook_values(tmp_path) -> None:
    workbook_path = tmp_path / "SystemElements_07-01-2026_05-00-AM.xlsx"
    make_workbook(
        workbook_path,
        rows=[
            [
                " IAD06-EQ-1 ",
                " PDU ",
                " Cond Green Tag ",
                " PDM-1 ",
                " EPS ",
                datetime(2026, 7, 1, 9, 0),
                " User ",
                "",
                " report.pdf ",
                datetime(2026, 7, 1, 8, 30),
                " IEM ",
                " MODEL-1 ",
                " SERIAL-1 ",
            ]
        ],
    )

    records = normalize_equipment(str(workbook_path))

    assert records == [
        {
            "equipment_id": "IAD06-EQ-1",
            "equipment_type": "PDU",
            "status": "Cond Green Tag",
            "parent": "PDM-1",
            "system": "EPS",
            "open_issues_count_from_system_elements": 0,
            "neta_complete": True,
            "neta_completed_at": "2026-07-01T08:30:00",
            "neta_test_report": "report.pdf",
            "feeder_cable_atp": None,
            "manufacturer": "IEM",
            "model": "MODEL-1",
            "serial_number": "SERIAL-1",
            "updated_at": "2026-07-01T09:00:00",
            "updated_by": "User",
        }
    ]


def test_normalize_equipment_preserves_optional_feeder_cable_atp(tmp_path) -> None:
    workbook_path = tmp_path / "SystemElements_with_atp.xlsx"
    headers = [*SOURCE_COLUMNS, "Feeder Cable ATP"]
    row = [None] * len(headers)
    row[headers.index("Unique ID")] = "FD01-IAD06-TX6-01A"
    row[headers.index("Open Issues")] = 0
    row[headers.index("Feeder Cable ATP")] = " FD01 Cable ATP.pdf "
    make_workbook(workbook_path, headers=headers, rows=[row])

    records = normalize_equipment(str(workbook_path))

    assert records[0]["feeder_cable_atp"] == "FD01 Cable ATP.pdf"


def test_normalize_equipment_rejects_missing_columns(tmp_path) -> None:
    workbook_path = tmp_path / "missing.xlsx"
    make_workbook(workbook_path, headers=["Unique ID"])

    with pytest.raises(ValueError, match="Missing expected SystemElements columns"):
        normalize_equipment(str(workbook_path))
