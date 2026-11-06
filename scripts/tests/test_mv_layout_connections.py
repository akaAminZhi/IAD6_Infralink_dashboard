from __future__ import annotations

import fitz
import json

from scripts.etl.build_layout_plan import build_layout_plan
from scripts.etl.mv_layout_connections import read_mv_connections
from scripts.etl.layout_connections import build_layout_connections


def make_diagram(path, *, ambiguous=False, far=False):
    with fitz.open() as doc:
        page = doc.new_page(width=500, height=400)
        for label, rect in [
            ("UTILITY6-01", (50, 50, 150, 100)),
            ("TX6-01C", (250, 200, 300, 260)),
            # Deliberately incorrect copied termination label must not affect topology.
            ("FD06-IAD06-UTILITY6-08-A", (90, 100, 110, 115)),
        ] + ([("TX6-OTHER", (250, 200, 300, 260))] if ambiguous else []):
            annot = page.add_rect_annot(fitz.Rect(rect))
            annot.set_info(content=label)
            annot.update()
        annot = page.add_polyline_annot([(100, 115), (100, 185), (275, 350 if far else 185)])
        annot.set_info(content="FD06-IAD06-UTILITY6-01")
        annot.update()
        doc.save(path)


def test_reads_diagram_ports_without_using_termination_names(tmp_path):
    path = tmp_path / "mv.pdf"
    make_diagram(path)
    index = read_mv_connections(path)
    cable = index["FD06-IAD06-UTILITY6-01"][0]
    assert cable["source_equipment_key"] == "UTILITY6-01"
    assert cable["target_equipment_key"] == "TX6-01C"
    assert cable["reason"] is None


def test_uncertain_and_distant_ports_are_not_guessed(tmp_path):
    for option in ("ambiguous", "far"):
        path = tmp_path / f"{option}.pdf"
        make_diagram(path, **{option: True})
        cable = read_mv_connections(path)["FD06-IAD06-UTILITY6-01"][0]
        assert cable["target_equipment_key"] is None
        assert cable["reason"] == "mv_diagram_endpoint_unresolved"
    assert read_mv_connections(tmp_path / "missing.pdf") == {}


def test_maps_single_ended_mv_ids_and_preserves_evidence_and_missing_placements(tmp_path):
    path = tmp_path / "mv.pdf"
    make_diagram(path)
    index = read_mv_connections(path)
    cable_key = "FD06-IAD06-UTILITY6-01"
    assets = {key: [{"equipment_id": f"IAD06-{key}", "equipment_type": "Cabinet"}]
              for key in ("UTILITY6-01", "TX6-01C")}
    assets[cable_key] = [{"equipment_id": cable_key, "equipment_type": "Feeder Cable - MV", "neta_complete": True}]
    cables, diagnostics = build_layout_connections(assets, set(assets), {}, mv_connection_index=index)
    assert diagnostics == []
    assert cables[0]["connection_status"] == "resolved"
    assert cables[0]["connection_source"] == "mv_diagram"
    assert cables[0]["target_equipment_key"] == "TX6-01C"
    assert cables[0]["neta_complete"] is True
    assert cables[0]["neta_test_report"] is None
    assert cables[0]["mv_annotation_ids"]
    cables, diagnostics = build_layout_connections(assets, {"UTILITY6-01"}, {}, mv_connection_index=index)
    assert cables[0]["connection_status"] == "endpoint_not_on_layout"
    assert diagnostics[0]["target_equipment_key"] == "TX6-01C"
    index[cable_key].append({**index[cable_key][0], "target_equipment_key": "OTHER"})
    cables, _ = build_layout_connections(assets, set(assets), {}, mv_connection_index=index)
    assert cables[0]["connection_status"] == "ambiguous_mv_diagram_connection"


def test_layout_builder_reads_mv_source_and_records_provenance(tmp_path):
    make_diagram(tmp_path / "Electrical-IAD6-MV.pdf")
    with fitz.open() as doc:
        page = doc.new_page(width=400, height=400)
        for label, coords in [("boundary", (10, 10, 390, 390)),
                              ("UTILITY6-01", (50, 50, 100, 100)),
                              ("TX6-01C", (200, 200, 250, 250))]:
            annotation = page.add_rect_annot(fitz.Rect(coords))
            annotation.set_info(content=label)
            annotation.update()
        doc.save(tmp_path / "floor.pdf")
    config = tmp_path / "config.json"
    config.write_text(json.dumps({"floors": [{"floor_id": "first", "label": "First Floor", "file_name": "floor.pdf"}]}))
    equipment = tmp_path / "equipment.json"
    equipment.write_text(json.dumps({"records": [
        {"equipment_id": "IAD06-UTILITY6-01", "equipment_type": "Switchgear"},
        {"equipment_id": "IAD06-TX6-01C", "equipment_type": "Transformer"},
        {"equipment_id": "FD06-IAD06-UTILITY6-01", "equipment_type": "Feeder Cable - MV"},
    ]}))
    payload = build_layout_plan(config, tmp_path, equipment, tmp_path / "out.json",
                                tmp_path / "reports", tmp_path / "atp", tmp_path / "daily")
    assert payload["cables"][0]["connection_status"] == "resolved"
    assert payload["cables"][0]["connection_source"] == "mv_diagram"
    assert payload["cable_diagnostics"] == []
    assert "Electrical-IAD6-MV.pdf" in payload["selected_input_files"]
