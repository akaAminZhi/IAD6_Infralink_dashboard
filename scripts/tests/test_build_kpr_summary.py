from __future__ import annotations

from datetime import date

from scripts.etl.build_kpr_summary import (
    classify_lifecycle_stage,
    eps_summary_as_of_date,
    eps_failure_type_breakdown,
    issue_performance,
    lifecycle_summary,
    monthly_trend,
    neta_month_movement,
    select_reporting_period,
)


def lifecycle_config() -> dict[str, object]:
    return {
        "schema_version": 1,
        "stages": [
            {
                "key": "ifc",
                "label": "IFC",
                "source": "status",
                "statuses": ["IFC"],
                "color": "#64748b",
            },
            {
                "key": "red",
                "label": "Conditional Red Tag",
                "source": "status",
                "statuses": ["Cond Red Tag"],
                "color": "#dc2626",
            },
            {
                "key": "neta",
                "label": "NETA Complete",
                "source": "neta_complete",
                "statuses": [],
                "color": "#0d9488",
            },
            {
                "key": "yellow",
                "label": "Conditional Yellow Tag",
                "source": "status",
                "statuses": ["Cond Yellow Tag"],
                "color": "#d97706",
            },
            {
                "key": "ship",
                "label": "Ship to Site",
                "source": "status",
                "statuses": ["Ship to Site"],
                "color": "#059669",
            },
        ],
        "unmapped_stage": {
            "key": "unmapped",
            "label": "Unmapped",
            "color": "#94a3b8",
        },
    }


def test_lifecycle_uses_virtual_neta_stage_without_overriding_later_status() -> None:
    config = lifecycle_config()

    assert (
        classify_lifecycle_stage(
            {"status": "IFC", "neta_complete": False},
            config,
        )
        == "ifc"
    )
    assert (
        classify_lifecycle_stage(
            {"status": "Cond Red Tag", "neta_complete": True},
            config,
        )
        == "neta"
    )
    assert (
        classify_lifecycle_stage(
            {"status": "Cond Yellow Tag", "neta_complete": True},
            config,
        )
        == "yellow"
    )
    assert (
        classify_lifecycle_stage(
            {"status": "Future Status", "neta_complete": False},
            config,
        )
        == "unmapped"
    )


def test_lifecycle_summary_reports_forward_regressed_and_unmapped_records() -> None:
    config = lifecycle_config()
    baseline = {
        "EQ-1": {"status": "IFC", "neta_complete": False},
        "EQ-2": {"status": "Cond Yellow Tag", "neta_complete": True},
        "EQ-3": {"status": None, "neta_complete": None},
    }
    current = {
        "EQ-1": {"status": "Ship to Site", "neta_complete": True},
        "EQ-2": {"status": "Cond Red Tag", "neta_complete": False},
        "EQ-3": {"status": None, "neta_complete": None},
    }

    summary = lifecycle_summary(current, baseline, config)

    assert summary["total_equipment"] == 3
    assert summary["advanced_count"] == 1
    assert summary["regressed_count"] == 1
    assert summary["unchanged_count"] == 1
    assert summary["unmapped_statuses"] == [{"status": "Blank", "count": 1}]
    stages = {stage["key"]: stage for stage in summary["stages"]}
    assert stages["ship"]["equipment_ids"] == ["EQ-1"]
    assert stages["red"]["equipment_ids"] == ["EQ-2"]
    assert stages["unmapped"]["equipment_ids"] == ["EQ-3"]
    assert stages["ifc"]["entered_count"] == 0
    assert stages["ifc"]["exited_count"] == 1
    assert stages["red"]["entered_count"] == 1
    assert stages["red"]["exited_count"] == 0
    assert stages["ship"]["entered_count"] == 1
    assert stages["ship"]["retained_count"] == 0
    assert stages["unmapped"]["retained_count"] == 1


def test_lifecycle_stage_reconciliation_includes_retained_equipment() -> None:
    config = lifecycle_config()
    baseline = {
        "EQ-1": {"status": "Cond Red Tag", "neta_complete": True},
        "EQ-2": {"status": "IFC", "neta_complete": False},
        "EQ-3": {"status": "IFC", "neta_complete": False},
    }
    current = {
        "EQ-1": {"status": "Cond Red Tag", "neta_complete": True},
        "EQ-2": {"status": "IFC", "neta_complete": True},
        "EQ-3": {"status": "Ship to Site", "neta_complete": True},
    }

    stages = {
        stage["key"]: stage
        for stage in lifecycle_summary(current, baseline, config)["stages"]
    }

    assert stages["neta"]["baseline_count"] == 1
    assert stages["neta"]["retained_count"] == 1
    assert stages["neta"]["entered_count"] == 1
    assert stages["neta"]["exited_count"] == 0
    assert stages["neta"]["current_count"] == 2


def test_monthly_trend_keeps_pre_month_baseline_point() -> None:
    trend = monthly_trend(
        date(2026, 7, 1),
        date(2026, 7, 30),
        {
            date(2026, 6, 30): 64,
            date(2026, 7, 1): 73,
            date(2026, 7, 30): 139,
        },
        {
            date(2026, 6, 30): 37,
            date(2026, 7, 30): 51,
        },
        {
            date(2026, 6, 30): 498,
            date(2026, 7, 30): 871,
        },
    )

    assert trend[0] == {
        "date": "2026-06-30",
        "neta_complete": 64,
        "eps_passed": 498,
        "issue_backlog": 37,
    }
    assert trend[-1]["neta_complete"] == 139
    assert trend[-1]["eps_passed"] == 871
    assert trend[-1]["issue_backlog"] == 51


def test_neta_month_movement_separates_gross_completions_from_net_change() -> None:
    movement = neta_month_movement(
        {"EQ-2", "EQ-3", "EQ-4"},
        {"EQ-1", "EQ-2"},
    )

    assert movement == {
        "newly_completed_count": 2,
        "newly_completed_equipment_ids": ["EQ-3", "EQ-4"],
        "no_longer_complete_count": 1,
        "net_change_count": 1,
        "no_longer_complete_equipment_ids": ["EQ-1"],
    }


def test_reporting_period_uses_previous_complete_month_during_first_week() -> None:
    early_month = select_reporting_period(date(2026, 8, 5))
    later_month = select_reporting_period(date(2026, 8, 8))

    assert early_month == {
        "month_start": date(2026, 7, 1),
        "target_end": date(2026, 7, 31),
        "selection_mode": "previous_complete_month",
    }
    assert later_month == {
        "month_start": date(2026, 8, 1),
        "target_end": date(2026, 8, 8),
        "selection_mode": "current_month_to_date",
    }


def test_eps_summary_as_of_date_prefers_source_date_then_snapshot() -> None:
    fallback = date(2026, 8, 3)

    assert (
        eps_summary_as_of_date(
            {
                "source_date_label": "2026-07-31",
                "snapshot_date": "2026-08-03",
            },
            fallback,
        )
        == date(2026, 7, 31)
    )
    assert (
        eps_summary_as_of_date({"snapshot_date": "2026-08-02"}, fallback)
        == date(2026, 8, 2)
    )
    assert eps_summary_as_of_date({}, fallback) == fallback


def test_eps_failure_type_breakdown_separates_current_and_fixed_history() -> None:
    result = eps_failure_type_breakdown(
        [
            {"item_status": "Failed", "tracker_type": "CT"},
            {"item_status": "Failed - Not In Tracker", "tracker_type": "CT"},
            {"item_status": "Fixed", "tracker_type": "CT"},
            {
                "item_status": "Fixed - Not In Tracker",
                "tracker_equipment_type": "METER",
            },
            {"item_status": "Passed", "tracker_type": "CT"},
        ]
    )

    assert result == [
        {
            "tracker_type": "CT",
            "current_failed": 2,
            "fixed_after_failure": 1,
            "failure_history_total": 3,
        },
        {
            "tracker_type": "METER",
            "current_failed": 0,
            "fixed_after_failure": 1,
            "failure_history_total": 1,
        },
    ]


def test_issue_performance_counts_resolved_and_open_aging() -> None:
    baseline = {
        "CASE-1": {"case_id": "CASE-1", "status": "Open"},
        "CASE-2": {"case_id": "CASE-2", "status": "Open"},
    }
    current = {
        "CASE-1": {"case_id": "CASE-1", "status": "Resolved"},
        "CASE-2": {
            "case_id": "CASE-2",
            "status": "Open",
            "priority": "Urgent (24h)",
            "created_at": "2026-06-01",
            "due_date": "2026-07-01",
        },
        "CASE-3": {
            "case_id": "CASE-3",
            "status": "Open",
            "priority": "High (3d)",
            "created_at": "2026-07-20",
        },
    }

    result = issue_performance(current, baseline, date(2026, 7, 30))

    assert result["month_start_open"] == 2
    assert result["new_issues"] == 1
    assert result["resolved_issues"] == 1
    assert result["current_open"] == 2
    assert result["overdue_open"] == 1
    assert result["urgent_high_open"] == 2
    assert result["open_over_30_days"] == 1
    assert result["month_start_open_case_ids"] == ["CASE-1", "CASE-2"]
    assert result["new_issue_case_ids"] == ["CASE-3"]
    assert result["resolved_issue_case_ids"] == ["CASE-1"]
    assert result["current_open_case_ids"] == ["CASE-2", "CASE-3"]
    assert result["overdue_open_case_ids"] == ["CASE-2"]
    assert result["urgent_high_open_case_ids"] == ["CASE-2", "CASE-3"]
    assert result["open_over_30_days_case_ids"] == ["CASE-2"]
