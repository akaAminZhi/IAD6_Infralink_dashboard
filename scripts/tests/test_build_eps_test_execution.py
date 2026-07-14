from __future__ import annotations

from datetime import date
from pathlib import Path

from scripts.etl.build_eps_test_execution import (
    TrackerRecord,
    build_module_link_index,
    choose_baseline_snapshot,
    choose_baseline_daily_date,
    cumulative_daily_equipment,
    compare_snapshots,
    date_tested_indicates_tested,
    find_module_link_for_tracker_record,
    is_one_day_snapshot_diff,
    parse_daily_tested_equipment,
    record_is_failed,
    tracker_item_record,
    tracker_module_key_for_record,
    tracker_match_keys,
    unmatched_input_equipment_keys,
)


def make_tracker_record(
    equipment_name: str,
    substation: str,
) -> TrackerRecord:
    return TrackerRecord(
        row_number=1,
        equipment_name=equipment_name,
        equipment_key=equipment_name,
        substation=substation,
        substation_key=substation,
        test_type="BKR-PRI INJ >2000A",
        equipment_type="",
        follow_up_req="",
        comments="",
        date_tested="",
    )


def test_tracker_record_prefers_equipment_prefix_when_substation_points_to_wrong_module() -> None:
    module_keys = {"CDS6-01R-8", "CDS6-02R-3"}
    record = make_tracker_record("CDS6-02R-3-MCB1", "CDS6-01R-8")

    assert tracker_module_key_for_record(record, module_keys) == "CDS6-02R-3"


def test_tracker_record_module_link_prefers_equipment_prefix_over_substation() -> None:
    module_links = [
        {
            "pdm_name": "IAD06-PDM-E6-110-01-PRIMARY-CDS-R",
            "source_equipment_label": "CDS6-01R-8",
            "normalized_equipment_id": "IAD06-CDS6-01R-8",
            "matched_equipment_id": "IAD06-CDS6-01R-8",
        },
        {
            "pdm_name": "IAD06-PDM-E6-110-02-PRIMARY-CDS-R",
            "source_equipment_label": "CDS6-02R-3",
            "normalized_equipment_id": "IAD06-CDS6-02R-3",
            "matched_equipment_id": "IAD06-CDS6-02R-3",
        },
    ]
    module_keys = {"CDS6-01R-8", "CDS6-02R-3"}
    record = make_tracker_record("CDS6-02R-3-MCB1", "CDS6-01R-8")

    module_link, match_status = find_module_link_for_tracker_record(
        record,
        build_module_link_index(module_links),
        module_keys,
    )

    assert match_status == "matched_module_link"
    assert module_link is not None
    assert module_link["source_equipment_label"] == "CDS6-02R-3"


def test_na_and_nt_dates_do_not_count_as_tested() -> None:
    assert not date_tested_indicates_tested("N/A")
    assert not date_tested_indicates_tested("N/T")
    assert not date_tested_indicates_tested("")
    assert date_tested_indicates_tested("2026-06-08 00:00:00")


def test_follow_up_req_with_comments_counts_as_failed_only_after_test_started() -> None:
    record = make_tracker_record("MDB6-01R-FB6", "MDB6-01R")
    record = TrackerRecord(
        **{
            **record.__dict__,
            "follow_up_req": "Yes",
            "comments": "Needs follow up",
            "date_tested": "N/T",
        }
    )

    assert not record_is_failed(record, set())

    record = TrackerRecord(
        **{
            **record.__dict__,
            "date_tested": "2026-06-08 00:00:00",
        }
    )

    assert record_is_failed(record, set())


def test_snapshot_failed_equipment_keeps_failed_not_in_tracker_items() -> None:
    failed_input_equipment = {"PDU6-01B-4-PQM1-CT01", "PDU6-01B-4-CT-PRI"}
    tracker_equipment_keys = {"PDU6-01B-4-PQM1-CT01"}

    failed_equipment, _alias_matches = tracker_match_keys(
        failed_input_equipment,
        tracker_equipment_keys,
    )
    snapshot_failed_equipment = failed_equipment | unmatched_input_equipment_keys(
        failed_input_equipment,
        tracker_equipment_keys,
    )

    assert snapshot_failed_equipment == {"PDU6-01B-4-PQM1-CT01", "PDU6-01B-4-CT-PRI"}


def test_daily_tested_equipment_parser_uses_dated_sections(tmp_path: Path) -> None:
    source = tmp_path / "daily_tested_equipment.md"
    source.write_text(
        "\n".join(
            [
                "# Tested Equipment",
                "",
                "## 7-1",
                "- PDU6-01A-1",
                "- PDU6-01A-2",
                "",
                "## 7-2",
                "- PDU6-01A-3",
                "",
                "# Failed Equipment",
                "",
                "## 7-1",
                "- PDU6-01A-4-CT-PRI",
                "",
                "## 7-2",
                "- PDU6-01A-2",
                "",
                "# Retested And Passed",
                "",
                "## 7-2",
                "- PDU6-01A-4-CT-PRI",
            ]
        ),
        encoding="utf-8",
    )

    history = parse_daily_tested_equipment(source, reference_date=date(2026, 7, 8))
    passed, failed = cumulative_daily_equipment(history, date(2026, 7, 2))

    assert history.latest_date == date(2026, 7, 2)
    assert passed == {"PDU6-01A-1", "PDU6-01A-3", "PDU6-01A-4-CT-PRI"}
    assert failed == {"PDU6-01A-2"}
    assert history.records_by_date[date(2026, 7, 2)]["retested"] == {
        "PDU6-01A-4-CT-PRI"
    }


def test_retested_item_is_fixed_and_appends_retest_comment() -> None:
    record = TrackerRecord(
        **{
            **make_tracker_record("PDU6-01A-5-PQM1-CT01", "PDU6-01A-5").__dict__,
            "comments": "Original failed ratio comment",
            "date_tested": "FAILED-6/25/26",
        }
    )

    item = tracker_item_record(
        tracker_record=record,
        module_link=None,
        equipment_info={},
        item_status="Fixed",
        module_match_status="matched_module_link",
        retested_at=date(2026, 7, 13),
    )

    assert item["item_status"] == "Fixed"
    assert item["retested_and_passed"] is True
    assert item["retested_at"] == "2026-07-13"
    assert item["comments"] == (
        "Original failed ratio comment; Retested and passed on 2026-07-13."
    )


def test_snapshot_comparison_counts_explicit_retest_as_repaired() -> None:
    baseline = {
        "source_date_label": "2026-07-06",
        "tested_equipment": [],
        "failed_equipment": [],
        "fixed_equipment": [],
        "module_status_by_key": {},
    }
    current = {
        "source_date_label": "2026-07-13",
        "tested_equipment": ["PDU6-01A-7-CT-PRI"],
        "failed_equipment": [],
        "fixed_equipment": ["PDU6-01A-7-CT-PRI"],
        "module_status_by_key": {},
    }

    comparison = compare_snapshots(current, baseline, 7)

    assert comparison["repaired_count"] == 1
    assert comparison["repaired_equipment"] == ["PDU6-01A-7-CT-PRI"]


def test_daily_baseline_prefers_dated_daily_source() -> None:
    dates = [
        date(2026, 6, 22),
        date(2026, 6, 29),
        date(2026, 7, 2),
        date(2026, 7, 6),
    ]

    assert choose_baseline_daily_date(dates, date(2026, 7, 6), 7) == date(2026, 6, 29)


def test_yesterday_snapshot_diff_requires_previous_calendar_day() -> None:
    assert is_one_day_snapshot_diff(
        {
            "available": True,
            "current_date": "2026-07-06",
            "baseline_date": "2026-07-05",
        },
        date(2026, 7, 6),
    )


def test_seven_day_baseline_prefers_snapshot_at_or_before_target_date() -> None:
    snapshots = [
        (date(2026, 7, 1), Path("2026-07-01.json")),
        (date(2026, 7, 2), Path("2026-07-02.json")),
        (date(2026, 7, 5), Path("2026-07-05.json")),
    ]

    assert (
        choose_baseline_snapshot(snapshots, date(2026, 7, 9), 7)
        == Path("2026-07-02.json")
    )


def test_seven_day_baseline_uses_nearest_workday_snapshot_when_target_is_missing() -> None:
    snapshots = [
        (date(2026, 7, 2), Path("2026-07-02.json")),
        (date(2026, 7, 6), Path("2026-07-06.json")),
    ]

    assert (
        choose_baseline_snapshot(snapshots, date(2026, 7, 7), 7)
        == Path("2026-07-02.json")
    )


def test_seven_day_baseline_stays_unavailable_when_no_nearby_snapshot_exists() -> None:
    snapshots = [
        (date(2026, 7, 6), Path("2026-07-06.json")),
    ]

    assert choose_baseline_snapshot(snapshots, date(2026, 7, 7), 7) is None
    assert not is_one_day_snapshot_diff(
        {
            "available": True,
            "current_date": "2026-07-06",
            "baseline_date": "2026-07-02",
        },
        date(2026, 7, 6),
    )
