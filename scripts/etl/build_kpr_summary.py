"""Build the current monthly KPR presentation dataset."""

from __future__ import annotations

import json
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable

try:
    from .build_history_comparison import CLOSED_CASE_STATUSES, parse_export_date
    from .file_discovery import CASES_DIR, SYSTEM_ELEMENTS_DIR, get_input_files
    from .json_utils import (
        load_records_json,
        selected_input_files_metadata,
        write_json,
    )
    from .normalize_cases import normalize_cases
    from .normalize_equipment import normalize_equipment
except ImportError:
    from build_history_comparison import CLOSED_CASE_STATUSES, parse_export_date
    from file_discovery import CASES_DIR, SYSTEM_ELEMENTS_DIR, get_input_files
    from json_utils import load_records_json, selected_input_files_metadata, write_json
    from normalize_cases import normalize_cases
    from normalize_equipment import normalize_equipment


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
OUTPUT_PATH = DATA_DIR / "kpr_summary.json"
LIFECYCLE_CONFIG_PATH = PROJECT_ROOT / "config" / "equipment_lifecycle.json"
EPS_SNAPSHOT_DIR = DATA_DIR / "eps_history" / "snapshots"
EPS_SUMMARY_PATH = DATA_DIR / "eps_test_summary.json"
EPS_TEST_ITEMS_PATH = DATA_DIR / "eps_test_items.json"
EARLY_MONTH_CUTOFF_DAY = 7


def normalize_key(value: Any) -> str:
    return " ".join(str(value or "").strip().upper().split())


def number(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def load_json_object(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    return payload if isinstance(payload, dict) else {}


def parse_date_value(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def eps_summary_as_of_date(eps_summary: dict[str, Any], fallback: date) -> date:
    return (
        parse_date_value(eps_summary.get("source_date_label"))
        or parse_date_value(eps_summary.get("snapshot_date"))
        or fallback
    )


def discover_exports(
    folder: Path,
    pattern: str,
    through_date: date,
) -> dict[date, Path]:
    exports: dict[date, Path] = {}
    for path in folder.glob(pattern):
        if not path.is_file() or path.name.startswith("~$"):
            continue
        export_date = parse_export_date(path)
        if export_date > through_date:
            continue
        current = exports.get(export_date)
        if current is None or (path.stat().st_mtime, path.name) > (
            current.stat().st_mtime,
            current.name,
        ):
            exports[export_date] = path.resolve()
    return exports


def latest_before(exports: dict[date, Path], boundary: date) -> tuple[date, Path] | None:
    candidates = [(export_date, path) for export_date, path in exports.items() if export_date < boundary]
    return max(candidates, default=None)


def latest_export_through(
    exports: dict[date, Path],
    boundary: date,
) -> tuple[date, Path] | None:
    candidates = [
        (export_date, path)
        for export_date, path in exports.items()
        if export_date <= boundary
    ]
    return max(candidates, default=None)


def select_reporting_period(latest_data_date: date) -> dict[str, Any]:
    current_month_start = latest_data_date.replace(day=1)
    if latest_data_date.day <= EARLY_MONTH_CUTOFF_DAY:
        target_end = current_month_start - timedelta(days=1)
        return {
            "month_start": target_end.replace(day=1),
            "target_end": target_end,
            "selection_mode": "previous_complete_month",
        }
    return {
        "month_start": current_month_start,
        "target_end": latest_data_date,
        "selection_mode": "current_month_to_date",
    }


def load_lifecycle_config() -> dict[str, Any]:
    config = json.loads(LIFECYCLE_CONFIG_PATH.read_text(encoding="utf-8"))
    stages = config.get("stages")
    if not isinstance(stages, list) or not stages:
        raise ValueError("Equipment lifecycle config must define at least one stage.")
    return config


def linked_equipment_catalog(module_links: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    catalog: dict[str, dict[str, Any]] = {}
    for record in module_links:
        equipment_id = (
            record.get("matched_equipment_id")
            or record.get("normalized_equipment_id")
            or record.get("source_equipment_label")
        )
        key = normalize_key(equipment_id)
        if key and key not in catalog:
            catalog[key] = {
                "equipment_id": equipment_id,
                "status": None,
                "neta_complete": None,
            }
    return catalog


def index_equipment(
    records: Iterable[dict[str, Any]],
    allowed_keys: set[str],
) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for record in records:
        key = normalize_key(record.get("equipment_id"))
        if key and key in allowed_keys and key not in indexed:
            indexed[key] = record
    return indexed


def index_cases(records: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for record in records:
        key = normalize_key(record.get("case_id"))
        if key and key not in indexed:
            indexed[key] = record
    return indexed


def is_closed_case(record: dict[str, Any] | None) -> bool:
    if not record:
        return False
    return normalize_key(record.get("status")).casefold() in CLOSED_CASE_STATUSES


def is_open_case(record: dict[str, Any] | None) -> bool:
    return bool(record) and not is_closed_case(record)


def is_neta_complete(record: dict[str, Any]) -> bool:
    return record.get("neta_complete") is True


def neta_month_movement(
    current_ids: set[str],
    baseline_ids: set[str],
) -> dict[str, Any]:
    newly_completed_ids = current_ids - baseline_ids
    no_longer_complete_ids = baseline_ids - current_ids
    return {
        "newly_completed_count": len(newly_completed_ids),
        "no_longer_complete_count": len(no_longer_complete_ids),
        "net_change_count": len(current_ids) - len(baseline_ids),
        "no_longer_complete_equipment_ids": sorted(no_longer_complete_ids),
    }


def lifecycle_maps(
    config: dict[str, Any],
) -> tuple[dict[str, dict[str, Any]], dict[str, int], dict[str, str]]:
    stages = config["stages"]
    by_key = {str(stage["key"]): stage for stage in stages}
    order = {str(stage["key"]): index for index, stage in enumerate(stages)}
    status_to_stage: dict[str, str] = {}
    for stage in stages:
        if stage.get("source") != "status":
            continue
        for status in stage.get("statuses") or []:
            status_to_stage[normalize_key(status)] = str(stage["key"])
    return by_key, order, status_to_stage


def classify_lifecycle_stage(
    record: dict[str, Any],
    config: dict[str, Any],
) -> str:
    _, order, status_to_stage = lifecycle_maps(config)
    unmapped_key = str(config["unmapped_stage"]["key"])
    status_stage = status_to_stage.get(normalize_key(record.get("status")))
    neta_stage = next(
        (
            str(stage["key"])
            for stage in config["stages"]
            if stage.get("source") == "neta_complete"
        ),
        None,
    )

    if (
        is_neta_complete(record)
        and neta_stage is not None
        and (status_stage is None or order[status_stage] < order[neta_stage])
    ):
        return neta_stage
    return status_stage or unmapped_key


def lifecycle_summary(
    current_equipment: dict[str, dict[str, Any]],
    baseline_equipment: dict[str, dict[str, Any]],
    config: dict[str, Any],
) -> dict[str, Any]:
    by_key, order, _ = lifecycle_maps(config)
    unmapped = config["unmapped_stage"]
    stage_definitions = [
        {
            "key": str(stage["key"]),
            "label": str(stage["label"]),
            "color": str(stage["color"]),
            "order": index,
        }
        for index, stage in enumerate(config["stages"])
    ]
    stage_definitions.append(
        {
            "key": str(unmapped["key"]),
            "label": str(unmapped["label"]),
            "color": str(unmapped["color"]),
            "order": len(stage_definitions),
        }
    )

    current_stage_by_key = {
        key: classify_lifecycle_stage(record, config)
        for key, record in current_equipment.items()
    }
    baseline_stage_by_key = {
        key: classify_lifecycle_stage(record, config)
        for key, record in baseline_equipment.items()
    }
    current_counts = Counter(current_stage_by_key.values())
    baseline_counts = Counter(baseline_stage_by_key.values())
    transitions: Counter[tuple[str, str]] = Counter()
    advanced = 0
    regressed = 0
    unchanged = 0
    unmapped_key = str(unmapped["key"])

    for equipment_key, current_stage in current_stage_by_key.items():
        baseline_stage = baseline_stage_by_key.get(equipment_key)
        if baseline_stage is None:
            continue
        if baseline_stage == current_stage:
            unchanged += 1
            continue

        transitions[(baseline_stage, current_stage)] += 1
        if baseline_stage in order and current_stage in order:
            if order[current_stage] > order[baseline_stage]:
                advanced += 1
            else:
                regressed += 1

    stage_labels = {
        **{key: str(stage["label"]) for key, stage in by_key.items()},
        unmapped_key: str(unmapped["label"]),
    }
    unmapped_statuses = Counter(
        str(current_equipment[key].get("status") or "Blank")
        for key, stage in current_stage_by_key.items()
        if stage == unmapped_key
    )

    return {
        "config_version": config.get("schema_version", 1),
        "total_equipment": len(current_stage_by_key),
        "baseline_equipment": len(baseline_stage_by_key),
        "stages": [
            {
                **stage,
                "current_count": current_counts.get(stage["key"], 0),
                "baseline_count": baseline_counts.get(stage["key"], 0),
                "month_change": current_counts.get(stage["key"], 0)
                - baseline_counts.get(stage["key"], 0),
            }
            for stage in stage_definitions
        ],
        "advanced_count": advanced,
        "regressed_count": regressed,
        "unchanged_count": unchanged,
        "new_equipment_count": len(set(current_stage_by_key) - set(baseline_stage_by_key)),
        "transitions": [
            {
                "from_key": from_key,
                "from_label": stage_labels[from_key],
                "to_key": to_key,
                "to_label": stage_labels[to_key],
                "count": count,
                "direction": (
                    "advanced"
                    if from_key in order
                    and to_key in order
                    and order[to_key] > order[from_key]
                    else "regressed"
                    if from_key in order and to_key in order
                    else "unmapped"
                ),
            }
            for (from_key, to_key), count in transitions.most_common()
        ],
        "unmapped_statuses": [
            {"status": status, "count": count}
            for status, count in unmapped_statuses.most_common()
        ],
    }


def issue_performance(
    current_cases: dict[str, dict[str, Any]],
    baseline_cases: dict[str, dict[str, Any]],
    current_date: date,
) -> dict[str, Any]:
    current_ids = set(current_cases)
    baseline_ids = set(baseline_cases)
    new_ids = current_ids - baseline_ids
    resolved_ids = {
        case_id
        for case_id, current_case in current_cases.items()
        if is_closed_case(current_case) and not is_closed_case(baseline_cases.get(case_id))
    }
    current_open = [record for record in current_cases.values() if is_open_case(record)]
    baseline_open_count = sum(is_open_case(record) for record in baseline_cases.values())
    overdue_count = 0
    urgent_high_count = 0
    over_30_days_count = 0
    open_ages: list[int] = []

    for record in current_open:
        due_date = parse_date_value(record.get("due_date"))
        if due_date is not None and due_date < current_date:
            overdue_count += 1
        priority = normalize_key(record.get("priority"))
        if "URGENT" in priority or "HIGH" in priority:
            urgent_high_count += 1
        created_date = parse_date_value(record.get("created_at")) or parse_date_value(
            record.get("reported_on")
        )
        if created_date is not None:
            age_days = max(0, (current_date - created_date).days)
            open_ages.append(age_days)
            if age_days > 30:
                over_30_days_count += 1

    return {
        "month_start_open": baseline_open_count,
        "new_issues": len(new_ids),
        "resolved_issues": len(resolved_ids),
        "current_open": len(current_open),
        "overdue_open": overdue_count,
        "urgent_high_open": urgent_high_count,
        "open_over_30_days": over_30_days_count,
        "average_open_age_days": (
            round(sum(open_ages) / len(open_ages), 1) if open_ages else None
        ),
        "balance_adjustment": len(current_open)
        - (baseline_open_count + len(new_ids) - len(resolved_ids)),
    }


def load_eps_snapshots(through_date: date) -> dict[date, dict[str, Any]]:
    snapshots: dict[date, dict[str, Any]] = {}
    if not EPS_SNAPSHOT_DIR.exists():
        return snapshots
    for path in EPS_SNAPSHOT_DIR.glob("*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        source_date = parse_date_value(payload.get("source_date_label")) or parse_date_value(
            payload.get("snapshot_date")
        )
        if source_date is None or source_date > through_date:
            continue
        snapshots[source_date] = payload
    return snapshots


def latest_payload_before(
    payloads: dict[date, dict[str, Any]],
    boundary: date,
) -> tuple[date, dict[str, Any]] | None:
    candidates = [(payload_date, payload) for payload_date, payload in payloads.items() if payload_date < boundary]
    return max(candidates, default=None)


def latest_payload_through(
    payloads: dict[date, dict[str, Any]],
    boundary: date,
) -> tuple[date, dict[str, Any]] | None:
    candidates = [(payload_date, payload) for payload_date, payload in payloads.items() if payload_date <= boundary]
    return max(candidates, default=None)


def value_at_or_before(values: dict[date, int], target_date: date) -> int | None:
    available = [(value_date, value) for value_date, value in values.items() if value_date <= target_date]
    return max(available, default=(target_date, None))[1]


def monthly_trend(
    month_start: date,
    period_end: date,
    neta_values: dict[date, int],
    issue_values: dict[date, int],
    eps_values: dict[date, int],
) -> list[dict[str, Any]]:
    baseline_dates = {
        max((value_date for value_date in values if value_date < month_start), default=None)
        for values in (neta_values, issue_values, eps_values)
    }
    dates = {
        month_start,
        period_end,
        *(value_date for value_date in baseline_dates if value_date is not None),
        *(
            value_date
            for values in (neta_values, issue_values, eps_values)
            for value_date in values
            if month_start <= value_date <= period_end
        ),
    }
    return [
        {
            "date": value_date.isoformat(),
            "neta_complete": value_at_or_before(neta_values, value_date),
            "eps_passed": value_at_or_before(eps_values, value_date),
            "issue_backlog": value_at_or_before(issue_values, value_date),
        }
        for value_date in sorted(dates)
    ]


def eps_failure_type_breakdown(
    test_items: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    failure_types: dict[str, Counter[str]] = {}

    for item in test_items:
        status = normalize_key(item.get("item_status"))
        if status.startswith("FAILED"):
            bucket = "current_failed"
        elif status.startswith("FIXED"):
            bucket = "fixed_after_failure"
        else:
            continue

        tracker_type = str(
            item.get("tracker_type")
            or item.get("tracker_equipment_type")
            or "Unclassified"
        ).strip()
        tracker_type = tracker_type or "Unclassified"
        failure_types.setdefault(tracker_type, Counter())[bucket] += 1

    result = [
        {
            "tracker_type": tracker_type,
            "current_failed": counts["current_failed"],
            "fixed_after_failure": counts["fixed_after_failure"],
            "failure_history_total": (
                counts["current_failed"] + counts["fixed_after_failure"]
            ),
        }
        for tracker_type, counts in failure_types.items()
    ]
    return sorted(
        result,
        key=lambda item: (
            -item["failure_history_total"],
            -item["current_failed"],
            item["tracker_type"],
        ),
    )


def pdm_summary(
    pdms: list[dict[str, Any]],
    eps_pdms: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    eps_by_pdm = {normalize_key(record.get("pdm_name")): record for record in eps_pdms}
    testing_started_count = 0
    fully_ready_count = 0
    pipeline_counts = Counter()

    for pdm in pdms:
        pdm_name = normalize_key(pdm.get("pdm_name"))
        eps = eps_by_pdm.get(pdm_name, {})
        equipment_count = number(pdm.get("equipment_count"))
        neta_incomplete = number(pdm.get("neta_incomplete_count"))
        missing_reports = number(pdm.get("neta_missing_report_count"))
        open_cases = number(pdm.get("open_case_count"))
        missing_images = sum(
            1
            for equipment in pdm.get("equipment") or []
            for case_item in equipment.get("cases") or []
            if not str(case_item.get("issue_image") or "").strip()
        )
        started = (
            number(eps.get("started_module_equipment_count")) > 0
            or (equipment_count > 0 and neta_incomplete != equipment_count)
        )
        if started:
            testing_started_count += 1
        ready = (
            started
            and neta_incomplete == 0
            and missing_reports == 0
            and open_cases == 0
            and missing_images == 0
        )
        if ready:
            fully_ready_count += 1

        if ready:
            pipeline_counts["ready"] += 1
        elif (
            open_cases > 0
            or missing_reports > 0
            or number(eps.get("failed_count")) > 0
        ):
            pipeline_counts["at_risk"] += 1
        elif number(eps.get("waiting_infralink_neta_count")) > 0:
            pipeline_counts["waiting_neta"] += 1
        elif started:
            pipeline_counts["eps_in_progress"] += 1
        else:
            pipeline_counts["not_started"] += 1

    pipeline_definitions = [
        ("not_started", "Not Started", "#94a3b8"),
        ("eps_in_progress", "EPS In Progress", "#2563eb"),
        ("waiting_neta", "Waiting Infralink NETA", "#0d9488"),
        ("ready", "NETA Complete / Ready", "#16a34a"),
        ("at_risk", "At Risk", "#dc2626"),
    ]
    return (
        {
            "total_pdms": len(pdms),
            "testing_started_pdms": testing_started_count,
            "fully_ready_pdms": fully_ready_count,
        },
        {
            "total_pdms": len(pdms),
            "stages": [
                {
                    "key": key,
                    "label": label,
                    "color": color,
                    "count": pipeline_counts[key],
                }
                for key, label, color in pipeline_definitions
            ],
        },
    )


def build_kpr_summary(input_files: dict[str, str] | None = None) -> dict[str, Any]:
    selected_inputs = input_files or get_input_files()
    latest_data_date = parse_export_date(selected_inputs["system_elements"])
    reporting_period = select_reporting_period(latest_data_date)
    month_start = reporting_period["month_start"]
    target_period_end = reporting_period["target_end"]
    selection_mode = reporting_period["selection_mode"]

    system_exports = discover_exports(
        SYSTEM_ELEMENTS_DIR,
        "SystemElements_*.xlsx",
        latest_data_date,
    )
    case_exports = discover_exports(CASES_DIR, "Cases_*.xlsx", latest_data_date)
    report_system = latest_export_through(system_exports, target_period_end)
    if report_system is None or report_system[0] < month_start:
        raise FileNotFoundError(
            "No SystemElements export is available in the selected KPR reporting month "
            f"starting {month_start.isoformat()}."
        )
    period_end = report_system[0]
    report_cases = latest_export_through(case_exports, period_end)
    if report_cases is None or report_cases[0] < month_start:
        raise FileNotFoundError(
            "No Cases export is available in the selected KPR reporting month "
            f"starting {month_start.isoformat()}."
        )
    system_baseline = latest_before(system_exports, month_start)
    case_baseline = latest_before(case_exports, month_start)

    module_links = load_records_json(DATA_DIR / "module_equipment_links.json")
    pdms = load_records_json(DATA_DIR / "pdms.json")
    eps_pdms = load_records_json(DATA_DIR / "eps_pdm_execution.json")
    eps_summary = load_json_object(EPS_SUMMARY_PATH)
    tracker_as_of_date = eps_summary_as_of_date(eps_summary, latest_data_date)
    eps_test_items = load_records_json(EPS_TEST_ITEMS_PATH)
    equipment_catalog = linked_equipment_catalog(module_links)
    allowed_equipment_keys = set(equipment_catalog)
    lifecycle_config = load_lifecycle_config()

    equipment_cache: dict[Path, list[dict[str, Any]]] = {}
    cases_cache: dict[Path, list[dict[str, Any]]] = {}

    def equipment_records(path: Path) -> list[dict[str, Any]]:
        if path not in equipment_cache:
            equipment_cache[path] = normalize_equipment(str(path))
        return equipment_cache[path]

    def case_records(path: Path) -> list[dict[str, Any]]:
        if path not in cases_cache:
            cases_cache[path] = normalize_cases(str(path))
        return cases_cache[path]

    current_system_path = report_system[1]
    current_cases_path = report_cases[1]
    current_equipment = index_equipment(
        equipment_records(current_system_path),
        allowed_equipment_keys,
    )
    baseline_equipment = (
        index_equipment(equipment_records(system_baseline[1]), allowed_equipment_keys)
        if system_baseline
        else {}
    )
    for equipment_key, fallback_record in equipment_catalog.items():
        current_equipment.setdefault(equipment_key, fallback_record)
        baseline_equipment.setdefault(equipment_key, fallback_record)
    current_cases = index_cases(case_records(current_cases_path))
    baseline_cases = (
        index_cases(case_records(case_baseline[1])) if case_baseline else {}
    )

    current_neta_ids = {
        equipment_key
        for equipment_key, record in current_equipment.items()
        if is_neta_complete(record)
    }
    baseline_neta_ids = {
        equipment_key
        for equipment_key, record in baseline_equipment.items()
        if is_neta_complete(record)
    }
    neta_movement = neta_month_movement(current_neta_ids, baseline_neta_ids)
    issues = issue_performance(current_cases, baseline_cases, period_end)
    pdm_metrics, pipeline = pdm_summary(pdms, eps_pdms)

    eps_snapshots = load_eps_snapshots(latest_data_date)
    current_eps = latest_payload_through(eps_snapshots, period_end)
    baseline_eps = latest_payload_before(eps_snapshots, month_start)
    latest_eps = latest_payload_through(eps_snapshots, latest_data_date)
    current_passed = set(current_eps[1].get("tested_equipment") or []) if current_eps else set()
    baseline_passed = set(baseline_eps[1].get("tested_equipment") or []) if baseline_eps else set()
    current_failed = set(current_eps[1].get("failed_equipment") or []) if current_eps else set()
    baseline_failed = set(baseline_eps[1].get("failed_equipment") or []) if baseline_eps else set()
    current_fixed = set(current_eps[1].get("fixed_equipment") or []) if current_eps else set()
    baseline_fixed = set(baseline_eps[1].get("fixed_equipment") or []) if baseline_eps else set()

    neta_values: dict[date, int] = {}
    for export_date, path in system_exports.items():
        if export_date < month_start and (not system_baseline or path != system_baseline[1]):
            continue
        indexed = index_equipment(equipment_records(path), allowed_equipment_keys)
        neta_values[export_date] = sum(is_neta_complete(record) for record in indexed.values())

    issue_values: dict[date, int] = {}
    for export_date, path in case_exports.items():
        if export_date < month_start and (not case_baseline or path != case_baseline[1]):
            continue
        indexed = index_cases(case_records(path))
        issue_values[export_date] = sum(is_open_case(record) for record in indexed.values())

    eps_values = {
        snapshot_date: len(payload.get("tested_equipment") or [])
        for snapshot_date, payload in eps_snapshots.items()
        if snapshot_date >= month_start or (baseline_eps and snapshot_date == baseline_eps[0])
    }
    lifecycle = lifecycle_summary(
        current_equipment,
        baseline_equipment,
        lifecycle_config,
    )
    neta_completion_rate = (
        round((len(current_neta_ids) / lifecycle["total_equipment"]) * 100, 1)
        if lifecycle["total_equipment"]
        else 0.0
    )
    latest_equipment = index_equipment(
        equipment_records(Path(selected_inputs["system_elements"]).resolve()),
        allowed_equipment_keys,
    )
    latest_cases = index_cases(
        case_records(Path(selected_inputs["cases"]).resolve())
    )
    latest_neta_complete_count = sum(
        is_neta_complete(record) for record in latest_equipment.values()
    )
    latest_open_issue_count = sum(
        is_open_case(record) for record in latest_cases.values()
    )
    latest_eps_passed_count = (
        len(latest_eps[1].get("tested_equipment") or []) if latest_eps else 0
    )
    report_inputs = {
        **selected_inputs,
        "system_elements": str(current_system_path),
        "cases": str(current_cases_path),
    }

    return {
        "schema_version": 3,
        "generated_at": datetime.now().astimezone().isoformat(),
        "selected_input_files": selected_input_files_metadata(report_inputs),
        "latest_input_files": selected_input_files_metadata(selected_inputs),
        "period": {
            "month": month_start.strftime("%Y-%m"),
            "label": month_start.strftime("%B %Y"),
            "start_date": month_start.isoformat(),
            "end_date": period_end.isoformat(),
            "target_end_date": target_period_end.isoformat(),
            "latest_data_date": latest_data_date.isoformat(),
            "selection_mode": selection_mode,
            "system_baseline_date": system_baseline[0].isoformat()
            if system_baseline
            else None,
            "case_baseline_date": case_baseline[0].isoformat() if case_baseline else None,
            "eps_baseline_date": baseline_eps[0].isoformat() if baseline_eps else None,
            "is_month_to_date": selection_mode == "current_month_to_date",
        },
        "current_snapshot": {
            "as_of_date": latest_data_date.isoformat(),
            "case_as_of_date": parse_export_date(
                selected_inputs["cases"]
            ).isoformat(),
            "eps_as_of_date": latest_eps[0].isoformat() if latest_eps else None,
            "is_later_than_report": latest_data_date > period_end,
            "neta_complete_count": latest_neta_complete_count,
            "eps_passed_count": latest_eps_passed_count,
            "eps_current_failed": number(
                eps_summary.get("failed_test_item_count")
            ),
            "open_issue_count": latest_open_issue_count,
        },
        "executive_summary": {
            **pdm_metrics,
            "neta_completed_month": neta_movement["newly_completed_count"],
            "neta_no_longer_complete_month": neta_movement[
                "no_longer_complete_count"
            ],
            "neta_net_change_month": neta_movement["net_change_count"],
            "neta_complete_current": len(current_neta_ids),
            "neta_complete_baseline": len(baseline_neta_ids),
            "eps_passed_month": len(current_passed - baseline_passed),
            "eps_passed_current": len(current_passed),
            "eps_passed_baseline": len(baseline_passed),
            "eps_failed_month": len(current_failed - baseline_failed),
            "eps_fixed_month": len(current_fixed - baseline_fixed),
            "new_issues_month": issues["new_issues"],
            "resolved_issues_month": issues["resolved_issues"],
            "current_open_issues": issues["current_open"],
        },
        "monthly_trends": monthly_trend(
            month_start,
            period_end,
            neta_values,
            issue_values,
            eps_values,
        ),
        "monthly_progress": {
            "neta": {
                "current_complete": len(current_neta_ids),
                "baseline_complete": len(baseline_neta_ids),
                "completed_month": neta_movement["newly_completed_count"],
                "no_longer_complete_month": neta_movement[
                    "no_longer_complete_count"
                ],
                "net_change_month": neta_movement["net_change_count"],
                "no_longer_complete_equipment_ids": neta_movement[
                    "no_longer_complete_equipment_ids"
                ],
                "total_equipment": lifecycle["total_equipment"],
                "completion_rate": neta_completion_rate,
            },
            "eps": {
                "daily_passed_current": len(current_passed),
                "daily_passed_baseline": len(baseline_passed),
                "daily_passed_month": len(current_passed - baseline_passed),
                "tracker_total_test_items": number(
                    eps_summary.get("test_item_count")
                ),
                "tracker_passed_or_fixed": number(
                    eps_summary.get("passed_test_item_count")
                ),
                "tracker_current_failed": number(
                    eps_summary.get("failed_test_item_count")
                ),
                "tracker_fixed_after_failure": number(
                    eps_summary.get("fixed_test_item_count")
                ),
                "tracker_not_tested": number(
                    eps_summary.get("not_tested_test_item_count")
                ),
                "tracker_as_of_date": tracker_as_of_date.isoformat(),
            },
            "issues": {
                "month_start_open": issues["month_start_open"],
                "new_issues": issues["new_issues"],
                "resolved_issues": issues["resolved_issues"],
                "current_open": issues["current_open"],
            },
        },
        "eps_failure_types": eps_failure_type_breakdown(eps_test_items),
        "pdm_pipeline": pipeline,
        "equipment_lifecycle": lifecycle,
        "issue_performance": issues,
    }


def run_build(input_files: dict[str, str] | None = None) -> dict[str, Any]:
    summary = build_kpr_summary(input_files)
    write_json(OUTPUT_PATH, summary)
    return summary


def main() -> int:
    summary = run_build()
    print(
        "KPR summary: "
        f"{summary['period']['label']} | "
        f"{summary['executive_summary']['neta_completed_month']} NETA newly completed / "
        f"{summary['executive_summary']['neta_net_change_month']:+d} net | "
        f"{summary['executive_summary']['eps_passed_month']} EPS passed"
    )
    print(f"Wrote {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
