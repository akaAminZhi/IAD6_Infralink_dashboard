"""Build a browser-linkable manifest for downloaded issue case attachments."""

from __future__ import annotations

import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

try:
    from .json_utils import file_metadata, write_json as write_json_payload
except ImportError:
    from json_utils import file_metadata, write_json as write_json_payload


PROJECT_ROOT = Path(__file__).resolve().parents[2]
TRACKER_ROOT = PROJECT_ROOT.parent / "IAD6_EPS_Testing_Tracker"
SOURCE_DIRECTORY = TRACKER_ROOT / "downloads" / "issue_case_images"
PUBLIC_DIRECTORY = PROJECT_ROOT / "frontend" / "public" / "issue-case-images"
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
OUTPUT_PATH = DATA_DIR / "issue_attachment_manifest.json"
PUBLIC_URL_BASE = "/issue-case-images"
SUPPORTED_FIELDS = {"Issue Image", "Corrective Images"}


def make_url(relative_path: Path) -> str:
    encoded_parts = [quote(part) for part in relative_path.parts]
    return f"{PUBLIC_URL_BASE}/{'/'.join(encoded_parts)}"


def create_public_directory_link() -> dict[str, Any]:
    if PUBLIC_DIRECTORY.exists():
        return {
            "path": str(PUBLIC_DIRECTORY),
            "target": str(SOURCE_DIRECTORY),
            "status": "exists",
        }

    PUBLIC_DIRECTORY.parent.mkdir(parents=True, exist_ok=True)
    try:
        if os.name == "nt":
            result = subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(PUBLIC_DIRECTORY), str(SOURCE_DIRECTORY)],
                check=True,
                capture_output=True,
                text=True,
            )
            message = result.stdout.strip()
        else:
            PUBLIC_DIRECTORY.symlink_to(SOURCE_DIRECTORY, target_is_directory=True)
            message = "created symlink"
    except Exception as exc:  # noqa: BLE001 - ETL should report link setup failures.
        return {
            "path": str(PUBLIC_DIRECTORY),
            "target": str(SOURCE_DIRECTORY),
            "status": "failed",
            "error": f"{type(exc).__name__}: {exc}",
        }

    return {
        "path": str(PUBLIC_DIRECTORY),
        "target": str(SOURCE_DIRECTORY),
        "status": "created",
        "message": message,
    }


def get_attachment_kind(file_path: Path) -> str:
    suffix = file_path.suffix.casefold()
    if suffix in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}:
        return "image"
    if suffix == ".pdf":
        return "pdf"
    return "file"


def build_records() -> list[dict[str, Any]]:
    if not SOURCE_DIRECTORY.exists():
        return []

    records: list[dict[str, Any]] = []
    for file_path in sorted(SOURCE_DIRECTORY.rglob("*")):
        if not file_path.is_file():
            continue

        relative_path = file_path.relative_to(SOURCE_DIRECTORY)
        if len(relative_path.parts) < 3:
            continue

        case_id, field = relative_path.parts[0], relative_path.parts[1]
        if field not in SUPPORTED_FIELDS:
            continue

        metadata = file_metadata(file_path)
        records.append(
            {
                "case_id": case_id,
                "field": field,
                "file_name": file_path.name,
                "relative_path": relative_path.as_posix(),
                "url": make_url(relative_path),
                "attachment_kind": get_attachment_kind(file_path),
                "bytes": file_path.stat().st_size,
                "modified_at": metadata["modified_at"],
            }
        )

    return records


def build_issue_attachment_manifest() -> dict[str, Any]:
    public_link = (
        create_public_directory_link()
        if SOURCE_DIRECTORY.exists()
        else {
            "path": str(PUBLIC_DIRECTORY),
            "target": str(SOURCE_DIRECTORY),
            "status": "missing_source",
        }
    )

    return {
        "generated_at": datetime.now().astimezone().isoformat(),
        "source_directory": {
            "path": str(SOURCE_DIRECTORY),
            "exists": SOURCE_DIRECTORY.exists(),
            "public_url_base": PUBLIC_URL_BASE,
        },
        "public_link": public_link,
        "records": build_records(),
    }


def main() -> None:
    manifest = build_issue_attachment_manifest()
    write_json_payload(OUTPUT_PATH, manifest)
    print(f"Wrote issue attachment manifest to {OUTPUT_PATH}")
    print(f"Linked issue attachment files: {len(manifest['records'])}")
    print(f"issue_case_images: {manifest['public_link']['status']} -> {PUBLIC_DIRECTORY}")


if __name__ == "__main__":
    main()
