from __future__ import annotations

from pathlib import Path
import time

from fastapi.testclient import TestClient

from scripts.automation.api import create_app
from scripts.automation.runner import AutomationConfig, TaskManager


def make_client(tmp_path: Path) -> tuple[TestClient, AutomationConfig, TaskManager]:
    dashboard = tmp_path / "dashboard"
    eps = tmp_path / "eps"
    dashboard.mkdir()
    eps.mkdir()
    (eps / "wash_daily_test_report_data.py").write_text(
        "print('daily summary updated')\n", encoding="utf-8"
    )
    config = AutomationConfig(
        dashboard_root=dashboard,
        eps_root=eps,
        runtime_root=dashboard / "runtime" / "automation",
        jc2_auth_state=tmp_path / "jc2.json",
        cxalloy_auth_state=tmp_path / "cx.json",
    )
    manager = TaskManager(config)
    return TestClient(create_app(config, manager)), config, manager


def wait_until_idle(manager: TaskManager) -> None:
    deadline = time.time() + 5
    while manager.has_active_run() and time.time() < deadline:
        time.sleep(0.05)
    assert not manager.has_active_run()


def test_health_and_daily_report_round_trip(tmp_path: Path) -> None:
    client, config, manager = make_client(tmp_path)
    health = client.get("/api/automation/health")
    assert health.status_code == 200
    assert health.json()["eps_tracker_root"] == str(config.eps_root)

    validation = client.post(
        "/api/automation/daily-reports/validate",
        json={
            "failed": "- ITEM-A\nITEM-B",
            "retested_and_passed": "ITEM-B",
            "tested": "ITEM-C",
        },
    )
    assert validation.status_code == 200
    assert validation.json()["counts"] == {
        "failed": 1,
        "retested_and_passed": 1,
        "tested": 1,
    }

    saved = client.put(
        "/api/automation/daily-reports/7-16.md",
        json={
            "failed": "ITEM-A",
            "retested_and_passed": "ITEM-B",
            "tested": "ITEM-C",
            "overwrite": False,
        },
    )
    assert saved.status_code == 202
    assert saved.json()["wash_run"]["label"] == "Rebuild Daily Test Summary"
    wait_until_idle(manager)

    loaded = client.get("/api/automation/daily-reports/7-16.md")
    assert loaded.status_code == 200
    assert loaded.json()["sections"]["failed"] == ["ITEM-A"]

    reports = client.get("/api/automation/daily-reports")
    assert reports.status_code == 200
    assert reports.json()[0]["report_name"] == "7-16.md"


def test_existing_daily_report_requires_overwrite_confirmation(tmp_path: Path) -> None:
    client, _, manager = make_client(tmp_path)
    payload = {
        "failed": "ITEM-A",
        "retested_and_passed": "",
        "tested": "",
        "overwrite": False,
    }
    assert client.put("/api/automation/daily-reports/7-16.md", json=payload).status_code == 202
    wait_until_idle(manager)

    duplicate = client.put("/api/automation/daily-reports/7-16.md", json=payload)
    assert duplicate.status_code == 409

    payload["overwrite"] = True
    replaced = client.put("/api/automation/daily-reports/7-16.md", json=payload)
    assert replaced.status_code == 202
    wait_until_idle(manager)


def test_api_rejects_unknown_jobs_and_unconfirmed_upload(tmp_path: Path) -> None:
    client, config, _ = make_client(tmp_path)
    (config.eps_root / "upload_cxalloy_reports.py").write_text("print('upload')\n", encoding="utf-8")

    unknown = client.post("/api/automation/jobs/shell/runs", json={})
    assert unknown.status_code == 409

    upload = client.post(
        "/api/automation/jobs/upload_cxalloy_reports/runs",
        json={"options": {}, "confirmed": False},
    )
    assert upload.status_code == 403

