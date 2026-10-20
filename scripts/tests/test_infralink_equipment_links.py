from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from scripts.etl.build_infralink_equipment_links import build_links, collect_snapshot, run_build
from scripts.etl import run_etl


def test_exact_id_matching_preserves_cables_and_excludes_ambiguous_or_invalid_ids():
    equipment = [{"equipment_id": name} for name in ["IAD06-PDU6-01E-2", "FDR-IAD06-A-IAD06-B", "POD 01B", "missing"]]
    snapshot = [
        {"equipment_id": "iad06-pdu6-01e-2", "infralink_id": "1301515161"},
        {"equipment_id": "FDR-IAD06-A-IAD06-B", "infralink_id": "12"},
        {"equipment_id": "POD 01B", "infralink_id": "20"},
        {"equipment_id": "POD 01B", "infralink_id": "21"},
        {"equipment_id": "missing", "infralink_id": "../wrong"},
        {"equipment_id": "not-in-export", "infralink_id": "42"},
    ]
    result = build_links(equipment, snapshot)
    assert {row["equipment_id"] for row in result["records"]} == {"IAD06-PDU6-01E-2", "FDR-IAD06-A-IAD06-B"}
    assert result["missing_equipment_ids"] == ["missing"]
    assert result["ambiguous_equipment"] == [{"equipment_id": "POD 01B", "infralink_ids": ["20", "21"]}]


def test_offline_build_accepts_envelopes_and_retains_published_ids_without_local_cache(tmp_path):
    equipment, cache, output = [tmp_path / filename for filename in ("equipment.json", "cache.json", "links.json")]
    equipment.write_text(json.dumps({"records": [{"equipment_id": "EQ-1"}]}))
    cache.write_text(json.dumps([{"equipment_id": "EQ-1", "infralink_id": "123"}]))
    assert run_build(equipment, cache, output)["records"] == [{"equipment_id": "EQ-1", "infralink_id": "123"}]
    cache.unlink()
    assert run_build(equipment, cache, output)["records"] == [{"equipment_id": "EQ-1", "infralink_id": "123"}]
    output.unlink()
    assert run_build(equipment, cache, output)["missing_equipment_ids"] == ["EQ-1"]


def row(identifier, name):
    return {"id": identifier, "data": {"name": {"displayValue": name, "entity": "Device"}}}


def test_snapshot_pages_only_read_queries_with_project_scope_and_no_session_data():
    calls = []
    def post(url, *, data, headers, timeout):
        calls.append((url, data))
        batch = [row(1, "EQ-1")] if data["pageOffset"] == 0 else [row(2, "EQ-2")]
        return SimpleNamespace(status=200, json=lambda: {"total": 2, "data": batch})
    result = collect_snapshot(SimpleNamespace(post=post), {"x-xsrf-token": "private"}, [1161413877])
    assert result == [{"equipment_id": "EQ-1", "infralink_id": "1"}, {"equipment_id": "EQ-2", "infralink_id": "2"}]
    assert len(calls) == 2
    assert calls[1][1]["pageOffset"] == 1
    assert all(url.endswith("/Device/entities") for url, _ in calls)
    assert calls[0][1]["loadGridConfig"]["gridConfig"]["filterValues"][0]["value"]["entityIds"] == [1161413877]
    assert "private" not in json.dumps(result)


@pytest.mark.parametrize("case", ["auth", "repeated", "incomplete", "changed_total", "bad_id"])
def test_incomplete_or_invalid_snapshot_fails_without_returning_partial_results(case):
    calls = 0
    def post(*args, **kwargs):
        nonlocal calls
        calls += 1
        batch = [row(1, "EQ-1")]
        total = 2
        if calls > 1 and case == "incomplete": batch = []
        if calls > 1 and case == "changed_total": total = 3
        if case == "bad_id": batch = [row("bad", "EQ-1")]
        return SimpleNamespace(status=401 if case == "auth" else 200, json=lambda: {"total": total, "data": batch})
    with pytest.raises((ValueError, RuntimeError)):
        collect_snapshot(SimpleNamespace(post=post), {}, [1161413877])


def test_normal_etl_registers_offline_link_builder_after_equipment():
    names = [name for name, _ in run_etl.build_pipeline_steps({})]
    assert names.index("normalize_equipment.py") < names.index("build_infralink_equipment_links.py")
    assert run_etl.OUTPUT_FILES["infralink_equipment_links"].name == "infralink_equipment_links.json"
