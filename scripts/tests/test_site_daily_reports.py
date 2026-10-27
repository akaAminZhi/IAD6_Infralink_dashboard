from pathlib import Path
import json

from openpyxl import Workbook

from scripts.etl.daily_report_sources import read_events
from scripts.etl.eps_daily_report_audit import build_daily_report_audit
from scripts.etl.eps_daily_test import build_eps_daily_test_index
from scripts.etl.build_power_plan import build_mv_test_index
from scripts.etl.layout_connections import build_layout_connections
from scripts.etl import build_eps_test_execution as builder


def report(root: Path, source: str, name: str, text: str) -> None:
    directory = root / source
    directory.mkdir(exist_ok=True)
    (directory / name).write_text(text, encoding="utf-8")


def test_all_duplicate_categories_and_phase_ids_are_preserved(tmp_path):
    report(tmp_path, "Offsite_Test_Report", "2026-10-01.md",
           "# Tested And Passed\n- TX6-01\n- TX6-01\n- TX6-01-CT01\n- UTILITY6-01-A PHASE\n")
    report(tmp_path, "Onsite_Test_Report", "2026-10-01.md", "# Failed\n- IAD06-TX6-01\n")
    report(tmp_path, "Onsite_Test_Report", "2026-10-02.md",
           "# Retested And Passed\n- TX6-01\n# Partially Tested\n- TX6-PARTIAL\n")
    audit = build_daily_report_audit(tmp_path)
    items = {item["equipment_key"]: item for item in audit["items"]}
    repeated = items["TX6-01"]
    assert repeated["repeated"] and repeated["cross_site"]
    assert repeated["repeated_on_same_day"] and repeated["repeated_on_different_dates"]
    assert len(repeated["events"]) == 4
    assert not items["TX6-01-CT01"]["repeated"]
    assert "UTILITY6-01-A PHASE" in items and "TX6-PARTIAL" not in items
    assert audit["repeated_item_count"] == audit["cross_site_item_count"] == 1


def test_both_map_indexes_read_sites_without_merging_ids_or_dropping_legacy(tmp_path):
    cable = "FDR-IAD06-TX6-01-IAD06-PDU6-01"
    report(tmp_path, "Daily_test_report", "2026-09-30.md", f"# Tested\n- {cable}-1\n")
    report(tmp_path, "MV_Daily_test_report", "2026-09-30.md",
           f"# Failed\n- {cable}\n# Partially Tested\n- TX6-PARTIAL\n")
    report(tmp_path, "Offsite_Test_Report", "2026-10-01.md", f"# Tested And Passed\n- {cable}\n")
    report(tmp_path, "Onsite_Test_Report", "2026-10-01.md", f"# Failed\n- {cable}\n")
    mv, _ = build_mv_test_index(tmp_path / "MV_Daily_test_report")
    eps, _ = build_eps_daily_test_index(tmp_path / "Daily_test_report")
    assert mv[cable][-1]["status"] == eps[cable][-1]["status"] == "failed"
    assert mv[cable][-1]["conflict"] is True
    assert "TX6-PARTIAL" not in mv
    assert f"{cable}-1" in eps
    cables, _ = build_layout_connections({cable: [{"equipment_id": cable, "equipment_type": "Feeder Cable - MV"}]}, set(), mv, {}, eps)
    assert len(cables[0]["daily_report_history"]) == 3  # Shared site evidence only once.
    assert cables[0]["daily_report_conflict"] is True


def test_eps_builder_rebuilds_sites_and_keeps_legacy_mv_out_of_completion(tmp_path, monkeypatch):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "TRACKER"
    sheet.append(["EQUIPMENT NAME", "SUBSTATION", "TYPE"])
    sheet.append(["TX6-01", "TX6-01", "TX"])
    tracker = tmp_path / "tracker.xlsx"
    workbook.save(tracker)
    module = tmp_path / "module.json"
    module.write_text(json.dumps({"records": [{"pdm_name": "IAD06-PDM-E6-110-01-PRIMARY-CDS", "source_equipment_label": "TX6-01", "matched_equipment_id": "IAD06-TX6-01", "match_status": "matched"}]}))
    equipment = tmp_path / "equipment.json"
    equipment.write_text(json.dumps({"records": [{"equipment_id": "IAD06-TX6-01"}]}))
    report(tmp_path, "Offsite_Test_Report", "2026-10-01.md", "# Tested And Passed\n- TX6-01\n")
    report(tmp_path, "MV_Daily_test_report", "2026-10-02.md", "# Tested And Passed\n- TX6-ONLY-MV\n")
    for name, value in {"EPS_ROOT": tmp_path, "EPS_TRACKER_PATH": tracker, "EPS_TRACKER_SOURCE_DIR": tmp_path / "missing", "DAILY_TESTED_EQUIPMENT_PATH": tmp_path / "daily_tested_equipment.md", "MODULE_LINKS_PATH": module, "EQUIPMENT_PATH": equipment, "SNAPSHOT_DIR": tmp_path / "snapshots"}.items():
        monkeypatch.setattr(builder, name, value)
    for name in ("SUMMARY_OUTPUT_PATH", "DAILY_REPORT_AUDIT_OUTPUT_PATH", "PDM_OUTPUT_PATH", "MODULE_OUTPUT_PATH", "TEST_ITEMS_OUTPUT_PATH", "FAILED_OUTPUT_PATH", "INCOMPLETE_OUTPUT_PATH", "NOT_FOUND_OUTPUT_PATH"):
        monkeypatch.setattr(builder, name, tmp_path / f"{name}.json")
    summary = builder.build_eps_test_execution(tracker)
    assert summary["total_tested_equipment_count"] == 1
    items = json.loads(builder.TEST_ITEMS_OUTPUT_PATH.read_text())["records"]
    assert items[0]["daily_report_history"][0]["site"] == "offsite"
    assert "TX6-ONLY-MV" not in (tmp_path / "daily_tested_equipment.md").read_text()
    report(tmp_path, "Onsite_Test_Report", "2026-10-03.md",
           "# Tested And Passed\n- UTILITY6-01-WAY1-A PHASE\n")
    summary = builder.build_eps_test_execution(tracker)
    assert summary["total_tested_equipment_count"] == 2
    not_found = json.loads(builder.NOT_FOUND_OUTPUT_PATH.read_text())["records"]
    phase = next(item for item in not_found if item["equipment_key"] == "UTILITY6-01-WAY1-A PHASE")
    assert phase["daily_report_history"][0]["site"] == "onsite"
