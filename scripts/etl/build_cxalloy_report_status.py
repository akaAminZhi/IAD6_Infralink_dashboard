"""Build current CxAlloy upload status for GC-organized NETA reports."""

from __future__ import annotations

import csv
import hashlib
import os
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

try:
    from .json_utils import file_metadata, write_json as write_json_payload
except ImportError:
    from json_utils import file_metadata, write_json as write_json_payload


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TRACKER_ROOT = PROJECT_ROOT.parent / "IAD6_EPS_Testing_Tracker"
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
OUTPUT_PATH = DATA_DIR / "cxalloy_report_status.json"
VALID_RENAME_STATUSES = {"copied", "skipped_existing"}
COMPLETED_UPLOAD_STATUSES = {"uploaded", "skipped_existing_on_site"}


def clean(value: object) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def get_tracker_root() -> Path:
    configured = os.environ.get("IAD6_EPS_TRACKER_ROOT")
    return Path(configured).expanduser().resolve() if configured else DEFAULT_TRACKER_ROOT


def resolve_manifest_path(value: str, tracker_root: Path) -> Path:
    path = Path(clean(value))
    return path if path.is_absolute() else tracker_root / path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def combined_sha256(files: Iterable[tuple[Path, str]]) -> str:
    digest = hashlib.sha256()
    for path, file_hash in sorted(files, key=lambda item: item[0].name.casefold()):
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(file_hash.encode("ascii"))
        digest.update(b"\0")
    return digest.hexdigest()


def canonical_equipment_id(value: object) -> str:
    equipment_id = clean(value)
    if equipment_id and not equipment_id.upper().startswith("IAD06-"):
        return f"IAD06-{equipment_id}"
    return equipment_id


def target_equipment(value: object) -> str:
    equipment_id = canonical_equipment_id(value)
    return equipment_id[6:] if equipment_id.upper().startswith("IAD06-") else equipment_id


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def latest_attempts_by_target(rows: Iterable[dict[str, str]]) -> dict[str, dict[str, str]]:
    latest: dict[str, dict[str, str]] = {}
    for row in rows:
        target = target_equipment(row.get("target_equipment") or row.get("device_name"))
        if not target:
            continue
        key = target.casefold()
        current = latest.get(key)
        timestamp = clean(row.get("uploaded_at"))
        if current is None or timestamp >= clean(current.get("uploaded_at")):
            latest[key] = row
    return latest


def completed_upload_keys(rows: Iterable[dict[str, str]]) -> set[tuple[str, str]]:
    keys: set[tuple[str, str]] = set()
    for row in rows:
        status = clean(row.get("status")).casefold()
        target = target_equipment(row.get("target_equipment") or row.get("device_name"))
        digest = clean(row.get("sha256"))
        if status in COMPLETED_UPLOAD_STATUSES and target and digest:
            keys.add((target.casefold(), digest))
    return keys


def build_cxalloy_report_status(
    rename_manifest: Path,
    upload_manifest: Path,
    tracker_root: Path,
) -> dict[str, Any]:
    grouped_rows: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in read_csv_rows(rename_manifest):
        if clean(row.get("status")).casefold() not in VALID_RENAME_STATUSES:
            continue
        device_name = canonical_equipment_id(row.get("device_name"))
        output_path = clean(row.get("output_path"))
        if device_name and output_path:
            grouped_rows[device_name].append(row)

    upload_rows = read_csv_rows(upload_manifest)
    completed_keys = completed_upload_keys(upload_rows)
    latest_attempts = latest_attempts_by_target(upload_rows)
    records: list[dict[str, Any]] = []

    for device_name in sorted(grouped_rows, key=str.casefold):
        target = target_equipment(device_name)
        existing_files: list[tuple[Path, str]] = []
        report_names: list[str] = []
        missing_report_names: list[str] = []

        for row in grouped_rows[device_name]:
            report_path = resolve_manifest_path(clean(row.get("output_path")), tracker_root)
            report_names.append(report_path.name)
            if report_path.exists() and report_path.is_file() and report_path.stat().st_size > 0:
                existing_files.append((report_path, sha256_file(report_path)))
            else:
                missing_report_names.append(report_path.name)

        report_names.sort(key=str.casefold)
        missing_report_names.sort(key=str.casefold)
        current_hash = combined_sha256(existing_files) if existing_files else None
        uploaded = bool(
            current_hash
            and not missing_report_names
            and (target.casefold(), current_hash) in completed_keys
        )
        latest_attempt = latest_attempts.get(target.casefold(), {})

        records.append(
            {
                "equipment_id": device_name,
                "target_equipment": target,
                "upload_status": (
                    "uploaded"
                    if uploaded
                    else "missing_pdf"
                    if missing_report_names
                    else "pending"
                ),
                "expected_report_count": len(report_names),
                "available_report_count": len(existing_files),
                "report_names": report_names,
                "missing_report_names": missing_report_names,
                "current_sha256": current_hash,
                "last_attempt_status": clean(latest_attempt.get("status")) or None,
                "last_attempt_error": clean(latest_attempt.get("error")) or None,
                "last_attempt_at": clean(latest_attempt.get("uploaded_at")) or None,
            }
        )

    uploaded_count = sum(record["upload_status"] == "uploaded" for record in records)
    pending_count = sum(record["upload_status"] != "uploaded" for record in records)
    missing_pdf_count = sum(record["upload_status"] == "missing_pdf" for record in records)

    return {
        "generated_at": datetime.now().astimezone().isoformat(),
        "source_files": {
            "rename_manifest": file_metadata(rename_manifest) if rename_manifest.exists() else None,
            "upload_manifest": file_metadata(upload_manifest) if upload_manifest.exists() else None,
        },
        "summary": {
            "equipment_with_gc_reports": len(records),
            "uploaded_equipment": uploaded_count,
            "pending_equipment": pending_count,
            "missing_pdf_equipment": missing_pdf_count,
            "expected_report_files": sum(record["expected_report_count"] for record in records),
        },
        "records": records,
    }


def main() -> None:
    tracker_root = get_tracker_root()
    gc_directory = tracker_root / "NETA_eport_To_GC"
    rename_manifest = gc_directory / "rename_manifest.csv"
    upload_manifest = gc_directory / "cxalloy_upload_manifest.csv"

    payload = build_cxalloy_report_status(rename_manifest, upload_manifest, tracker_root)
    write_json_payload(OUTPUT_PATH, payload)
    summary = payload["summary"]
    print(f"Wrote CxAlloy report status to {OUTPUT_PATH}")
    print(
        "CxAlloy report equipment uploaded / pending: "
        f"{summary['uploaded_equipment']} / {summary['pending_equipment']}"
    )


if __name__ == "__main__":
    main()
