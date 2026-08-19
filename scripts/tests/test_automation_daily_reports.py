from __future__ import annotations

from pathlib import Path

import pytest

from scripts.automation.daily_reports import (
    ReportNameError,
    format_mv_report,
    format_report,
    normalize_report_name,
    read_mv_report,
    read_report,
    report_path,
    validate_mv_sections,
    validate_sections,
    write_mv_report,
    write_report,
)


def test_report_name_accepts_supported_date_formats() -> None:
    assert normalize_report_name("7-16") == "7-16.md"
    assert normalize_report_name("2026-07-16.md") == "2026-07-16.md"


@pytest.mark.parametrize(
    "value",
    ["", "notes.md", "7/16.md", "../7-16.md", "13-1.md", "2026-02-30.md"],
)
def test_report_name_rejects_unsafe_or_non_date_names(value: str) -> None:
    with pytest.raises(ReportNameError):
        normalize_report_name(value)


def test_report_path_stays_inside_report_directory(tmp_path: Path) -> None:
    report_dir = tmp_path / "Daily_test_report"
    assert report_path(report_dir, "7-16.md") == report_dir.resolve() / "7-16.md"
    with pytest.raises(ReportNameError):
        report_path(report_dir, "../7-16.md")


def test_section_validation_normalizes_bullets_and_applies_precedence() -> None:
    result = validate_sections(
        "- ITEM-A\n* ITEM-B\nITEM-A\nITEM-C",
        "1. ITEM-B\nITEM-D",
        "ITEM-C\n2) ITEM-D\nITEM-E",
    )

    assert result["sections"] == {
        "failed": ["ITEM-A"],
        "retested_and_passed": ["ITEM-B", "ITEM-D"],
        "tested": ["ITEM-C", "ITEM-E"],
    }
    assert result["counts"] == {
        "failed": 1,
        "retested_and_passed": 2,
        "tested": 2,
    }
    assert len(result["warnings"]) == 3


def test_report_is_written_atomically_and_requires_overwrite(tmp_path: Path) -> None:
    report_dir = tmp_path / "Daily_test_report"
    sections = {
        "failed": ["ITEM-A"],
        "retested_and_passed": ["ITEM-B"],
        "tested": ["ITEM-C"],
    }

    path = write_report(report_dir, "7-16.md", sections, overwrite=False)
    assert path.read_text(encoding="utf-8") == format_report(sections)
    assert not list(report_dir.glob("*.tmp"))

    with pytest.raises(FileExistsError):
        write_report(report_dir, "7-16.md", sections, overwrite=False)

    replacement = {**sections, "failed": ["ITEM-Z"]}
    write_report(report_dir, "7-16.md", replacement, overwrite=True)
    loaded = read_report(report_dir, "7-16.md")
    assert loaded["sections"] == replacement


def test_mv_report_validation_format_and_atomic_write(tmp_path: Path) -> None:
    result = validate_mv_sections(
        "FD1-A\nFD2-B",
        "FD3-C\nFD4-D",
        "FD4-D\nFD5-E",
        "FD2-B\nFD6-F",
    )

    assert result["sections"] == {
        "tested_and_passed": ["FD1-A"],
        "partially_tested": ["FD3-C"],
        "failed": ["FD4-D", "FD5-E"],
        "retested_and_passed": ["FD2-B", "FD6-F"],
    }
    assert result["counts"] == {
        "tested_and_passed": 1,
        "partially_tested": 1,
        "failed": 2,
        "retested_and_passed": 2,
    }
    assert len(result["warnings"]) == 2

    report_dir = tmp_path / "MV_Daily_test_report"
    sections = result["sections"]
    path = write_mv_report(report_dir, "2026-08-19.md", sections, overwrite=False)
    content = path.read_text(encoding="utf-8")
    assert content == format_mv_report(sections)
    assert "# Partially Tested" in content
    assert read_mv_report(report_dir, path.name)["sections"] == sections
    assert not list(report_dir.glob("*.tmp"))


def test_mv_validation_keeps_only_compact_test_item_ids() -> None:
    result = validate_mv_sections(
        """FD01-IAD06-TX6-06R
CABLE, MV
PM/KAB
8/18/2026
TX6-06F
XFMR, MV
GA/DH
TX6-06R""",
        "TX6-06B\nTX6-06D",
        "",
        "",
    )

    assert result["sections"]["tested_and_passed"] == [
        "FD01-IAD06-TX6-06R",
        "TX6-06F",
        "TX6-06R",
    ]
    assert result["sections"]["partially_tested"] == ["TX6-06B", "TX6-06D"]
