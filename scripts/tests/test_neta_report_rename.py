from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from scripts.automation import neta_report_rename
from scripts.automation.api import create_app
from scripts.automation.auth import require_operator
from scripts.automation.runner import AutomationConfig, TaskManager

URL = "/api/automation/neta-report-names"
PAYLOAD = {"report_file": "_temporary/EQ-1/EQ-1-OLD.pdf", "new_name": "EQ-1-NEW",
           "expected_sha256": "a" * 64, "confirmed": True}
OPTIONS = {key: PAYLOAD[key] for key in ("report_file", "new_name", "expected_sha256")}


def manager_for(tmp_path):
    return TaskManager(AutomationConfig(tmp_path / "dashboard", tmp_path / "tracker", tmp_path / "runtime",
                                        tmp_path / "jc2.json", tmp_path / "cx.json"))


@pytest.fixture
def api(tmp_path, monkeypatch):
    manager = manager_for(tmp_path)
    app = create_app(manager.config, manager)
    monkeypatch.delenv("AUTOMATION_LOCAL_AUTH_BYPASS", raising=False)
    validated = []
    monkeypatch.setattr(neta_report_rename, "validate_rename",
                        lambda *args: validated.append(args) or {"will_queue_cxalloy": True})
    monkeypatch.setattr(manager, "_start_worker", lambda *_: None)
    return manager, app, TestClient(app), validated


def test_only_local_operator_can_preview_or_rename(api):
    manager, app, client, validated = api
    assert client.post(URL, json=PAYLOAD).status_code == 401
    app.dependency_overrides[require_operator] = lambda: "user_signed_in_with_clerk"
    for url in (URL, URL + "/preview"):
        response = client.post(url, json=PAYLOAD)
        assert response.status_code == 403
        assert "local operator" in response.json()["detail"]
    assert validated == [] and manager.list_runs() == []


def test_local_operator_preview_and_confirmed_rename(api):
    manager, app, client, validated = api
    app.dependency_overrides[require_operator] = lambda: "local_operator"
    assert client.post(URL + "/preview", json=PAYLOAD).json() == {"will_queue_cxalloy": True}
    assert client.post(URL, json={**PAYLOAD, "confirmed": False}).status_code == 403
    response = client.post(URL, json=PAYLOAD)
    assert response.status_code == 202
    assert response.json()["owner_user_id"] == "local_operator"
    assert validated[-1] == (manager.config.eps_root, PAYLOAD["report_file"], "EQ-1-NEW", "a" * 64)
    assert client.post(URL, json=PAYLOAD).status_code == 409  # One active run at a time.


def test_generic_job_endpoint_cannot_bypass_local_only_rename(tmp_path, monkeypatch):
    manager = manager_for(tmp_path)
    monkeypatch.setattr(neta_report_rename, "validate_rename", lambda *a: {})
    with pytest.raises(PermissionError, match="local operator"):
        manager.start_job("rename_neta_gc_report", OPTIONS, confirmed=True, owner_user_id="clerk_user")
    with pytest.raises(PermissionError, match="local operator"):
        manager.start_job("rename_neta_gc_report", OPTIONS, confirmed=True, owner_user_id=None)
    assert "rename_neta_gc_report" not in {job["job_id"] for job in manager.jobs_public()}


@pytest.mark.parametrize("change", [
    {"report_file": "../secret.pdf"}, {"report_file": "C:/x/y.pdf"}, {"report_file": "/abs/y.pdf"},
    {"report_file": "EQ/report.txt"}, {"new_name": "a/b"}, {"new_name": "bad:name"},
    {"new_name": "x" * 200}, {"expected_sha256": "nothex"}, {"command": "anything"},
])
def test_rename_options_are_strictly_validated(tmp_path, change):
    with pytest.raises(ValueError):
        manager_for(tmp_path).build_command("rename_neta_gc_report", {**OPTIONS, **change},
                                            owner_user_id="local_operator")


def test_rename_command_is_fixed_and_carries_actor(tmp_path):
    manager = manager_for(tmp_path)
    command, cwd = manager.build_command("rename_neta_gc_report", OPTIONS, owner_user_id="local_operator")
    assert command[2] == str(manager.config.dashboard_root / "scripts/automation/neta_report_rename.py")
    assert command[3:] == ["--report-file", OPTIONS["report_file"], "--new-name", "EQ-1-NEW",
                           "--expected-sha256", "a" * 64, "--tracker-root", str(manager.config.eps_root),
                           "--actor", "local_operator"]
    assert cwd == manager.config.dashboard_root


def test_missing_tracker_support_is_reported(tmp_path):
    with pytest.raises(ValueError, match="unavailable"):
        neta_report_rename.validate_rename(tmp_path, "EQ/a.pdf", "b", "a" * 64)
