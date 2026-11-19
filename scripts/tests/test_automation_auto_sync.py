from __future__ import annotations

from datetime import datetime
from pathlib import Path

from scripts.automation.runner import (
    DAILY_PIPELINE,
    LIGHT_SYNC_PIPELINE,
    TaskManager,
)
from scripts.tests.test_automation_runner import make_config


class Clock:
    def __init__(self) -> None:
        self.now = 1_000_000.0

    def __call__(self) -> float:
        return self.now


def make_manager(tmp_path: Path) -> tuple[TaskManager, Clock, list[str]]:
    manager = TaskManager(make_config(tmp_path), start_auto_sync=False)
    clock = Clock()
    manager._clock = clock
    started: list[str] = []
    # Record worker starts instead of spawning subprocesses.
    manager._start_worker = lambda run_id, start_index: started.append(run_id)  # type: ignore[method-assign]
    return manager, clock, started


def finish(manager: TaskManager, run_id: str, status: str, error: str | None = None) -> None:
    with manager._lock:
        run = manager._runs[run_id]
        run["status"] = status
        run["error"] = error
        manager._active_run_id = None
    manager._on_run_finished(run)


def manual_pipeline(manager: TaskManager, status: str = "succeeded") -> str:
    run = manager._new_run(
        kind="pipeline",
        label="Daily Data Refresh",
        steps=list(DAILY_PIPELINE),
        options={"headed": False, "force": False},
        owner_user_id="local_operator",
    )
    finish(manager, run["run_id"], status, None if status == "succeeded" else "boom")
    return run["run_id"]


def test_manual_success_arms_and_restart_is_off(tmp_path: Path) -> None:
    manager, clock, started = make_manager(tmp_path)
    assert manager.auto_sync_status()["state"] == "off"
    manual_pipeline(manager)
    status = manager.auto_sync_status()
    assert status["state"] == "on"
    assert status["owner_user_id"] == "local_operator"
    assert manager._auto_sync_tick() is None  # not due yet
    clock.now += manager.auto_sync_interval_s
    run_id = manager._auto_sync_tick()
    assert run_id is not None and started == [run_id]
    run = manager.get_run(run_id)
    assert run["kind"] == "auto_sync"
    assert run["auto_mode"] == "light"
    assert [step["job_id"] for step in run["steps"]] == list(LIGHT_SYNC_PIPELINE)
    assert run["owner_user_id"] == "local_operator"

    # A fresh service instance (restart) does not inherit the armed state.
    restarted = TaskManager(manager.config, start_auto_sync=False)
    assert restarted.auto_sync_status()["state"] == "off"


def test_manual_failure_does_not_arm(tmp_path: Path) -> None:
    manager, clock, _ = make_manager(tmp_path)
    manual_pipeline(manager, status="failed")
    clock.now += 10_000
    assert manager._auto_sync_tick() is None
    assert manager.auto_sync_status()["state"] == "off"


def test_full_pipeline_runs_once_per_full_interval(tmp_path: Path) -> None:
    manager, clock, _ = make_manager(tmp_path)
    manual_pipeline(manager)
    modes = []
    for _ in range(6):
        clock.now += manager.auto_sync_interval_s
        run_id = manager._auto_sync_tick()
        assert run_id
        modes.append(manager.get_run(run_id)["auto_mode"])
        finish(manager, run_id, "succeeded")
    # 10-minute light syncs; the sixth tick reaches 60 minutes since the last full run.
    assert modes == ["light"] * 5 + ["full"]
    full_run = manager.list_runs()[0]
    assert [step["job_id"] for step in full_run["steps"]] == list(DAILY_PIPELINE)


def test_waits_while_another_task_is_active(tmp_path: Path) -> None:
    manager, clock, started = make_manager(tmp_path)
    manual_pipeline(manager)
    other = manager._new_run(kind="job", label="x", steps=["run_dashboard_etl"], options={})
    clock.now += manager.auto_sync_interval_s
    assert manager._auto_sync_tick() is None
    assert manager.auto_sync_status()["state"] == "waiting_for_idle"
    finish(manager, other["run_id"], "succeeded")
    assert manager._auto_sync_tick() is not None
    assert len(started) == 1


def test_running_state_reports_mode_and_step(tmp_path: Path) -> None:
    manager, clock, _ = make_manager(tmp_path)
    manual_pipeline(manager)
    clock.now += manager.auto_sync_interval_s
    run_id = manager._auto_sync_tick()
    with manager._lock:
        manager._runs[run_id]["status"] = "running"
        manager._runs[run_id]["current_step"] = "refresh_jc2_exports"
    status = manager.auto_sync_status()
    assert status["state"] == "running"
    assert status["active_run_id"] == run_id
    assert status["active_mode"] == "light"
    assert status["current_step"] == "Refresh JC2 Excel Exports"


def test_auth_failure_and_cancel_stop_auto_sync(tmp_path: Path) -> None:
    for status, error in (
        ("auth_required", "Refresh JC2 Excel Exports requires a refreshed browser login."),
        ("failed", "Run Dashboard ETL exited with code 1."),
        ("cancelled", "Run cancelled by user."),
    ):
        (tmp_path / status).mkdir()
        manager, clock, _ = make_manager(tmp_path / status)
        manual_pipeline(manager)
        clock.now += manager.auto_sync_interval_s
        run_id = manager._auto_sync_tick()
        finish(manager, run_id, status, error)
        result = manager.auto_sync_status()
        assert result["state"] == "stopped"
        assert result["stopped_reason"] == error
        clock.now += 10_000
        assert manager._auto_sync_tick() is None
        # A successful manual refresh re-arms it.
        manual_pipeline(manager)
        assert manager.auto_sync_status()["state"] == "on"


def test_auto_runs_are_trimmed_separately(tmp_path: Path) -> None:
    manager, clock, _ = make_manager(tmp_path)
    manual_ids = []
    for _ in range(3):
        manual_ids.append(manual_pipeline(manager))
    for _ in range(25):
        clock.now += manager.auto_sync_interval_s * 7
        run_id = manager._auto_sync_tick()
        finish(manager, run_id, "succeeded")
    runs = manager.list_runs()
    assert sum(run["kind"] == "auto_sync" for run in runs) == 20
    assert all(any(run["run_id"] == rid for run in runs) for rid in manual_ids)


def test_full_auto_run_uses_pipeline_options(tmp_path: Path) -> None:
    manager, _, _ = make_manager(tmp_path)
    run = {"kind": "auto_sync", "options": {"headed": False, "force": False}}
    assert manager._options_for_step(run, "download_neta_reports") == {
        "headed": False,
        "force": False,
    }


def write_export(folder: Path, name: str) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / name
    path.write_bytes(b"x")
    return path


def test_prunes_only_previous_same_day_auto_exports(tmp_path: Path) -> None:
    manager, _, _ = make_manager(tmp_path)
    raw = manager.config.dashboard_root / "raw_data" / "system_elements"
    raw_cases = manager.config.dashboard_root / "raw_data" / "cases"
    excel = manager.config.eps_root / "Excel" / "system_elements"
    manual = write_export(raw, "SystemElements_manual.xlsx")
    older_day = write_export(raw, "SystemElements_yesterday.xlsx")
    manager._runs["r"] = {"run_id": "r"}

    before = manager._export_snapshot()
    first = [write_export(raw, "SystemElements_a1.xlsx"), write_export(excel, "SystemElements_a1.xlsx"),
             write_export(raw_cases, "Cases_a1.xlsx")]
    manager._prune_superseded_auto_exports("r", before)
    assert all(path.exists() for path in first)

    # Previous-day auto exports are never deleted.
    manager._auto["exports"]["date"] = "2000-01-01"
    manager._auto["exports"]["files"].append(str(older_day))
    before = manager._export_snapshot()
    second = [write_export(raw, "SystemElements_a2.xlsx"), write_export(excel, "SystemElements_a2.xlsx"),
              write_export(raw_cases, "Cases_a2.xlsx")]
    manager._prune_superseded_auto_exports("r", before)
    assert all(path.exists() for path in first + second) and older_day.exists()

    # Same day: the previous auto export is replaced, but only in families that got a new file.
    before = manager._export_snapshot()
    third = [write_export(raw, "SystemElements_a3.xlsx"), write_export(excel, "SystemElements_a3.xlsx")]
    manager._prune_superseded_auto_exports("r", before)
    assert all(path.exists() for path in third)
    assert not (raw / "SystemElements_a2.xlsx").exists()
    assert not (excel / "SystemElements_a2.xlsx").exists()
    assert (raw_cases / "Cases_a2.xlsx").exists()
    assert manual.exists() and older_day.exists()
    assert manager._auto["exports"]["date"] == datetime.now().date().isoformat()


def test_interval_settings_validate_persist_and_reschedule(tmp_path: Path) -> None:
    manager, clock, _ = make_manager(tmp_path)
    for light, full in ((0, 60), (10, 5), (10, 2000), (True, 60)):
        try:
            manager.update_auto_sync_settings(light, full)
        except ValueError:
            continue
        raise AssertionError(f"accepted {light}/{full}")

    manual_pipeline(manager)
    finished_at = clock.now
    clock.now += 60
    status = manager.update_auto_sync_settings(3, 30)
    assert status["interval_minutes"] == 3 and status["full_interval_minutes"] == 30
    # The waiting run is rescheduled from when the previous run finished.
    assert manager._auto["next_run_at"] == finished_at + 180
    clock.now = finished_at + 179
    assert manager._auto_sync_tick() is None
    clock.now = finished_at + 180
    assert manager._auto_sync_tick() is not None

    restarted = TaskManager(manager.config, start_auto_sync=False)
    assert restarted.auto_sync_interval_s == 180
    assert restarted.auto_full_interval_s == 1800


def test_settings_api_updates_intervals(tmp_path: Path) -> None:
    from fastapi.testclient import TestClient

    from scripts.automation.api import create_app
    from scripts.automation.auth import require_operator

    manager, _, _ = make_manager(tmp_path)
    app = create_app(manager.config, manager)
    app.dependency_overrides[require_operator] = lambda: "user_test_operator"
    client = TestClient(app)
    url = "/api/automation/auto-sync/settings"
    response = client.put(url, json={"light_minutes": 5, "full_minutes": 45})
    assert response.status_code == 200
    assert response.json()["interval_minutes"] == 5
    assert client.get("/api/automation/health").json()["auto_sync"]["full_interval_minutes"] == 45
    assert client.put(url, json={"light_minutes": 20, "full_minutes": 10}).status_code == 422
    assert client.put(url, json={"light_minutes": 0, "full_minutes": 10}).status_code == 422


def test_non_owner_sees_global_auto_sync_but_cannot_edit(tmp_path: Path) -> None:
    from fastapi.testclient import TestClient

    from scripts.automation.api import create_app
    from scripts.automation.auth import require_operator

    manager, clock, _ = make_manager(tmp_path)
    app = create_app(manager.config, manager)
    client = TestClient(app)
    manual_pipeline(manager)  # owned by local_operator
    clock.now += manager.auto_sync_interval_s
    run_id = manager._auto_sync_tick()
    with manager._lock:
        manager._runs[run_id]["status"] = "running"

    app.dependency_overrides[require_operator] = lambda: "user_other"
    other = client.get("/api/automation/health").json()["auto_sync"]
    assert other["state"] == "running"
    assert other["owned_by_other"] is True
    assert other["active_run_id"] is None
    assert "owner_user_id" not in other
    url = "/api/automation/auto-sync/settings"
    assert client.put(url, json={"light_minutes": 5, "full_minutes": 30}).status_code == 403

    app.dependency_overrides[require_operator] = lambda: "local_operator"
    owner = client.get("/api/automation/health").json()["auto_sync"]
    assert owner["owned_by_other"] is False
    assert owner["active_run_id"] == run_id
    assert client.put(url, json={"light_minutes": 5, "full_minutes": 30}).status_code == 200

    # The other operator's successful manual refresh takes the single auto-sync over.
    finish(manager, run_id, "succeeded")
    run = manager._new_run(kind="pipeline", label="Daily Data Refresh", steps=list(DAILY_PIPELINE),
                           options={}, owner_user_id="user_other")
    finish(manager, run["run_id"], "succeeded")
    assert manager.auto_sync_status()["owner_user_id"] == "user_other"
    clock.now += manager.auto_sync_interval_s
    next_run = manager._auto_sync_tick()
    assert manager.get_run(next_run)["owner_user_id"] == "user_other"
    assert manager._auto_sync_tick() is None  # still one auto-sync, never two
