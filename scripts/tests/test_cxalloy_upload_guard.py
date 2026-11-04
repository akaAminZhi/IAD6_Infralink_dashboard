from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path

import pytest

from scripts.automation import cxalloy_upload
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


@pytest.mark.parametrize("case", ["not_found", "wrong_answer"])
def test_invalidated_success_cannot_skip_upload_or_supply_aliases(tmp_path, case):
    item = report(tmp_path / "report.pdf", "downloads/old.pdf")
    rows = history([item])
    if case == "not_found":
        rows += history([item], status="equipment_not_found")
    else:
        rows[0].update(status="skipped_existing_on_site",
                       error="CxAlloy row already has answer file: ANOTHER-DEVICE.pdf.")
    rows += history([item], status="skipped_manifest_uploaded")
    plan = plan_upload([item], rows)
    assert plan.new_paths == [item.pdf_path]
    assert not any(plan.aliases.values())


def test_compatibility_cli_runs_tracker_without_extra_checks(tmp_path):
    # A fake Tracker proves its entry point runs even with force, without any
    # Dashboard manifest planning or browser access. Preserve its exit status.
    script = tmp_path / "upload_cxalloy_reports.py"
    script.write_text(
        "import sys\nfrom pathlib import Path\n"
        "assert Path.cwd() == Path(__file__).resolve().parent\n"
        "assert sys.argv[1:] == ['--dry-run', '--force', '--only', 'PDU6-01A-1']\n"
        "raise SystemExit(7)\n",
        encoding="utf-8",
    )
    assert cxalloy_upload.main([
        "--tracker-root", str(tmp_path), "--dry-run", "--force", "--only", "PDU6-01A-1",
    ]) == 7
