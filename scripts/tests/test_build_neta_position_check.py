import csv
import json
from pathlib import Path

import pytest

from scripts.etl.build_neta_position_check import build_position_check, run_build
from scripts.etl.run_etl import OUTPUT_FILES, build_pipeline_steps


MDS_NAMES = ["CDS-PRI", "CDS-SEC", "MCB1-PRI", "MBB-PRI"]


def _write_fixture(root: Path, baselines: dict | None = None) -> tuple[Path, Path, Path]:
    gc = root / "tracker/NETA_eport_To_GC"
    gc.mkdir(parents=True)
    reports = []
    for device in ("IAD06-MDS6-01A", "IAD06-MDS6-01B", "IAD06-MDS6-01C"):
        short = device.removeprefix("IAD06-")
        for name in MDS_NAMES:
            reports.append({"file": f"{device}/{short}-{name}.pdf", "status": "PASSED",
                            "report_stage": "formal", "sha256": f"{device}{name}"})
    reports += [
        {"file": "IAD06-MDS6-01D/MDS6-01D-CDS-PRICFAILED).pdf", "status": "FAILED", "report_stage": "formal"},
        {"file": "IAD06-MDS6-01D/MDS6-01D-MCB1 MAIN-PRI.pdf", "status": "PASSED", "report_stage": "formal"},
        {"file": "IAD06-MDS6-01D/MDS6-01D-MBB-PRI.pdf", "status": "PASSED", "report_stage": "formal"},
        {"file": "IAD06-MDS6-01D/FDR-IAD06-MDS6-01D-IAD06-CDS6-01D.pdf", "status": "PASSED", "report_stage": "formal"},
        {"file": "_temporary/IAD06-MDS6-01E/MDS6-01E-CDS-PRI.pdf", "status": "PASSED", "report_stage": "temporary"},
        {"file": "IAD06-UPS6-01A/UPS6-01A.pdf", "status": "PASSED", "report_stage": "formal"},
    ]
    (gc / "test_reports_result.json").write_text(json.dumps({"reports": reports}), encoding="utf-8")
    with (gc / "rename_manifest.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, ["source_path", "output_path", "parsed_source", "status", "source_sha256"])
        writer.writeheader()
        writer.writerow({"source_path": "downloads/neta_reports/IAD06-MDS6-01D/IAD06-MDS6-01D - NETA Test Report-18.pdf",
                         "output_path": "NETA_eport_To_GC\\IAD06-MDS6-01D\\MDS6-01D-CDS-PRICFAILED).pdf",
                         "parsed_source": "OCR_ASSET", "status": "skipped_existing", "source_sha256": "abc"})
    equipment = root / "equipment.json"
    equipment.write_text(json.dumps([
        {"equipment_id": f"IAD06-MDS6-01{letter}", "neta_complete": letter != "E",
         "equipment_type": "Main Switchboard"} for letter in "ABCDE"
    ]), encoding="utf-8")
    baselines_path = root / "baselines.json"
    if baselines is not None:
        baselines_path.write_text(json.dumps(baselines), encoding="utf-8")
    return root / "tracker", equipment, baselines_path


def test_draft_comparison_flags_missing_failed_and_complete_conflict(tmp_path: Path) -> None:
    tracker, equipment, baselines = _write_fixture(tmp_path)
    output = tmp_path / "out.json"
    result = run_build(tracker, output, equipment, baselines)

    assert result["available"] is True
    assert json.loads(output.read_text(encoding="utf-8")) == result
    family = result["families"][0]
    assert family["family"] == "MDS6|A-F"
    assert family["baseline_basis"] == "draft"
    assert family["baseline_positions"] == sorted(MDS_NAMES)
    by_id = {entry["equipment_id"]: entry for entry in result["equipment"]}
    assert "IAD06-UPS6-01A" not in by_id
    mds_d = by_id["IAD06-MDS6-01D"]
    results = {position["key"]: position["result"] for position in mds_d["positions"]}
    assert results == {"CDS-PRI": "failed_only", "CDS-SEC": "missing", "MBB-PRI": "pass", "MCB1-PRI": "pass"}
    assert mds_d["complete_but_nonconforming"] is True
    assert all(not report["file"].split("/")[-1].startswith("FDR") for report in mds_d["reports"])
    assert mds_d["reports"][0]["source_report_name"] == "IAD06-MDS6-01D - NETA Test Report-18.pdf"
    in_progress = by_id["IAD06-MDS6-01E"]
    assert in_progress["report_stage"] == "temporary"
    assert in_progress["nonconforming"] is True
    assert in_progress["complete_but_nonconforming"] is False
    assert result["summary"]["complete_but_nonconforming"] == 1


def test_confirmed_baseline_and_exceptions_take_precedence(tmp_path: Path) -> None:
    tracker, equipment, baselines = _write_fixture(tmp_path, {
        "version": 1, "revision": 3,
        "families": {"MDS6|A-F": {
            "status": "confirmed",
            "positions": [{"key": "CDS-PRI"}, {"key": "MBB-PRI"}],
            "exceptions": {"IAD06-MDS6-01D": {"waived_positions": [], "extra_positions": [], "note": "x"}},
        }},
    })
    result = run_build(tracker, tmp_path / "out.json", equipment, baselines)
    family = result["families"][0]
    assert family["baseline_basis"] == "confirmed"
    assert family["draft_differs_from_confirmed"] is True
    assert result["baseline_revision"] == 3
    mds_a = next(entry for entry in result["equipment"] if entry["equipment_id"] == "IAD06-MDS6-01A")
    assert mds_a["issue_counts"] == {"extra": 2}
    assert mds_a["nonconforming"] is False


def test_missing_tracker_output_is_explicitly_unavailable(tmp_path: Path) -> None:
    result = run_build(tmp_path / "none", tmp_path / "out.json", tmp_path / "eq.json", tmp_path / "b.json")
    assert result["available"] is False
    assert result["equipment"] == []


def test_position_check_registered_in_etl() -> None:
    assert "neta_position_check" in OUTPUT_FILES
    steps = [name for name, _ in build_pipeline_steps({})]
    assert steps.index("build_neta_position_check.py") > steps.index("build_neta_report_reviews.py")


def test_pdf_fields_override_truncated_gc_names_and_suggest_renames() -> None:
    from scripts.etl.build_neta_position_check import parse_report

    ct = parse_report("MDS6-01.pdf", "IAD06-MDS6-01B",
                      {"filename": "MDS6-01B-PQM1-CT01 A PHASE", "station": "MDS6-01B", "test_date": "2026-09-25"},
                      {"text_source": "pdf_text"})
    assert ct.key == "PQM1-CT01-A" and ct.name_source == "pdf_filename"
    assert "gc_name_mismatch" in ct.flags
    assert ct.suggested_gc_name == "MDS6-01B-PQM1-CT01 A PHASE.pdf"
    assert ct.test_date == "2026-09-25"

    typo = parse_report("IAD06-PDU6-01D-4-FCB-F5 PRI INJ.pdf", "IAD06-PDU6-01D-2",
                        {"asset": "IAD06-PDU6-01D-4-FCB-F5 PRI INJ", "substation": "IAD06-PDU6-01D-2",
                         "equipment_id_field": "IAD06-PDU6-01D-2-FCB-F5", "serial_number": "CE31229473"}, {})
    assert typo.key == "FB5-PRI"
    assert {"asset_equipment_conflict", "gc_name_mismatch"} <= set(typo.flags)
    assert typo.suggested_gc_name == "IAD06-PDU6-01D-2-FCB-F5 PRI INJ.pdf"
    assert typo.field_votes["substation"] == "agree"

    same = parse_report("MDS6-01B-CDS-PRI.pdf", "IAD06-MDS6-01B", {"asset": "MDS6-01B-CDS-PRI"}, {})
    assert same.suggested_gc_name is None and "gc_name_mismatch" not in same.flags

    no_fields = parse_report("MDS6-01B-CDS-PRI.pdf", "IAD06-MDS6-01B", {}, {})
    assert no_fields.name_source == "gc_name" and no_fields.key == "CDS-PRI"


def test_data_quality_lists_only_confirmed_baseline_nonconformance() -> None:
    from scripts.etl.build_data_quality_report import build_neta_complete_but_nonconforming

    check = {"equipment": [
        {"equipment_id": "B", "family": "F", "baseline_basis": "confirmed", "complete_but_nonconforming": True,
         "positions": [{"key": "X", "result": "missing"}, {"key": "Y", "result": "failed_only"}, {"key": "Z", "result": "pass"}]},
        {"equipment_id": "A", "family": "F", "baseline_basis": "draft", "complete_but_nonconforming": True, "positions": []},
        {"equipment_id": "C", "family": "F", "baseline_basis": "confirmed", "complete_but_nonconforming": False, "positions": []},
    ]}
    findings = build_neta_complete_but_nonconforming(check)
    assert [finding["equipment_id"] for finding in findings] == ["B"]
    assert findings[0]["missing_positions"] == ["X"] and findings[0]["failed_positions"] == ["Y"]
    assert build_neta_complete_but_nonconforming(None) == []


def test_confirmed_baseline_ocr_suggestion_preserves_failure_and_original_name() -> None:
    device = "IAD06-MDS6-01D"
    file = f"{device}/MDS6-01D-WAY1-RLYI(FAILED).pdf"
    reviews = {"reports": [{"file": file, "status": "FAILED", "sha256": "scan"}]}
    fields = {"scan": {"text_source": "ocr", "fields": {"asset": "MDS6-01D-WAY1-RLYI"}}}
    equipment = [{"equipment_id": device, "neta_complete": True}]
    family = {"status": "confirmed", "positions": [{"key": "WAY1-RLY1"}]}
    baselines = {"families": {"MDS6|A-F": family}}

    def report_for(config):
        return build_position_check(reviews, {}, fields, equipment, config)["equipment"][0]["reports"][0]

    report = report_for(baselines)
    assert report["suggested_gc_name"] == "MDS6-01D-WAY1-RLY1(FAILED).pdf"
    assert "gc_name_mismatch" in report["flags"]
    assert (report["file"], report["status"], report["key"]) == (file, "FAILED", "WAY1-RLYI")
    assert report_for({})["suggested_gc_name"] is None

    family["exceptions"] = {device: {"waived_positions": ["WAY1-RLY1"]}}
    assert report_for(baselines)["suggested_gc_name"] is None
    family["exceptions"] = {}
    family["positions"].append({"key": "WAYI-RLY1"})
    # Two confusable candidates are too close to justify a suggestion.
    fields["scan"]["fields"]["asset"] = "MDS6-01D-WAYI-RLYI"
    reviews["reports"][0]["file"] = file.replace("WAY1", "WAYI")
    assert report_for(baselines)["suggested_gc_name"] is None


def test_position_links_to_the_decisive_same_day_failure_first() -> None:
    device = "IAD06-MDS6-01D"
    passed = f"{device}/MDS6-01D-MCB2 PRI.pdf"
    failed = f"{device}/MDS6-01D-MCB2 PRI(FAILED).pdf"
    reviews = {"reports": [{"file": passed, "status": "PASSED"}, {"file": failed, "status": "FAILED"}]}
    field = {"fields": {"test_date": "2026-11-10"}}
    config = {"families": {"MDS6|A-F": {"status": "confirmed", "positions": [{"key": "MCB2-PRI"}]}}}
    check = build_position_check(reviews, {}, {passed.casefold(): field, failed.casefold(): field}, [], config)
    cell, = check["equipment"][0]["positions"]
    assert (cell["result"], cell["notes"], cell["reports"]) == ("failed_only", ["same_day_fail"], [failed, passed])


@pytest.mark.parametrize(("status", "expected"), [
    ("PASSED", "pass"), ("FAILED", "failed_only"), ("REVIEW_REQUIRED", "result_pending"),
])
def test_manual_ct_report_position_survives_renaming_and_can_be_removed(status: str, expected: str) -> None:
    device = "IAD06-PDU6-02B-6"
    positions = ["CT-S-A", "CT-S-B", "CT-S-C", "CT-S-MG"]
    reports = [
        {"file": f"{device}/{device} CT-S {phase}.pdf", "sha256": f"{index:064x}", "status": "PASSED"}
        for index, phase in enumerate(("A PHASE", "B PHASE", "C PHASE", "MG"), 1)
    ]
    first = reports[0]
    first["status"] = status
    digest = first["sha256"]
    fields = {report["sha256"]: {"fields": {"filename": f"{device} CT-S"}} for report in reports}
    family = {"status": "confirmed", "positions": [{"key": position} for position in positions]}
    config = {"families": {"PDU6|A-F|sub": family}}
    equipment = [{"equipment_id": device, "neta_complete": True}]

    def check():
        return build_position_check({"reports": reports}, {}, fields, equipment, config)

    auto = check()["equipment"][0]
    assert all(cell["result"] == "missing" for cell in auto["positions"])
    assert auto["reports"][0]["suggested_gc_name"] == f"{device} CT-S.pdf"

    family["report_position_links"] = {device: {digest: "CT-S-A"}}
    linked = check()
    linked_entry = linked["equipment"][0]
    assert linked["families"][0]["draft"]["support"] == {"CT-S": 1}
    assert [cell["result"] for cell in linked_entry["positions"]] == [expected, "missing", "missing", "missing"]
    assert linked_entry["positions"][0]["reports"] == [first["file"]]
    assert linked_entry["issue_counts"]["extra"] == 3
    assert linked_entry["issue_counts"]["gc_name_mismatch"] == 3
    linked_report = linked_entry["reports"][0]
    assert (linked_report["key"], linked_report["manual_position"]) == ("CT-S", "CT-S-A")
    assert linked_report["suggested_gc_name"] is None

    first["file"] = f"{device}/{device} renamed.pdf"
    assert check()["equipment"][0]["positions"][0]["reports"] == [first["file"]]
    del family["report_position_links"]
    assert check()["equipment"][0]["positions"][0]["result"] == "missing"


def test_unresolved_position_links_are_visible_and_fall_back_to_parsed_positions() -> None:
    device = "IAD06-PDU6-02B-6"
    digest = "a" * 64
    position = "CT-S-A"
    family = {"status": "confirmed", "positions": [{"key": position}],
              "report_position_links": {device: {digest: position}}}
    config = {"families": {"PDU6|A-F|sub": family}}
    reports = [{"file": f"{device}/{device} CT-S B PHASE.pdf", "sha256": "b" * 64, "status": "PASSED"}]

    def equipment_entry():
        return build_position_check({"reports": reports}, {}, {}, [], config)["equipment"][0]

    check = equipment_entry()
    assert check["unresolved_position_links"] == [{"sha256": digest, "position": position, "reason": "report_missing"}]
    assert check["issue_counts"]["unresolved_position_link"] == 1
    reports[0]["sha256"] = digest
    reports.append({**reports[0], "file": f"{device}/{device} CT-S B PHASE__2.pdf"})
    check = equipment_entry()
    assert check["unresolved_position_links"][0]["reason"] == "report_ambiguous"
    assert check["positions"][0]["result"] == "missing"
    assert all(report["manual_position"] is None for report in check["reports"])
    reports.pop()
    family["positions"] = [{"key": "CT-S-B"}]
    check = equipment_entry()
    assert check["unresolved_position_links"][0]["reason"] == "position_removed"
    assert check["positions"][0]["result"] == "pass"
    reports.clear()
    assert equipment_entry()["unresolved_position_links"][0]["reason"] == "position_removed"


def test_tx6_oil_analysis_uses_its_own_position_and_review_result() -> None:
    reports = []
    fields = {}
    equipment = []
    for lineup, results in {
        "A": [("transformer", "REVIEW_REQUIRED"), ("oil_analysis", "FAILED")],
        "B": [("oil_analysis", "PASSED"), ("transformer", "PASSED")],
        "C": [("transformer", "PASSED")],
    }.items():
        asset = f"TX6-01{lineup}"
        device = f"IAD06-{asset}"
        equipment.append({"equipment_id": device, "neta_complete": True})
        for index, (form, status) in enumerate(results):
            suffix = "__2" if index else ""
            file = f"{device}/{asset}{suffix}.pdf"
            reports.append({"file": file, "status": status})
            label = "designation" if form == "oil_analysis" else "asset"
            fields[file.casefold()] = {"form": form, "fields": {label: asset}}

    check = build_position_check({"reports": reports}, {}, fields, equipment, {})
    family, = check["families"]
    assert family["draft"]["support"] == {"EQUIPMENT": 3, "OIL-SAMPLE": 2}
    first, second, third = check["equipment"]
    assert [(cell["key"], cell["result"]) for cell in first["positions"]] == [
        ("EQUIPMENT", "result_pending"), ("OIL-SAMPLE", "failed_only"),
    ]
    assert first["positions"][1]["reports"] == ["IAD06-TX6-01A/TX6-01A__2.pdf"]
    assert [cell["result"] for cell in second["positions"]] == ["pass", "pass"]
    assert second["positions"][1]["reports"] == ["IAD06-TX6-01B/TX6-01B.pdf"]
    assert not second["issue_counts"]
    assert all(report["suggested_gc_name"] is None for report in first["reports"] + second["reports"])
    assert third["positions"][1]["result"] == "missing"
