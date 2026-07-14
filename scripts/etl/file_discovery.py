"""Discover weekly-renamed Excel input files for the ETL pipeline."""

from __future__ import annotations

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DATA_DIR = PROJECT_ROOT / "raw_data"

MODULE_DIR = RAW_DATA_DIR / "module"
SYSTEM_ELEMENTS_DIR = RAW_DATA_DIR / "system_elements"
CASES_DIR = RAW_DATA_DIR / "cases"


def find_latest_excel_file(folder: str, pattern: str) -> str:
    """Return the newest non-temporary .xlsx file matching pattern."""

    folder_path = Path(folder)
    if not folder_path.exists():
        raise FileNotFoundError(f"Input folder does not exist: {folder_path}")
    if not folder_path.is_dir():
        raise FileNotFoundError(f"Input path is not a folder: {folder_path}")

    candidates = [
        path
        for path in folder_path.glob(pattern)
        if path.is_file()
        and path.suffix.casefold() == ".xlsx"
        and not path.name.startswith("~$")
    ]

    if not candidates:
        raise FileNotFoundError(
            f"No Excel files matching {pattern!r} were found in {folder_path}"
        )

    newest = max(candidates, key=lambda path: (path.stat().st_mtime, path.name))
    return str(newest.resolve())


def get_input_files() -> dict[str, str]:
    """Return the selected source workbook paths for the current ETL run."""

    return {
        "module_list": find_latest_excel_file(str(MODULE_DIR), "*.xlsx"),
        "system_elements": find_latest_excel_file(
            str(SYSTEM_ELEMENTS_DIR),
            "SystemElements_*.xlsx",
        ),
        "cases": find_latest_excel_file(str(CASES_DIR), "Cases_*.xlsx"),
    }
