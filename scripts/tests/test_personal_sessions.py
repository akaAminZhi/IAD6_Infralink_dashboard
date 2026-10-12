from __future__ import annotations

import json
from pathlib import Path
import time

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

from scripts.automation.api import create_app
from scripts.automation.auth import require_operator
from scripts.automation.browser_login import BrowserLoginManager, BrowserSession, allowed_host
from scripts.automation.runner import AutomationConfig, TaskManager, AUTH_PROVIDERS


def config_for(tmp_path: Path) -> AutomationConfig:
    dashboard, eps, auth = (tmp_path / name for name in ("dashboard", "eps", "auth"))
    for directory in (dashboard, eps, auth):
        directory.mkdir()
    return AutomationConfig(dashboard, eps, dashboard / "runtime", auth / "jc2.json", auth / "cxalloy.json")


class FakeLogins(BrowserLoginManager):
    def start(self, owner, provider):
        if provider not in {"jc2", "cxalloy"}:
            raise ValueError("Invalid provider")
        session = BrowserSession(owner, provider, status="ready")
        self._sessions[session.session_id] = session
        return session.public()

    def command(self, owner, session_id, action):
        session = self._owned(owner, session_id)
        return {**session.public(), "image": "data:image/jpeg;base64,fixture"}


@pytest.fixture
def personal_api(tmp_path):
    config = config_for(tmp_path)
    (config.eps_root / "wash_daily_test_report_data.py").write_text("print('done')\n", encoding="utf-8")
    manager = TaskManager(config)
    logins = FakeLogins(config)
    owner = ["user_alice"]
    app = create_app(config, manager, logins)
    app.dependency_overrides[require_operator] = lambda: owner[0]
    with TestClient(app) as client:
        yield client, config, manager, logins, owner


def test_each_user_has_distinct_safe_session_paths(tmp_path):
    config = config_for(tmp_path)
    alice = config.session_path("user_alice", "jc2")
    bob = config.session_path("user_bob", "jc2")
    assert alice != bob != config.jc2_auth_state
    assert alice != config.session_path("user_alice", "cxalloy")
    assert config.session_path("../../escape", "jc2").is_relative_to(config.jc2_auth_state.parent)


@pytest.mark.parametrize("job,provider", list(AUTH_PROVIDERS.items()))
def test_all_external_jobs_receive_the_callers_session_path(tmp_path, job, provider):
    manager = TaskManager(config_for(tmp_path))
    alice, _ = manager.build_command(job, owner_user_id="user_alice")
    bob, _ = manager.build_command(job, owner_user_id="user_bob")
    assert alice[-2:] == ["--auth-state", str(manager.config.session_path("user_alice", provider))]
    assert bob[-1] != alice[-1]


def test_missing_personal_state_never_falls_back_to_vm_shared_state(tmp_path):
    config = config_for(tmp_path)
    config.jc2_auth_state.write_text('{"cookies":[]}', encoding="utf-8")
    (config.eps_root / "download_neta_reports.py").write_text("print('SHOULD NOT RUN')", encoding="utf-8")
    manager = TaskManager(config)
    run = manager.start_job("download_neta_reports", owner_user_id="user_alice")
    deadline = time.monotonic() + 5
    while manager.has_active_run() and time.monotonic() < deadline:
        time.sleep(0.02)
    result = manager.get_run(run["run_id"])
    assert result["status"] == "auth_required"
    assert "SHOULD NOT RUN" not in manager.read_log(run["run_id"])["content"]


def test_other_users_cannot_read_or_control_runs(personal_api):
    client, _, manager, _, owner = personal_api
    run = client.post("/api/automation/jobs/wash_daily_reports/runs", json={}).json()
    assert run["owner_user_id"] == "user_alice"
    run_id = run["run_id"]
    owner[0] = "user_bob"
    assert client.get("/api/automation/runs").json() == []
    for method, suffix in [("GET", ""), ("GET", "/logs"), ("POST", "/resume"),
                           ("POST", "/cancel"), ("POST", "/continue")]:
        assert client.request(method, f"/api/automation/runs/{run_id}{suffix}").status_code == 404
    owner[0] = "user_alice"
    assert client.get(f"/api/automation/runs/{run_id}").status_code == 200
    deadline = time.monotonic() + 5
    while manager.has_active_run() and time.monotonic() < deadline:
        time.sleep(0.02)


def test_health_shows_only_my_provider_state(personal_api):
    client, config, _, _, owner = personal_api
    alice = config.session_path("user_alice", "jc2")
    alice.parent.mkdir(parents=True)
    alice.write_text("{}", encoding="utf-8")
    assert client.get("/api/automation/health").json()["sessions"]["jc2"]["exists"]
    owner[0] = "user_bob"
    assert not client.get("/api/automation/health").json()["sessions"]["jc2"]["exists"]


def test_other_users_cannot_view_click_or_close_login_windows(personal_api):
    client, _, _, _, owner = personal_api
    response = client.post("/api/automation/browser-logins/jc2")
    assert response.status_code == 202
    assert response.headers["cache-control"] == "no-store"
    session_id = response.json()["session_id"]
    url = f"/api/automation/browser-logins/{session_id}"
    owner[0] = "user_bob"
    for action in [{"kind": "screen"}, {"kind": "text", "text": "private"}, {"kind": "save"}]:
        assert client.post(url + "/actions", json=action).status_code == 404
    assert client.delete(url).status_code == 404
    owner[0] = "user_alice"
    assert client.post(url + "/actions", json={"kind": "screen"}).status_code == 200
    assert client.delete(url).status_code == 200


def test_login_commands_cannot_navigate_execute_code_or_upload_files(personal_api):
    client, _, _, _, _ = personal_api
    session = client.post("/api/automation/browser-logins/cxalloy").json()["session_id"]
    for action in [{"kind": "goto", "url": "http://localhost"},
                   {"kind": "evaluate", "script": "anything"},
                   {"kind": "key", "key": "Control+L"},
                   {"kind": "click", "x": -1, "y": 1},
                   {"kind": "text", "text": "x", "owner_user_id": "user_bob"}]:
        assert client.post(f"/api/automation/browser-logins/{session}/actions", json=action).status_code == 422


def test_disconnect_only_removes_my_saved_state(personal_api):
    client, config, _, _, _ = personal_api
    for user in ("user_alice", "user_bob"):
        state = config.session_path(user, "cxalloy")
        state.parent.mkdir(parents=True)
        state.write_text(json.dumps({"cookies": []}), encoding="utf-8")
    assert client.delete("/api/automation/provider-sessions/cxalloy").status_code == 200
    assert not config.session_path("user_alice", "cxalloy").exists()
    assert config.session_path("user_bob", "cxalloy").exists()


def test_legacy_login_endpoint_does_not_open_a_vm_browser(personal_api):
    client, _, _, _, _ = personal_api
    assert client.post("/api/automation/logins/jc2").status_code == 410


def test_login_network_hosts_are_limited(monkeypatch):
    monkeypatch.delenv("AUTOMATION_LOGIN_ALLOWED_HOSTS", raising=False)
    assert allowed_host("login.microsoftonline.com", "jc2.example.test")
    assert allowed_host("aadcdn.msauth.net", "jc2.example.test")
    assert allowed_host("idp.mcdean.com", "jc2.example.test")
    assert not allowed_host("idp.mcdean.com.evil.test", "jc2.example.test")
    assert not allowed_host("other.mcdean.com", "jc2.example.test")
    assert not allowed_host("127.0.0.1", "jc2.example.test")
    assert not allowed_host("login.microsoftonline.com.evil.test", "jc2.example.test")
    monkeypatch.setenv("AUTOMATION_LOGIN_ALLOWED_HOSTS", "sso.example.test")
    assert allowed_host("sso.example.test", "jc2.example.test")
