from scripts.etl.layout_connections import build_layout_connections


def build(records, keys=None, history=None):
    index = {}
    for record in records:
        index.setdefault(record["equipment_id"].removeprefix("IAD06-"), []).append(record)
    return build_layout_connections(index, keys or {"TX-UPP6-06A", "UPP6-06A"}, history or {})


def assets():
    return [{"equipment_id": f"IAD06-{key}", "equipment_type": "Cabinet"} for key in ("TX-UPP6-06A", "UPP6-06A")]


CABLE_ID = "FDR-IAD06-TX-UPP6-06A-IAD06-UPP6-06A"


def test_type_controls_cable_classification_and_hyphenated_endpoints_remain_intact():
    cables, diagnostics = build(assets() + [
        {"equipment_id": CABLE_ID, "equipment_type": "Feeder Cable - LV", "status": "Installation Complete"},
        {"equipment_id": CABLE_ID + "-A", "equipment_type": "Termination", "parent": CABLE_ID},
        {"equipment_id": CABLE_ID + "-Z", "equipment_type": "Termination-MV", "parent": CABLE_ID},
        {"equipment_id": "FD-CABINET", "equipment_type": "Cabinet"},
    ])
    assert len(cables) == 1
    assert cables[0]["source_equipment_key"] == "TX-UPP6-06A"
    assert cables[0]["target_equipment_key"] == "UPP6-06A"
    assert cables[0]["connection_status"] == "resolved"
    assert diagnostics == []


def test_missing_positions_and_unencoded_ids_are_preserved_without_invented_endpoints():
    cables, diagnostics = build(assets() + [
        {"equipment_id": CABLE_ID, "equipment_type": "Feeder Cable - LV (Off-Site)"},
        {"equipment_id": "FD01-IAD06-TX6-01A", "equipment_type": "Feeder Cable - MV"},
    ], keys={"TX-UPP6-06A"})
    assert cables[0]["connection_status"] == "endpoint_not_on_layout"
    assert cables[1]["source_equipment_key"] is None
    assert cables[1]["target_equipment_key"] is None
    assert diagnostics[1]["reason"] == "endpoints_not_encoded"


def test_circuit_suffix_is_only_removed_when_the_exact_asset_does_not_exist():
    cable = {"equipment_id": CABLE_ID + "-02", "equipment_type": "Feeder Cable - MV"}
    cables, _ = build(assets() + [cable])
    assert cables[0]["target_equipment_key"] == "UPP6-06A"
    cables, _ = build(assets() + [cable, {"equipment_id": "IAD06-UPP6-06A-02", "equipment_type": "Cabinet"}])
    assert cables[0]["target_equipment_key"] == "UPP6-06A-02"


def test_ambiguous_equipment_or_cable_ids_are_not_drawable():
    cable = {"equipment_id": CABLE_ID, "equipment_type": "Feeder Cable - LV"}
    cables, _ = build(assets() + [assets()[0], cable])
    assert cables[0]["connection_status"] == "ambiguous_endpoint_equipment"
    cables, _ = build(assets() + [cable, cable])
    assert cables[0]["connection_status"] == "ambiguous_cable_id"


def test_latest_mv_daily_result_and_missing_neta_report_are_preserved():
    cable = {"equipment_id": CABLE_ID, "equipment_type": "Feeder Cable - LV", "neta_complete": True}
    cables, _ = build(assets() + [cable], history={CABLE_ID: [
        {"date": "2026-10-13", "status": "tested_and_passed"},
        {"date": "2026-10-14", "status": "failed"},
    ]})
    assert cables[0]["mv_daily_test_status"] == "failed"
    assert cables[0]["mv_daily_test_date"] == "2026-10-14"
    assert cables[0]["neta_complete"] is True
    assert cables[0]["neta_test_report"] is None
