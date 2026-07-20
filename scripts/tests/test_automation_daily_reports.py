from __future__ import annotations

from pathlib import Path

import pytest

from scripts.automation.daily_reports import (
    ReportNameError,
    format_report,
    normalize_report_name,
    read_report,
    report_path,
    validate_sections,
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

