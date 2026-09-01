from scripts.etl.tracking_rules import requires_equipment_test_tracking


def test_battery_equipment_is_not_test_tracked() -> None:
    assert not requires_equipment_test_tracking(
        {"equipment_id": "IAD06-INV6-H1-1 BATTERY 2"}
    )
    assert not requires_equipment_test_tracking(
        {"source_equipment_label": "INV6-H1-1 battery1"}
    )
    assert requires_equipment_test_tracking({"equipment_id": "IAD06-PDU6-01A-1"})


def test_direct_inverter_is_not_tracked_but_tx_inverter_is_tracked() -> None:
    assert not requires_equipment_test_tracking({"equipment_id": "IAD06-INV6-04R"})
    assert not requires_equipment_test_tracking({"source_equipment_label": "INV6-H1-1"})
    assert requires_equipment_test_tracking({"equipment_id": "IAD06-TX-INV6-03R"})
    assert requires_equipment_test_tracking(
        {"equipment_id": "IAD06-ATS-TX-INV6-H1-1"}
    )


def test_ups_and_mbc_equipment_are_not_test_tracked() -> None:
    assert not requires_equipment_test_tracking(
        {"equipment_id": "IAD06-UPS6-01A-3"}
    )
    assert not requires_equipment_test_tracking(
        {"source_equipment_label": "UPS6-01A-3 BATT"}
    )
    assert not requires_equipment_test_tracking(
        {"equipment_id": "IAD06-MBC3-01A-3"}
    )
    assert not requires_equipment_test_tracking(
        {"normalized_equipment_id": "IAD06-MBC6-01R-2"}
    )
    assert requires_equipment_test_tracking({"equipment_id": "IAD06-PDU6-01A-3"})
