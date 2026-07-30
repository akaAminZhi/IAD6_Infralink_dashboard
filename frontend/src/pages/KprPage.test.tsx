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
    expect(screen.getByText("EPS Failure Type Breakdown")).toBeInTheDocument();
    expect(screen.getByText("CT")).toBeInTheDocument();
    expect(screen.getByText("NETA Net Change")).toBeInTheDocument();
    expect(screen.getByText("+29")).toBeInTheDocument();
    expect(
      screen.getByText(/30 newly complete .* 1 no longer marked complete/i),
    ).toBeInTheDocument();
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
