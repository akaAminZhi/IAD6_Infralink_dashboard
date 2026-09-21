import json
from pathlib import Path

from scripts.etl.build_neta_report_reviews import run_build
from scripts.etl.run_etl import OUTPUT_FILES, build_pipeline_steps


def test_publishes_compact_evidence_and_honors_tracker_override(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "NETA_eport_To_GC/test_reports_result.json"
    source.parent.mkdir()
    source.write_text(json.dumps({
        "reports_directory": "private absolute path",
        "reports": [{"file": "EQ/report.pdf", "status": "FAILED", "is_passed": False,
                     "pages": [{"page": 1, "status": "FAILED", "evidence": ["Bad reading"]}]}],
    }), encoding="utf-8")
    monkeypatch.setenv("IAD6_EPS_TRACKER_ROOT", str(tmp_path))
    output = tmp_path / "public/reviews.json"
    result = run_build(output_path=output)
    assert result["available"] is True
    assert result["reports"][0]["evidence"] == ["Page 1: Bad reading"]
    assert result["summary"]["FAILED"] == 1
    assert "reports_directory" not in result
    assert "pages" not in result["reports"][0]
    assert json.loads(output.read_text()) == result
    source.unlink()
    assert run_build(output_path=output)["available"] is False
    assert json.loads(output.read_text())["reports"] == []


def test_reviews_registered_in_etl() -> None:
    assert "neta_report_reviews" in OUTPUT_FILES
    assert "build_neta_report_reviews.py" in dict(build_pipeline_steps({}))
