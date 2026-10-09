"""Clerk session verification and local operator authorization."""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import os
from ipaddress import ip_address
from urllib.parse import urlparse

from fastapi import HTTPException, Request
import jwt


@dataclass(frozen=True)
class AuthSettings:
    issuer: str
    authorized_parties: tuple[str, ...]
    allowed_user_ids: frozenset[str]

    @classmethod
    def from_env(cls) -> AuthSettings:
        return cls(
            os.environ.get("CLERK_ISSUER", "").rstrip("/"),
            tuple(value.strip().rstrip("/") for value in os.environ.get(
                "CLERK_AUTHORIZED_PARTIES", ""
            ).split(",") if value.strip()),
            frozenset(value.strip() for value in os.environ.get(
                "CLERK_ALLOWED_USER_IDS", ""
            ).split(",") if value.strip()),
        )


@lru_cache(maxsize=4)
def signing_keys(issuer: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{issuer}/.well-known/jwks.json", timeout=5)


def verify_session(token: str, settings: AuthSettings) -> str:
    parsed = urlparse(settings.issuer)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.query
            or parsed.fragment or parsed.username or parsed.path
            or not settings.authorized_parties or not settings.allowed_user_ids):
        raise HTTPException(503, "Data Operations authentication is not configured.")
    try:
        key = signing_keys(settings.issuer).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token, key.key, algorithms=["RS256"], issuer=settings.issuer,
            options={"require": ["exp", "iat", "nbf", "iss", "sub", "sid", "azp"]},
        )
    except jwt.PyJWKClientConnectionError as exc:
        raise HTTPException(503, "Unable to verify your session. Please retry.") from exc
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        raise HTTPException(401, "Your session is invalid or expired. Please sign in again.") from exc
    if (claims.get("azp") not in settings.authorized_parties
            or claims.get("sts") not in (None, "active")
            or not isinstance(claims.get("sid"), str) or not claims["sid"]):
        raise HTTPException(401, "Your session is not authorized for this application.")
    user_id = claims["sub"]
    if user_id not in settings.allowed_user_ids:
        raise HTTPException(403, "Your account does not have Data Operations access.")
    return user_id


def require_operator(request: Request) -> str | None:
    # Preserve dashboard viewing; every mutation and operational read is protected.
    if request.method == "GET" and request.url.path in {
        "/api/automation/mv-equipment-comments", "/api/automation/neta-report-reviews",
    }:
        return None
    if is_local_operator(request):
        return "local_operator"
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(401, "Sign in to use Data Operations.",
                            headers={"WWW-Authenticate": "Bearer"})
    return verify_session(token.strip(), AuthSettings.from_env())


def is_local_operator(request: Request) -> bool:
    """Allow opt-in direct loopback use, never requests forwarded by a proxy."""
    if os.environ.get("AUTOMATION_LOCAL_AUTH_BYPASS", "").lower() != "true":
        return False
    if any(name.lower().startswith("x-forwarded-") or name.lower() in {
        "forwarded", "x-iad6-proxied",
    } for name in request.headers):
        return False
    try:
        if not request.client or not ip_address(request.client.host).is_loopback:
            return False
    except ValueError:
        return False
    if request.url.hostname not in {"localhost", "127.0.0.1", "::1"}:
        return False
    origin = request.headers.get("origin")
    if origin:
        parsed = urlparse(origin)
        if parsed.scheme not in {"http", "https"} or parsed.hostname not in {
            "localhost", "127.0.0.1", "::1",
        }:
            return False
    if not origin and request.headers.get("sec-fetch-site") == "cross-site":
        return False
    return True
