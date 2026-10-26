from pathlib import Path
import os
from datetime import datetime
import json

from openpyxl import Workbook

from scripts.etl.eps_daily_report_audit import build_daily_report_audit


def report(root: Path, source: str, name: str, text: str) -> Path:
    directory = root / source
    directory.mkdir(exist_ok=True)
    path = directory / name
    path.write_text(text, encoding="utf-8-sig")
    return path


def test_combines_sources_and_preserves_chronological_retests_while_ignoring_partial_results(tmp_path):
    report(tmp_path, "Daily_test_report", "2026-10-02.md",
           "# Failed\n- IAD06-TX6-01\n# Tested\n- TX6-01-CT01\n")
    report(tmp_path, "MV_Daily_test_report", "2026-10-04.md",
           "# Retested And Passed\n- tx6-01\n# Partially Tested\n- TX6-02\n")
    report(tmp_path, "MV_Daily_test_report", "2026-10-06.md",
           "# Tested And Passed\n- TX6-01\n")
    audit = build_daily_report_audit(tmp_path)
    items = {item["equipment_key"]: item for item in audit["items"]}
    assert audit["item_count"] == 2
    assert audit["event_count"] == 4
    assert audit["repeated_item_count"] == 1
    repeated = items["TX6-01"]
    assert repeated["test_dates"] == ["2026-10-02", "2026-10-04", "2026-10-06"]
    assert [event["status"] for event in repeated["events"]] == ["failed", "retested_and_passed", "tested_and_passed"]
    assert repeated["cross_source"] is True
    assert repeated["repeated_on_same_day"] is False
    assert repeated["events"][0]["line_number"] == 2
    assert repeated["events"][0]["source"] == "Daily_test_report"
    assert "TX6-02" not in items
    assert items["TX6-01-CT01"]["repeated_on_different_dates"] is False
    assert items["TX6-01"]["pdm_name"] is None


def test_same_day_overlap_conflicts_and_duplicate_lines_do_not_imply_a_later_retest(tmp_path):
    report(tmp_path, "Daily_test_report", "2026-10-02.md",
           "# Failed\n- TX6-01\n- TX6-01\n# Retested And Passed\n- TX6-01\n")
    report(tmp_path, "MV_Daily_test_report", "2026-10-02.md",
           "# Tested And Passed\n- IAD06-TX6-01\n")
    audit = build_daily_report_audit(tmp_path)
    item = audit["items"][0]
    assert audit["event_count"] == 4
    assert audit["repeated_item_count"] == 0
    assert audit["same_day_item_count"] == 1
    assert item["test_dates"] == ["2026-10-02"]
    assert item["repeated_on_same_day"] is True
    assert item["cross_source"] is True
    assert [event["line_number"] for event in item["events"]] == [2, 3, 5, 2]


def test_missing_sources_invalid_dates_and_inferred_year_are_visible(tmp_path):
    path = report(tmp_path, "Daily_test_report", "7-16.md", "# Tested\n- TX6-01\n")
    timestamp = datetime(2025, 8, 1).timestamp()
    os.utime(path, (timestamp, timestamp))
    report(tmp_path, "Daily_test_report", "2026-02-30.md", "# Tested\n- TX6-02\n")
    report(tmp_path, "Daily_test_report", "notes.md", "# Tested\n- TX6-03\n")
    audit = build_daily_report_audit(tmp_path)
    assert audit["sources"]["MV_Daily_test_report"]["available"] is False
    assert audit["sources"]["Daily_test_report"]["skipped_files"] == ["2026-02-30.md", "notes.md"]
    assert audit["items"][0]["test_dates"] == ["2025-07-16"]
    assert audit["items"][0]["events"][0]["date_basis"] == "filename_month_day_file_year"


def test_only_explicit_retest_and_excluded_equipment_do_not_create_false_repeats(tmp_path):
    report(tmp_path, "Daily_test_report", "2026-10-02.md",
           "# Retested And Passed\n- TX6-01\n# Tested\n- UPS6-01\n- INV6-01\n- TX-INV6-01\n"
           "# Notes\n- TX6-IGNORE\n")
    audit = build_daily_report_audit(tmp_path)
    items = {item["equipment_key"]: item for item in audit["items"]}
    assert audit["repeated_item_count"] == 0
    assert "TX6-IGNORE" not in items
    assert not items["UPS6-01"]["test_tracking_required"]
    assert not items["INV6-01"]["test_tracking_required"]
    assert items["TX-INV6-01"]["test_tracking_required"]


def test_execution_builder_publishes_combined_evidence_without_changing_tracker_totals(tmp_path, monkeypatch):
    from scripts.etl import build_eps_test_execution as builder
    from scripts.etl import run_etl

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "TRACKER"
    sheet.append(["EQUIPMENT NAME", "SUBSTATION", "TYPE"])
    sheet.append(["TX6-01", "TX6-01", "TX"])
    tracker = tmp_path / "tracker.xlsx"
    workbook.save(tracker)
    washed = tmp_path / "daily_tested_equipment.md"
    washed.write_text("# Tested Equipment\n## 2026-10-02\n- TX6-01\n", encoding="utf-8")
    module_path = tmp_path / "module_equipment_links.json"
    module_path.write_text(json.dumps({"records": [{
        "pdm_name": "IAD06-PDM-E6-110-01-PRIMARY-CDS", "source_equipment_label": "TX6-01",
        "matched_equipment_id": "IAD06-TX6-01", "match_status": "matched",
    }]}), encoding="utf-8")
    equipment_path = tmp_path / "equipment.json"
    equipment_path.write_text(json.dumps({"records": [{"equipment_id": "IAD06-TX6-01"}]}), encoding="utf-8")
    report(tmp_path, "Daily_test_report", "2026-10-02.md", "# Tested\n- TX6-01\n")
    report(tmp_path, "MV_Daily_test_report", "2026-10-04.md",
           "# Retested And Passed\n- TX6-01\n# Partially Tested\n- UNMATCHED6-01\n# Failed\n- UNMATCHED6-02\n")
    for name, value in {
        "EPS_ROOT": tmp_path, "EPS_TRACKER_PATH": tracker,
        "EPS_TRACKER_SOURCE_DIR": tmp_path / "missing", "DAILY_TESTED_EQUIPMENT_PATH": washed,
        "MODULE_LINKS_PATH": module_path, "EQUIPMENT_PATH": equipment_path,
        "SNAPSHOT_DIR": tmp_path / "snapshots",
    }.items():
        monkeypatch.setattr(builder, name, value)
    for name in ("SUMMARY_OUTPUT_PATH", "DAILY_REPORT_AUDIT_OUTPUT_PATH", "PDM_OUTPUT_PATH",
                 "MODULE_OUTPUT_PATH", "TEST_ITEMS_OUTPUT_PATH", "FAILED_OUTPUT_PATH",
                 "INCOMPLETE_OUTPUT_PATH", "NOT_FOUND_OUTPUT_PATH"):
        monkeypatch.setattr(builder, name, tmp_path / name.lower())

    summary = builder.build_eps_test_execution(tracker)
    audit = json.loads(builder.DAILY_REPORT_AUDIT_OUTPUT_PATH.read_text(encoding="utf-8"))
    assert summary["total_tested_equipment_count"] == 1
    assert "daily_report_audit" not in summary  # Large evidence stays route-specific.
    assert audit["item_count"] == 2
    assert audit["repeated_item_count"] == 1
    items = {item["equipment_key"]: item for item in audit["items"]}
    assert items["TX6-01"]["pdm_name"] == "IAD06-PDM-E6-110-01-PRIMARY-CDS"
    assert "UNMATCHED6-01" not in items
    assert items["UNMATCHED6-02"]["pdm_name"] is None
    assert run_etl.OUTPUT_FILES["eps_daily_report_audit"].name == "eps_daily_report_audit.json"
