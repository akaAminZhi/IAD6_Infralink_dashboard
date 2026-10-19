"""Guarded incremental CxAlloy entry point; the vendor UI lives in EPS Tracker."""
from __future__ import annotations

import argparse
from collections import defaultdict
from dataclasses import replace
import importlib.util
from pathlib import Path
import sys
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.etl.build_cxalloy_report_status import get_tracker_root, valid_upload_history  # noqa: E402
from scripts.etl.cxalloy_upload_plan import UploadPlan, plan_upload  # noqa: E402


def choose_site_files(plan: UploadPlan, paths: tuple[Path, ...], existing: set[str]) -> tuple[dict[Path, str], list[Path]]:
    """Reuse verified historical names; never silently re-upload a missing alias."""
    selected: dict[Path, str] = {}
    uploads: list[Path] = []
    if plan.review_paths:
        raise ValueError("Upload history cannot verify changed reports; manual review required.")
    for path in paths:
        aliases = plan.aliases.get(path, set())
        if aliases:
            candidates = aliases & existing
            if not candidates:
                raise ValueError(f"Recorded uploaded report is absent from the CxAlloy file list: {path.name}")
            selected[path] = sorted(candidates, key=str.casefold)[0]
        else:
            selected[path] = path.name
            if path.name not in existing:
                uploads.append(path)
    known = {name for names in plan.aliases.values() for name in names} | {path.name for path in paths}
    if uploads and any(name.lower().endswith(".pdf") and name not in known for name in existing):
        raise ValueError("CxAlloy contains unverified PDF filenames; reconcile upload history before adding files.")
    return selected, uploads


def load_uploader(root: Path):
    source = root / "upload_cxalloy_reports.py"
    spec = importlib.util.spec_from_file_location("iad6_guarded_cxalloy_vendor", source)
    if spec is None or spec.loader is None:
        raise RuntimeError("CxAlloy uploader is unavailable.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    sys.path.insert(0, str(root))
    spec.loader.exec_module(module)
    return module


def install_guard(uploader, plans: dict[str, UploadPlan], files_by_target: dict[str, list[Any]]) -> None:
    def upload_increment(page, report, force, timeout_ms):
        key = report.target_equipment.casefold()
        plan = plans[key]
        paths = uploader.report_pdf_paths(report)
        items = files_by_target[key]
        if any(uploader.sha256_file(item.pdf_path) != item.sha256 for item in items):
            return uploader.row_from_report(report, "upload_failed", "PDF changed after planning; rerun dry-run.")
        container = uploader.upload_container(page, timeout_ms)
        if container is None:
            return uploader.row_from_report(report, "upload_row_not_found", "NETA upload row not found.")
        count = uploader.attachment_count(container)
        if not uploader.click_line_file_button(page, container, timeout_ms):
            return uploader.row_from_report(report, "upload_failed", "Cannot open file list.")
        if not uploader.wait_for_file_modal_ready(page, count, timeout_ms):
            return uploader.row_from_report(report, "upload_failed", "Cannot read complete file list.")
        try:
            existing = set(uploader.modal_file_names(page))
            if len(existing) < count:
                raise ValueError("CxAlloy file list is incomplete; no PDF was sent.")
            selected, new_paths = choose_site_files(plan, paths, existing)
        except ValueError as exc:
            return uploader.row_from_report(report, "upload_failed", str(exc))
        if new_paths:
            field = uploader.first_visible_locator([page.locator('.fancybox-opened input[type="file"]')])
            if field is None:
                return uploader.row_from_report(report, "upload_failed", "File upload control not found.")
            field.set_input_files([str(path) for path in new_paths], timeout=timeout_ms)
            for path in new_paths:
                uploader.modal_file_rows(page, path.name).first.wait_for(state="visible", timeout=timeout_ms)
        # Retain the original equipment answer filename, including after renaming.
        answer = selected[paths[0]]
        if not uploader.select_file_in_modal(page, answer, timeout_ms) or not uploader.save_file_modal(page, timeout_ms):
            return uploader.row_from_report(report, "upload_failed", "Could not save selected report.")
        page.wait_for_timeout(1000)
        uploader.wait_for_cxalloy(page, timeout_ms)
        if not uploader.answered_file_name(container) or answer not in container.inner_text(timeout=5_000):
            return uploader.row_from_report(report, "upload_failed", "Saved answer could not be verified.")
        # Record the names actually on site, not the newer local aliases.
        actual_items = [replace(item, pdf_path=item.pdf_path.with_name(selected[item.pdf_path])) for item in items]
        actual_report = replace(report, pdf_paths=tuple(path.with_name(selected[path]) for path in paths),
                                sha256=uploader.combined_sha256(actual_items))
        return uploader.row_from_report(actual_report, "uploaded" if new_paths else "skipped_existing_on_site")

    def guarded_upload(page, report, force, timeout_ms):
        try:
            return upload_increment(page, report, force, timeout_ms)
        except Exception:
            # Keep previous successful groups available for manifest persistence.
            return uploader.row_from_report(report, "upload_failed", "Could not safely finish this equipment; inspect CxAlloy before retrying.")

    uploader.upload_pdf_to_current_checklist = guarded_upload
    original_completed = uploader.completed_upload_keys

    def verified_completed(rows):
        rows = list(rows)
        keys = original_completed(valid_upload_history(rows))
        for target, files in files_by_target.items():
            history = [row for row in rows if row.get("target_equipment", "").casefold() == target]
            plan = plan_upload(files, history)
            if not plan.new_paths and not plan.review_paths:
                keys.add((target, uploader.combined_sha256(files)))
        return keys

    uploader.completed_upload_keys = verified_completed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--tracker-root", type=Path, default=get_tracker_root())
    wrapper, vendor_args = parser.parse_known_args(argv)
    root = wrapper.tracker_root.resolve()
    uploader = load_uploader(root)
    args = uploader.parse_args(vendor_args)
    if args.force:
        raise ValueError("Force is disabled in the guarded uploader to prevent duplicate reports.")
    if args.login:
        raise ValueError("Connect your account through Data Operations Refresh login.")
    for attribute in ("rename_manifest", "upload_manifest", "matrix_workbook", "customer_upload_csv"):
        path = getattr(args, attribute)
        setattr(args, attribute, path if path.is_absolute() else root / path)
    files, missing = uploader.load_report_inputs(args.rename_manifest, root)
    groups = uploader.group_reports_by_device(files)
    only = uploader.only_filter_values(args.only)
    selected = uploader.selected_reports(groups, only, args.limit)
    if only:
        missing = [row for row in missing if row.target_equipment.casefold() in only]
    files_by_target: dict[str, list[Any]] = defaultdict(list)
    for item in files:
        files_by_target[item.target_equipment.casefold()].append(item)
    rows = uploader.read_upload_manifest(args.upload_manifest)
    plans = {target: plan_upload(items, [row for row in rows if row.get("target_equipment", "").casefold() == target])
             for target, items in files_by_target.items()}
    completed = uploader.completed_upload_keys(valid_upload_history(rows))
    pending, skipped, blocked = [], [], []
    for report in selected:
        plan = plans[report.target_equipment.casefold()]
        if (report.target_equipment.casefold(), report.sha256) in completed or (not plan.new_paths and not plan.review_paths):
            skipped.append(uploader.row_from_report(report, "skipped_manifest_uploaded", "Verified unchanged uploaded PDF contents."))
        elif plan.review_paths:
            blocked.append(report)
        else:
            pending.append(report)
    print(f"Selected equipment groups: {len(selected)}")
    print(f"Already uploaded, including renamed reports: {len(skipped)}")
    print(f"Equipment needing new attachments: {len(pending)}")
    print(f"New local PDFs (site filenames checked before upload): {sum(len(plans[r.target_equipment.casefold()].new_paths) for r in pending)}")
    print(f"Blocked for manual review: {len(blocked)}; missing PDFs: {len(missing)}")
    for report in pending[:10]:
        plan = plans[report.target_equipment.casefold()]
        print(f"{report.target_equipment}: add {len(plan.new_paths)} PDF(s), reuse {sum(bool(names) for names in plan.aliases.values())} existing PDF(s)")
        if args.only:
            for path in plan.new_paths:
                print(f"  Add: {path.name}")
    if len(pending) > 10:
        print(f"... {len(pending) - 10} more equipment group(s); use --only to inspect one equipment.")
    for report in blocked:
        print(f"Review required: {report.target_equipment}")
    if args.dry_run:
        return 1 if blocked or missing else 0
    if blocked or missing:
        print("Upload stopped before opening CxAlloy; resolve review/missing PDFs first.")
        return 1
    if pending and not args.auth_state.exists():
        print("CxAlloy auth state not found. Connect your personal account first.")
        return 2
    install_guard(uploader, plans, files_by_target)
    result = skipped + (uploader.upload_reports(pending, args) if pending else [])
    uploader.append_upload_manifest(args.upload_manifest, result)
    uploader.rebuild_customer_upload_csv(args.upload_manifest, args.customer_upload_csv, groups)
    if not args.no_excel_update:
        equipment = uploader.matrix_equipment_ids_from_rows(result)
        if equipment:
            uploader.print_matrix_update_result(uploader.update_testing_matrix(args.matrix_workbook, args.matrix_sheet, equipment))
    for status, count in sorted(uploader.status_counts(result).items()):
        print(f"{status}: {count}")
    return 0 if all(row.status in uploader.EXCEL_COMPLETE_UPLOAD_STATUSES for row in result) else 1


if __name__ == "__main__":
    raise SystemExit(main())
