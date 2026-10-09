from __future__ import annotations

import time
from types import SimpleNamespace

from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.testclient import TestClient
import jwt
import pytest

from scripts.automation import auth
from scripts.automation.api import create_app


@pytest.fixture
def session(monkeypatch):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(auth, "signing_keys", lambda issuer: SimpleNamespace(
        get_signing_key_from_jwt=lambda token: SimpleNamespace(key=private_key.public_key())
    ))
    now = int(time.time())
    claims = {"iss": "https://test.clerk.accounts.dev", "sub": "user_allowed",
              "sid": "sess_test", "azp": "https://dashboard.ngrok-free.app",
              "iat": now - 1, "nbf": now - 1, "exp": now + 60}
    settings = auth.AuthSettings(claims["iss"], (claims["azp"],), frozenset({"user_allowed"}))
    return private_key, claims, settings


def test_valid_signed_operator_session(session):
    key, claims, settings = session
    assert auth.verify_session(jwt.encode(claims, key, algorithm="RS256"), settings) == "user_allowed"


@pytest.mark.parametrize("change,status", [
    ({"exp": 1}, 401), ({"nbf": 9999999999}, 401),
    ({"iss": "https://other.clerk.accounts.dev"}, 401),
    ({"azp": "https://evil.example"}, 401), ({"sts": "pending"}, 401),
    ({"sub": "user_other"}, 403), ({"sid": ""}, 401),
])
def test_reject_invalid_sessions(session, change, status):
    key, claims, settings = session
    claims.update(change)
    with pytest.raises(HTTPException) as error:
        auth.verify_session(jwt.encode(claims, key, algorithm="RS256"), settings)
    assert error.value.status_code == status


def test_reject_wrong_signature_and_missing_claims(session):
    key, claims, settings = session
    wrong_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    for token in [jwt.encode(claims, wrong_key, algorithm="RS256"),
                  jwt.encode({k: v for k, v in claims.items() if k != "sid"}, key, algorithm="RS256"),
                  jwt.encode(claims, "wrong-secret" * 4, algorithm="HS256"), "malformed"]:
        with pytest.raises(HTTPException) as error:
            auth.verify_session(token, settings)
        assert error.value.status_code == 401


def test_unconfigured_auth_fails_closed(session):
    key, claims, _ = session
    with pytest.raises(HTTPException) as error:
        auth.verify_session(jwt.encode(claims, key, algorithm="RS256"), auth.AuthSettings("", (), frozenset()))
    assert error.value.status_code == 503


@pytest.mark.parametrize("method,path", [
    ("GET", "/api/automation/access"), ("GET", "/api/automation/health"),
    ("GET", "/api/automation/jobs"), ("GET", "/api/automation/runs"),
    ("GET", "/api/automation/daily-reports"), ("GET", "/api/automation/mv-daily-reports"),
    ("POST", "/api/automation/jobs/dashboard_etl/runs"),
    ("POST", "/api/automation/pipelines/daily/runs"),
    ("POST", "/api/automation/logins/jc2"),
    ("PUT", "/api/automation/daily-reports/10-9.md"),
    ("PUT", "/api/automation/mv-daily-reports/10-9.md"),
    ("PUT", "/api/automation/neta-report-reviews"),
    ("POST", "/api/automation/mv-equipment-comments"),
    ("DELETE", "/api/automation/mv-equipment-comments/comment1"),
])
def test_api_blocks_unauthenticated_operations(method, path):
    client = TestClient(create_app())
    assert client.request(method, path, json={}).status_code == 401


def test_api_checks_signed_identity_and_origin(session, monkeypatch):
    key, claims, settings = session
    monkeypatch.setattr(auth.AuthSettings, "from_env", lambda: settings)
    client = TestClient(create_app())
    for user_id, status in [("user_allowed", 200), ("user_other", 403)]:
        claims["sub"] = user_id
        token = jwt.encode(claims, key, algorithm="RS256")
        result = client.get("/api/automation/access", headers={"Authorization": f"Bearer {token}"})
        assert result.status_code == status


def test_cors_preflight_supports_authorization():
    result = TestClient(create_app()).options("/api/automation/access", headers={
        "Origin": "http://127.0.0.1:5173", "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
    })
    assert result.status_code == 200


def test_explicit_local_bypass_allows_direct_loopback_and_validation(monkeypatch):
    monkeypatch.setenv("AUTOMATION_LOCAL_AUTH_BYPASS", "true")
    client = TestClient(create_app(), base_url="http://127.0.0.1:8765", client=("127.0.0.1", 12345))
    response = client.get("/api/automation/access", headers={
        "Origin": "http://localhost:5173", "Sec-Fetch-Site": "cross-site",
    })
    assert response.status_code == 200
    assert response.json() == {"user_id": "local_operator"}
    response = client.post("/api/automation/daily-reports/validate", json={"tested": "ITEM-A"},
                           headers={"Origin": "http://127.0.0.1:5173"})
    assert response.status_code == 200
    assert response.json()["counts"]["tested"] == 1


@pytest.mark.parametrize("headers", [
    {"X-IAD6-Proxied": "1"}, {"X-IAD6-Proxied": "0"},
    {"X-Forwarded-For": "127.0.0.1"}, {"X-Forwarded-Host": "localhost:5173"},
    {"X-Forwarded-Proto": "https"}, {"Forwarded": "for=127.0.0.1"},
    {"Origin": "https://dashboard.ngrok-free.app"}, {"Origin": "null"},
    {"Sec-Fetch-Site": "cross-site"}, {"Host": "dashboard.ngrok-free.app"},
])
def test_local_bypass_never_allows_tunnel_or_cross_site_requests(monkeypatch, headers):
    monkeypatch.setenv("AUTOMATION_LOCAL_AUTH_BYPASS", "true")
    client = TestClient(create_app(), base_url="http://127.0.0.1:8765", client=("127.0.0.1", 12345))
    assert client.get("/api/automation/access", headers=headers).status_code == 401


def test_local_bypass_denies_non_loopback_peer(monkeypatch):
    monkeypatch.setenv("AUTOMATION_LOCAL_AUTH_BYPASS", "true")
    client = TestClient(create_app(), base_url="http://localhost:8765", client=("192.0.2.10", 12345))
    assert client.get("/api/automation/access").status_code == 401


def test_local_bypass_is_opt_in(monkeypatch):
    monkeypatch.setenv("AUTOMATION_LOCAL_AUTH_BYPASS", "false")
    client = TestClient(create_app(), base_url="http://127.0.0.1:8765", client=("127.0.0.1", 12345))
    assert client.get("/api/automation/access").status_code == 401
