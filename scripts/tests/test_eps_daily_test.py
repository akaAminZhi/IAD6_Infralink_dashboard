from scripts.etl.eps_daily_test import build_eps_daily_test_index


def test_indexes_exact_ids_and_latest_eps_daily_outcome(tmp_path):
    cable_id = "FDR-IAD06-TX-UPP6-06A-IAD06-UPP6-06A"
    neighboring_id = f"{cable_id}-1"
    (tmp_path / "2026-10-13.md").write_text(
        f"# Failed\n- {cable_id}\n# Tested\n- {neighboring_id}\n",
        encoding="utf-8",
    )
    (tmp_path / "2026-10-14.md").write_text(
        f"# Failed\n- {cable_id}\n# Retested And Passed\n- {cable_id}\n",
        encoding="utf-8",
    )

    index, files = build_eps_daily_test_index(tmp_path)

    assert [file.name for file in files] == ["2026-10-13.md", "2026-10-14.md"]
    assert [entry["status"] for entry in index[cable_id]] == ["failed", "retested_and_passed"]
    assert index[cable_id][-1] == {
        "date": "2026-10-14", "status": "retested_and_passed", "report_name": "2026-10-14.md",
    }
    assert len(index[neighboring_id]) == 1


def test_missing_eps_daily_directory_has_no_evidence(tmp_path):
    assert build_eps_daily_test_index(tmp_path / "missing") == ({}, [])
