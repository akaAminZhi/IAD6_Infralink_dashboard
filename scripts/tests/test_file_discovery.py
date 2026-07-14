from __future__ import annotations

import os
from pathlib import Path

import pytest

from scripts.etl import file_discovery


def touch(path: Path, modified_time: int) -> None:
    path.write_text("placeholder", encoding="utf-8")
    os.utime(path, (modified_time, modified_time))


def test_find_latest_excel_file_selects_newest_and_ignores_temp(tmp_path: Path) -> None:
    touch(tmp_path / "SystemElements_old.xlsx", 100)
    newest = tmp_path / "SystemElements_new.xlsx"
    touch(newest, 200)
    touch(tmp_path / "~$SystemElements_newer.xlsx", 300)
    touch(tmp_path / "SystemElements_not_excel.xls", 400)

    selected = file_discovery.find_latest_excel_file(
        str(tmp_path),
        "SystemElements_*.xlsx",
    )

    assert Path(selected).name == newest.name


def test_find_latest_excel_file_raises_when_no_match(tmp_path: Path) -> None:
    touch(tmp_path / "~$Cases_ignored.xlsx", 100)

    with pytest.raises(FileNotFoundError):
        file_discovery.find_latest_excel_file(str(tmp_path), "Cases_*.xlsx")


def test_get_input_files_selects_newest_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    module_dir = tmp_path / "module"
    system_dir = tmp_path / "system_elements"
    cases_dir = tmp_path / "cases"
    module_dir.mkdir()
    system_dir.mkdir()
    cases_dir.mkdir()

    touch(module_dir / "module_old.xlsx", 100)
    touch(module_dir / "module_new.xlsx", 200)
    touch(system_dir / "SystemElements_old.xlsx", 100)
    touch(system_dir / "SystemElements_new.xlsx", 200)
    touch(cases_dir / "Cases_old.xlsx", 100)
    touch(cases_dir / "Cases_new.xlsx", 200)

    monkeypatch.setattr(file_discovery, "MODULE_DIR", module_dir)
    monkeypatch.setattr(file_discovery, "SYSTEM_ELEMENTS_DIR", system_dir)
    monkeypatch.setattr(file_discovery, "CASES_DIR", cases_dir)

    selected = file_discovery.get_input_files()

    assert Path(selected["module_list"]).name == "module_new.xlsx"
    assert Path(selected["system_elements"]).name == "SystemElements_new.xlsx"
    assert Path(selected["cases"]).name == "Cases_new.xlsx"
