"""Owner-bound remote browser login. Passwords/screenshots are never persisted."""
from __future__ import annotations

import ast
import base64
from concurrent.futures import Future, TimeoutError as FutureTimeout
from dataclasses import dataclass, field
import importlib.util
import os
from pathlib import Path
from queue import Queue, Empty
import threading
import time
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import HTTPException

from scripts.automation.runner import AutomationConfig

WIDTH, HEIGHT = 1180, 760
MAX_AGE = 20 * 60
KEYS = {"Enter", "Tab", "Shift+Tab", "Backspace", "Delete", "Escape",
        "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End",
        "PageUp", "PageDown", "Control+A"}

# Native WebAuthn prompts belong to the host OS, outside the remotely controlled
# page. Cancel these requests before they open; Microsoft can offer its other
# permitted sign-in methods. This never creates credentials or approves MFA.
REMOTE_MICROSOFT_AUTH_SCRIPT = """(() => {
    if (!["login.microsoftonline.com", "login.microsoft.com", "login.live.com"]
        .includes(location.hostname)) return;
    const credentials = navigator.credentials;
    if (credentials) {
        for (const method of ["get", "create"]) {
            const original = credentials[method];
            if (typeof original !== "function") continue;
            Object.defineProperty(credentials, method, {
                value: function(options) {
                    if (options?.publicKey) {
                        return Promise.reject(new DOMException(
                            "Use another sign-in method in the remote login window.",
                            "NotAllowedError"));
                    }
                    return original.call(this, options);
                }
            });
        }
    }
    if (typeof PublicKeyCredential !== "undefined") {
        for (const method of ["isUserVerifyingPlatformAuthenticatorAvailable",
                              "isConditionalMediationAvailable"]) {
            if (typeof PublicKeyCredential[method] === "function") {
                Object.defineProperty(PublicKeyCredential, method, {
                    value: () => Promise.resolve(false)
                });
            }
        }
    }
})();"""


def provider_url(config: AutomationConfig, provider: str) -> str:
    if provider == "jc2":
        source = config.eps_root / "jc2_config.py"
        spec = importlib.util.spec_from_file_location("iad6_login_jc2_config", source)
        if spec is None or spec.loader is None:
            raise ValueError("JC2 configuration is unavailable.")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        url = module.load_system_elements_url(url_file=config.eps_root / "config" / "jc2_system_elements_url.txt")
    elif provider == "cxalloy":
        url = os.environ.get("CXALLOY_PROJECT_URL", "")
        if not url:
            tree = ast.parse((config.eps_root / "upload_cxalloy_reports.py").read_text(encoding="utf-8-sig"))
            url = next(ast.literal_eval(node.value) for node in tree.body
                       if isinstance(node, ast.Assign) and any(
                           isinstance(target, ast.Name) and target.id == "DEFAULT_PROJECT_URL"
                           for target in node.targets))
    else:
        raise ValueError("Login provider must be jc2 or cxalloy.")
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("A valid HTTPS provider login URL is required.")
    return url


def allowed_host(host: str, target_host: str) -> bool:
    exact = {target_host, "login.microsoftonline.com", "login.microsoft.com", "login.live.com",
             "idp.mcdean.com", "fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com", "cdn.jsdelivr.net"}
    exact.update(value.strip().lower() for value in os.environ.get("AUTOMATION_LOGIN_ALLOWED_HOSTS", "").split(",") if value.strip())
    suffixes = (".microsoftonline.com", ".msauth.net", ".msftauth.net",
                ".msauthimages.net", ".msftauthimages.net", ".microsoft.com", ".live.com")
    return host in exact or host.endswith(suffixes)


@dataclass
class BrowserSession:
    owner: str
    provider: str
    session_id: str = field(default_factory=lambda: uuid4().hex)
    created: float = field(default_factory=time.monotonic)
    commands: Queue = field(default_factory=lambda: Queue(maxsize=32))
    stop: threading.Event = field(default_factory=threading.Event)
    status: str = "starting"
    error: str | None = None
    blocked_host: str | None = None

    def public(self) -> dict:
        return {"session_id": self.session_id, "provider": self.provider,
                "status": self.status, "error": self.error,
                "width": WIDTH, "height": HEIGHT, "blocked_host": self.blocked_host}


class BrowserLoginManager:
    def __init__(self, config: AutomationConfig) -> None:
        self.config = config
        self._sessions: dict[str, BrowserSession] = {}
        self._lock = threading.Lock()

    def start(self, owner: str, provider: str) -> dict:
        url = provider_url(self.config, provider)
        with self._lock:
            for old in list(self._sessions.values()):
                if old.owner == owner and old.provider == provider:
                    old.stop.set()
                if old.status in {"closed", "failed", "saved"}:
                    self._sessions.pop(old.session_id, None)
            if sum(session.status in {"starting", "ready"} for session in self._sessions.values()) >= 6:
                raise HTTPException(409, "All login windows are busy. Please retry shortly.")
            session = BrowserSession(owner, provider)
            self._sessions[session.session_id] = session
        threading.Thread(target=self._worker, args=(session, url), daemon=True,
                         name=f"provider-login-{session.session_id[:8]}").start()
        return session.public()

    def _owned(self, owner: str, session_id: str) -> BrowserSession:
        with self._lock:
            session = self._sessions.get(session_id)
        if session is None or session.owner != owner:
            raise HTTPException(404, "Login window not found.")
        return session

    def command(self, owner: str, session_id: str, action: dict) -> dict:
        session = self._owned(owner, session_id)
        if session.stop.is_set() and session.status == "ready":
            session.status = "closed"
        if session.status in {"closed", "failed", "saved", "starting"}:
            return session.public()
        result: Future = Future()
        try:
            session.commands.put_nowait((action, result))
        except Exception as exc:
            raise HTTPException(429, "Login window is busy. Please retry.") from exc
        try:
            return result.result(timeout=15)
        except FutureTimeout as exc:
            raise HTTPException(503, "Login window is responding slowly. Please retry.") from exc

    def close(self, owner: str, session_id: str) -> dict:
        session = self._owned(owner, session_id)
        with self._lock:
            session.stop.set()
        return {"session_id": session_id, "status": "closed"}

    def disconnect(self, owner: str, provider: str) -> None:
        with self._lock:
            for session in self._sessions.values():
                if session.owner == owner and session.provider == provider:
                    session.stop.set()
            self.config.session_path(owner, provider).unlink(missing_ok=True)

    def shutdown(self) -> None:
        with self._lock:
            for session in self._sessions.values():
                session.stop.set()

    def _worker(self, session: BrowserSession, url: str) -> None:
        try:
            from playwright.sync_api import sync_playwright
            target = urlsplit(url)
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(
                    headless=os.environ.get("AUTOMATION_LOGIN_HEADLESS", "true").lower() != "false")
                try:
                    context = browser.new_context(viewport={"width": WIDTH, "height": HEIGHT},
                                                  accept_downloads=False, service_workers="block")
                    context.add_init_script(REMOTE_MICROSOFT_AUTH_SCRIPT)
                    def route_request(route):
                        parsed = urlsplit(route.request.url)
                        if parsed.scheme == "https" and allowed_host(parsed.hostname or "", target.hostname or ""):
                            route.continue_()
                        else:
                            session.blocked_host = parsed.hostname
                            route.abort()
                    context.route("**/*", route_request)
                    context.route_web_socket("**/*", lambda route: route.close())
                    context.on("page", lambda page: page.on("dialog", lambda dialog: dialog.dismiss()))
                    page = context.new_page()
                    try:
                        page.goto(url, wait_until="domcontentloaded", timeout=12_000)
                    except Exception:
                        pass  # Show whatever loaded, including a navigation still awaiting MFA.
                    session.status = "ready"
                    while not session.stop.is_set() and time.monotonic() - session.created < MAX_AGE:
                        try:
                            action, result = session.commands.get(timeout=0.1)
                        except Empty:
                            # Pump browser events while the phone MFA completes.
                            live_pages = [candidate for candidate in context.pages if not candidate.is_closed()]
                            if not live_pages:
                                session.stop.set()
                                break
                            page = live_pages[-1]
                            page.wait_for_timeout(100)
                            continue
                        if result.cancelled():
                            continue
                        try:
                            pages = [candidate for candidate in context.pages if not candidate.is_closed()]
                            if not pages:
                                raise ValueError("The login page was closed. Start a new login.")
                            page = pages[-1]
                            kind = action["kind"]
                            if kind == "click":
                                page.mouse.click(action["x"], action["y"])
                            elif kind == "text":
                                page.keyboard.type(action["text"])
                            elif kind == "key":
                                if action["key"] not in KEYS:
                                    raise ValueError("Unsupported login key.")
                                page.keyboard.press(action["key"])
                            elif kind == "scroll":
                                page.mouse.wheel(0, action["delta"])
                            elif kind == "save":
                                current = urlsplit(page.url)
                                if current.scheme != "https" or current.hostname != target.hostname:
                                    raise ValueError("Finish signing in and return to the provider page before saving.")
                                route_text = (current.path + "#" + current.fragment).lower()
                                if any(word in route_text for word in ("login", "signin", "/auth", "saml", "oauth", "adfs")) or any(
                                    frame.locator('input[type="password"]:visible').count() for frame in page.frames):
                                    raise ValueError("Sign-in is not complete yet.")
                                state = context.storage_state(indexed_db=True)
                                if not state.get("cookies") and not any(origin.get("localStorage") for origin in state.get("origins", [])):
                                    raise ValueError("No signed-in session was found. Complete sign-in first.")
                                import json
                                destination = self.config.session_path(session.owner, session.provider)
                                with self._lock:
                                    if session.stop.is_set():
                                        raise ValueError("Login window was closed.")
                                    destination.parent.mkdir(parents=True, exist_ok=True)
                                    temporary = destination.with_suffix(".tmp")
                                    temporary.write_text(json.dumps(state), encoding="utf-8")
                                    temporary.replace(destination)
                                    session.status = "saved"
                                    session.stop.set()
                            elif kind != "screen":
                                raise ValueError("Unsupported login action.")
                            payload = session.public()
                            if not session.stop.is_set():
                                payload["image"] = "data:image/jpeg;base64," + base64.b64encode(
                                    page.screenshot(type="jpeg", quality=65, timeout=5_000)).decode("ascii")
                            result.set_result(payload)
                        except ValueError as exc:
                            result.set_exception(HTTPException(409, str(exc)))
                        except Exception:
                            # Do not expose URLs, cookies, submitted passwords or Playwright traces.
                            result.set_exception(HTTPException(503, "Login page changed. Please retry."))
                finally:
                    browser.close()
            if session.status != "saved":
                session.status = "closed"
        except Exception:
            session.status = "failed"
            session.error = "Unable to open the login browser. Check Playwright Chromium on the automation host."
        finally:
            while not session.commands.empty():
                _, result = session.commands.get_nowait()
                if not result.done():
                    result.set_result(session.public())
