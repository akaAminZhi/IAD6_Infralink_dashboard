from __future__ import annotations

import json

import fitz
import pytest
from fastapi.testclient import TestClient

from scripts.automation.api import create_app
from scripts.automation.auth import require_operator
from scripts.automation.runner import AutomationConfig
from scripts.etl.build_layout_plan import build_layout_plan


def make_pdf(path, *, rotation=0, boundary=True, regions=False):
    with fitz.open() as document:
        page = document.new_page(width=300, height=300)
        labels = [
            ("fix", (30, 30, 90, 90)),
            ("EQ-FIX", (40, 40, 60, 60)),
            ("EQ-1", (110, 110, 130, 135)),
            ("EQ-DUP", (150, 110, 170, 130)),
            ("EQ-MISSING", (180, 110, 200, 130)),
            ("EQ-OUTSIDE", (260, 260, 280, 280)),
        ]
        if boundary:
            labels.append(("boundary", (20, 20, 240, 240)))
        if regions:
            labels.extend([
                ("POD", (65, 35, 85, 85)),
                ("E6-110-01", (105, 75, 220, 145)),
                ("E-1-2", (105, 155, 220, 220)),
            ])
        for label, coords in labels:
            annotation = page.add_rect_annot(fitz.Rect(coords))
            annotation.set_info(content=label)
            annotation.update()
        page.set_rotation(rotation)
        document.save(path)


def inputs(tmp_path, **pdf_options):
    pdf = tmp_path / "floor.pdf"
    make_pdf(pdf, **pdf_options)
    config = tmp_path / "config.json"
    config.write_text(json.dumps({"floors": [
        {"floor_id": "floor-1", "label": "First Floor", "file_name": pdf.name, "page_number": 1},
        {"floor_id": "floor-2", "label": "Second Floor", "file_name": pdf.name, "page_number": 1},
    ]}))
    equipment = tmp_path / "equipment.json"
    equipment.write_text(json.dumps({"records": [
        {"equipment_id": "IAD06-EQ-1", "energized_completed_at": "2026-10-14T08:00:00",
         "updated_by": "Equipment Editor", "updated_at": "2026-11-06T10:30:00"},
        {"equipment_id": "IAD06-EQ-FIX", "energized_completed_at": None},
        {"equipment_id": "IAD06-EQ-DUP"}, {"equipment_id": "EQ-DUP"},
    ]}))
    return config, equipment


def test_extracts_coordinates_fixed_devices_and_preserves_uncertain_matches(tmp_path):
    config, equipment = inputs(tmp_path)
    output = tmp_path / "layout.json"
    payload = build_layout_plan(config, tmp_path, equipment, output)
    assert len(payload["floors"]) == 2
    records = payload["floors"][0]["equipment"]
    assert [item["label"] for item in records] == ["EQ-1", "EQ-DUP", "EQ-MISSING"]
    assert records[0]["rect"] == {"x": 90.0, "y": 90.0, "width": 22.0, "height": 27.0}
    assert records[0]["energized_completed_at"] == "2026-10-14T08:00:00"
    assert records[0]["updated_by"] == "Equipment Editor"
    assert records[0]["updated_at"] == "2026-11-06T10:30:00"
    assert records[1]["updated_by"] is None
    assert records[2]["updated_by"] is None
    assert records[1]["match_status"] == "ambiguous"
    assert len(records[1]["candidate_equipment_ids"]) == 2
    assert records[1]["energized_completed_at"] is None
    assert records[2]["match_status"] == "unmatched"
    assert len(payload["fixed_equipment"]) == 2
    assert all(item["label"] == "EQ-FIX" and item["fixed"] for item in payload["fixed_equipment"])
    assert {item["reason"] for item in payload["diagnostics"]} == {"outside_boundary", "ambiguous", "unmatched"}
    assert json.loads(output.read_text())["floors"] == payload["floors"]


def test_applies_pdf_rotation_to_control_and_equipment_coordinates(tmp_path):
    config, equipment = inputs(tmp_path, rotation=90)
    payload = build_layout_plan(config, tmp_path, equipment, tmp_path / "layout.json")
    assert payload["floors"][0]["equipment"][0]["rect"] == {
        "x": 105.0, "y": 90.0, "width": 27.0, "height": 22.0,
    }


def test_local_energization_is_published_by_etl_and_revocable_after_excel_confirmation(tmp_path, monkeypatch):
    config_path, equipment_path = inputs(tmp_path)
    config = AutomationConfig.discover(dashboard_root=tmp_path)
    output = tmp_path / "frontend" / "public" / "data" / "layout_plan.json"

    def rebuild():
        return build_layout_plan(config_path, tmp_path, equipment_path, output, runtime_root=config.runtime_root)

    assert rebuild()["manual_energizations"] == []
    monkeypatch.setenv("AUTOMATION_LOCAL_AUTH_BYPASS", "true")
    app = create_app(config)
    local = TestClient(app, base_url="http://127.0.0.1:8765", client=("127.0.0.1", 12345))
    remote = TestClient(app)
    url = "/api/automation/layout-energizations"
    equipment_id = "IAD06-EQ-FIX"
    mark = {"equipment_id": equipment_id, "energized": True, "expected_revision": 0, "confirmed": True}

    assert remote.put(url, json=mark).status_code == 401
    app.dependency_overrides[require_operator] = lambda: "user_test_operator"
    assert remote.put(url, json=mark).status_code == 403
    assert remote.get(url).status_code == 403
    app.dependency_overrides.clear()

    assert local.put(url, json={**mark, "confirmed": False}).status_code == 422
    assert local.put(url, json={**mark, "equipment_id": "IAD06-EQ-DUP"}).status_code == 422
    assert local.put(url, json={**mark, "equipment_id": "IAD06-EQ-OUTSIDE"}).status_code == 422
    assert local.put(url, json={**mark, "equipment_id": "IAD06-EQ-1"}).status_code == 409
    saved = local.put(url, json=mark)
    assert saved.status_code == 200
    record = saved.json()
    assert record["updated_by"] == "local_operator"
    assert record["updated_at"]
    assert record["revision"] == 1
    assert local.get(url).json() == {"records": [record]}
    assert json.loads(output.read_text())["manual_energizations"] == []
    assert rebuild()["manual_energizations"] == [record]

    equipment = json.loads(equipment_path.read_text())
    completed = "2026-11-24T14:00:00"
    equipment["records"][1]["energized_completed_at"] = completed
    equipment_path.write_text(json.dumps(equipment))
    payload = rebuild()
    assert payload["fixed_equipment"][0]["energized_completed_at"] == completed
    assert payload["manual_energizations"] == [record]

    revoked = local.put(url, json={**mark, "energized": False, "expected_revision": 1})
    assert revoked.status_code == 200
    assert revoked.json()["energized"] is False
    assert revoked.json()["revision"] == 2
    assert json.loads(output.read_text())["manual_energizations"] == [record]
    assert rebuild()["manual_energizations"] == []

    equipment["records"][1]["energized_completed_at"] = None
    equipment_path.write_text(json.dumps(equipment))
    assert rebuild()["manual_energizations"] == []
    assert local.put(url, json=mark).status_code == 409
    assert local.get(url).json() == {"records": [revoked.json()]}


def test_publishes_cable_endpoints_types_and_latest_daily_evidence(tmp_path):
    config, equipment = inputs(tmp_path)
    records = json.loads(equipment.read_text())
    records["records"][0]["equipment_type"] = "Switchboard"
    records["records"][0]["neta_test_report"] = "EQ-1 - NETA Test Report-01.pdf"
    cable_id = "FDR-IAD06-EQ-1-IAD06-EQ-FIX"
    records["records"].extend([
        {"equipment_id": cable_id, "equipment_type": "Feeder Cable - LV", "status": "Installation Complete",
         "feeder_cable_atp": "EQ-1 Cable ATP.pdf", "updated_by": "Cable Editor",
         "updated_at": "2026-11-05T09:00:00"},
        {"equipment_id": cable_id + "-A", "equipment_type": "Termination", "parent": cable_id},
    ])
    equipment.write_text(json.dumps(records))
    reports = tmp_path / "reports"
    reports.mkdir()
    (reports / "2026-10-14.md").write_text(f"# Tested And Passed\n- {cable_id}\n")
    (reports / "2026-10-15.md").write_text(f"# Failed\n- {cable_id}\n")
    eps_reports = tmp_path / "eps_reports"
    eps_reports.mkdir()
    (eps_reports / "2026-10-16.md").write_text(f"# Tested\n- {cable_id}\n", encoding="utf-8")
    atp_dir = tmp_path / "atp"
    cable_folder = atp_dir / cable_id
    cable_folder.mkdir(parents=True)
    (cable_folder / "EQ-1 Cable ATP.pdf").write_bytes(b"%PDF-1.4\n")
    payload = build_layout_plan(config, tmp_path, equipment, tmp_path / "layout.json", reports, atp_dir, eps_reports)
    assert payload["floors"][0]["equipment"][0]["equipment_type"] == "Switchboard"
    assert payload["floors"][0]["equipment"][0]["neta_test_report"] == "EQ-1 - NETA Test Report-01.pdf"
    assert len(payload["cables"]) == 1
    cable = payload["cables"][0]
    assert cable["updated_by"] == "Cable Editor"
    assert cable["updated_at"] == "2026-11-05T09:00:00"
    assert cable["connection_status"] == "resolved"
    assert cable["source_equipment_key"] == "EQ-1"
    assert cable["target_equipment_key"] == "EQ-FIX"
    assert cable["mv_daily_test_status"] == "failed"
    assert cable["mv_daily_test_date"] == "2026-10-15"
    assert cable["eps_daily_test_status"] == "tested"
    assert cable["eps_daily_test_date"] == "2026-10-16"
    assert cable["eps_daily_report_name"] == "2026-10-16.md"
    assert cable["feeder_cable_atp_names"] == ["EQ-1 Cable ATP.pdf"]
    assert cable["feeder_cable_atp_files"][0]["url"].endswith("EQ-1%20Cable%20ATP.pdf")
    assert len(payload["mv_daily_report_files"]) == 2
    assert len(payload["eps_daily_report_files"]) == 1


def test_separate_pdf_pages_supply_distinct_floor_equipment_and_share_fixed_layer(tmp_path):
    config, equipment = inputs(tmp_path)
    with fitz.open(tmp_path / "floor.pdf") as document:
        page = document.new_page(width=300, height=300)
        for label, coords in [
            ("boundary", (20, 20, 240, 240)),
            ("EQ-2", (80, 100, 120, 140)),
            ("E6-210-01", (70, 70, 150, 160)),
        ]:
            annotation = page.add_rect_annot(fitz.Rect(coords))
            annotation.set_info(content=label)
            annotation.update()
        document.saveIncr()
    specs = json.loads(config.read_text())
    specs["floors"][1]["page_number"] = 2
    config.write_text(json.dumps(specs))
    equipment_records = json.loads(equipment.read_text())
    equipment_records["records"].append({"equipment_id": "IAD06-EQ-2"})
    equipment.write_text(json.dumps(equipment_records))

    payload = build_layout_plan(config, tmp_path, equipment, tmp_path / "layout.json")
    first, second = payload["floors"]
    assert [first["page_number"], second["page_number"]] == [1, 2]
    assert [item["label"] for item in first["equipment"]] == ["EQ-1", "EQ-DUP", "EQ-MISSING"]
    assert [item["label"] for item in second["equipment"]] == ["EQ-2"]
    assert second["equipment"][0]["match_status"] == "matched"
    assert second["equipment"][0]["source_floor_id"] == "floor-2"
    assert second["equipment"][0]["rect"] == {"x": 60.0, "y": 80.0, "width": 42.0, "height": 42.0}
    assert [item["label"] for item in second["regions"]] == ["E6-210-01"]
    assert [item["label"] for item in payload["fixed_equipment"]] == ["EQ-FIX"]
    assert payload["fixed_equipment"][0]["source_floor_id"] == "floor-1"


def test_pods_and_rooms_are_regions_not_equipment_or_match_diagnostics(tmp_path):
    config, equipment = inputs(tmp_path, regions=True)
    payload = build_layout_plan(config, tmp_path, equipment, tmp_path / "layout.json")
    assert [item["label"] for item in payload["floors"][0]["equipment"]] == ["EQ-1", "EQ-DUP", "EQ-MISSING"]
    assert [item["label"] for item in payload["floors"][0]["regions"]] == ["E6-110-01", "E-1-2"]
    assert all(item["kind"] == "room" for item in payload["floors"][0]["regions"])
    assert len(payload["fixed_regions"]) == 2
    assert all(item["kind"] == "pod" and item["fixed"] for item in payload["fixed_regions"])
    assert not any(item.get("label") in {"POD", "E6-110-01", "E-1-2"} for item in payload["diagnostics"])


@pytest.mark.parametrize("rooms", [True, False])
def test_floor_alignment_translates_local_geometry_and_keeps_fixed_layer(tmp_path, rooms):
    config, equipment = inputs(tmp_path, regions=rooms)
    baseline = build_layout_plan(config, tmp_path, equipment, tmp_path / "before.json")
    # Give the second page a different boundary origin and scale-independent offset.
    with fitz.open(tmp_path / "floor.pdf") as document:
        page = document[0]
        for annotation in page.annots():
            if annotation.info.get("content") == "boundary":
                annotation.set_rect(fitz.Rect(10, 10, 250, 250))
                annotation.update()
        document.saveIncr()
    unaligned = build_layout_plan(config, tmp_path, equipment, tmp_path / "unaligned.json")
    specs = json.loads(config.read_text())
    specs["floors"][0]["file_name"] = "reference.pdf"
    make_pdf(tmp_path / "reference.pdf", regions=rooms)
    specs["floors"][1]["align_to_floor_id"] = "floor-1"
    config.write_text(json.dumps(specs))
    payload = build_layout_plan(config, tmp_path, equipment, tmp_path / "aligned.json")
    assert payload["floors"][0] == {**baseline["floors"][0], "file_name": "reference.pdf"}
    for kind in ["equipment", "regions"]:
        assert payload["floors"][1][kind] == baseline["floors"][1][kind]
    assert payload["fixed_equipment"][0] == baseline["fixed_equipment"][0]
    assert payload["fixed_equipment"][1] == unaligned["fixed_equipment"][1]
    if rooms:
        assert payload["fixed_regions"][0] == baseline["fixed_regions"][0]
        assert payload["fixed_regions"][1] == unaligned["fixed_regions"][1]


@pytest.mark.parametrize("target_id", ["missing-floor", "floor-2"])
def test_alignment_requires_an_earlier_available_reference_floor(tmp_path, target_id):
    config, equipment = inputs(tmp_path)
    specs = json.loads(config.read_text())
    specs["floors"][1]["align_to_floor_id"] = target_id
    config.write_text(json.dumps(specs))
    with pytest.raises(ValueError, match="earlier available floor"):
        build_layout_plan(config, tmp_path, equipment, tmp_path / "layout.json")


def test_alignment_anchors_room_right_edge_with_different_room_widths(tmp_path):
    config, equipment = inputs(tmp_path, regions=True)
    (tmp_path / "reference.pdf").write_bytes((tmp_path / "floor.pdf").read_bytes())
    with fitz.open(tmp_path / "floor.pdf") as document:
        page = document[0]
        for annotation in page.annots():
            if annotation.info.get("content") in {"E6-110-01", "E-1-2"}:
                annotation.set_rect(fitz.Rect(100, 90, 190, 220))
                annotation.update()
        document.saveIncr()
    before = build_layout_plan(config, tmp_path, equipment, tmp_path / "before.json")
    specs = json.loads(config.read_text())
    specs["floors"][0]["file_name"] = "reference.pdf"
    specs["floors"][1]["align_to_floor_id"] = "floor-1"
    config.write_text(json.dumps(specs))
    after = build_layout_plan(config, tmp_path, equipment, tmp_path / "after.json")
    reference_rooms = after["floors"][0]["regions"]
    aligned_rooms = after["floors"][1]["regions"]
    assert max(r["rect"]["x"] + r["rect"]["width"] for r in aligned_rooms) == max(r["rect"]["x"] + r["rect"]["width"] for r in reference_rooms)
    assert min(r["rect"]["y"] for r in aligned_rooms) == min(r["rect"]["y"] for r in reference_rooms)
    for old, new in zip(before["floors"][1]["equipment"] + before["floors"][1]["regions"], after["floors"][1]["equipment"] + aligned_rooms):
        assert new["rect"] == {**old["rect"], "x": old["rect"]["x"] + 30, "y": old["rect"]["y"] - 15}
    assert after["fixed_equipment"] == before["fixed_equipment"]
    assert after["fixed_regions"] == before["fixed_regions"]


def test_missing_boundary_fails_explicitly(tmp_path):
    config, equipment = inputs(tmp_path, boundary=False)
    with pytest.raises(ValueError, match="exactly one boundary"):
        build_layout_plan(config, tmp_path, equipment, tmp_path / "layout.json")


def test_missing_pdf_produces_empty_dataset_with_diagnostic(tmp_path):
    config, equipment = inputs(tmp_path)
    (tmp_path / "floor.pdf").unlink()
    payload = build_layout_plan(config, tmp_path, equipment, tmp_path / "layout.json")
    assert payload["floors"] == []
    assert all(item["reason"] == "missing_pdf" for item in payload["diagnostics"])


def test_duplicate_floor_id_is_rejected(tmp_path):
    config, equipment = inputs(tmp_path)
    specs = json.loads(config.read_text())
    specs["floors"][1]["floor_id"] = "floor-1"
    config.write_text(json.dumps(specs))
    with pytest.raises(ValueError, match="Duplicate layout floor_id"):
        build_layout_plan(config, tmp_path, equipment, tmp_path / "layout.json")
