from __future__ import annotations

import pytest
from openpyxl import Workbook

from scripts.etl.normalize_modules import SOURCE_COLUMNS, normalize_modules


def make_workbook(path, headers=SOURCE_COLUMNS, rows=None) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(headers)
    for row in rows or []:
        sheet.append(row)
    workbook.save(path)


def test_normalize_modules_unpivots_equipment_and_adds_iad06_prefix(tmp_path) -> None:
    workbook_path = tmp_path / "modules.xlsx"
    make_workbook(
        workbook_path,
        rows=[
            [
                " PDM-1 ",
                " MDB ",
                10,
                20,
                30,
                40,
                "PDU6-01A-1",
                " IAD06-ATS6-01A-1 ",
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ]
        ],
    )

    records = normalize_modules(str(workbook_path))

    assert len(records) == 2
    assert records[0]["source_equipment_column"] == "Equipment 1"
    assert records[0]["source_equipment_label"] == "PDU6-01A-1"
    assert records[0]["normalized_equipment_id"] == "IAD06-PDU6-01A-1"
    assert records[1]["normalized_equipment_id"] == "IAD06-ATS6-01A-1"
    assert all(record["match_status"] == "pending_match" for record in records)


def test_normalize_modules_accepts_case_and_whitespace_header_variants(tmp_path) -> None:
    workbook_path = tmp_path / "headers.xlsx"
    headers = [f"  {header.lower()}  " for header in SOURCE_COLUMNS]
    make_workbook(workbook_path, headers=headers)

    assert normalize_modules(str(workbook_path)) == []


def test_normalize_modules_rejects_missing_equipment_columns(tmp_path) -> None:
    workbook_path = tmp_path / "missing.xlsx"
    make_workbook(workbook_path, headers=SOURCE_COLUMNS[:-1])

    with pytest.raises(ValueError, match="Missing expected module list columns"):
        normalize_modules(str(workbook_path))
