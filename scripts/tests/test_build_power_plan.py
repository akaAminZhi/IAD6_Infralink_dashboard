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
    termination = page.add_rect_annot(fitz.Rect(122, 70, 136, 84))
    termination.set_info(content="FD01-IAD06-PDU6-01A-2-A", title="Test User")
    termination.update()
    connection = page.add_polyline_annot(
        [fitz.Point(120, 77), fitz.Point(180, 77), fitz.Point(180, 120)]
    )
    connection.set_info(content="FD01-IAD06-PDU6-01A-2", title="Test User")
    connection.update()
    room_boundary = page.add_rect_annot(fitz.Rect(20, 20, 280, 180))
    room_boundary.set_info(content="", subject="Room_line", title="Test User")
    room_boundary.update()
    document.save(pdf_path)
    document.close()

    equipment_path = tmp_path / "equipment.json"
    write_json(
        equipment_path,
        [
            {
                "equipment_id": "IAD06-PDU6-01A-2",
                "equipment_type": "Power Distribution Unit",
                "status": "Ship to Site",
            },
            {
                "equipment_id": "FD01-IAD06-PDU6-01A-2-A",
                "equipment_type": "Termination-MV",
                "status": "Installation Complete",
            },
            {
                "equipment_id": "FD01-IAD06-PDU6-01A-2",
                "equipment_type": "Feeder Cable - MV",
                "status": "Installation Complete",
            },
        ],
    )
    output_path = tmp_path / "power_plan.json"
    result = build_power_plan(source_dir, equipment_path, output_path)

    assert result["page_count"] == 1
    assert result["equipment_annotation_count"] == 1
    assert result["matched_equipment_annotation_count"] == 1
    record = result["pages"][0]["annotations"][0]
    assert record["label"] == "PDU6-01A-2"
    assert record["matched_equipment_id"] == "IAD06-PDU6-01A-2"
    assert record["match_status"] == "matched"
    assert record["system_element_status"] == "Ship to Site"
    assert record["system_element_type"] == "Power Distribution Unit"
    assert record["status_match_source"] == "annotation_id"
    assert "image_url" not in result["pages"][0]
    termination_record = next(
        item for item in result["pages"][0]["annotations"] if item["kind"] == "termination"
    )
    assert termination_record["label"] == "FD01-IAD06-PDU6-01A-2-A"
    assert termination_record["match_status"] == "matched"
    assert termination_record["matched_equipment_id"] == "FD01-IAD06-PDU6-01A-2-A"
    assert termination_record["system_element_status"] == "Installation Complete"
    assert termination_record["system_element_type"] == "Termination-MV"
    connection_record = next(
        item for item in result["pages"][0]["annotations"] if item["kind"] == "connection"
    )
    assert connection_record["label"] == "FD01-IAD06-PDU6-01A-2"
    assert len(connection_record["vertices"]) == 3
    assert connection_record["match_status"] == "matched"
    assert connection_record["system_element_status"] == "Installation Complete"
    assert connection_record["system_element_type"] == "Feeder Cable - MV"
    boundary = next(
        item for item in result["pages"][0]["annotations"] if item["kind"] == "room_boundary"
    )
    assert boundary["label"] == ""
    assert boundary["match_status"] == "not_applicable"
    assert output_path.exists()
