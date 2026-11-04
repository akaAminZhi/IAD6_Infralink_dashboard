from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest

from scripts.etl import build_neta_report_manifest as builder


def pdf(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"%PDF-1.4\nfixture\n%%EOF")


@pytest.fixture
def tracker(tmp_path, monkeypatch):
    root = tmp_path / "tracker"
    monkeypatch.delenv("IAD6_EPS_TRACKER_ROOT", raising=False)
    monkeypatch.setattr(builder, "SOURCE_DEFINITIONS", [
        {"source_key": key, "source_label": label, "directory": root / directory,
         "public_directory": tmp_path / "public" / public, "url_base": f"/{public}"}
        for key, label, directory, public in [
            ("downloaded", "Original", "downloads/neta_reports", "neta-reports"),
            ("gc", "GC", "NETA_eport_To_GC", "neta-reports-gc"),
        ]
    ])
    monkeypatch.setattr(builder, "create_public_directory_link", lambda *_: {"status": "created"})
    return root


def state(root: Path, **entry) -> None:
    path = root / "downloads/neta_reports/neta_lifecycle.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"version": 1, "devices": {"eq-1": entry}}), encoding="utf-8")


def rename(root: Path, rows: list[dict[str, str]]) -> None:
    path = root / "NETA_eport_To_GC/rename_manifest.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["source_path", "output_path", "device_name"])
        writer.writeheader()
        writer.writerows(rows)


def test_temporary_reports_map_equipment_and_gc_names_and_exclude_internal_files(tracker):
    original = tracker / "downloads/neta_reports"
    gc = tracker / "NETA_eport_To_GC"
    name = "报告 #1.PDF"
    pdf(original / "_temporary/EQ-1" / name)
    pdf(gc / "_temporary/EQ-1/GC report.pdf")
    pdf(gc / "_temporary/EQ-2/unmapped.pdf")
    for path in ["_staging/EQ-1/a.pdf", "_backups/EQ-1/a.pdf", "_archive/EQ-1/a.pdf",
                 "_replacement/EQ-1/a.pdf", "_temporary/EQ-1/_backup/a.pdf",
                 "_temporary/orphan.pdf", "_quarantine_bad_downloads_1/a.pdf"]:
        pdf(original / path)
    rename(tracker, [{"source_path": f"downloads/neta_reports/_temporary/EQ-1/{name}",
                      "output_path": "NETA_eport_To_GC/_temporary/EQ-1/GC report.pdf"}])
    records = builder.build_neta_report_manifest()["records"]
    assert len(records) == 3
    assert all(r["report_stage"] == "temporary" for r in records)
    assert {r["equipment_id"] for r in records} == {"EQ-1", "EQ-2"}
    assert next(r for r in records if r["report_name"] == "GC report.pdf")["source_report_name"] == name
    assert "%20%231.PDF" in records[0]["url"]
    assert next(r for r in records if r["equipment_id"] == "EQ-2")["source_report_name"] == "unmapped.pdf"


@pytest.mark.parametrize("stage,download_ready,formal_ready,expected", [
    ("temporary", True, True, ["temporary", "temporary"]),
    ("formal", False, False, ["temporary", "temporary"]),
    ("formal", True, False, ["formal", "temporary"]),
    ("formal", True, True, ["formal", "formal"]),
])
def test_ready_formal_reports_replace_only_their_temporary_counterparts(
    tracker, stage, download_ready, formal_ready, expected,
):
    for folder in ["downloads/neta_reports", "NETA_eport_To_GC"]:
        for prefix in ["", "_temporary/"]:
            pdf(tracker / folder / prefix / "EQ-1/report.pdf")
    state(tracker, report_stage=stage, download_ready=download_ready, formal_ready=formal_ready)
    records = builder.build_neta_report_manifest()["records"]
    assert [r["report_stage"] for r in records] == expected
    # Cleanup performed by Tracker is reflected by the next index build.
    if formal_ready and stage == "formal":
        for folder in ["downloads/neta_reports", "NETA_eport_To_GC"]:
            (tracker / folder / "_temporary/EQ-1/report.pdf").unlink()
        assert builder.build_neta_report_manifest()["records"] == records


def test_legacy_formal_and_same_name_other_device_survive(tracker):
    original = tracker / "downloads/neta_reports"
    pdf(original / "EQ-1/report.pdf")
    pdf(original / "_temporary/EQ-1/report.pdf")
    pdf(original / "_temporary/EQ-2/report.pdf")
    records = builder.build_neta_report_manifest()["records"]
    assert {(r["equipment_id"], r["report_stage"]) for r in records} == {
        ("EQ-1", "formal"), ("EQ-2", "temporary"),
    }
    (original / "EQ-1/report.pdf").unlink()
    assert all(r["report_stage"] == "temporary" for r in builder.build_neta_report_manifest()["records"])


def test_environment_root_and_absolute_gc_mapping(tracker, tmp_path, monkeypatch):
    other = tmp_path / "configured-tracker"
    output = other / "NETA_eport_To_GC/_temporary/EQ-1/GC.pdf"
    pdf(output)
    rename(other, [{"source_path": str(other / "downloads/neta_reports/_temporary/EQ-1/original.pdf"),
                    "output_path": str(output), "device_name": "EQ-1"}])
    monkeypatch.setenv("IAD6_EPS_TRACKER_ROOT", str(other))
    manifest = builder.build_neta_report_manifest()
    assert len(manifest["records"]) == 1
    assert manifest["records"][0]["source_report_name"] == "original.pdf"
    assert manifest["source_directories"]["downloaded"]["path"].startswith(str(other))


def test_invalid_lifecycle_fails_instead_of_publishing_unready_formal(tracker):
    path = tracker / "downloads/neta_reports/neta_lifecycle.json"
    path.parent.mkdir(parents=True)
    path.write_text('{"version": 2, "devices": {}}', encoding="utf-8")
    with pytest.raises(ValueError, match="Invalid NETA lifecycle"):
        builder.build_neta_report_manifest()


def test_gc_renames_share_identity_and_flat_legacy_files_keep_device_ownership(tracker):
    gc = tracker / "NETA_eport_To_GC"
    paths = ["_temporary/EQ-1/old-name.pdf", "EQ-1/new-name.pdf", "flat-legacy.pdf"]
    for path in paths:
        pdf(gc / path)
    rename(tracker, [{"source_path": "downloads/neta_reports/EQ-1/original.pdf",
                      "output_path": f"NETA_eport_To_GC/{path}", "device_name": "EQ-1"} for path in paths])
    state(tracker, report_stage="formal", download_ready=True, formal_ready=True)
    rows = builder.build_neta_report_manifest()["records"]
    assert {r["report_name"] for r in rows} == {"new-name.pdf", "flat-legacy.pdf"}
    assert all(r["equipment_id"] == "EQ-1" and r["source_report_name"] == "original.pdf" for r in rows)


def test_conflicting_public_directory_requires_correct_target(tmp_path):
    public = tmp_path / "public"
    source = tmp_path / "source"
    public.mkdir()
    source.mkdir()
    with pytest.raises(ValueError, match="different location"):
        builder.create_public_directory_link(public, source)
