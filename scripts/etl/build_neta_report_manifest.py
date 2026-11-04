"""Build a browser-linkable manifest for downloaded NETA report PDFs."""

from __future__ import annotations

import csv
import json
import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

try:
    from .json_utils import file_metadata, write_json as write_json_payload
    from .schemas import NetaReportFileRecord
except ImportError:
    from json_utils import file_metadata, write_json as write_json_payload
    from schemas import NetaReportFileRecord


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
    if relative_path.parts[0] == "_temporary" and len(relative_path.parts) > 2:
        return relative_path.parts[1]
    if len(relative_path.parts) > 1:
        return relative_path.parts[0]
    name = file_path.stem.strip()
    return name or None


def read_gc_source_report_lookup(gc_directory: Path) -> dict[str, dict[str, str]]:
    manifest_path = gc_directory / "rename_manifest.csv"
    if not manifest_path.exists():
        return {}

    lookup: dict[str, dict[str, str]] = {}
    with manifest_path.open("r", encoding="utf-8-sig", newline="") as manifest_file:
        reader = csv.DictReader(manifest_file)
        for row in reader:
            output_path = normalize_relative_path(row.get("output_path"))
            if output_path and Path(output_path).is_absolute():
                try:
                    output_relative = Path(output_path).relative_to(gc_directory.resolve()).as_posix()
                except ValueError:
                    continue
            else:
                output_relative = strip_known_prefix(output_path, "NETA_eport_To_GC")
            source_relative = strip_known_prefix(row.get("source_path"), "downloads")
            if output_relative is None or source_relative is None:
                continue
            lookup[output_relative.casefold()] = {
                "source_report_name": Path(source_relative).name,
                "equipment_id": (row.get("device_name") or Path(source_relative).parent.name).strip(),
            }

    return lookup


def create_public_directory_link(public_directory: Path, source_directory: Path) -> dict[str, Any]:
    if public_directory.exists():
        if public_directory.resolve() != source_directory.resolve():
            raise ValueError(
                f"Report public directory targets a different location: {public_directory}. "
                f"Expected {source_directory}; correct the local link before rebuilding."
            )
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


def read_lifecycle(source_directory: Path) -> dict[str, Any]:
    state_path = source_directory / "neta_lifecycle.json"
    if not state_path.exists():
        return {}
    state = json.loads(state_path.read_text(encoding="utf-8"))
    if (not isinstance(state, dict) or state.get("version") != 1
            or not isinstance(state.get("devices"), dict)
            or not all(isinstance(entry, dict) for entry in state["devices"].values())):
        raise ValueError(f"Invalid NETA lifecycle state: {state_path}")
    return {key.casefold(): entry for key, entry in state["devices"].items()}


def build_records_for_source(
    source: dict[str, Any], lifecycle: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    source_directory = source["directory"]
    if not source_directory.exists():
        return []

    gc_source_lookup = (
        read_gc_source_report_lookup(source_directory)
        if source["source_key"] == "gc"
        else {}
    )
    records: list[dict[str, Any]] = []

    for file_path in sorted(source_directory.rglob("*")):
        if file_path.suffix.lower() != ".pdf" or not file_path.is_file():
            continue
        relative_path = file_path.relative_to(source_directory)
        relative_path_text = relative_path.as_posix()
        gc_metadata = gc_source_lookup.get(relative_path_text.casefold(), {})
        temporary = relative_path.parts[0] == "_temporary"
        active_parts = relative_path.parts[1:] if temporary else relative_path.parts
        if (any(part.startswith("_") for part in active_parts)
                or (temporary and len(relative_path.parts) < 3)):
            continue
        equipment_id = get_equipment_id(relative_path, file_path)
        if len(relative_path.parts) == 1:
            equipment_id = gc_metadata.get("equipment_id") or equipment_id
        entry = (lifecycle or {}).get((equipment_id or "").casefold())
        ready_field = "download_ready" if source["source_key"] == "downloaded" else "formal_ready"
        if not temporary and entry is not None and (
            entry.get("report_stage") != "formal" or entry.get(ready_field) is not True
        ):
            continue
        source_report_name = gc_metadata.get("source_report_name")
        metadata = file_metadata(file_path)

        records.append(
            NetaReportFileRecord(
                source_key=source["source_key"],
                source_label=source["source_label"],
                equipment_id=equipment_id,
                report_name=file_path.name,
                source_report_name=source_report_name or file_path.name,
                relative_path=relative_path_text,
                url=make_url(source["url_base"], relative_path),
                bytes=file_path.stat().st_size,
                modified_at=metadata["modified_at"],
                report_stage="temporary" if temporary else "formal",
            ).to_dict()
        )

    formal_keys = {
        ((record["equipment_id"] or "").casefold(), record["source_report_name"].casefold())
        for record in records if record["report_stage"] == "formal"
    }
    return [record for record in records if record["report_stage"] == "formal" or (
        (record["equipment_id"] or "").casefold(), record["source_report_name"].casefold()
    ) not in formal_keys]


def build_neta_report_manifest(tracker_root: Path | None = None) -> dict[str, Any]:
    public_links: dict[str, dict[str, Any]] = {}
    source_directories: dict[str, dict[str, Any]] = {}
    records: list[dict[str, Any]] = []

    sources = SOURCE_DEFINITIONS
    configured_root = tracker_root or os.environ.get("IAD6_EPS_TRACKER_ROOT")
    if configured_root:
        tracker = Path(configured_root).resolve()
        sources = [{**source, "directory": tracker / (
            "downloads/neta_reports" if source["source_key"] == "downloaded" else "NETA_eport_To_GC"
        )} for source in sources]
    downloaded = next(source for source in sources if source["source_key"] == "downloaded")
    lifecycle = read_lifecycle(downloaded["directory"])

    for source in sources:
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
            records.extend(build_records_for_source(source, lifecycle))
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
