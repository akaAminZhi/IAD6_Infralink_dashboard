"""Compare each equipment's NETA reports with a per-family test-position baseline.

Read-only diagnostic. Inputs (all JSON/CSV, no PDF reading here):

- Tracker ``NETA_eport_To_GC/test_reports_result.json`` (PASS/FAIL incl. manual overrides)
- Tracker ``NETA_eport_To_GC/rename_manifest.csv`` (parsed source of each GC name)
- Tracker ``NETA_eport_To_GC/report_fields.json`` (optional PDF fields; preferred when present)
- ``frontend/public/data/equipment.json`` (NETA complete flag)
- ``config/neta_position_baselines.json`` (operator-confirmed baselines)

Families without a confirmed baseline are compared with the auto-generated
draft and marked ``baseline_basis: "draft"`` so nothing is treated as final.
"""

from __future__ import annotations

from collections import Counter, defaultdict
import csv
from datetime import datetime
import json
import os
from pathlib import Path
import sys
from typing import Any
from urllib.parse import quote

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.etl.json_utils import load_records_json, write_json
from scripts.etl.neta_positions import (
    ReportRef,
    build_family_draft,
    compare_equipment,
    family_key,
    is_excluded_report,
    parse_position,
    position_source,
    suggest_ocr_gc_name,
    suggested_gc_name,
    vote_equipment,
)
from scripts.etl.schemas import NetaPositionEquipment, NetaPositionReport
from scripts.etl.tracking_rules import requires_equipment_test_tracking


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
OUTPUT_PATH = DATA_DIR / "neta_position_check.json"
EQUIPMENT_PATH = DATA_DIR / "equipment.json"
BASELINES_PATH = PROJECT_ROOT / "config" / "neta_position_baselines.json"
GC_URL_BASE = "/neta-reports-gc"
REVIEW_STATUSES = {"PASSED", "FAILED", "REVIEW_REQUIRED", "ERROR"}


def tracker_root() -> Path:
    return Path(os.environ.get(
        "IAD6_EPS_TRACKER_ROOT", PROJECT_ROOT.parent / "IAD6_EPS_Testing_Tracker"))


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_baselines(path: Path = BASELINES_PATH) -> dict[str, Any]:
    if not path.is_file():
        return {"version": 1, "revision": 0, "families": {}}
    payload = _read_json(path)
    if not isinstance(payload, dict) or not isinstance(payload.get("families"), dict):
        raise ValueError(f"Invalid NETA position baselines: {path}")
    return payload


def read_manifest_sources(gc_directory: Path) -> dict[str, dict[str, str]]:
    """GC relative path (casefolded) -> parsed_source / parsed_value / source name."""
    path = gc_directory / "rename_manifest.csv"
    if not path.is_file():
        return {}
    lookup: dict[str, dict[str, str]] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if (row.get("status") or "") == "superseded":
                continue
            output = (row.get("output_path") or "").replace("\\", "/")
            marker = "NETA_eport_To_GC/"
            if marker in output:
                output = output.split(marker, 1)[1]
            lookup[output.casefold()] = {
                "parsed_source": (row.get("parsed_source") or "").strip(),
                "source_report_name": Path((row.get("source_path") or "").replace("\\", "/")).name,
                "source_sha256": (row.get("source_sha256") or "").strip(),
            }
    return lookup


def read_report_fields(gc_directory: Path) -> dict[str, dict[str, Any]]:
    path = gc_directory / "report_fields.json"
    if not path.is_file():
        return {}
    payload = _read_json(path)
    records = payload.get("records") if isinstance(payload, dict) else None
    if not isinstance(records, dict):
        return {}
    # Index by content hash and by every GC path that carried those bytes.
    lookup: dict[str, dict[str, Any]] = dict(records)
    for record in records.values():
        for file_name in record.get("files") or [] if isinstance(record, dict) else []:
            lookup[str(file_name).replace("\\", "/").casefold()] = record
    return lookup


def _report_location(file_name: str) -> tuple[str | None, str]:
    parts = file_name.replace("\\", "/").split("/")
    if parts[0] == "_temporary":
        return (parts[1] if len(parts) > 2 else None), "temporary"
    return (parts[0] if len(parts) > 1 else None), "formal"


def _url(file_name: str) -> str:
    return f"{GC_URL_BASE}/" + "/".join(quote(part) for part in file_name.split("/"))


PDF_FIELD_KEYS = ("asset", "filename", "designation", "substation", "station", "equipment_id_field",
                  "serial_number", "cubicle_code", "test_date")


def parse_report(
    name: str, equipment_id: str, pdf_fields: dict[str, Any], record: dict[str, Any],
) -> NetaPositionReport:
    """Position from the PDF header when it parses cleanly, else from the GC name."""
    gc_parse = parse_position(name, equipment_id)
    source = position_source(pdf_fields)
    pdf_parse = parse_position(source[1], equipment_id) if source else None
    vote = vote_equipment(pdf_fields, equipment_id) if pdf_fields else None
    if pdf_parse is not None and pdf_parse.confidence != "needs_review":
        parsed, name_source = pdf_parse, f"pdf_{source[0]}"
    elif gc_parse.confidence != "needs_review" or pdf_parse is None:
        parsed, name_source = gc_parse, "gc_name"
    else:
        parsed, name_source = pdf_parse, f"pdf_{source[0]}"
    # Oil lab forms share the equipment's designation and sometimes its GC
    # basename. The form type identifies an independent test position.
    oil_sample = record.get("form") == "oil_analysis"
    position_key = "OIL-SAMPLE" if oil_sample else parsed.key
    flags = list(parsed.flags)
    referenced = parsed.referenced_equipment
    if pdf_parse is not None and parsed is gc_parse:
        flags.append("pdf_unparsed")
    if vote is not None:
        if vote["asset_equipment_conflict"] and "asset_equipment_conflict" not in flags:
            flags.append("asset_equipment_conflict")
            referenced = referenced or vote["votes"].get("asset")
        if vote["belongs_elsewhere"]:
            flags.append("report_belongs_elsewhere")
            referenced = referenced or vote["belongs_elsewhere"]
    suggestion = None
    if name_source != "gc_name" and source is not None:
        wrong_device = "asset_equipment_conflict" in gc_parse.flags and "report_belongs_elsewhere" not in flags
        if gc_parse.key not in {parsed.key, position_key} or gc_parse.confidence == "needs_review" or wrong_device:
            flags.append("gc_name_mismatch")
            wrong_token = referenced if "asset_equipment_conflict" in flags else None
            suggestion = suggested_gc_name(source[1], equipment_id, wrong_token)
            if suggestion.casefold() == name.casefold():
                suggestion = None
                flags.remove("gc_name_mismatch")
    return NetaPositionReport(
        equipment_id=equipment_id,
        file="",
        url="",
        report_stage="formal",
        status="",
        key=position_key,
        confidence=parsed.confidence,
        form="oil_analysis" if oil_sample else parsed.form,
        flags=list(dict.fromkeys(flags)),
        referenced_equipment=referenced,
        name_source=name_source,
        gc_name_key=gc_parse.key,
        test_date=str(pdf_fields.get("test_date") or "") or None,
        serial_number=str(pdf_fields.get("serial_number") or "") or None,
        text_source=record.get("text_source"),
        pdf_fields={key: pdf_fields[key] for key in PDF_FIELD_KEYS if pdf_fields.get(key)},
        field_votes=(vote or {}).get("votes") or {},
        suggested_gc_name=suggestion,
    )


def collect_reports(
    reviews: list[dict[str, Any]],
    manifest: dict[str, dict[str, str]],
    fields: dict[str, dict[str, Any]],
    confirmed_families: dict[str, Any],
) -> dict[str, list[dict[str, Any]]]:
    """Parsed device reports per equipment; formal reports hide temporary ones."""
    by_equipment: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for review in reviews:
        file_name = str(review.get("file") or "").replace("\\", "/")
        status = str(review.get("status") or "").upper()
        equipment_id, stage = _report_location(file_name)
        if not equipment_id or status not in REVIEW_STATUSES:
            continue
        name = file_name.rsplit("/", 1)[-1]
        source = manifest.get(file_name.casefold(), {})
        if is_excluded_report(name, source.get("parsed_source")):
            continue
        record = fields.get(str(review.get("sha256") or "")) or fields.get(file_name.casefold()) or {}
        pdf_fields = record.get("fields") if isinstance(record.get("fields"), dict) else {}
        report = parse_report(name, equipment_id.upper(), pdf_fields, record)
        suggestion = suggest_ocr_gc_name(name, equipment_id, record, confirmed_families)
        if suggestion:
            report.suggested_gc_name = suggestion
            report.flags.append("gc_name_mismatch")
        by_equipment[equipment_id.upper()][stage].append(
            report.to_dict() | {
                "file": file_name,
                "url": _url(file_name),
                "source_report_name": source.get("source_report_name") or None,
                "report_stage": stage,
                "status": status,
            })
    return {
        equipment_id: stages.get("formal") or stages.get("temporary") or []
        for equipment_id, stages in by_equipment.items()
    }


def _confirmed_positions(family: dict[str, Any] | None) -> list[dict[str, Any]] | None:
    if not family or family.get("status") != "confirmed":
        return None
    return [position for position in family.get("positions") or [] if position.get("key")]


def build_position_check(
    reviews_payload: dict[str, Any] | None,
    manifest: dict[str, dict[str, str]],
    fields: dict[str, dict[str, Any]],
    equipment_records: list[dict[str, Any]],
    baselines: dict[str, Any],
) -> dict[str, Any]:
    generated_at = datetime.now().astimezone().isoformat()
    if not reviews_payload:
        return {"available": False, "generated_at": generated_at, "families": [],
                "equipment": [], "summary": {}, "baseline_revision": baselines.get("revision", 0)}
    confirmed_families = baselines.get("families") or {}
    reports_by_equipment = collect_reports(reviews_payload.get("reports") or [], manifest, fields, confirmed_families)
    equipment_lookup = {
        str(record.get("equipment_id") or "").upper(): record
        for record in equipment_records if record.get("equipment_id")
    }
    universe = set(reports_by_equipment) | {
        equipment_id for equipment_id, record in equipment_lookup.items()
        if record.get("neta_complete") is True
    }
    tracked = sorted(
        equipment_id for equipment_id in universe
        if requires_equipment_test_tracking({"equipment_id": equipment_id})
        and equipment_lookup.get(equipment_id, {}).get("test_tracking_required", True) is not False
    )
    members: dict[str, list[str]] = defaultdict(list)
    for equipment_id in tracked:
        members[family_key(equipment_id)].append(equipment_id)

    families_out: list[dict[str, Any]] = []
    equipment_out: list[dict[str, Any]] = []
    for family, ids in sorted(members.items()):
        complete_keys = {
            equipment_id: {
                report["key"] for report in reports_by_equipment.get(equipment_id, [])
                if report["confidence"] != "needs_review"
            }
            for equipment_id in ids
            if equipment_lookup.get(equipment_id, {}).get("neta_complete") is True
            and reports_by_equipment.get(equipment_id)
        }
        draft = build_family_draft(complete_keys)
        confirmed_entry = confirmed_families.get(family)
        confirmed = _confirmed_positions(confirmed_entry)
        if confirmed is not None:
            basis, baseline = "confirmed", confirmed
        elif draft["positions"]:
            basis = "draft"
            baseline = [{"key": key, "count": 1, "optional": False, "aliases": []} for key in draft["positions"]]
        else:
            basis, baseline = "none", []
        exceptions = (confirmed_entry or {}).get("exceptions") or {}
        draft_differs = confirmed is not None and sorted(p["key"] for p in confirmed) != draft["positions"]

        nonconforming = 0
        for equipment_id in ids:
            record = equipment_lookup.get(equipment_id, {})
            reports = reports_by_equipment.get(equipment_id, [])
            exception = exceptions.get(equipment_id) or {}
            device_baseline = [*baseline, *(exception.get("extra_positions") or [])]
            refs = [ReportRef(report["file"], report["key"], report["confidence"], report["status"],
                              report.get("test_date"), report.get("serial_number")) for report in reports]
            comparison = compare_equipment(refs, device_baseline, exception.get("waived_positions") or [])
            if basis == "none":
                comparison["nonconforming"] = False
            neta_complete = record.get("neta_complete") is True
            issue_counts = Counter(comparison["issue_counts"])
            for flag in ("asset_equipment_conflict", "gc_name_mismatch", "report_belongs_elsewhere"):
                flagged = sum(1 for report in reports if flag in report["flags"])
                if flagged:
                    issue_counts[flag] = flagged
            complete_but_nonconforming = neta_complete and comparison["nonconforming"]
            if complete_but_nonconforming:
                issue_counts["complete_but_nonconforming"] = 1
            if not reports:
                issue_counts["no_reports"] = 1
            nonconforming += int(comparison["nonconforming"])
            # Keep every parsed report so per-report links survive in the drawer.
            equipment_out.append(NetaPositionEquipment(
                equipment_id=equipment_id,
                family=family,
                equipment_type=record.get("equipment_type"),
                neta_complete=neta_complete,
                baseline_basis=basis,
                report_stage=reports[0]["report_stage"] if reports else None,
                report_count=len(reports),
                nonconforming=comparison["nonconforming"],
                complete_but_nonconforming=complete_but_nonconforming,
                issue_counts=dict(sorted(issue_counts.items())),
                positions=comparison["positions"],
                extra_reports=comparison["extra_reports"],
                needs_review_reports=comparison["needs_review_reports"],
                reports=reports,
                exception_note=exception.get("note") or None,
            ).to_dict())
        families_out.append({
            "family": family,
            "members": ids,
            "member_count": len(ids),
            "neta_complete_count": sum(
                1 for equipment_id in ids if equipment_lookup.get(equipment_id, {}).get("neta_complete") is True),
            "draft": draft,
            "confirmed": None if confirmed is None else {
                "positions": confirmed,
                "confirmed_at": confirmed_entry.get("confirmed_at"),
                "confirmed_by": confirmed_entry.get("confirmed_by"),
                "exceptions": exceptions,
            },
            "baseline_basis": basis,
            "baseline_positions": [position["key"] for position in baseline],
            "draft_differs_from_confirmed": draft_differs,
            "nonconforming_count": nonconforming,
        })

    totals: Counter[str] = Counter()
    for entry in equipment_out:
        for key, value in entry["issue_counts"].items():
            totals[key] += 1 if value else 0
    return {
        "available": True,
        "generated_at": generated_at,
        "reviews_generated_at": reviews_payload.get("generated_at"),
        "report_fields_available": bool(fields),
        "baseline_revision": int(baselines.get("revision") or 0),
        "summary": {
            "families": len(families_out),
            "families_confirmed": sum(1 for family in families_out if family["baseline_basis"] == "confirmed"),
            "families_draft": sum(1 for family in families_out if family["baseline_basis"] == "draft"),
            "equipment": len(equipment_out),
            "nonconforming_equipment": sum(1 for entry in equipment_out if entry["nonconforming"]),
            "complete_but_nonconforming": sum(1 for entry in equipment_out if entry["complete_but_nonconforming"]),
            "equipment_by_issue": dict(sorted(totals.items())),
        },
        "families": families_out,
        "equipment": equipment_out,
    }


def run_build(
    tracker: Path | None = None,
    output_path: Path = OUTPUT_PATH,
    equipment_path: Path = EQUIPMENT_PATH,
    baselines_path: Path = BASELINES_PATH,
) -> dict[str, Any]:
    gc_directory = (tracker or tracker_root()) / "NETA_eport_To_GC"
    reviews_path = gc_directory / "test_reports_result.json"
    reviews = _read_json(reviews_path) if reviews_path.is_file() else None
    payload = build_position_check(
        reviews if isinstance(reviews, dict) else None,
        read_manifest_sources(gc_directory),
        read_report_fields(gc_directory),
        load_records_json(equipment_path) if equipment_path.is_file() else [],
        read_baselines(baselines_path),
    )
    write_json(output_path, payload)
    return payload


def main() -> None:
    result = run_build()
    summary = result.get("summary") or {}
    print(f"NETA position check: available={result['available']} "
          f"families={summary.get('families', 0)} equipment={summary.get('equipment', 0)} "
          f"nonconforming={summary.get('nonconforming_equipment', 0)} "
          f"complete_but_nonconforming={summary.get('complete_but_nonconforming', 0)}")


if __name__ == "__main__":
    main()
