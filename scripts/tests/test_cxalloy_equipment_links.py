from __future__ import annotations

import json
from unittest.mock import Mock

import pytest

from scripts.etl import build_cxalloy_equipment_links as cx
from scripts.etl import run_etl


def identity(name, identifier="1", project_id="49402"):
    return {"cxalloy_name": name, "cxalloy_id": identifier, "project_id": project_id}


def test_exact_names_win_and_only_tracker_aliases_are_allowed():
    names = ["IAD06-PDU6-01E-2", "IAD06-UTILITY6-01", "UTILITY6-08", "TX-INV6", "INV6",
             "FDR-IAD06-A-IAD06-B", "FDR-IAD06-A-IAD06-B-1", "IAD06-CDS6-01-R", "A"]
    snapshot = [identity("iad06-pdu6-01e-2", "1"), identity("PDU6-01E-2", "2"),
                identity("UTILITY6-1", "3"), identity("UTILITY6-8", "4"), identity("TX-INV6", "5"),
                identity("FDR-IAD06-A-IAD06-B", "6"), identity("CDS6-01", "7"), identity("A-1", "8")]
    result = cx.build_links([{"equipment_id": n} for n in names], snapshot, "49402")
    assert {r["equipment_id"]: r["cxalloy_id"] for r in result["records"]} == {
        "IAD06-PDU6-01E-2": "1", "IAD06-UTILITY6-01": "3", "UTILITY6-08": "4",
        "TX-INV6": "5", "FDR-IAD06-A-IAD06-B": "6",
    }
    assert set(result["missing_equipment_ids"]) == {"INV6", "FDR-IAD06-A-IAD06-B-1", "IAD06-CDS6-01-R", "A"}


def test_duplicates_ambiguity_and_invalid_or_cross_project_identities():
    equipment = [{"equipment_id": n} for n in ["IAD06-A", "B", "C", "D", "E"]]
    snapshot = [identity("IAD06-A", "1"), identity("iad06-a", "2"), identity("A", "3"),
                identity("B", "4"), identity(" B ", "4"), identity("C", "../5"),
                identity("D", "6", "999"), identity("E", "0")]
    result = cx.build_links(equipment, snapshot, "49402")
    assert result["records"] == [{"equipment_id": "B", **identity("B", "4")}]
    assert result["ambiguous_equipment"][0]["equipment_id"] == "IAD06-A"
    assert {r["cxalloy_id"] for r in result["ambiguous_equipment"][0]["candidates"]} == {"1", "2"}
    assert result["missing_equipment_ids"] == ["C", "D", "E"]


def test_offline_build_and_published_fallback_preserve_names_and_diagnostics(tmp_path):
    equipment, cache, output = [tmp_path / n for n in ["equipment.json", "cache.json", "links.json"]]
    equipment.write_text(json.dumps({"records": [{"equipment_id": "IAD06-A"}, {"equipment_id": "B"}]}))
    cache.write_text(json.dumps({"project_id": "49402", "generated_at": "snapshot-time", "records": [
        identity("A", "1"), identity("B", "2"), identity("B", "3"),
    ]}))
    initial = cx.run_build(equipment, cache, output, cx.DEFAULT_PROJECT_URL)
    assert initial["records"] == [{"equipment_id": "IAD06-A", **identity("A")}]
    assert initial["snapshot_generated_at"] == "snapshot-time"
    cache.unlink()
    retained = cx.run_build(equipment, cache, output, cx.DEFAULT_PROJECT_URL)
    assert retained["records"] == initial["records"]
    assert retained["ambiguous_equipment"] == initial["ambiguous_equipment"]
    assert retained["snapshot_generated_at"] == "snapshot-time"
    output.unlink()
    empty = cx.run_build(equipment, cache, output, cx.DEFAULT_PROJECT_URL)
    assert empty["snapshot_available"] is False
    assert empty["missing_equipment_ids"] == ["B", "IAD06-A"]


def test_offline_fallback_keeps_ambiguous_website_names_and_accepts_bare_lists(tmp_path):
    equipment, cache, output = [tmp_path / n for n in ["equipment.json", "cache.json", "links.json"]]
    equipment.write_text(json.dumps([{"equipment_id": "IAD06-UTILITY6-01"}]))
    cache.write_text(json.dumps([identity("UTILITY6-1", "1"), identity("utility6-1", "2")]))
    initial = cx.run_build(equipment, cache, output, cx.DEFAULT_PROJECT_URL)
    cache.unlink()
    assert cx.run_build(equipment, cache, output, cx.DEFAULT_PROJECT_URL)["ambiguous_equipment"] == initial["ambiguous_equipment"]


def test_project_mismatch_fails_without_replacing_published_links(tmp_path):
    equipment, cache, output = [tmp_path / n for n in ["equipment.json", "cache.json", "links.json"]]
    equipment.write_text("[]")
    cache.write_text(json.dumps({"project_id": "9", "records": []}))
    output.write_text("old-published-data")
    with pytest.raises(ValueError, match="another project"):
        cx.run_build(equipment, cache, output, cx.DEFAULT_PROJECT_URL)
    assert output.read_text() == "old-published-data"


@pytest.mark.parametrize("url", ["http://tq.cxalloy.com/project/1/equipment", "https://evil.test/project/1/equipment",
    "https://tq.cxalloy.com/project/1/equipment/2", "https://tq.cxalloy.com/project/0/equipment",
    "https://user@tq.cxalloy.com/project/1/equipment", "https://tq.cxalloy.com/project/1/equipment?other=2"])
def test_rejects_unsafe_or_non_project_configuration(url):
    with pytest.raises(ValueError):
        cx.project_identity(url)


def test_tracker_config_is_read_without_executing_the_upload_script(tmp_path, monkeypatch):
    monkeypatch.delenv("CXALLOY_PROJECT_URL", raising=False)
    (tmp_path / "upload_cxalloy_reports.py").write_text(
        "raise RuntimeError('never import')\nDEFAULT_PROJECT_URL = 'https://tq.cxalloy.com/project/12/equipment'\n")
    assert cx.configured_project_url(tmp_path).endswith("/12/equipment")
    monkeypatch.setenv("CXALLOY_PROJECT_URL", cx.DEFAULT_PROJECT_URL)
    assert cx.configured_project_url(tmp_path) == cx.DEFAULT_PROJECT_URL


def fake_page(batches, totals=None, missing_controls=False, auth=False):
    page = Mock()
    page.url = "https://tq.cxalloy.com/auth/login" if auth else cx.DEFAULT_PROJECT_URL
    links, header, next_page, enabled = Mock(), Mock(), Mock(), Mock()
    links.evaluate_all.side_effect = batches
    header.inner_text.side_effect = [f"{n} Equipment sorted by name" for n in (totals or [sum(map(len, batches))] * len(batches))]
    next_page.filter.return_value = next_page
    next_page.count.return_value = 0 if missing_controls else 2
    next_page.locator.return_value = enabled
    enabled.count.side_effect = [2] * (len(batches) - 1) + [0]
    def locator(selector):
        if selector == "a.item-card-name": return links
        if selector == "#items_list .list-header": return header
        return next_page
    page.locator.side_effect = locator
    return page


def site_link(name, identifier="1", project_id="49402"):
    return {"name": name, "href": f"https://tq.cxalloy.com/project/{project_id}/equipment/{identifier}"}


def test_complete_paginated_snapshot_contains_only_names_and_project_identities():
    page = fake_page([[site_link("A")], [site_link("B", "2")]])
    assert cx.collect_snapshot(page, cx.DEFAULT_PROJECT_URL) == [identity("A"), identity("B", "2")]
    assert page.goto.call_args.args[0].endswith("#sort%5B%5D=name")
    page.locator('a.page-item[data-filtername="page"]').locator.return_value.first.click.assert_called_once()


@pytest.mark.parametrize("kind", ["auth", "missing_controls", "repeated", "incomplete", "changed_total", "bad_id", "other_project"])
def test_incomplete_or_untrusted_inventory_is_rejected(kind):
    batches = [[site_link("A")], [site_link("B", "2")]]
    totals = [2, 2]
    if kind == "repeated": batches[1] = batches[0]
    if kind == "incomplete": batches[1] = []
    if kind == "changed_total": totals[1] = 3
    if kind == "bad_id": batches[0][0]["href"] = "https://tq.cxalloy.com/project/49402/equipment/0"
    if kind == "other_project": batches[0] = [site_link("A", project_id="9")]
    with pytest.raises((ValueError, RuntimeError)):
        cx.collect_snapshot(fake_page(batches, totals, kind == "missing_controls", kind == "auth"), cx.DEFAULT_PROJECT_URL)


def test_declared_total_must_match_last_page_and_is_not_optional():
    with pytest.raises(ValueError, match="Incomplete"):
        cx.collect_snapshot(fake_page([[site_link("A")]], [2]), cx.DEFAULT_PROJECT_URL)
    page = fake_page([[site_link("A")]])
    page.locator("#items_list .list-header").inner_text.side_effect = ["Unknown equipment count"]
    with pytest.raises(ValueError, match="total not found"):
        cx.collect_snapshot(page, cx.DEFAULT_PROJECT_URL)


def test_refresh_failure_preserves_existing_snapshot(tmp_path, monkeypatch):
    auth, cache = tmp_path / "private.json", tmp_path / "snapshot.json"
    auth.write_text("{}")
    cache.write_text("old-snapshot")
    browser = Mock()
    driver = Mock()
    driver.chromium.launch.return_value = browser
    manager = Mock()
    manager.__enter__ = Mock(return_value=driver)
    manager.__exit__ = Mock(return_value=False)
    import playwright.sync_api
    monkeypatch.setattr(playwright.sync_api, "sync_playwright", lambda: manager)
    monkeypatch.setattr(cx, "collect_snapshot", Mock(side_effect=RuntimeError("Login expired")))
    with pytest.raises(RuntimeError, match="Login expired"):
        cx.refresh_snapshot(auth, cx.DEFAULT_PROJECT_URL, cache)
    assert cache.read_text() == "old-snapshot"
    browser.close.assert_called_once()


def test_normal_etl_registers_only_the_offline_builder():
    steps = run_etl.build_pipeline_steps({})
    names = [n for n, _ in steps]
    assert names.index("normalize_equipment.py") < names.index("build_cxalloy_equipment_links.py")
    assert steps[names.index("build_cxalloy_equipment_links.py")][1] is cx.run_build
    assert run_etl.OUTPUT_FILES["cxalloy_equipment_links"].name == "cxalloy_equipment_links.json"
