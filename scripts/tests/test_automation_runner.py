from __future__ import annotations

import json
import os
from pathlib import Path
import time

import pytest

from scripts.automation.runner import AutomationConfig, TaskManager


def make_config(tmp_path: Path) -> AutomationConfig:
    dashboard = tmp_path / "IAD6_Infralink_dashboard"
    eps = tmp_path / "IAD6_EPS_Testing_Tracker"
    dashboard.mkdir()
    eps.mkdir()
    auth = tmp_path / "auth"
    auth.mkdir()
    return AutomationConfig(
        dashboard_root=dashboard,
        eps_root=eps,
        runtime_root=dashboard / "runtime" / "automation",
        jc2_auth_state=auth / "jc2.json",
        cxalloy_auth_state=auth / "cxalloy.json",
    )


def write_script(path: Path, body: str = "print('ok')\n") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")


def wait_for_status(
    manager: TaskManager,
    run_id: str,
    statuses: set[str],
    timeout: float = 8,
) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = manager.get_run(run_id)
        if run["status"] in statuses:
            return run
        time.sleep(0.05)
    raise AssertionError(f"Run did not reach {statuses}: {manager.get_run(run_id)}")


def test_build_command_uses_fixed_scripts_and_validated_options(tmp_path: Path) -> None:
    manager = TaskManager(make_config(tmp_path))
    command, cwd = manager.build_command(
        "download_neta_reports",
        {"headed": True, "force": True, "only": ["IAD06-PDU6-01A-1"], "limit": 2},
    )

    assert cwd == manager.config.eps_root
    assert command[2] == str(manager.config.eps_root / "download_neta_reports.py")
    assert command[3:] == [
        "--only",
        "IAD06-PDU6-01A-1",
        "--headed",
        "--force",
        "--limit",
        "2",
    ]

    with pytest.raises(ValueError, match="Unknown automation job"):
        manager.build_command("powershell")
    with pytest.raises(ValueError, match="does not support option"):
        manager.build_command("run_dashboard_etl", {"force": True})


def test_job_execution_captures_logs_and_persists_result(tmp_path: Path) -> None:
    config = make_config(tmp_path)
    write_script(config.eps_root / "wash_daily_test_report_data.py", "print('summary rebuilt')\n")
    manager = TaskManager(config)

    started = manager.start_job("wash_daily_reports")
    completed = wait_for_status(manager, started["run_id"], {"succeeded"})

    assert completed["steps"][0]["status"] == "succeeded"
    assert "summary rebuilt" in manager.read_log(started["run_id"])["content"]
    saved = json.loads(
        (config.runtime_root / f"{started['run_id']}.json").read_text(encoding="utf-8")
    )
    assert saved["status"] == "succeeded"


def test_onedrive_replace_denial_falls_back_without_stopping_job(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = make_config(tmp_path)
    write_script(config.eps_root / "wash_daily_test_report_data.py", "print('completed')\n")
    manager = TaskManager(config)

    def deny_replace(source: str | bytes | os.PathLike, destination: str | bytes | os.PathLike) -> None:
        raise PermissionError(5, "Access is denied", str(destination))

    monkeypatch.setattr(os, "replace", deny_replace)
    started = manager.start_job("wash_daily_reports")
    completed = wait_for_status(manager, started["run_id"], {"succeeded"})

    assert completed["status"] == "succeeded"
    saved = json.loads(
        (config.runtime_root / f"{started['run_id']}.json").read_text(encoding="utf-8")
    )
    assert saved["status"] == "succeeded"


def test_only_one_job_can_run_at_a_time(tmp_path: Path) -> None:
    config = make_config(tmp_path)
    write_script(
        config.eps_root / "wash_daily_test_report_data.py",
        "import time\nprint('started', flush=True)\ntime.sleep(2)\n",
    )
    manager = TaskManager(config)
    first = manager.start_job("wash_daily_reports")
    wait_for_status(manager, first["run_id"], {"running"})

    with pytest.raises(RuntimeError, match="already active"):
        manager.start_job("wash_daily_reports")

    manager.cancel(first["run_id"])
    wait_for_status(manager, first["run_id"], {"cancelled"})


def test_login_waits_for_page_confirmation(tmp_path: Path) -> None:
    config = make_config(tmp_path)
    write_script(
        config.eps_root / "download_jc2_excel_exports.py",
        "print('A browser window is open. Finish logging in to JC2, then return here.', flush=True)\n"
        "input('Press Enter after the JC2 page is visible...')\n"
        "print('saved', flush=True)\n",
    )
    manager = TaskManager(config)

    started = manager.start_login("jc2")
    waiting = wait_for_status(manager, started["run_id"], {"waiting_for_user"})
    assert waiting["steps"][0]["status"] == "waiting_for_user"

    manager.continue_login(started["run_id"])
    completed = wait_for_status(manager, started["run_id"], {"succeeded"})
    assert completed["status"] == "succeeded"


def test_cxalloy_upload_requires_confirmation_unless_dry_run(tmp_path: Path) -> None:
    config = make_config(tmp_path)
    write_script(config.eps_root / "upload_cxalloy_reports.py")
    manager = TaskManager(config)

    with pytest.raises(PermissionError, match="explicit confirmation"):
        manager.start_job("upload_cxalloy_reports")

    preview = manager.start_job("upload_cxalloy_reports", {"dry_run": True})
    wait_for_status(manager, preview["run_id"], {"succeeded"})
