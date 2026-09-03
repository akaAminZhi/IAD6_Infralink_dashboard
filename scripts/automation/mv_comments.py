from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import threading
from typing import Any
from uuid import uuid4


_COMMENT_LOCK = threading.RLock()
_COMMENTS_FILE_NAME = "mv_equipment_comments.json"


def list_mv_equipment_comments(runtime_root: Path) -> list[dict[str, str]]:
    """Return valid locally saved MV annotation comments, oldest first."""
    with _COMMENT_LOCK:
        return _read_comments(_comments_path(runtime_root))


def add_mv_equipment_comment(
    runtime_root: Path,
    annotation_id: str,
    text: str,
) -> dict[str, str]:
    """Append one locally stored MV annotation comment using an atomic write."""
    path = _comments_path(runtime_root)
    comment = {
        "comment_id": uuid4().hex,
        "annotation_id": annotation_id,
        "text": text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    with _COMMENT_LOCK:
        comments = _read_comments(path)
        comments.append(comment)
        _write_comments(path, comments)
    return comment


def delete_mv_equipment_comment(runtime_root: Path, comment_id: str) -> bool:
    """Delete one locally stored comment and report whether it existed."""
    path = _comments_path(runtime_root)
    with _COMMENT_LOCK:
        comments = _read_comments(path)
        remaining = [comment for comment in comments if comment["comment_id"] != comment_id]
        if len(remaining) == len(comments):
            return False
        _write_comments(path, remaining)
    return True


def _comments_path(runtime_root: Path) -> Path:
    return runtime_root / _COMMENTS_FILE_NAME


def _read_comments(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    try:
        payload: Any = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    records = payload.get("comments", []) if isinstance(payload, dict) else []
    if not isinstance(records, list):
        return []
    comments: list[dict[str, str]] = []
    for record in records:
        if not isinstance(record, dict):
            continue
        comment_id = record.get("comment_id")
        annotation_id = record.get("annotation_id")
        text = record.get("text")
        created_at = record.get("created_at")
        if all(isinstance(value, str) and value for value in (comment_id, annotation_id, text, created_at)):
            comments.append(
                {
                    "comment_id": comment_id,
                    "annotation_id": annotation_id,
                    "text": text,
                    "created_at": created_at,
                }
            )
    return comments


def _write_comments(path: Path, comments: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({"comments": comments}, ensure_ascii=False, indent=2)
    temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    temporary.write_text(payload, encoding="utf-8")
    try:
        # os.replace is atomic on supported filesystems; retry briefly for OneDrive locks.
        for _ in range(3):
            try:
                os.replace(temporary, path)
                return
            except PermissionError:
                continue
        path.write_text(payload, encoding="utf-8")
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
