"""Build a browser-linkable manifest for downloaded NETA report PDFs."""

from __future__ import annotations

import csv
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
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
PUBLIC_DIR = PROJECT_ROOT / "frontend" / "public"
OUTPUT_PATH = DATA_DIR / "neta_report_manifest.json"

SOURCE_DEFINITIONS = [
    {
        "source_key": "downloaded",
        "source_label": "Original",
        "directory": TRACKER_ROOT / "downloads" / "neta_reports",
        "public_directory": PUBLIC_DIR / "neta-reports",
        "url_base": "/neta-reports",
    },
    {
        "source_key": "gc",
        "source_label": "GC",
        "directory": TRACKER_ROOT / "NETA_eport_To_GC",
        "public_directory": PUBLIC_DIR / "neta-reports-gc",
        "url_base": "/neta-reports-gc",
    },
]


def normalize_relative_path(value: str | None) -> str | None:
    if value is None or value.strip() == "":
        return None
    return str(Path(value.strip().replace("\\", "/")).as_posix())


def strip_known_prefix(value: str | None, prefix: str) -> str | None:
    normalized = normalize_relative_path(value)
    if normalized is None:
        return None
    prefix = prefix.strip("/").casefold()
    parts = normalized.split("/")
    if parts and parts[0].casefold() == prefix:
        return "/".join(parts[1:])
    return normalized


def make_url(url_base: str, relative_path: Path) -> str:
    encoded_parts = [quote(part) for part in relative_path.parts]
    return f"{url_base}/{'/'.join(encoded_parts)}"


def get_equipment_id(relative_path: Path, file_path: Path) -> str | None:
    if len(relative_path.parts) > 1:
        return relative_path.parts[0]
    name = file_path.stem.strip()
    return name or None


def read_gc_source_report_lookup(gc_directory: Path) -> dict[str, str]:
    manifest_path = gc_directory / "rename_manifest.csv"
    if not manifest_path.exists():
        return {}

    lookup: dict[str, str] = {}
    with manifest_path.open("r", encoding="utf-8-sig", newline="") as manifest_file:
        reader = csv.DictReader(manifest_file)
        for row in reader:
            output_relative = strip_known_prefix(row.get("output_path"), "NETA_eport_To_GC")
            source_relative = strip_known_prefix(row.get("source_path"), "downloads")
            if output_relative is None or source_relative is None:
                continue
            lookup[output_relative.casefold()] = Path(source_relative).name

    return lookup


def create_public_directory_link(public_directory: Path, source_directory: Path) -> dict[str, Any]:
    if public_directory.exists():
        return {
            "path": str(public_directory),
            "target": str(source_directory),
            "status": "exists",
        }

    public_directory.parent.mkdir(parents=True, exist_ok=True)
    try:
        if os.name == "nt":
            result = subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(public_directory), str(source_directory)],
                check=True,
                capture_output=True,
                text=True,
            )
            message = result.stdout.strip()
        else:
            public_directory.symlink_to(source_directory, target_is_directory=True)
            message = "created symlink"
    except Exception as exc:  # noqa: BLE001 - manifest should explain link setup failures.
        return {
            "path": str(public_directory),
            "target": str(source_directory),
            "status": "failed",
            "error": f"{type(exc).__name__}: {exc}",
        }

    return {
        "path": str(public_directory),
        "target": str(source_directory),
        "status": "created",
        "message": message,
    }


def build_records_for_source(source: dict[str, Any]) -> list[dict[str, Any]]:
    source_directory = source["directory"]
    if not source_directory.exists():
        return []

    gc_source_lookup = (
        read_gc_source_report_lookup(source_directory)
        if source["source_key"] == "gc"
        else {}
    )
    records: list[dict[str, Any]] = []

    for file_path in sorted(source_directory.rglob("*.pdf")):
        if not file_path.is_file():
            continue
        relative_path = file_path.relative_to(source_directory)
        if any(part.startswith("_") for part in relative_path.parts):
            continue
        relative_path_text = relative_path.as_posix()
        source_report_name = gc_source_lookup.get(relative_path_text.casefold())
        metadata = file_metadata(file_path)

        records.append(
            {
                "source_key": source["source_key"],
                "source_label": source["source_label"],
                "equipment_id": get_equipment_id(relative_path, file_path),
                "report_name": file_path.name,
                "source_report_name": source_report_name or file_path.name,
                "relative_path": relative_path_text,
                "url": make_url(source["url_base"], relative_path),
                "bytes": file_path.stat().st_size,
                "modified_at": metadata["modified_at"],
            }
        )

    return records


def build_neta_report_manifest() -> dict[str, Any]:
    public_links: dict[str, dict[str, Any]] = {}
    source_directories: dict[str, dict[str, Any]] = {}
    records: list[dict[str, Any]] = []

    for source in SOURCE_DEFINITIONS:
        source_key = source["source_key"]
        source_directory = source["directory"]
        source_directories[source_key] = {
            "source_label": source["source_label"],
            "path": str(source_directory),
            "exists": source_directory.exists(),
            "public_url_base": source["url_base"],
        }
        if source_directory.exists():
            public_links[source_key] = create_public_directory_link(
                source["public_directory"],
                source_directory,
            )
            records.extend(build_records_for_source(source))
        else:
            public_links[source_key] = {
                "path": str(source["public_directory"]),
                "target": str(source_directory),
                "status": "missing_source",
            }

    return {
        "generated_at": datetime.now().astimezone().isoformat(),
        "source_directories": source_directories,
        "public_links": public_links,
        "records": records,
    }


def main() -> None:
    manifest = build_neta_report_manifest()
    write_json_payload(OUTPUT_PATH, manifest)
    print(f"Wrote NETA report manifest to {OUTPUT_PATH}")
    print(f"Linked NETA report files: {len(manifest['records'])}")
    for source_key, link in manifest["public_links"].items():
        print(f"{source_key}: {link['status']} -> {link['path']}")


if __name__ == "__main__":
    main()
