"""Run the full IAD6 dashboard ETL pipeline."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Callable

try:
    from .file_discovery import get_input_files
    from .json_utils import (
        file_metadata,
        load_records_json,
        selected_input_files_metadata,
        write_json as write_json_payload,
    )
    from . import build_data_quality_report
    from . import build_eps_test_execution
    from . import build_history_comparison
    from . import build_issue_attachment_manifest
    from . import build_neta_report_manifest
    from . import build_pdm_dataset
    from . import build_power_plan
    from . import build_summary
    from . import inspect_workbooks
    from . import match_equipment
    from . import normalize_cases
    from . import normalize_equipment
    from . import normalize_modules
except ImportError:
    from file_discovery import get_input_files
    from json_utils import (
        file_metadata,
        load_records_json,
        selected_input_files_metadata,
        write_json as write_json_payload,
    )

    import build_data_quality_report
    import build_eps_test_execution
    import build_history_comparison
    import build_issue_attachment_manifest
    import build_neta_report_manifest
    import build_pdm_dataset
    import build_power_plan
    import build_summary
    import inspect_workbooks
    import match_equipment
    import normalize_cases
    import normalize_equipment
    import normalize_modules


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
ETL_METADATA_OUTPUT_PATH = DATA_DIR / "etl_run_metadata.json"

OUTPUT_FILES = {
    "workbook_inspection": DATA_DIR / "workbook_inspection.json",
    "equipment": DATA_DIR / "equipment.json",
    "equipment_csv": DATA_DIR / "equipment.csv",
    "module_equipment_links_raw": DATA_DIR / "module_equipment_links_raw.json",
    "module_equipment_links_raw_csv": DATA_DIR / "module_equipment_links_raw.csv",
    "cases_raw": DATA_DIR / "cases_raw.json",
    "cases_raw_csv": DATA_DIR / "cases_raw.csv",
    "module_equipment_links": DATA_DIR / "module_equipment_links.json",
    "cases": DATA_DIR / "cases.json",
    "unmatched_module_equipment": DATA_DIR / "unmatched_module_equipment.json",
    "unmatched_cases": DATA_DIR / "unmatched_cases.json",
    "pdms": DATA_DIR / "pdms.json",
    "pdms_csv": DATA_DIR / "pdms.csv",
    "summary": DATA_DIR / "summary.json",
    "data_quality_report": DATA_DIR / "data_quality_report.json",
    "history_comparison": DATA_DIR / "history_comparison.json",
    "eps_test_summary": DATA_DIR / "eps_test_summary.json",
    "eps_pdm_execution": DATA_DIR / "eps_pdm_execution.json",
    "eps_module_execution": DATA_DIR / "eps_module_execution.json",
    "eps_test_items": DATA_DIR / "eps_test_items.json",
    "eps_failed_items": DATA_DIR / "eps_failed_items.json",
    "eps_incomplete_items": DATA_DIR / "eps_incomplete_items.json",
    "eps_not_found_items": DATA_DIR / "eps_not_found_items.json",
    "issue_attachment_manifest": DATA_DIR / "issue_attachment_manifest.json",
    "neta_report_manifest": DATA_DIR / "neta_report_manifest.json",
    "power_plan": DATA_DIR / "power_plan.json",
    "etl_run_metadata": ETL_METADATA_OUTPUT_PATH,
}

BASE_PIPELINE_STEPS: list[tuple[str, Callable[[], object]]] = [
    ("inspect_workbooks.py", inspect_workbooks.main),
    ("normalize_equipment.py", normalize_equipment.main),
    ("normalize_modules.py", normalize_modules.main),
    ("normalize_cases.py", normalize_cases.main),
]


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def ensure_output_folder() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def print_selected_input_files(input_files: dict[str, str]) -> None:
    print("")
    print("Selected input files")
    for label, path in selected_input_files_metadata(input_files).items():
        print(f"  {label}: {path['file_name']} | modified {path['modified_at']}")


def build_pipeline_steps(input_files: dict[str, str]) -> list[tuple[str, Callable[[], object]]]:
    return [
        *BASE_PIPELINE_STEPS,
        ("match_equipment.py", lambda: match_equipment.run_matching(input_files)),
        ("build_pdm_dataset.py", lambda: build_pdm_dataset.run_build(input_files)),
        ("build_summary.py", lambda: build_summary.run_build(input_files)),
        (
            "build_data_quality_report.py",
            lambda: build_data_quality_report.run_build(input_files),
        ),
        ("build_history_comparison.py", lambda: build_history_comparison.run_build(input_files)),
        ("build_eps_test_execution.py", lambda: build_eps_test_execution.run_build(input_files)),
        ("build_neta_report_manifest.py", build_neta_report_manifest.main),
        ("build_issue_attachment_manifest.py", build_issue_attachment_manifest.main),
        ("build_power_plan.py", build_power_plan.main),
    ]


def run_steps(input_files: dict[str, str]) -> bool:
    pipeline_steps = build_pipeline_steps(input_files)
    total_steps = len(pipeline_steps)

    for index, (name, step) in enumerate(pipeline_steps, start=1):
        print("")
        print(f"[{index}/{total_steps}] Running {name}...")
        try:
            step()
        except Exception as exc:
            print("")
            print(f"ERROR: ETL step failed: {name}")
            print(f"{type(exc).__name__}: {exc}")
            return False
        print(f"[{index}/{total_steps}] Finished {name}")

    return True


def get_output_files_metadata() -> dict[str, dict[str, str] | None]:
    return {
        name: file_metadata(path) if path.exists() else None
        for name, path in OUTPUT_FILES.items()
    }


def build_run_metadata(input_files: dict[str, str]) -> dict[str, object]:
    equipment = load_records_json(DATA_DIR / "equipment.json")
    pdms = load_records_json(DATA_DIR / "pdms.json")
    module_links = load_records_json(DATA_DIR / "module_equipment_links.json")
    cases = load_records_json(DATA_DIR / "cases.json")
    data_quality_report = load_json(DATA_DIR / "data_quality_report.json")
    eps_pdm_execution = load_records_json(DATA_DIR / "eps_pdm_execution.json")
    eps_module_execution = load_records_json(DATA_DIR / "eps_module_execution.json")
    eps_test_items = load_records_json(DATA_DIR / "eps_test_items.json")
    eps_failed_items = load_records_json(DATA_DIR / "eps_failed_items.json")

    data_quality_counts = {
        key: len(value)
        for key, value in data_quality_report.items()
        if isinstance(value, list)
    }

    return {
        "generated_at": datetime.now().astimezone().isoformat(),
        "selected_input_files": selected_input_files_metadata(input_files),
        "output_files": get_output_files_metadata(),
        "record_counts": {
            "equipment": len(equipment),
            "pdms": len(pdms),
            "module_equipment_links": len(module_links),
            "cases": len(cases),
            "eps_pdm_execution": len(eps_pdm_execution),
            "eps_module_execution": len(eps_module_execution),
            "eps_test_items": len(eps_test_items),
            "eps_failed_items": len(eps_failed_items),
        },
        "data_quality_counts": data_quality_counts,
    }


def write_run_metadata(input_files: dict[str, str]) -> dict[str, object]:
    metadata = build_run_metadata(input_files)
    write_json_payload(ETL_METADATA_OUTPUT_PATH, metadata)
    metadata["output_files"] = get_output_files_metadata()
    write_json_payload(ETL_METADATA_OUTPUT_PATH, metadata)
    return metadata


def print_final_summary(metadata: dict[str, object]) -> None:
    record_counts = metadata["record_counts"]
    data_quality_counts = metadata["data_quality_counts"]

    print("")
    print("ETL summary")
    print(f"  total equipment records: {record_counts['equipment']}")
    print(f"  total PDMs: {record_counts['pdms']}")
    print(f"  total module equipment links: {record_counts['module_equipment_links']}")
    print(f"  total cases: {record_counts['cases']}")
    print(
        "  cases missing issue image: "
        f"{data_quality_counts.get('cases_missing_issue_image', 0)}"
    )
    print(
        "  closed cases missing corrective images: "
        f"{data_quality_counts.get('closed_cases_missing_corrective_images', 0)}"
    )
    print(
        "  unmatched module equipment count: "
        f"{data_quality_counts.get('unmatched_module_equipment', 0)}"
    )
    print(f"  unmatched cases count: {data_quality_counts.get('unmatched_cases', 0)}")
    print(
        "  NETA completed but missing test report count: "
        f"{data_quality_counts.get('neta_completed_but_missing_test_report', 0)}"
    )
    eps_summary_path = DATA_DIR / "eps_test_summary.json"
    if eps_summary_path.exists():
        eps_summary = load_json(eps_summary_path)
        if isinstance(eps_summary, dict):
            print(
                "  EPS module equipment records: "
                f"{record_counts.get('eps_module_execution', 0)}"
            )
            print(
                "  EPS tracker test items: "
                f"{record_counts.get('eps_test_items', 0)}"
            )
            print(
                "  EPS failed module equipment: "
                f"{eps_summary.get('failed_count', 0)}"
            )
            print(
                "  Complete, waiting Infralink NETA completion: "
                f"{eps_summary.get('waiting_infralink_neta_count', 0)}"
            )
            yesterday = eps_summary.get("yesterday", {})
            if isinstance(yesterday, dict):
                print(
                    "  EPS yesterday tested / failed: "
                    f"{yesterday.get('new_tested_count', 0)} / "
                    f"{yesterday.get('new_failed_count', 0)}"
                )
            seven_day = eps_summary.get("seven_day", {})
            if isinstance(seven_day, dict):
                print(
                    "  EPS 7-day tested / failed / repaired: "
                    f"{seven_day.get('new_tested_count', 0)} / "
                    f"{seven_day.get('new_failed_count', 0)} / "
                    f"{seven_day.get('repaired_count', 0)}"
                )
    neta_manifest_path = DATA_DIR / "neta_report_manifest.json"
    if neta_manifest_path.exists():
        manifest = load_json(neta_manifest_path)
        records = manifest.get("records", []) if isinstance(manifest, dict) else []
        print(f"  linked NETA report files: {len(records)}")
    history_comparison_path = DATA_DIR / "history_comparison.json"
    if history_comparison_path.exists():
        comparison = load_json(history_comparison_path)
        if isinstance(comparison, dict):
            neta_complete = comparison.get("neta_complete", {})
            cases = comparison.get("cases", {})
            if isinstance(neta_complete, dict):
                print(
                    "  NETA complete added since 7-day baseline: "
                    f"{neta_complete.get('new_count', 0)}"
                )
            if isinstance(cases, dict):
                print(
                    "  cases added since 7-day baseline: "
                    f"{cases.get('new_count', 0)}"
                )
                print(
                    "  cases resolved since 7-day baseline: "
                    f"{cases.get('resolved_count', 0)}"
                )
    issue_attachment_manifest_path = DATA_DIR / "issue_attachment_manifest.json"
    if issue_attachment_manifest_path.exists():
        manifest = load_json(issue_attachment_manifest_path)
        records = manifest.get("records", []) if isinstance(manifest, dict) else []
        print(f"  linked issue attachment files: {len(records)}")
    power_plan_path = DATA_DIR / "power_plan.json"
    if power_plan_path.exists():
        power_plan = load_json(power_plan_path)
        if isinstance(power_plan, dict):
            print(f"  power plan pages: {power_plan.get('page_count', 0)}")
            print(
                "  matched power plan equipment: "
                f"{power_plan.get('matched_equipment_annotation_count', 0)} / "
                f"{power_plan.get('equipment_annotation_count', 0)}"
            )
    print(f"  output folder path: {DATA_DIR}")


def main() -> int:
    print("Starting IAD6 Infralink dashboard ETL")
    ensure_output_folder()

    try:
        input_files = get_input_files()
    except FileNotFoundError as exc:
        print("")
        print("ERROR: Missing required raw Excel input.")
        print(str(exc))
        print("")
        print("Expected folders:")
        print("  raw_data/module/")
        print("  raw_data/system_elements/")
        print("  raw_data/cases/")
        return 1

    print_selected_input_files(input_files)

    if not run_steps(input_files):
        return 1

    metadata = write_run_metadata(input_files)
    print_final_summary(metadata)
    print("")
    print("ETL complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
