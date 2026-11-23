from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from scripts.automation.api import create_app
from scripts.automation.auth import require_operator
from scripts.automation.neta_report_rename import LOCAL_OPERATOR
from scripts.automation.runner import AutomationConfig, TaskManager


URL = "/api/automation/neta-position-baselines/"
FAMILY = "MDS6%7CA-F"
LINK_URL = "/api/automation/neta-position-links/" + FAMILY


def make_client(tmp_path: Path, user: str = LOCAL_OPERATOR) -> tuple[TestClient, AutomationConfig]:
    dashboard, eps = tmp_path / "dashboard", tmp_path / "eps"
    dashboard.mkdir(exist_ok=True)
    eps.mkdir(exist_ok=True)
    config = AutomationConfig(dashboard_root=dashboard, eps_root=eps,
                              runtime_root=dashboard / "runtime/automation",
                              jc2_auth_state=tmp_path / "jc2.json", cxalloy_auth_state=tmp_path / "cx.json")
    app = create_app(config, TaskManager(config))
    app.dependency_overrides[require_operator] = lambda: user
    return TestClient(app), config


BODY = {
    "positions": [
        {"key": "cds-pri", "aliases": ["cds-primary"], "count": 1},
        {"key": "CDS-SEC"},
        {"key": "PQM1-CT01-A", "optional": True},
    ],
    "exceptions": {"IAD06-MDS6-01X": {"waived_positions": ["CDS-SEC"], "note": "no secondary"}},
}


def test_save_read_and_delete_with_revision_checks(tmp_path: Path) -> None:
    client, config = make_client(tmp_path)
    initial = client.get(URL.rstrip("/")).json()
    assert initial["revision"] == 0 and initial["families"] == {} and initial["editable"] is True

    saved = client.put(URL + FAMILY, json={**BODY, "expected_revision": 0})
    assert saved.status_code == 200, saved.text
    entry = saved.json()["families"]["MDS6|A-F"]
    assert [position["key"] for position in entry["positions"]] == ["CDS-PRI", "CDS-SEC", "PQM1-CT01-A"]
    assert entry["positions"][0]["aliases"] == ["CDS-PRIMARY"]
    assert entry["confirmed_by"] == LOCAL_OPERATOR and entry["status"] == "confirmed"
    assert entry["exceptions"]["IAD06-MDS6-01X"]["waived_positions"] == ["CDS-SEC"]
    on_disk = json.loads(config.neta_position_baselines_path.read_text(encoding="utf-8"))
    assert on_disk["revision"] == 1
    assert not list(config.neta_position_baselines_path.parent.glob(".*.tmp"))

    stale = client.put(URL + FAMILY, json={**BODY, "expected_revision": 0})
    assert stale.status_code == 409
    assert client.delete(URL + FAMILY, params={"expected_revision": 0}).status_code == 409
    deleted = client.delete(URL + FAMILY, params={"expected_revision": 1})
    assert deleted.status_code == 200 and deleted.json()["families"] == {}
    assert client.delete(URL + FAMILY, params={"expected_revision": 2}).status_code == 404


def test_invalid_baselines_are_rejected(tmp_path: Path) -> None:
    client, _ = make_client(tmp_path)
    duplicate = {"positions": [{"key": "A"}, {"key": "B", "aliases": ["A"]}], "expected_revision": 0}
    assert client.put(URL + FAMILY, json=duplicate).status_code == 422
    waived_unknown = {**BODY, "exceptions": {"IAD06-MDS6-01X": {"waived_positions": ["NOPE"]}},
                      "expected_revision": 0}
    assert client.put(URL + FAMILY, json=waived_unknown).status_code == 422
    assert client.put(URL + "bad family", json={**BODY, "expected_revision": 0}).status_code == 422
    assert client.put(URL + FAMILY, json={"positions": [], "expected_revision": 0}).status_code == 422


def test_remote_operator_is_read_only(tmp_path: Path) -> None:
    client, _ = make_client(tmp_path, user="user_remote")
    assert client.get(URL.rstrip("/")).json()["editable"] is False
    assert client.put(URL + FAMILY, json={**BODY, "expected_revision": 0}).status_code == 403
    assert client.delete(URL + FAMILY, params={"expected_revision": 0}).status_code == 403
    assert client.patch(LINK_URL, json={
        "equipment_id": "IAD06-MDS6-01D", "sha256": "a" * 64, "position": "CDS-PRI", "expected_revision": 0,
    }).status_code == 403


def test_save_report_position_link_preserves_baseline_and_can_be_removed(tmp_path: Path) -> None:
    client, config = make_client(tmp_path)
    preflight = client.options(LINK_URL, headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "content-type",
    })
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert client.put(URL + FAMILY, json={**BODY, "expected_revision": 0}).status_code == 200
    report = {"sha256": "a" * 64, "flags": []}
    equipment = {"family": "MDS6|A-F", "equipment_id": "IAD06-MDS6-01D", "reports": [report]}
    check_path = config.dashboard_root / "frontend/public/data/neta_position_check.json"
    check_path.parent.mkdir(parents=True)

    def write_check():
        check_path.write_text(json.dumps({"equipment": [equipment]}), encoding="utf-8")

    write_check()
    body = {"equipment_id": equipment["equipment_id"], "sha256": report["sha256"],
            "position": "CDS-SEC", "expected_revision": 1}
    for invalid in ({"position": "CDS-PRIMARY"}, {"sha256": "b" * 64}, {"equipment_id": "IAD06-MDS6-01B"}):
        assert client.patch(LINK_URL, json={**body, **invalid}).status_code == 422
    report["flags"] = ["report_belongs_elsewhere"]
    write_check()
    assert client.patch(LINK_URL, json=body).status_code == 422
    report["flags"] = []
    equipment["reports"].append(report.copy())
    write_check()
    assert client.patch(LINK_URL, json=body).status_code == 422
    equipment["reports"].pop()
    write_check()

    saved = client.patch(LINK_URL, json=body)
    assert saved.status_code == 200, saved.text
    family = saved.json()["families"]["MDS6|A-F"]
    assert family["report_position_links"] == {equipment["equipment_id"]: {report["sha256"]: "CDS-SEC"}}
    assert family["exceptions"]["IAD06-MDS6-01X"]["note"] == "no secondary"
    assert client.patch(LINK_URL, json=body).status_code == 409
    reconfirmed = client.put(URL + FAMILY, json={**BODY, "expected_revision": 2})
    assert reconfirmed.status_code == 200
    assert reconfirmed.json()["families"]["MDS6|A-F"]["report_position_links"] == family["report_position_links"]
    changed = client.patch(LINK_URL, json={**body, "expected_revision": 3, "position": "CDS-PRI"})
    assert changed.json()["families"]["MDS6|A-F"]["report_position_links"][equipment["equipment_id"]] == {
        report["sha256"]: "CDS-PRI",
    }

    check_path.unlink()
    removed = client.patch(LINK_URL, json={**body, "expected_revision": 4, "position": None})
    assert removed.status_code == 200, removed.text
    assert "report_position_links" not in removed.json()["families"]["MDS6|A-F"]
