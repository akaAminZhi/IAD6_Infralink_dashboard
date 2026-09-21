import json
from pathlib import Path
from unittest.mock import patch

from scripts.automation import neta_report_reviews as reviews


def test_exception_evidence_includes_failed_checks_and_review_notes() -> None:
    report = {
        "file": "EQ/report.pdf", "status": "FAILED",
        "pages": [
            {"page": 1, "status": "FAILED", "evidence": ["Assessment failed", "Assessment failed"],
             "numeric_checks": [
                 {"test": "IR", "status": "FAILED", "value": 5, "limit": 100,
                  "evidence": "Measured 5 MOhm"},
                 {"test": "Other", "status": "PASSED", "evidence": "Unrelated passing check"},
             ]},
            {"page": 2, "status": "REVIEW_REQUIRED", "evidence": "Assessment unclear",
             "review_notes": ["Verify settings"]},
        ],
    }
    compact = reviews._compact_report(report)
    assert compact is not None
    evidence = compact["evidence"]
    assert evidence.count("Page 1: Assessment failed") == 1
    assert "Page 1: IR: FAILED (value=5, limit=100)" in evidence
    assert "Page 1: Measured 5 MOhm" in evidence
    assert "Page 2: Assessment unclear" in evidence
    assert "Page 2: Verify settings" in evidence
    assert not any("Unrelated" in line for line in evidence)
    report["status"] = "PASSED"
    assert reviews._compact_report(report)["evidence"] == []


def test_cache_reuses_parse_and_invalidates_after_external_and_api_edits(tmp_path: Path) -> None:
    path = tmp_path / "results.json"
    payload = {"reports": [{"file": "EQ/report.pdf", "status": "REVIEW_REQUIRED"}]}
    path.write_text(json.dumps(payload), encoding="utf-8")
    with patch.object(reviews, "_load_payload", wraps=reviews._load_payload) as read:
        assert reviews.list_neta_report_reviews(path)["reports"][0]["status"] == "REVIEW_REQUIRED"
        reviews.list_neta_report_reviews(path)
        assert read.call_count == 1
        payload["reports"][0]["status"] = "FAILED"
        path.write_text(json.dumps(payload), encoding="utf-8")
        assert reviews.list_neta_report_reviews(path)["reports"][0]["status"] == "FAILED"
        assert read.call_count == 2
        reviews.update_neta_report_review(path, "EQ/report.pdf", "PASSED")
        assert reviews.list_neta_report_reviews(path)["reports"][0]["status"] == "PASSED"
    path.unlink()
    try:
        reviews.list_neta_report_reviews(path)
    except FileNotFoundError:
        pass
    else:
        raise AssertionError("Deleted files must not return cached results")
