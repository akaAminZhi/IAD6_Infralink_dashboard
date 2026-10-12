from __future__ import annotations

from hashlib import sha256
from pathlib import Path


def user_session_path(auth_root: Path, user_id: str, provider: str) -> Path:
    if provider not in {"jc2", "cxalloy"} or not user_id:
        raise ValueError("A user identity and valid provider are required.")
    # The identity is supplied by verified auth, never by a client request body.
    owner = sha256(user_id.encode("utf-8")).hexdigest()
    return auth_root / "users" / owner / f"{provider}_auth_state.json"
