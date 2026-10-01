from __future__ import annotations

import json
from pathlib import Path

from openpyxl import Workbook
import pytest

from scripts.etl import build_pdm_dataset, run_etl
from scripts.etl.pdm_energisation import HEADERS, WORKBOOK_NAME, attach_energisation


def make_workbook(path: Path, rows: list[list[object]]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "SKID Tracker"
    sheet.append(["Shipping tracker"])
    sheet.append(["Instructions"])
    sheet.append([])
    sheet.append(list(HEADERS.values()))
    for row in rows:
        sheet.append(row)
    workbook.save(path)
    workbook.close()
    return path


def test_import_yes_no_unknown_alias_and_unmatched(tmp_path: Path) -> None:
    primary = "IAD06-PDM-E6-120-03-PRIMARY-CDS-R"
    source = make_workbook(tmp_path / "tracker.xlsx", [
        [" pdm-a ", " Yes ", "No"],
        ["PDM-B", None, "YES"],
        ["IAD06-PDM-E6-120-03-CDS-R", "Yes", None],
        ["PDM-C", "Not started", 0],
        ["PDM-MISSING", "Yes", "Yes"],
    ])
    pdms = [{"pdm_name": name} for name in ["PDM-A", "PDM-B", primary, "PDM-C", "PDM-D"]]
    report = attach_energisation(pdms, source)
    assert report["available"] is True
    assert report["source_file"]["file_name"] == "tracker.xlsx"
    assert [(p["energised_offsite"], p["energised_onsite"]) for p in pdms] == [
        (True, False), (None, True), (True, None), (None, None), (None, None),
    ]
    assert report["records"][2]["match_method"] == "cds_alias"
    assert report["records"][2]["candidate_pdms"] == [primary]
    assert report["records"][3]["invalid_fields"] == ["energised_offsite", "energised_onsite"]
    assert report["records"][4]["match_status"] == "unmatched"
    assert report["records"][0]["row"] == 5


def test_duplicate_rows_and_ambiguous_pdms_are_not_marked_energised(tmp_path: Path) -> None:
    source = make_workbook(tmp_path / "tracker.xlsx", [
        ["PDM-A", "Yes", None], ["PDM-A", "No", None],
        ["PDM-B", "Yes", "Yes"],
    ])
    pdms = [{"pdm_name": name} for name in ["PDM-A", "PDM-B", " pdm-b "]]
    report = attach_energisation(pdms, source)
    assert all(p["energised_offsite"] is None for p in pdms)
    assert all(r["match_status"] == "ambiguous" for r in report["records"])


def test_alias_does_not_merge_primary_and_redundant_or_override_exact_match(tmp_path: Path) -> None:
    source = make_workbook(tmp_path / "tracker.xlsx", [["IAD06-PDM-E6-120-03-CDS-R", "Yes", None]])
    pdms = [{"pdm_name": name} for name in [
        "IAD06-PDM-E6-120-03-PRIMARY-CDS", "IAD06-PDM-E6-120-03-PRIMARY-CDS-R",
        "IAD06-PDM-E6-120-03-CDS-R",
    ]]
    attach_energisation(pdms, source)
    assert [p["energised_offsite"] for p in pdms] == [None, None, True]


def test_missing_source_clears_stale_flags(tmp_path: Path) -> None:
    pdms = [{"pdm_name": "PDM-A", "energised_offsite": True}]
    report = attach_energisation(pdms, tmp_path / "missing.xlsx")
    assert report["available"] is False
    assert pdms[0]["energised_offsite"] is None


def test_invalid_headers_fail_explicitly(tmp_path: Path) -> None:
    source = tmp_path / "invalid.xlsx"
    workbook = Workbook()
    workbook.active.append(["Wrong header"])
    workbook.save(source)
    workbook.close()
    with pytest.raises(ValueError, match="Missing skid energisation headers"):
        attach_energisation([], source)


def test_build_publishes_enriched_pdm_csv_source_and_diagnostics(tmp_path: Path, monkeypatch) -> None:
    tracker = tmp_path / "tracker"
    source = make_workbook(tracker / "Excel" / WORKBOOK_NAME, [["PDM-A", "Yes", None]])
    monkeypatch.setenv("IAD6_EPS_TRACKER_ROOT", str(tracker))
    for attribute, rows in [
        ("EQUIPMENT_PATH", []), ("CASES_PATH", []),
        ("MODULE_LINKS_PATH", [{"pdm_name": "PDM-A", "source_equipment_label": "EQ-1"}]),
    ]:
        path = tmp_path / f"{attribute}.json"
        path.write_text(json.dumps({"records": rows}), encoding="utf-8")
        monkeypatch.setattr(build_pdm_dataset, attribute, path)
    for attribute in ["PDMS_OUTPUT_PATH", "PDMS_CSV_OUTPUT_PATH", "ENERGISATION_OUTPUT_PATH"]:
        monkeypatch.setattr(build_pdm_dataset, attribute, tmp_path / attribute)
    pdms = build_pdm_dataset.run_build({"module_list": str(source)})
    assert pdms[0]["energised_offsite"] is True
    payload = json.loads(build_pdm_dataset.PDMS_OUTPUT_PATH.read_text())
    assert payload["selected_input_files"]["skid_energisation"]["file_name"] == WORKBOOK_NAME
    assert payload["records"][0]["energised_onsite"] is None
    assert "energised_offsite" in build_pdm_dataset.PDMS_CSV_OUTPUT_PATH.read_text()
    diagnostics = json.loads(build_pdm_dataset.ENERGISATION_OUTPUT_PATH.read_text())
    assert diagnostics["records"][0]["match_status"] == "matched"
    assert "pdm_energisation" in run_etl.OUTPUT_FILES
