from __future__ import annotations

import csv

from scripts.etl import build_issue_attachment_manifest as issue_manifest
from scripts.etl import build_neta_report_manifest as neta_manifest


def test_issue_attachment_manifest_filters_fields_and_classifies_files(
    tmp_path,
    monkeypatch,
) -> None:
    source = tmp_path / "issue_case_images"
    (source / "CASE-1" / "Issue Image").mkdir(parents=True)
    (source / "CASE-1" / "Corrective Images").mkdir(parents=True)
    (source / "CASE-1" / "Other").mkdir(parents=True)
    (source / "CASE-1" / "Issue Image" / "image one.jpg").write_bytes(b"jpg")
    (source / "CASE-1" / "Corrective Images" / "repair.pdf").write_bytes(b"pdf")
    (source / "CASE-1" / "Other" / "ignored.txt").write_text("ignore")
    monkeypatch.setattr(issue_manifest, "SOURCE_DIRECTORY", source)
    monkeypatch.setattr(issue_manifest, "PUBLIC_DIRECTORY", tmp_path / "public")
    monkeypatch.setattr(
        issue_manifest,
        "create_public_directory_link",
        lambda: {"status": "created"},
    )

    manifest = issue_manifest.build_issue_attachment_manifest()

    assert [record["attachment_kind"] for record in manifest["records"]] == [
        "pdf",
        "image",
    ]
    assert {record["field"] for record in manifest["records"]} == {
        "Issue Image",
        "Corrective Images",
    }
    assert any("%20" in record["url"] for record in manifest["records"])


def test_neta_manifest_links_original_and_gc_names(tmp_path, monkeypatch) -> None:
    original = tmp_path / "downloads" / "neta_reports"
    gc = tmp_path / "NETA_eport_To_GC"
    (original / "IAD06-EQ-1").mkdir(parents=True)
    gc.mkdir(parents=True)
    (original / "IAD06-EQ-1" / "Original Report.pdf").write_bytes(b"pdf")
    (gc / "GC-Report.pdf").write_bytes(b"pdf")
    with (gc / "rename_manifest.csv").open(
        "w",
        encoding="utf-8",
        newline="",
    ) as manifest_file:
        writer = csv.DictWriter(
            manifest_file,
            fieldnames=["output_path", "source_path"],
        )
        writer.writeheader()
        writer.writerow(
            {
                "output_path": "NETA_eport_To_GC/GC-Report.pdf",
                "source_path": "downloads/IAD06-EQ-1/Original Report.pdf",
            }
        )

    sources = [
        {
            "source_key": "downloaded",
            "source_label": "Original",
            "directory": original,
            "public_directory": tmp_path / "public-original",
            "url_base": "/neta-reports",
        },
        {
            "source_key": "gc",
            "source_label": "GC",
            "directory": gc,
            "public_directory": tmp_path / "public-gc",
            "url_base": "/neta-reports-gc",
        },
    ]
    monkeypatch.setattr(neta_manifest, "SOURCE_DEFINITIONS", sources)
    monkeypatch.setattr(
        neta_manifest,
        "create_public_directory_link",
        lambda public_directory, source_directory: {"status": "created"},
    )

    manifest = neta_manifest.build_neta_report_manifest()

    assert len(manifest["records"]) == 2
    original_record = next(
        record
        for record in manifest["records"]
        if record["source_key"] == "downloaded"
    )
    gc_record = next(
        record for record in manifest["records"] if record["source_key"] == "gc"
    )
    assert original_record["equipment_id"] == "IAD06-EQ-1"
    assert gc_record["source_report_name"] == "Original Report.pdf"
    assert gc_record["url"] == "/neta-reports-gc/GC-Report.pdf"
