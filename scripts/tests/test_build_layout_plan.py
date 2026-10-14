from __future__ import annotations

import json

import fitz
import pytest

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
        {"equipment_id": "IAD06-EQ-1", "energized_completed_at": "2026-10-14T08:00:00"},
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


def test_pods_and_rooms_are_regions_not_equipment_or_match_diagnostics(tmp_path):
    config, equipment = inputs(tmp_path, regions=True)
    payload = build_layout_plan(config, tmp_path, equipment, tmp_path / "layout.json")
    assert [item["label"] for item in payload["floors"][0]["equipment"]] == ["EQ-1", "EQ-DUP", "EQ-MISSING"]
    assert [item["label"] for item in payload["floors"][0]["regions"]] == ["E6-110-01", "E-1-2"]
    assert all(item["kind"] == "room" for item in payload["floors"][0]["regions"])
    assert len(payload["fixed_regions"]) == 2
    assert all(item["kind"] == "pod" and item["fixed"] for item in payload["fixed_regions"])
    assert not any(item.get("label") in {"POD", "E6-110-01", "E-1-2"} for item in payload["diagnostics"])


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
