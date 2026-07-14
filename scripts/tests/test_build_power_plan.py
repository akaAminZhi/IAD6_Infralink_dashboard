from pathlib import Path

import fitz

from scripts.etl.build_power_plan import build_power_plan
from scripts.etl.json_utils import write_json


def test_build_power_plan_extracts_and_matches_equipment_annotations(tmp_path: Path):
    source_dir = tmp_path / "power_plan"
    source_dir.mkdir()
    pdf_path = source_dir / "floor_1.pdf"

    document = fitz.open()
    page = document.new_page(width=300, height=200)
    page.draw_rect(fitz.Rect(20, 20, 280, 180), color=(0, 0, 0))
    annotation = page.add_rect_annot(fitz.Rect(80, 60, 120, 100))
    annotation.set_info(content="PDU6-01A-2", subject="PDU", title="Test User")
    annotation.update()
    room_boundary = page.add_rect_annot(fitz.Rect(20, 20, 280, 180))
    room_boundary.set_info(content="", subject="Room_line", title="Test User")
    room_boundary.update()
    document.save(pdf_path)
    document.close()

    equipment_path = tmp_path / "equipment.json"
    write_json(equipment_path, [{"equipment_id": "IAD06-PDU6-01A-2"}])
    output_path = tmp_path / "power_plan.json"
    result = build_power_plan(source_dir, equipment_path, output_path)

    assert result["page_count"] == 1
    assert result["equipment_annotation_count"] == 1
    assert result["matched_equipment_annotation_count"] == 1
    record = result["pages"][0]["annotations"][0]
    assert record["label"] == "PDU6-01A-2"
    assert record["matched_equipment_id"] == "IAD06-PDU6-01A-2"
    assert record["match_status"] == "matched"
    assert "image_url" not in result["pages"][0]
    boundary = next(
        item for item in result["pages"][0]["annotations"] if item["kind"] == "room_boundary"
    )
    assert boundary["label"] == ""
    assert boundary["match_status"] == "not_applicable"
    assert output_path.exists()
