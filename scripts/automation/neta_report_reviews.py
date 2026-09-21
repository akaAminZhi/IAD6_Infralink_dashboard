from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from functools import lru_cache
import json
import os
from pathlib import Path
import threading
import time
from typing import Any
from uuid import uuid4


REVIEW_STATUSES = {"PASSED", "FAILED", "REVIEW_REQUIRED", "ERROR"}
MANUAL_STATUSES = {"PASSED", "FAILED"}
_UPDATE_LOCK = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_file(value: object) -> str:
    return str(value or "").strip().replace("\\", "/").casefold()


def _load_payload(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"NETA report review results not found: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"NETA report review results are not valid JSON: {path}") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("reports"), list):
        raise ValueError("NETA report review results must contain a reports list.")
    return payload


def _evidence_lines(report: dict[str, Any]) -> list[str]:
    """Keep exception evidence and review notes without sending every numeric test."""
    lines: list[str] = []

    def add(value: object, prefix: str = "") -> None:
        values = value if isinstance(value, list) else [value]
        for item in values:
            if isinstance(item, str) and item.strip():
                lines.append(prefix + item.strip())

    add(report.get("evidence"))
    add(report.get("review_notes"))
    add(report.get("error"))
    pages = report.get("pages")
    for page in pages if isinstance(pages, list) else []:
        if not isinstance(page, dict):
            continue
        prefix = f"Page {page['page']}: " if page.get("page") is not None else ""
        if page.get("status") in {"FAILED", "REVIEW_REQUIRED", "ERROR"}:
            add(page.get("evidence"), prefix)
        add(page.get("review_notes"), prefix)
        add(page.get("error"), prefix)
        checks = page.get("numeric_checks")
        for check in checks if isinstance(checks, list) else []:
            if not isinstance(check, dict) or check.get("status") not in {"FAILED", "REVIEW_REQUIRED", "ERROR"}:
                continue
            details = ", ".join(
                f"{key}={check[key]}" for key in
                ("value", "operator", "limit", "minimum", "maximum")
                if check.get(key) is not None
            )
            add(f"{check.get('test', 'Numeric check')}: {check['status']}"
                + (f" ({details})" if details else ""), prefix)
            add(check.get("evidence"), prefix)
    return list(dict.fromkeys(lines))


def _compact_report(report: object) -> dict[str, Any] | None:
    if not isinstance(report, dict):
        return None
    file_name = str(report.get("file") or "").strip().replace("\\", "/")
    status = str(report.get("status") or "").strip().upper()
    if not file_name or status not in REVIEW_STATUSES:
        return None
    return {
        "file": file_name,
        "status": status,
        "is_passed": report.get("is_passed"),
        "manual_review": report.get("manual_review"),
        "evidence": _evidence_lines(report) if status != "PASSED" else [],
    }


def _summary(reports: list[object]) -> dict[str, int]:
    counts = Counter(
        str(report.get("status") or "").strip().upper()
        for report in reports
        if isinstance(report, dict)
    )
    return {status: counts.get(status, 0) for status in ("PASSED", "FAILED", "REVIEW_REQUIRED", "ERROR")}


def list_neta_report_reviews(path: Path) -> dict[str, Any]:
    path = path.resolve()
    stat = path.stat()
    with _UPDATE_LOCK:
        return _cached_reviews(path, stat.st_mtime_ns, stat.st_ctime_ns, stat.st_size)


@lru_cache(maxsize=4)
def _cached_reviews(path: Path, modified: int, changed: int, size: int) -> dict[str, Any]:
    payload = _load_payload(path)
    reports = [compact for item in payload["reports"] if (compact := _compact_report(item))]
    return {
        "generated_at": payload.get("generated_at"),
        "last_reviewed_at": payload.get("last_reviewed_at"),
        "total_reports": len(reports),
        "summary": _summary(payload["reports"]),
        "reports": reports,
    }


def _write_payload(path: Path, payload: dict[str, Any]) -> None:
    temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    try:
        for delay in (0.0, 0.03, 0.1, 0.25):
            if delay:
                time.sleep(delay)
            try:
                os.replace(temporary, path)
                return
            except PermissionError:
                continue
        raise PermissionError(f"NETA report review results are temporarily locked: {path}")
    finally:
        temporary.unlink(missing_ok=True)


def _update_neta_report_review(path: Path, report_file: str, status: str) -> dict[str, Any]:
    normalized_file = _normalize_file(report_file)
    normalized_status = status.strip().upper()
    if not normalized_file:
        raise ValueError("NETA report file is required.")
    if normalized_status not in MANUAL_STATUSES:
        raise ValueError("NETA report review status must be PASSED or FAILED.")

    payload = _load_payload(path)
    matches = [
        report
        for report in payload["reports"]
        if isinstance(report, dict) and _normalize_file(report.get("file")) == normalized_file
    ]
    if not matches:
        raise KeyError(f"NETA report was not found: {report_file}")
    if len(matches) > 1:
        raise ValueError(f"NETA report path is duplicated: {report_file}")

    reviewed_at = _now()
    report = matches[0]
    report["status"] = normalized_status
    report["is_passed"] = normalized_status == "PASSED"
    report["manual_review"] = {
        "status": normalized_status,
        "reviewed_at": reviewed_at,
    }
    payload["last_reviewed_at"] = reviewed_at
    payload["summary"] = _summary(payload["reports"])
    payload["total_reports"] = len(payload["reports"])
    payload["all_reports_passed"] = bool(payload["reports"]) and all(
        isinstance(item, dict) and item.get("status") == "PASSED"
        for item in payload["reports"]
    )
    _write_payload(path, payload)
    _cached_reviews.cache_clear()

    compact = _compact_report(report)
    assert compact is not None
    return compact


def update_neta_report_review(path: Path, report_file: str, status: str) -> dict[str, Any]:
    with _UPDATE_LOCK:
        return _update_neta_report_review(path, report_file, status)
