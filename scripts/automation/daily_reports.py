from __future__ import annotations

from datetime import date, datetime
import os
from pathlib import Path
import re
import tempfile
from typing import Iterable


REPORT_NAME_PATTERN = re.compile(
    r"^(?:(?P<month>\d{1,2})-(?P<day>\d{1,2})|"
    r"(?P<year>\d{4})-(?P<iso_month>\d{2})-(?P<iso_day>\d{2}))\.md$",
    re.IGNORECASE,
)
LIST_PREFIX_PATTERN = re.compile(r"^\s*(?:(?:[-*+])|(?:\d+[.)]))\s+")
HEADING_MAP = {
    "failed": "failed",
    "failed equipment": "failed",
    "retested and passed": "retested_and_passed",
    "retest and passed": "retested_and_passed",
    "tested": "tested",
    "tested equipment": "tested",
}
MV_HEADING_MAP = {
    "tested and passed": "tested_and_passed",
    "tested & passed": "tested_and_passed",
    "partially tested": "partially_tested",
    "partial tested": "partially_tested",
    "failed": "failed",
    "retested and passed": "retested_and_passed",
    "retest and passed": "retested_and_passed",
}


class ReportNameError(ValueError):
    pass


def normalize_report_name(value: str) -> str:
    name = str(value or "").strip()
    if not name:
        raise ReportNameError("Report name is required.")
    if not name.lower().endswith(".md"):
        name = f"{name}.md"

    match = REPORT_NAME_PATTERN.fullmatch(name)
    if not match:
        raise ReportNameError(
            "Report name must use M-D.md or YYYY-MM-DD.md, for example 7-16.md."
        )

    try:
        if match.group("year"):
            date(
                int(match.group("year")),
                int(match.group("iso_month")),
                int(match.group("iso_day")),
            )
        else:
            # Leap year permits every valid month/day combination.
            date(2000, int(match.group("month")), int(match.group("day")))
    except ValueError as exc:
        raise ReportNameError(f"Report name contains an invalid date: {name}") from exc

    return name


def report_path(report_dir: Path, report_name: str) -> Path:
    normalized = normalize_report_name(report_name)
    directory = report_dir.resolve()
    candidate = (directory / normalized).resolve()
    if candidate.parent != directory:
        raise ReportNameError("Report path must stay inside the configured report directory.")
    return candidate


def _item_key(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).upper()


def normalize_items(value: str | Iterable[str]) -> list[str]:
    lines = value.splitlines() if isinstance(value, str) else value
    items: list[str] = []
    seen: set[str] = set()

    for raw_line in lines:
        item = LIST_PREFIX_PATTERN.sub("", str(raw_line)).strip()
        if not item:
            continue
        key = _item_key(item)
        if key in seen:
            continue
        seen.add(key)
        items.append(item)

    return items


def normalize_mv_items(value: str | Iterable[str]) -> list[str]:
    """Keep compact MV test IDs using the same shape as EPS daily reports."""
    return [
        item
        for item in normalize_items(value)
        if " " not in item and "-" in item and any(char.isdigit() for char in item)
    ]


def validate_sections(
    failed: str | Iterable[str],
    retested_and_passed: str | Iterable[str],
    tested: str | Iterable[str],
) -> dict[str, object]:
    original = {
        "failed": normalize_items(failed),
        "retested_and_passed": normalize_items(retested_and_passed),
        "tested": normalize_items(tested),
    }
    retested_keys = {_item_key(item) for item in original["retested_and_passed"]}
    tested_without_retests = [
        item for item in original["tested"] if _item_key(item) not in retested_keys
    ]
    tested_keys = {_item_key(item) for item in tested_without_retests}
    failed_final = [
        item
        for item in original["failed"]
        if _item_key(item) not in retested_keys and _item_key(item) not in tested_keys
    ]

    warnings: list[dict[str, str]] = []
    for item in original["tested"]:
        if _item_key(item) in retested_keys:
            warnings.append(
                {
                    "item": item,
                    "removed_from": "Tested",
                    "kept_in": "Retested And Passed",
                }
            )
    for item in original["failed"]:
        key = _item_key(item)
        if key in retested_keys:
            warnings.append(
                {
                    "item": item,
                    "removed_from": "Failed",
                    "kept_in": "Retested And Passed",
                }
            )
        elif key in tested_keys:
            warnings.append(
                {"item": item, "removed_from": "Failed", "kept_in": "Tested"}
            )

    sections = {
        "failed": failed_final,
        "retested_and_passed": original["retested_and_passed"],
        "tested": tested_without_retests,
    }
    return {
        "sections": sections,
        "counts": {name: len(items) for name, items in sections.items()},
        "warnings": warnings,
    }


def format_report(sections: dict[str, list[str]]) -> str:
    lines: list[str] = ["# Failed", ""]
    lines.extend(f"- {item}" for item in sections["failed"])
    lines.extend(["", "# Retested And Passed", ""])
    lines.extend(f"- {item}" for item in sections["retested_and_passed"])
    lines.extend(["", "# Tested", ""])
    lines.extend(f"- {item}" for item in sections["tested"])
    return "\n".join(lines).rstrip() + "\n"


def validate_mv_sections(
    tested_and_passed: str | Iterable[str],
    partially_tested: str | Iterable[str],
    failed: str | Iterable[str],
    retested_and_passed: str | Iterable[str],
) -> dict[str, object]:
    original = {
        "tested_and_passed": normalize_mv_items(tested_and_passed),
        "partially_tested": [],
        "failed": normalize_mv_items(failed),
        "retested_and_passed": normalize_mv_items(retested_and_passed),
    }
    priority = (
        "retested_and_passed",
        "tested_and_passed",
        "failed",
        "partially_tested",
    )
    labels = {
        "tested_and_passed": "Tested And Passed",
        "partially_tested": "Partially Tested",
        "failed": "Failed",
        "retested_and_passed": "Retested And Passed",
    }
    sections = {name: [] for name in original}
    kept_by_key: dict[str, str] = {}
    for section_name in priority:
        for item in original[section_name]:
            key = _item_key(item)
            if key in kept_by_key:
                continue
            kept_by_key[key] = section_name
            sections[section_name].append(item)

    warnings: list[dict[str, str]] = []
    for section_name, items in original.items():
        for item in items:
            kept_section = kept_by_key[_item_key(item)]
            if kept_section != section_name:
                warnings.append(
                    {
                        "item": item,
                        "removed_from": labels[section_name],
                        "kept_in": labels[kept_section],
                    }
                )

    return {
        "sections": sections,
        "counts": {name: len(items) for name, items in sections.items()},
        "warnings": warnings,
    }


def format_mv_report(sections: dict[str, list[str]]) -> str:
    lines: list[str] = ["# Tested And Passed", ""]
    lines.extend(f"- {item}" for item in sections["tested_and_passed"])
    lines.extend(["", "# Partially Tested", ""])
    lines.extend(f"- {item}" for item in sections["partially_tested"])
    lines.extend(["", "# Failed", ""])
    lines.extend(f"- {item}" for item in sections["failed"])
    lines.extend(["", "# Retested And Passed", ""])
    lines.extend(f"- {item}" for item in sections["retested_and_passed"])
    return "\n".join(lines).rstrip() + "\n"


def parse_report_text(text: str) -> dict[str, list[str]]:
    raw_sections: dict[str, list[str]] = {
        "failed": [],
        "retested_and_passed": [],
        "tested": [],
    }
    current_section: str | None = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith("#"):
            heading = line.lstrip("#").strip().lower()
            current_section = HEADING_MAP.get(heading)
            continue
        if current_section is not None:
            raw_sections[current_section].append(raw_line)

    validation = validate_sections(
        raw_sections["failed"],
        raw_sections["retested_and_passed"],
        raw_sections["tested"],
    )
    return validation["sections"]  # type: ignore[return-value]


def parse_mv_report_text(text: str) -> dict[str, list[str]]:
    raw_sections: dict[str, list[str]] = {
        "tested_and_passed": [],
        "partially_tested": [],
        "failed": [],
        "retested_and_passed": [],
    }
    current_section: str | None = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith("#"):
            heading = line.lstrip("#").strip().lower()
            current_section = MV_HEADING_MAP.get(heading)
            if current_section == "partially_tested":
                current_section = None
            continue
        if current_section is not None:
            raw_sections[current_section].append(raw_line)

    validation = validate_mv_sections(
        raw_sections["tested_and_passed"],
        raw_sections["partially_tested"],
        raw_sections["failed"],
        raw_sections["retested_and_passed"],
    )
    return validation["sections"]  # type: ignore[return-value]


def read_report(report_dir: Path, report_name: str) -> dict[str, object]:
    path = report_path(report_dir, report_name)
    if not path.exists():
        raise FileNotFoundError(f"Daily report not found: {path.name}")
    text = path.read_text(encoding="utf-8-sig")
    sections = parse_report_text(text)
    stat = path.stat()
    return {
        "report_name": path.name,
        "modified_at": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
        "sections": sections,
        "counts": {name: len(items) for name, items in sections.items()},
    }


def list_reports(report_dir: Path) -> list[dict[str, object]]:
    if not report_dir.exists():
        return []
    reports: list[dict[str, object]] = []
    for path in report_dir.glob("*.md"):
        try:
            reports.append(read_report(report_dir, path.name))
        except (OSError, ReportNameError, UnicodeError):
            continue
    reports.sort(key=lambda report: str(report["modified_at"]), reverse=True)
    return reports


def read_mv_report(report_dir: Path, report_name: str) -> dict[str, object]:
    path = report_path(report_dir, report_name)
    if not path.exists():
        raise FileNotFoundError(f"MV daily report not found: {path.name}")
    text = path.read_text(encoding="utf-8-sig")
    sections = parse_mv_report_text(text)
    stat = path.stat()
    return {
        "report_name": path.name,
        "modified_at": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
        "sections": sections,
        "counts": {name: len(items) for name, items in sections.items()},
    }


def list_mv_reports(report_dir: Path) -> list[dict[str, object]]:
    if not report_dir.exists():
        return []
    reports: list[dict[str, object]] = []
    for path in report_dir.glob("*.md"):
        try:
            reports.append(read_mv_report(report_dir, path.name))
        except (OSError, ReportNameError, UnicodeError):
            continue
    reports.sort(key=lambda report: str(report["modified_at"]), reverse=True)
    return reports


def _write_report_content(
    report_dir: Path,
    report_name: str,
    content: str,
    *,
    overwrite: bool,
) -> Path:
    report_dir.mkdir(parents=True, exist_ok=True)
    path = report_path(report_dir, report_name)
    if path.exists() and not overwrite:
        raise FileExistsError(f"Daily report already exists: {path.name}")

    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            newline="\n",
            dir=report_dir,
            prefix=f".{path.stem}-",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_path = Path(temporary.name)
        os.replace(temporary_path, path)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink(missing_ok=True)
    return path


def write_report(
    report_dir: Path,
    report_name: str,
    sections: dict[str, list[str]],
    *,
    overwrite: bool,
) -> Path:
    return _write_report_content(
        report_dir,
        report_name,
        format_report(sections),
        overwrite=overwrite,
    )


def write_mv_report(
    report_dir: Path,
    report_name: str,
    sections: dict[str, list[str]],
    *,
    overwrite: bool,
) -> Path:
    return _write_report_content(
        report_dir,
        report_name,
        format_mv_report(sections),
        overwrite=overwrite,
    )


def site_report_name(value: str) -> str:
    name = normalize_report_name(value)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.md", name, re.I):
        raise ReportNameError("Onsite/Offsite reports require YYYY-MM-DD.md.")
    return name


def validate_site_sections(tested_and_passed: str, failed: str, retested_and_passed: str) -> dict[str, object]:
    from scripts.etl.daily_report_sources import clean_item
    sections: dict[str, list[str]] = {}
    for status, text in (("tested_and_passed", tested_and_passed), ("failed", failed),
                         ("retested_and_passed", retested_and_passed)):
        items = []
        for line in text.splitlines():
            if not line.strip():
                continue
            item = clean_item(line)
            if item is None:
                raise ValueError(f"Invalid test item in {status}: {line.strip()}")
            items.append(item)
        # Preserve repeated lines and cross-section occurrences for the audit.
        sections[status] = items
    return {"sections": sections, "counts": {name: len(items) for name, items in sections.items()}, "warnings": []}


def read_site_report(report_dir: Path, report_name: str, site: str) -> dict[str, object]:
    from scripts.etl.daily_report_sources import parse_events
    path = report_path(report_dir, site_report_name(report_name))
    text = path.read_text(encoding="utf-8-sig")
    source = "Onsite_Test_Report" if site == "onsite" else "Offsite_Test_Report"
    sections: dict[str, list[str]] = {name: [] for name in ("tested_and_passed", "failed", "retested_and_passed")}
    for event in parse_events(text, source=source, report_name=path.name, day=path.stem):
        status = "tested_and_passed" if event["status"] == "tested" else event["status"]
        sections[status].append(event["equipment_key"])
    return {"report_name": path.name, "site": site,
            "modified_at": datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat(),
            "sections": sections, "counts": {name: len(items) for name, items in sections.items()}}


def list_site_reports(report_dir: Path, site: str) -> list[dict[str, object]]:
    reports = []
    for path in report_dir.glob("*.md"):
        try:
            reports.append(read_site_report(report_dir, path.name, site))
        except (ReportNameError, OSError, UnicodeError):
            # The audit exposes skipped filenames; malformed files must not hide
            # every valid report in the editor's list.
            continue
    return sorted(reports, key=lambda report: str(report["report_name"]), reverse=True)


def write_site_report(report_dir: Path, report_name: str, sections: dict[str, list[str]], *, overwrite: bool) -> Path:
    lines = []
    for name, heading in (("tested_and_passed", "Tested And Passed"), ("failed", "Failed"),
                          ("retested_and_passed", "Retested And Passed")):
        lines.extend([f"# {heading}", "", *[f"- {item}" for item in sections[name]], ""])
    return _write_report_content(report_dir, site_report_name(report_name), "\n".join(lines).rstrip() + "\n", overwrite=overwrite)
