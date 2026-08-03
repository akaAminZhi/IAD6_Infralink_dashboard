import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { DashboardData, KprSummary } from "../types/data";
import { KprPage } from "./KprPage";

vi.mock("recharts", () => ({
  CartesianGrid: () => null,
  Line: () => null,
  LineChart: ({ children }: { children: ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

function kprSummary(
  overrides: Partial<KprSummary> = {},
): KprSummary {
  return {
    schema_version: 3,
    generated_at: "2026-08-05T08:00:00-04:00",
    period: {
      month: "2026-07",
      label: "July 2026",
      start_date: "2026-07-01",
      end_date: "2026-07-31",
      target_end_date: "2026-07-31",
      latest_data_date: "2026-08-05",
      selection_mode: "previous_complete_month",
      system_baseline_date: "2026-06-30",
      case_baseline_date: "2026-06-30",
      eps_baseline_date: "2026-06-30",
      is_month_to_date: false,
    },
    current_snapshot: {
      as_of_date: "2026-08-05",
      case_as_of_date: "2026-08-05",
      eps_as_of_date: "2026-08-04",
      is_later_than_report: true,
      neta_complete_count: 150,
      eps_passed_count: 900,
      eps_current_failed: 12,
      open_issue_count: 20,
    },
    executive_summary: {
      total_pdms: 203,
      testing_started_pdms: 45,
      fully_ready_pdms: 15,
      neta_completed_month: 30,
      neta_no_longer_complete_month: 1,
      neta_net_change_month: 29,
      neta_complete_current: 140,
      neta_complete_baseline: 110,
      eps_passed_month: 100,
      eps_passed_current: 850,
      eps_passed_baseline: 750,
      eps_failed_month: 5,
      eps_fixed_month: 3,
      new_issues_month: 10,
      resolved_issues_month: 8,
      current_open_issues: 22,
    },
    monthly_trends: [
      {
        date: "2026-06-30",
        neta_complete: 110,
        eps_passed: 750,
        issue_backlog: 20,
      },
      {
        date: "2026-07-31",
        neta_complete: 140,
        eps_passed: 850,
        issue_backlog: 22,
      },
    ],
    monthly_progress: {
      neta: {
        current_complete: 140,
        baseline_complete: 110,
        completed_month: 30,
        no_longer_complete_month: 1,
        net_change_month: 29,
        no_longer_complete_equipment_ids: ["IAD06-EQ-1"],
        total_equipment: 1161,
        completion_rate: 12.1,
      },
      eps: {
        daily_passed_current: 850,
        daily_passed_baseline: 750,
        daily_passed_month: 100,
        tracker_total_test_items: 2000,
        tracker_passed_or_fixed: 900,
        tracker_current_failed: 12,
        tracker_fixed_after_failure: 3,
        tracker_not_tested: 1088,
        tracker_as_of_date: "2026-08-05",
      },
      issues: {
        month_start_open: 20,
        new_issues: 10,
        resolved_issues: 8,
        current_open: 22,
      },
    },
    eps_failure_types: [
      {
        tracker_type: "CT",
        current_failed: 8,
        fixed_after_failure: 3,
        failure_history_total: 11,
      },
    ],
    pdm_pipeline: {
      total_pdms: 203,
      stages: [
        {
          key: "ready",
          label: "NETA Complete / Ready",
          color: "#16a34a",
          count: 15,
        },
      ],
    },
    equipment_lifecycle: {
      config_version: 1,
      total_equipment: 1161,
      baseline_equipment: 1161,
      stages: [],
      advanced_count: 30,
      regressed_count: 0,
      unchanged_count: 1131,
      new_equipment_count: 0,
      transitions: [],
      unmapped_statuses: [],
    },
    issue_performance: {
      month_start_open: 20,
      new_issues: 10,
      resolved_issues: 8,
      current_open: 22,
      overdue_open: 4,
      urgent_high_open: 5,
      open_over_30_days: 2,
      average_open_age_days: 12,
      balance_adjustment: 0,
    },
    ...overrides,
  };
}

function dashboardData(summary: KprSummary): DashboardData {
  return {
    pdms: [],
    equipment: [],
    cases: [],
    moduleEquipmentLinks: [],
    summary: null,
    dataQualityReport: null,
    etlRunMetadata: null,
    historyComparison: null,
    epsTestSummary: null,
    epsPdmExecution: [],
    epsModuleExecution: [],
    epsTestItems: [],
    epsFailedItems: [],
    epsIncompleteItems: [],
    epsNotFoundItems: [],
    issueAttachmentManifest: null,
    netaReportManifest: null,
    cxalloyReportStatus: null,
    powerPlanManifest: null,
    kprSummary: summary,
  };
}

describe("KprPage", () => {
  it("shows the previous complete month and a separate current snapshot", () => {
    render(<KprPage data={dashboardData(kprSummary())} />);

    expect(screen.getByText("Last complete month")).toBeInTheDocument();
    expect(screen.getByText("Current Snapshot")).toBeInTheDocument();
    expect(
      screen.getByText(/monthly performance remains locked to July 2026/i),
    ).toBeInTheDocument();
    expect(screen.getByText("3rd Party Test Failure Breakdown")).toBeInTheDocument();
    expect(screen.getByText("CT")).toBeInTheDocument();
    expect(screen.getByText("NETA Equipment Change")).toBeInTheDocument();
    expect(screen.getByText("Metric units")).toBeInTheDocument();
    expect(screen.getAllByText("Test Item").length).toBeGreaterThan(0);
    expect(screen.queryByText("PDM Delivery Pipeline")).not.toBeInTheDocument();
    expect(screen.getAllByText("+29").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/30 newly complete .* 1 no longer marked complete/i),
    ).toBeInTheDocument();
  });

  it("uses daily reports as the 3rd party execution source", () => {
    render(<KprPage data={dashboardData(kprSummary())} />);

    expect(screen.getByText("NETA Equipment Movement")).toBeInTheDocument();
    expect(screen.getByText("Latest Aug 5")).toBeInTheDocument();
    expect(screen.getByText("+10 since period end")).toBeInTheDocument();
    expect(screen.getByText("3rd Party Test Activity")).toBeInTheDocument();
    expect(screen.getByText("Daily Report Cumulative")).toBeInTheDocument();
    expect(screen.getByText("750 at month start")).toBeInTheDocument();
    expect(screen.getByText("Source: Daily Test Reports")).toBeInTheDocument();
    expect(screen.queryByText("Tracker Status")).not.toBeInTheDocument();
    expect(screen.queryByText("Passed / fixed")).not.toBeInTheDocument();
    expect(screen.getAllByText("Period end Jul 31").length).toBe(2);
  });

  it("shows each 3rd party failure type as a share of failure history", () => {
    const summary = kprSummary({
      eps_failure_types: [
        {
          tracker_type: "CT",
          current_failed: 8,
          fixed_after_failure: 3,
          failure_history_total: 11,
        },
        {
          tracker_type: "METER",
          current_failed: 3,
          fixed_after_failure: 0,
          failure_history_total: 3,
        },
      ],
    });

    render(<KprPage data={dashboardData(summary)} />);

    expect(screen.getByText("Current Failed")).toBeInTheDocument();
    expect(screen.getByText("Fixed After Failure")).toBeInTheDocument();
    expect(screen.getByText("Failure History")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "11 current failed and 3 fixed after failure",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "CT: 11 failure-history items, 78.6 percent of total",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "METER: 3 failure-history items, 21.4 percent of total",
      }),
    ).toBeInTheDocument();
  });

  it("presents lifecycle counts as stage inventory and separates mapping gaps", () => {
    const baseSummary = kprSummary();
    const summary = kprSummary({
      equipment_lifecycle: {
        ...baseSummary.equipment_lifecycle,
        advanced_count: 210,
        stages: [
          {
            key: "ifc",
            label: "IFC",
            color: "#64748b",
            order: 0,
            baseline_count: 659,
            current_count: 582,
            month_change: -77,
          },
          {
            key: "pre_installation_complete",
            label: "Pre-Installation Complete",
            color: "#2563eb",
            order: 1,
            baseline_count: 329,
            current_count: 307,
            month_change: -22,
          },
          {
            key: "ship_to_site",
            label: "Ship to Site",
            color: "#059669",
            order: 6,
            baseline_count: 12,
            current_count: 147,
            month_change: 135,
          },
          {
            key: "unmapped",
            label: "Unmapped",
            color: "#94a3b8",
            order: 7,
            baseline_count: 78,
            current_count: 78,
            month_change: 0,
          },
        ],
        transitions: [
          {
            from_key: "pre_installation_complete",
            from_label: "Pre-Installation Complete",
            to_key: "ship_to_site",
            to_label: "Ship to Site",
            count: 44,
            direction: "advanced",
          },
        ],
        unmapped_statuses: [{ status: "Blank", count: 78 }],
      },
    });

    render(<KprPage data={dashboardData(summary)} />);

    expect(screen.getByText("Equipment Lifecycle")).toBeInTheDocument();
    expect(screen.getByText("210 forward")).toBeInTheDocument();
    expect(screen.getByLabelText("77 fewer than month start")).toBeInTheDocument();
    expect(screen.getByLabelText("135 more than month start")).toBeInTheDocument();
    expect(screen.getByText("Movement details").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Blank: 78")).toBeInTheDocument();
  });

  it("does not duplicate Current Snapshot during month-to-date reporting", () => {
    const summary = kprSummary({
      period: {
        ...kprSummary().period,
        selection_mode: "current_month_to_date",
        is_month_to_date: true,
      },
      current_snapshot: {
        ...kprSummary().current_snapshot,
        is_later_than_report: false,
      },
    });
    render(<KprPage data={dashboardData(summary)} />);

    expect(screen.getByText("Month to date")).toBeInTheDocument();
    expect(screen.queryByText("Current Snapshot")).not.toBeInTheDocument();
  });

  it("toggles Presentation Mode without losing report content", async () => {
    const user = userEvent.setup();
    render(<KprPage data={dashboardData(kprSummary())} />);

    await user.click(
      screen.getByRole("button", { name: "Presentation mode" }),
    );
    expect(
      screen.getByRole("button", { name: "Exit presentation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Executive Summary")).toBeInTheDocument();
  });

  it("shows an actionable empty state when KPR data is missing", () => {
    render(<KprPage data={dashboardData(null as unknown as KprSummary)} />);

    expect(
      screen.getByText("Monthly KPR data is not available."),
    ).toBeInTheDocument();
    expect(screen.getByText(/run python scripts\/etl\/run_etl.py/i)).toBeInTheDocument();
  });
});
