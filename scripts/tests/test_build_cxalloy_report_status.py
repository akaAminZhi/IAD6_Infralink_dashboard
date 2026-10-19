from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

import pytest

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


@pytest.mark.parametrize("change, expected", [("unchanged", "uploaded"), ("changed", "pending"), ("missing", "missing_pdf")])
def test_multiple_sources_for_one_pdf_use_unique_package_hash(
    tmp_path: Path, change: str, expected: str,
) -> None:
    equipment = tmp_path / "equipment.pdf"
    cable = tmp_path / "FDR.pdf"
    equipment.write_bytes(b"equipment report")
    cable.write_bytes(b"shared feeder report")
    rows = [
        {"device_name": "IAD06-CDS6-03R-2", "source_path": "source/equipment.pdf",
         "output_path": equipment.name, "status": "copied"},
        *[{"device_name": "IAD06-CDS6-03R-2", "source_path": f"source/feeder-{index}.pdf",
           "output_path": cable.name, "status": "skipped_existing"} for index in range(4)],
    ]
    upload = {"target_equipment": "CDS6-03R-2", "status": "uploaded",
              "sha256": uploader_group_hash([equipment, cable]),
              "source_path": "; ".join(row["source_path"] for row in rows),
              "pdf_path": f"{equipment.name}; {cable.name}"}
    rename_manifest, upload_manifest = tmp_path / "rename.csv", tmp_path / "upload.csv"
    write_csv(rename_manifest, list(rows[0]), rows)
    write_csv(upload_manifest, list(upload), [upload])
    if change == "changed":
        cable.write_bytes(b"changed feeder report")
    elif change == "missing":
        cable.unlink()

    payload = build_cxalloy_report_status(rename_manifest, upload_manifest, tmp_path)
    record = payload["records"][0]
    assert record["upload_status"] == expected
    assert record["expected_report_count"] == 2
    assert record["available_report_count"] == (1 if change == "missing" else 2)
    assert record["report_names"] == ["equipment.pdf", "FDR.pdf"]
    assert record["missing_report_names"] == (["FDR.pdf"] if change == "missing" else [])
    assert payload["summary"]["expected_report_files"] == 2
    if change == "unchanged":
        assert record["current_sha256"] == upload["sha256"]


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


def test_duplicate_pdf_content_under_new_source_does_not_become_pending(tmp_path: Path) -> None:
    first = tmp_path / "original.pdf"
    duplicate = tmp_path / "renamed.pdf"
    first.write_bytes(b"same report")
    duplicate.write_bytes(b"same report")
    rename_manifest = tmp_path / "rename.csv"
    upload_manifest = tmp_path / "upload.csv"
    rows = [{"device_name": "IAD06-PDU6-01A-1", "source_path": source,
             "output_path": path.name, "status": "copied"}
            for source, path in [("source/first.pdf", first), ("source/second.pdf", duplicate)]]
    write_csv(rename_manifest, list(rows[0]), rows)
    uploaded = {"target_equipment": "PDU6-01A-1", "source_path": "source/first.pdf",
                "pdf_path": first.name, "sha256": uploader_group_hash([first]), "status": "uploaded"}
    write_csv(upload_manifest, list(uploaded), [uploaded])
    payload = build_cxalloy_report_status(rename_manifest, upload_manifest, tmp_path)
    assert payload["summary"]["uploaded_equipment"] == 1
    assert payload["summary"]["pending_equipment"] == 0


def test_prior_status_preserves_uploaded_hash_across_machines(tmp_path: Path) -> None:
    gc_dir = tmp_path / "NETA_eport_To_GC" / "IAD06-PDU6-01A-1"
    report = gc_dir / "report.pdf"
    gc_dir.mkdir(parents=True)
    report.write_bytes(b"same report on both machines")
    rename_manifest = tmp_path / "NETA_eport_To_GC" / "rename_manifest.csv"
    upload_manifest = tmp_path / "NETA_eport_To_GC" / "missing_upload_manifest.csv"
    prior_status = tmp_path / "cxalloy_report_status.json"
    write_csv(
        rename_manifest,
        ["device_name", "output_path", "status"],
        [
            {
                "device_name": "IAD06-PDU6-01A-1",
                "output_path": str(report.relative_to(tmp_path)),
                "status": "copied",
            }
        ],
    )
    current_hash = uploader_group_hash([report])
    prior_status.write_text(
        json.dumps(
            {
                "records": [
                    {
                        "equipment_id": "IAD06-PDU6-01A-1",
                        "target_equipment": "PDU6-01A-1",
                        "upload_status": "uploaded",
                        "current_sha256": current_hash,
                        "last_attempt_status": "uploaded",
                        "last_attempt_at": "2026-08-06T09:00:00-04:00",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    payload = build_cxalloy_report_status(
        rename_manifest,
        upload_manifest,
        tmp_path,
        prior_status_manifest=prior_status,
    )

    assert payload["summary"]["uploaded_equipment"] == 1
    assert payload["records"][0]["upload_status"] == "uploaded"
    assert payload["records"][0]["last_attempt_status"] == "uploaded"

    report.write_bytes(b"updated report must be uploaded again")
    changed = build_cxalloy_report_status(
        rename_manifest,
        upload_manifest,
        tmp_path,
        prior_status_manifest=prior_status,
    )
    assert changed["records"][0]["upload_status"] == "pending"


@pytest.mark.parametrize(
    "change, expected",
    [
        ("renamed", "uploaded"),
        ("skipped_existing_on_site", "uploaded"),
        ("content", "pending"),
        ("added", "pending"),
        ("removed", "pending"),
        ("duplicate_source", "pending"),
        ("missing_source", "pending"),
        ("incomplete_paths", "pending"),
        ("failed", "pending"),
        ("other_target", "pending"),
        ("missing_pdf", "missing_pdf"),
    ],
)
def test_uploaded_reports_survive_renaming_only(
    tmp_path: Path, change: str, expected: str,
) -> None:
    first = tmp_path / "first.pdf"
    second = tmp_path / "second.pdf"
    first.write_bytes(b"first report")
    second.write_bytes(b"second report")
    uploaded_hash = uploader_group_hash([first, second])
    first.rename(tmp_path / "first__2.pdf")
    second.rename(tmp_path / "second__9.pdf")
    # Current manifest order differs from the uploaded package order.
    rows = [
        {"device_name": "IAD06-PDU6-03D-4", "source_path": "downloads/02.pdf",
         "output_path": "second__9.pdf", "status": "copied"},
        {"device_name": "IAD06-PDU6-03D-4", "source_path": "downloads/01.pdf",
         "output_path": "first__2.pdf", "status": "skipped_existing"},
    ]
    upload = {
        "target_equipment": "PDU6-03D-4", "sha256": uploaded_hash,
        "source_path": r"downloads\01.pdf; downloads\02.pdf",
        "pdf_path": r"C:\remote\first.pdf; C:\remote\second.pdf",
        "status": "uploaded",
    }
    if change == "content":
        (tmp_path / "first__2.pdf").write_bytes(b"changed report")
    elif change == "added":
        (tmp_path / "extra.pdf").write_bytes(b"extra")
        rows.append({**rows[0], "source_path": "downloads/03.pdf", "output_path": "extra.pdf"})
    elif change == "removed":
        rows.pop()
    elif change == "duplicate_source":
        rows[1]["source_path"] = rows[0]["source_path"]
    elif change == "missing_source":
        rows[1]["source_path"] = ""
    elif change == "incomplete_paths":
        upload["pdf_path"] = r"C:\remote\first.pdf"
    elif change == "failed":
        upload["status"] = "upload_failed"
    elif change == "other_target":
        upload["target_equipment"] = "PDU6-03D-6"
    elif change == "skipped_existing_on_site":
        upload["status"] = change
    elif change == "missing_pdf":
        (tmp_path / "first__2.pdf").unlink()
    rename_manifest = tmp_path / "rename.csv"
    upload_manifest = tmp_path / "upload.csv"
    write_csv(rename_manifest, list(rows[0]), rows)
    write_csv(upload_manifest, list(upload), [upload])
    payload = build_cxalloy_report_status(rename_manifest, upload_manifest, tmp_path)
    assert payload["records"][0]["upload_status"] == expected


@pytest.mark.parametrize("cable_kind", ["LV_CABLE", "MV_CABLE"])
def test_downloaded_cables_have_independent_verified_upload_status(
    tmp_path: Path, cable_kind: str,
) -> None:
    equipment, old_cable, new_cable = [tmp_path / name for name in (
        "equipment.pdf", "old-cable.pdf", "ATR-REMARK.pdf",
    )]
    for path in (equipment, old_cable, new_cable):
        path.write_bytes(path.name.encode())
    rows = [
        {"device_name": "IAD06-MDS6-01D", "source_path": f"downloads/{path.name}",
         "output_path": path.name, "parsed_source": kind, "status": "copied"}
        for path, kind in ((equipment, "OCR_ASSET"), (old_cable, cable_kind), (new_cable, cable_kind))
    ]
    # Two cable references can share a physical PDF, regardless of its filename.
    rows.append({**rows[-1], "source_path": "downloads/another-cable-reference.pdf"})
    rename_manifest, upload_manifest = tmp_path / "rename.csv", tmp_path / "upload.csv"
    write_csv(rename_manifest, list(rows[0]), rows)
    uploaded = {
        "target_equipment": "MDS6-01D", "status": "uploaded",
        "source_path": ";".join(row["source_path"] for row in rows[:2]),
        "pdf_path": f"{equipment.name};{old_cable.name}",
        "sha256": uploader_group_hash([equipment, old_cable]),
    }
    failed = {**uploaded, "status": "upload_failed", "source_path": rows[2]["source_path"],
              "pdf_path": new_cable.name, "sha256": uploader_group_hash([new_cable])}
    write_csv(upload_manifest, list(uploaded), [uploaded, failed])

    record = build_cxalloy_report_status(rename_manifest, upload_manifest, tmp_path)["records"][0]
    reports = {report["report_name"]: report for report in record["reports"]}
    assert record["upload_status"] == "pending"
    assert len(reports) == 3
    assert reports[equipment.name]["report_kind"] == "equipment"
    assert reports[equipment.name]["upload_status"] == "uploaded"
    assert reports[old_cable.name]["report_kind"] == "cable"
    assert reports[old_cable.name]["upload_status"] == "uploaded"
    assert reports[new_cable.name]["report_kind"] == "cable"
    assert reports[new_cable.name]["upload_status"] == "pending"

    # Preserve proven file contents even if history is absent on another machine,
    # new cables arrive, or already-uploaded files are renamed locally.
    prior_status = tmp_path / "prior.json"
    prior_status.write_text(json.dumps({"records": [record]}), encoding="utf-8")
    write_csv(upload_manifest, list(uploaded), [])
    equipment.rename(tmp_path / "equipment-renamed.pdf")
    rows[0]["output_path"] = "equipment-renamed.pdf"
    write_csv(rename_manifest, list(rows[0]), rows)
    rebuilt = build_cxalloy_report_status(
        rename_manifest, upload_manifest, tmp_path, prior_status,
    )["records"][0]
    statuses = {report["report_name"]: report["upload_status"] for report in rebuilt["reports"]}
    assert statuses == {"equipment-renamed.pdf": "uploaded", "old-cable.pdf": "uploaded", "ATR-REMARK.pdf": "pending"}

    (tmp_path / "equipment-renamed.pdf").write_bytes(b"changed contents")
    old_cable.unlink()
    changed = build_cxalloy_report_status(
        rename_manifest, upload_manifest, tmp_path, prior_status,
    )["records"][0]
    statuses = {report["report_name"]: report["upload_status"] for report in changed["reports"]}
    assert statuses["equipment-renamed.pdf"] != "uploaded"
    assert statuses[old_cable.name] == "missing_pdf"


def test_changed_historical_pdf_needs_review_and_other_targets_do_not_prove_upload(tmp_path: Path) -> None:
    report = tmp_path / "cable.pdf"
    report.write_bytes(b"old contents")
    old_hash = uploader_group_hash([report])
    report.write_bytes(b"new contents")
    row = {"device_name": "IAD06-EQ-1", "source_path": "source/cable.pdf",
           "output_path": report.name, "parsed_source": "LV_CABLE", "status": "copied"}
    upload = {"target_equipment": "EQ-1", "source_path": row["source_path"],
              "pdf_path": report.name, "sha256": old_hash, "status": "uploaded"}
    rename_manifest, upload_manifest = tmp_path / "rename.csv", tmp_path / "upload.csv"
    write_csv(rename_manifest, list(row), [row])
    write_csv(upload_manifest, list(upload), [upload, {
        **upload, "target_equipment": "EQ-OTHER", "sha256": uploader_group_hash([report]),
    }])
    record = build_cxalloy_report_status(rename_manifest, upload_manifest, tmp_path)["records"][0]
    assert record["reports"][0]["upload_status"] == "review_required"


@pytest.mark.parametrize("case, expected", [
    ("wrong_answer", "pending"),
    ("correct_answer", "uploaded"),
    ("not_found", "pending"),
    ("cache_only_not_found", "pending"),
    ("upload_failed", "uploaded"),
    ("auth_required", "uploaded"),
    ("recovered_upload", "uploaded"),
    ("recovered_site_check", "uploaded"),
])
def test_bad_history_revokes_package_and_per_file_caches(tmp_path: Path, case: str, expected: str) -> None:
    report = tmp_path / "IAD06-TX-HTP6-01E.pdf"
    report.write_bytes(b"equipment NETA report")
    source = "downloads/neta_reports/TX/report.pdf"
    row = {"device_name": "IAD06-TX-HTP6-01E", "source_path": source,
           "output_path": report.name, "parsed_source": "ASSET", "status": "copied"}
    success = {"target_equipment": "TX-HTP6-01E", "source_path": source,
               "pdf_path": str(report), "sha256": uploader_group_hash([report]),
               "status": "uploaded", "error": "", "uploaded_at": "2026-06-30T06:50:23-04:00"}
    skip = {**success, "status": "skipped_manifest_uploaded", "uploaded_at": "2026-10-19T08:00:00-04:00"}
    rows = [success]
    if case in {"wrong_answer", "correct_answer"}:
        rows[0] = {**success, "status": "skipped_existing_on_site",
                   "pdf_path": r"C:\old\IAD06-TX-HTP6-01E.pdf",
                   "error": f"CxAlloy row already has answer file: {'IAD06-ATS-TX-HTP6-01E.pdf' if case == 'wrong_answer' else report.name}."}
    else:
        failure = "equipment_not_found" if case not in {"upload_failed", "auth_required"} else case
        rows.append({**success, "status": failure, "error": failure,
                     "uploaded_at": "2026-10-19T07:21:52-04:00"})
    rows.append(skip)
    if case.startswith("recovered_"):
        recovery = "uploaded" if case == "recovered_upload" else "skipped_existing_on_site"
        rows.append({**success, "status": recovery, "uploaded_at": "2026-10-19T09:00:00-04:00"})
    rename_manifest, upload_manifest, prior = [tmp_path / name for name in ("rename.csv", "upload.csv", "prior.json")]
    write_csv(rename_manifest, list(row), [row])
    write_csv(upload_manifest, list(success), [] if case == "cache_only_not_found" else rows)
    # Both caches are deliberately stale: neither may override raw invalidation.
    cached = {"equipment_id": row["device_name"], "upload_status": "uploaded",
              "current_sha256": success["sha256"], "report_names": [report.name],
              "last_attempt_status": "equipment_not_found" if case == "cache_only_not_found" else "uploaded",
              "reports": [{"report_name": report.name, "report_kind": "equipment", "upload_status": "uploaded",
                           "sha256": hashlib.sha256(report.read_bytes()).hexdigest()}]}
    prior.write_text(json.dumps({"records": [cached]}), encoding="utf-8")
    for _ in range(2):
        payload = build_cxalloy_report_status(rename_manifest, upload_manifest, tmp_path, prior)
        record = payload["records"][0]
        assert record["upload_status"] == expected
        assert record["reports"][0]["upload_status"] == expected
        prior.write_text(json.dumps(payload), encoding="utf-8")
