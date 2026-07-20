from __future__ import annotations

import csv
import hashlib
from pathlib import Path

from scripts.etl.build_cxalloy_report_status import build_cxalloy_report_status


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def uploader_group_hash(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths, key=lambda item: item.name.casefold()):
        file_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(file_hash.encode("ascii"))
        digest.update(b"\0")
    return digest.hexdigest()


def test_current_hash_controls_uploaded_status(tmp_path: Path) -> None:
    gc_dir = tmp_path / "NETA_eport_To_GC" / "IAD06-PDU6-01A-1"
    first = gc_dir / "first.pdf"
    second = gc_dir / "second.pdf"
    gc_dir.mkdir(parents=True)
    first.write_bytes(b"first")
    second.write_bytes(b"second")
    rename_manifest = tmp_path / "NETA_eport_To_GC" / "rename_manifest.csv"
    upload_manifest = tmp_path / "NETA_eport_To_GC" / "cxalloy_upload_manifest.csv"
    rename_fields = ["device_name", "output_path", "status"]
    write_csv(
        rename_manifest,
        rename_fields,
        [
            {
                "device_name": "IAD06-PDU6-01A-1",
                "output_path": str(first.relative_to(tmp_path)),
                "status": "copied",
            },
            {
                "device_name": "IAD06-PDU6-01A-1",
                "output_path": str(second.relative_to(tmp_path)),
                "status": "skipped_existing",
            },
        ],
    )
    upload_fields = ["target_equipment", "sha256", "status", "error", "uploaded_at"]
    write_csv(
        upload_manifest,
        upload_fields,
        [
            {
                "target_equipment": "PDU6-01A-1",
                "sha256": uploader_group_hash([first, second]),
                "status": "uploaded",
                "error": "",
                "uploaded_at": "2026-07-16T10:00:00-04:00",
            }
        ],
    )

    payload = build_cxalloy_report_status(rename_manifest, upload_manifest, tmp_path)

    assert payload["summary"]["uploaded_equipment"] == 1
    assert payload["records"][0]["upload_status"] == "uploaded"
    assert payload["records"][0]["expected_report_count"] == 2

    second.write_bytes(b"updated report")
    changed = build_cxalloy_report_status(rename_manifest, upload_manifest, tmp_path)
    assert changed["summary"]["pending_equipment"] == 1
    assert changed["records"][0]["upload_status"] == "pending"


def test_missing_pdf_and_latest_failure_are_preserved(tmp_path: Path) -> None:
    rename_manifest = tmp_path / "NETA_eport_To_GC" / "rename_manifest.csv"
    upload_manifest = tmp_path / "NETA_eport_To_GC" / "cxalloy_upload_manifest.csv"
    write_csv(
        rename_manifest,
        ["device_name", "output_path", "status"],
        [
            {
                "device_name": "ATS6-01A-1",
                "output_path": "NETA_eport_To_GC/IAD06-ATS6-01A-1/missing.pdf",
                "status": "copied",
            }
        ],
    )
    write_csv(
        upload_manifest,
        ["target_equipment", "sha256", "status", "error", "uploaded_at"],
        [
            {
                "target_equipment": "ATS6-01A-1",
                "sha256": "old",
                "status": "upload_failed",
                "error": "Could not save file.",
                "uploaded_at": "2026-07-16T11:00:00-04:00",
            }
        ],
    )

    payload = build_cxalloy_report_status(rename_manifest, upload_manifest, tmp_path)
    record = payload["records"][0]

    assert record["equipment_id"] == "IAD06-ATS6-01A-1"
    assert record["upload_status"] == "missing_pdf"
    assert record["missing_report_names"] == ["missing.pdf"]
    assert record["last_attempt_status"] == "upload_failed"
    assert record["last_attempt_error"] == "Could not save file."


def test_missing_manifests_produce_empty_status(tmp_path: Path) -> None:
    payload = build_cxalloy_report_status(
        tmp_path / "missing_rename.csv",
        tmp_path / "missing_upload.csv",
        tmp_path,
    )

    assert payload["records"] == []
    assert payload["summary"]["pending_equipment"] == 0
