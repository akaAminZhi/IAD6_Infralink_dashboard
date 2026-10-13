from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path
from types import SimpleNamespace

import pytest

from scripts.automation import cxalloy_upload
from scripts.automation.cxalloy_upload import choose_site_files, install_guard
from scripts.etl.build_cxalloy_report_status import combined_sha256
from scripts.etl.cxalloy_upload_plan import ReportEvidence, plan_upload


@dataclass
class InputReport(ReportEvidence):
    target_equipment: str = "PDU6-01A-1"


def report(path: Path, source: str, content: bytes = b"original") -> InputReport:
    path.write_bytes(content)
    return InputReport(source, path, hashlib.sha256(content).hexdigest())


def history(items, names=None, status="uploaded"):
    names = names or [item.pdf_path.name for item in items]
    return [{"source_path": "; ".join(item.source_path for item in items),
             "pdf_path": "; ".join("C:/old/" + name for name in names),
             "sha256": combined_sha256((Path(name), item.sha256) for item, name in zip(items, names)),
             "target_equipment": "PDU6-01A-1", "status": status}]


def test_renamed_group_is_skipped_by_verified_content(tmp_path):
    item = report(tmp_path / "report__2.pdf", "downloads/original.pdf")
    plan = plan_upload([item], history([item], ["report.pdf"]))
    assert plan.new_paths == plan.review_paths == []
    assert plan.aliases[item.pdf_path] == {"report.pdf"}


def test_added_cable_does_not_reupload_renamed_equipment_report(tmp_path):
    old = report(tmp_path / "report__2.pdf", "downloads/old.pdf")
    new = report(tmp_path / "cable.pdf", "downloads/cable.pdf", b"new cable")
    plan = plan_upload([old, new], history([old], ["report.pdf"]))
    names, files = choose_site_files(plan, (old.pdf_path, new.pdf_path), {"report.pdf"})
    assert files == [new.pdf_path]
    assert names[old.pdf_path] == "report.pdf"


def test_new_source_with_identical_bytes_reuses_known_content(tmp_path):
    old = report(tmp_path / "report.pdf", "downloads/old.pdf")
    duplicate = report(tmp_path / "renamed.pdf", "downloads/another.pdf")
    plan = plan_upload([old, duplicate], history([old]))
    assert plan.new_paths == plan.review_paths == []
    assert plan.aliases[duplicate.pdf_path] == {"report.pdf"}


@pytest.mark.parametrize("change", ["content", "duplicate_source", "invalid_hash", "missing_paths"])
def test_unverifiable_history_requires_review(tmp_path, change):
    item = report(tmp_path / "report.pdf", "downloads/old.pdf")
    uploaded = history([item])
    current = [item]
    if change == "content":
        current = [report(item.pdf_path, item.source_path, b"changed")]
    elif change == "duplicate_source":
        current.append(report(tmp_path / "copy.pdf", item.source_path))
    elif change == "invalid_hash":
        uploaded[0]["sha256"] = "invalid"
    else:
        uploaded[0]["pdf_path"] = ""
    plan = plan_upload(current, uploaded)
    assert plan.review_paths


def test_failed_history_never_proves_upload(tmp_path):
    item = report(tmp_path / "report.pdf", "downloads/old.pdf")
    plan = plan_upload([item], history([item], status="upload_failed"))
    assert plan.new_paths == [item.pdf_path]


def test_missing_recorded_site_filename_blocks_upload(tmp_path):
    old = report(tmp_path / "report__2.pdf", "downloads/old.pdf")
    plan = plan_upload([old], history([old], ["report.pdf"]))
    with pytest.raises(ValueError, match="absent"):
        choose_site_files(plan, (old.pdf_path,), set())


def test_same_name_site_file_is_never_uploaded_twice(tmp_path):
    item = report(tmp_path / "report.pdf", "downloads/old.pdf")
    plan = plan_upload([item], [])
    _, files = choose_site_files(plan, (item.pdf_path,), {"report.pdf"})
    assert files == []


def test_unknown_site_pdf_blocks_new_files(tmp_path):
    item = report(tmp_path / "report.pdf", "downloads/new.pdf")
    with pytest.raises(ValueError, match="unverified"):
        choose_site_files(plan_upload([item], []), (item.pdf_path,), {"different-name.pdf"})


@dataclass
class Group:
    target_equipment: str
    pdf_paths: tuple[Path, ...]
    sha256: str


def test_browser_guard_only_sends_new_file_and_records_actual_site_names(tmp_path):
    old = report(tmp_path / "report__2.pdf", "downloads/old.pdf")
    cable = report(tmp_path / "cable.pdf", "downloads/cable.pdf", b"cable")
    files = [old, cable]
    plan = plan_upload(files, history([old], ["report.pdf"]))
    group = Group("PDU6-01A-1", tuple(item.pdf_path for item in files), "group")
    sent, answers, saved = [], [], []
    field = SimpleNamespace(set_input_files=lambda paths, **kwargs: sent.extend(paths))
    row = SimpleNamespace(first=SimpleNamespace(wait_for=lambda **kwargs: None))
    container = SimpleNamespace(inner_text=lambda **kwargs: "report.pdf")
    vendor = SimpleNamespace(
        sha256_file=lambda path: hashlib.sha256(path.read_bytes()).hexdigest(),
        report_pdf_paths=lambda value: value.pdf_paths,
        upload_container=lambda *args: container,
        attachment_count=lambda *args: 1,
        click_line_file_button=lambda *args: True,
        wait_for_file_modal_ready=lambda *args: True,
        modal_file_names=lambda *args: {"report.pdf"},
        first_visible_locator=lambda *args: field,
        modal_file_rows=lambda *args: row,
        select_file_in_modal=lambda page, name, timeout: answers.append(name) or True,
        save_file_modal=lambda *args: True,
        wait_for_cxalloy=lambda *args: None,
        answered_file_name=lambda *args: "report.pdf",
        combined_sha256=lambda items: combined_sha256((item.pdf_path, item.sha256) for item in items),
        row_from_report=lambda value, status, error="": saved.append((value, status, error)) or saved[-1],
        completed_upload_keys=lambda rows: set(),
    )
    page = SimpleNamespace(locator=lambda *args: field, wait_for_timeout=lambda *args: None)
    install_guard(vendor, {"pdu6-01a-1": plan}, {"pdu6-01a-1": files})
    vendor.upload_pdf_to_current_checklist(page, group, False, 100)
    assert sent == [str(cable.pdf_path)]
    assert answers == ["report.pdf"]
    actual, status, error = saved[-1]
    assert status == "uploaded"
    assert actual.pdf_paths[0].name == "report.pdf"
    assert actual.sha256 == combined_sha256([(Path("report.pdf"), old.sha256), (cable.pdf_path, cable.sha256)])
    # A later run verifies the stored group while local names stay different.
    assert not plan_upload(files, history(files, [path.name for path in actual.pdf_paths])).new_paths

    sent.clear()
    old.pdf_path.write_bytes(b"changed since planning")
    vendor.upload_pdf_to_current_checklist(page, group, False, 100)
    assert sent == []
    assert saved[-1][1] == "upload_failed"

    old.pdf_path.write_bytes(b"original")
    def interrupted_upload(*args, **kwargs):
        raise TimeoutError("simulated network interruption")
    field.set_input_files = interrupted_upload
    vendor.upload_pdf_to_current_checklist(page, group, False, 100)
    assert saved[-1][1] == "upload_failed"
    assert "safely finish" in saved[-1][2]


@pytest.mark.parametrize("case,expected_code,skipped,new", [
    ("renamed", 0, 1, 0), ("added", 0, 0, 1), ("changed", 1, 0, 0),
])
def test_dry_run_never_opens_browser_or_writes_manifests(tmp_path, monkeypatch, capsys, case, expected_code, skipped, new):
    old = report(tmp_path / "old__2.pdf", "downloads/old.pdf")
    rows = history([old], ["old.pdf"])
    files = [old]
    if case == "added":
        files.append(report(tmp_path / "cable.pdf", "downloads/cable.pdf", b"cable"))
    if case == "changed":
        files = [report(old.pdf_path, old.source_path, b"changed")]
    group = Group("PDU6-01A-1", tuple(item.pdf_path for item in files), combined_sha256((item.pdf_path, item.sha256) for item in files))
    args = SimpleNamespace(force=False, login=False, only=[], limit=None, dry_run=True,
                           rename_manifest=Path("rename.csv"), upload_manifest=Path("upload.csv"),
                           matrix_workbook=Path("matrix.xlsx"), customer_upload_csv=Path("customer.csv"))
    vendor = SimpleNamespace(
        parse_args=lambda argv: args,
        load_report_inputs=lambda *args: (files, []),
        group_reports_by_device=lambda *args: [group],
        only_filter_values=lambda *args: set(),
        selected_reports=lambda *args: [group],
        read_upload_manifest=lambda *args: rows,
        completed_upload_keys=lambda *args: set(),
        row_from_report=lambda *args: SimpleNamespace(status="skipped_manifest_uploaded"),
    )
    monkeypatch.setattr(cxalloy_upload, "load_uploader", lambda root: vendor)
    before = sorted(path.name for path in tmp_path.iterdir())
    assert cxalloy_upload.main(["--tracker-root", str(tmp_path), "--dry-run"]) == expected_code
    assert sorted(path.name for path in tmp_path.iterdir()) == before
    output = capsys.readouterr().out
    assert f"Already uploaded, including renamed reports: {skipped}" in output
    assert f"Equipment needing new attachments: {new}" in output
    # No browser/write functions exist on this fake vendor, so any call fails.
    args.force = True
    with pytest.raises(ValueError, match="Force is disabled"):
        cxalloy_upload.main(["--tracker-root", str(tmp_path), "--dry-run"])
