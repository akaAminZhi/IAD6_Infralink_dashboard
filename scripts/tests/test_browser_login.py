from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
import time

from fastapi import HTTPException
import pytest

from scripts.automation import browser_login
from scripts.tests.test_personal_sessions import config_for


def wait_ready(manager, session_id):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        state = manager._sessions[session_id]
        if state.status == "ready":
            return
        if state.status == "failed":
            pytest.fail(state.error)
        time.sleep(0.05)
    pytest.fail("Login browser did not become ready")


def test_real_browser_remote_controls_mfa_save_and_owner_isolation(tmp_path, monkeypatch):
    # Only a local fixture page is served; no real provider accounts are touched.
    import playwright.sync_api as pw
    actual_playwright = pw.sync_playwright
    target = "https://auth.example.test/app"
    html = """<html><body>
      <input id='user' style='position:absolute;left:20px;top:50px;width:200px;height:30px'>
      <input id='pass' type='password' style='position:absolute;left:20px;top:100px;width:200px;height:30px'>
      <button id='signin' style='position:absolute;left:20px;top:150px;width:100px;height:30px'
        onclick="if(document.getElementById('user').value==='alice@example.test' && document.getElementById('pass').value==='fixture-pass'){document.getElementById('user').remove();document.getElementById('pass').remove();this.remove();document.getElementById('mfa').hidden=false}">Sign in</button>
      <button id='mfa' hidden style='position:absolute;left:20px;top:210px;width:100px;height:30px'
        onclick="document.cookie='fixture_session=approved; Secure; SameSite=Lax; Path=/';this.remove();document.body.append('Signed in')">Approve phone</button>
    </body></html>"""

    class Context:
        def __init__(self, context):
            self.context = context

        def route(self, pattern, handler):
            self.context.route(pattern, lambda route: route.fulfill(status=200, content_type="text/html", body=html)
                               if route.request.url == target else handler(route))

        def __getattr__(self, name):
            return getattr(self.context, name)

    class Browser:
        def __init__(self, browser):
            self.browser = browser

        def new_context(self, **options):
            return Context(self.browser.new_context(**options))

        def close(self):
            self.browser.close()

    @contextmanager
    def fixture_playwright():
        with actual_playwright() as driver:
            yield SimpleNamespace(chromium=SimpleNamespace(
                launch=lambda **options: Browser(driver.chromium.launch(headless=True))))

    monkeypatch.setattr(pw, "sync_playwright", fixture_playwright)
    monkeypatch.setattr(browser_login, "provider_url", lambda config, provider: target)
    config = config_for(tmp_path)
    manager = browser_login.BrowserLoginManager(config)
    session_id = manager.start("user_alice", "jc2")["session_id"]
    try:
        wait_ready(manager, session_id)
        assert manager.command("user_alice", session_id, {"kind": "screen"})["image"].startswith("data:image/jpeg;base64,")
        with pytest.raises(HTTPException) as forbidden:
            manager.command("user_bob", session_id, {"kind": "screen"})
        assert forbidden.value.status_code == 404
        with pytest.raises(HTTPException):
            manager.command("user_alice", session_id, {"kind": "save"})
        for action in [
            {"kind": "click", "x": 60, "y": 65}, {"kind": "text", "text": "alice@example.test"},
            {"kind": "click", "x": 60, "y": 115}, {"kind": "text", "text": "fixture-pass"},
            {"kind": "click", "x": 60, "y": 165},
        ]:
            manager.command("user_alice", session_id, action)
        with pytest.raises(HTTPException):
            manager.command("user_alice", session_id, {"kind": "save"})
        manager.command("user_alice", session_id, {"kind": "click", "x": 60, "y": 225})
        assert manager.command("user_alice", session_id, {"kind": "save"})["status"] == "saved"
        own_file = config.session_path("user_alice", "jc2")
        assert own_file.exists()
        assert "fixture-pass" not in own_file.read_text(encoding="utf-8")
        assert not config.session_path("user_bob", "jc2").exists()
        assert not config.jc2_auth_state.exists()
    finally:
        manager.shutdown()
        deadline = time.monotonic() + 5
        while manager._sessions[session_id].status in {"starting", "ready"} and time.monotonic() < deadline:
            time.sleep(0.05)
