from __future__ import annotations

import json
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
    assert health.json()["mv_report_directory"] == str(config.mv_report_dir)

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


def test_mv_daily_report_round_trip_does_not_start_eps_wash(tmp_path: Path) -> None:
    client, config, manager = make_client(tmp_path)
    validation = client.post(
        "/api/automation/mv-daily-reports/validate",
        json={
            "tested_and_passed": "FD1-A\nFD2-B",
            "partially_tested": "FD3-C",
            "failed": "FD3-C\nFD4-D",
            "retested_and_passed": "FD2-B",
        },
    )
    assert validation.status_code == 200
    assert validation.json()["counts"] == {
        "tested_and_passed": 1,
        "partially_tested": 0,
        "failed": 2,
        "retested_and_passed": 1,
    }

    saved = client.put(
        "/api/automation/mv-daily-reports/8-19.md",
        json={
            "tested_and_passed": "FD1-A",
            "partially_tested": "FD2-B",
            "failed": "FD3-C",
            "retested_and_passed": "FD4-D",
            "overwrite": False,
        },
    )
    assert saved.status_code == 202
    assert "wash_run" not in saved.json()
    assert not manager.has_active_run()
    assert (config.mv_report_dir / "8-19.md").exists()

    loaded = client.get("/api/automation/mv-daily-reports/8-19.md")
    assert loaded.status_code == 200
    assert loaded.json()["sections"]["partially_tested"] == ["FD2-B"]
    reports = client.get("/api/automation/mv-daily-reports")
    assert reports.status_code == 200
    assert reports.json()[0]["report_name"] == "8-19.md"


def test_mv_equipment_comments_are_persisted_locally(tmp_path: Path) -> None:
    client, config, _ = make_client(tmp_path)
    assert client.get("/api/automation/mv-equipment-comments").json() == {"comments": []}

    saved = client.post(
        "/api/automation/mv-equipment-comments",
        json={"annotation_id": "equipment-1", "text": "Verify relay settings before energization."},
    )
    assert saved.status_code == 201
    comment = saved.json()["comment"]
    assert comment["annotation_id"] == "equipment-1"
    assert comment["text"] == "Verify relay settings before energization."
    assert comment["comment_id"]
    assert comment["created_at"]
    assert (config.runtime_root / "mv_equipment_comments.json").is_file()

    loaded = client.get("/api/automation/mv-equipment-comments")
    assert loaded.status_code == 200
    assert loaded.json()["comments"] == [comment]

    deleted = client.delete(f"/api/automation/mv-equipment-comments/{comment['comment_id']}")
    assert deleted.status_code == 200
    assert deleted.json() == {"comment_id": comment["comment_id"]}
    assert client.get("/api/automation/mv-equipment-comments").json() == {"comments": []}
    assert client.delete(f"/api/automation/mv-equipment-comments/{comment['comment_id']}").status_code == 404

    invalid = client.post(
        "/api/automation/mv-equipment-comments",
        json={"annotation_id": " ", "text": " "},
    )
    assert invalid.status_code == 422


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


def test_neta_report_review_round_trip_updates_source_json(tmp_path: Path) -> None:
    client, config, _ = make_client(tmp_path)
    results_path = config.neta_report_results_path
    results_path.parent.mkdir(parents=True)
    results_path.write_text(
        """{
  "generated_at": "2026-09-18T09:11:06-04:00",
  "summary": {"PASSED": 0, "FAILED": 0, "REVIEW_REQUIRED": 1, "ERROR": 0},
  "all_reports_passed": false,
  "reports": [
    {
      "file": "IAD06-EQ-1/IAD06-EQ-1.pdf",
      "status": "REVIEW_REQUIRED",
      "is_passed": null,
      "pages": [{"page": 1, "review_notes": ["Verify values."]}]
    }
  ]
}
""",
        encoding="utf-8",
    )

    listed = client.get("/api/automation/neta-report-reviews")
    assert listed.status_code == 200
    assert listed.json()["reports"] == [
        {
            "file": "IAD06-EQ-1/IAD06-EQ-1.pdf",
            "status": "REVIEW_REQUIRED",
            "is_passed": None,
            "manual_review": None,
            "evidence": ["Page 1: Verify values."],
        }
    ]

    saved = client.put(
        "/api/automation/neta-report-reviews",
        json={"file": "IAD06-EQ-1/IAD06-EQ-1.pdf", "status": "PASSED"},
    )
    assert saved.status_code == 200
    assert saved.json()["report"]["status"] == "PASSED"

    persisted = json.loads(results_path.read_text(encoding="utf-8"))
    assert persisted["summary"] == {
        "PASSED": 1,
        "FAILED": 0,
        "REVIEW_REQUIRED": 0,
        "ERROR": 0,
    }
    assert persisted["all_reports_passed"] is True
    assert persisted["reports"][0]["is_passed"] is True
    assert persisted["reports"][0]["pages"] == [
        {"page": 1, "review_notes": ["Verify values."]}
    ]
    assert persisted["reports"][0]["manual_review"]["status"] == "PASSED"

    missing = client.put(
        "/api/automation/neta-report-reviews",
        json={"file": "missing.pdf", "status": "FAILED"},
    )
    assert missing.status_code == 404
