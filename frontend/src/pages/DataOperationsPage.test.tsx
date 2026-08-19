import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AutomationHealth,
  AutomationJob,
  AutomationRun,
  DailyReport,
  MvDailyReport,
} from "../types/automation";
import {
  getAutomationHealth,
  getAutomationJobs,
  getAutomationRuns,
  getDailyReports,
  getMvDailyReports,
  getRunLogs,
  startDailyPipeline,
} from "../utils/automationApi";
import { DataOperationsPage } from "./DataOperationsPage";

vi.mock("../utils/automationApi", () => {
  class MockAutomationApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }

  return {
    AutomationApiError: MockAutomationApiError,
    cancelAutomationRun: vi.fn(),
    continueAutomationLogin: vi.fn(),
    getAutomationHealth: vi.fn(),
    getAutomationJobs: vi.fn(),
    getAutomationRuns: vi.fn(),
    getDailyReport: vi.fn(),
    getDailyReports: vi.fn(),
    getMvDailyReport: vi.fn(),
    getMvDailyReports: vi.fn(),
    getRunLogs: vi.fn(),
    resumeAutomationRun: vi.fn(),
    runAutomationJob: vi.fn(),
    saveDailyReport: vi.fn(),
    saveMvDailyReport: vi.fn(),
    startAutomationLogin: vi.fn(),
    startDailyPipeline: vi.fn(),
    validateDailyReport: vi.fn(),
    validateMvDailyReport: vi.fn(),
  };
});

const health: AutomationHealth = {
  service_status: "ok",
  dashboard_root: "C:/dashboard",
  eps_tracker_root: "C:/tracker",
  eps_tracker_exists: true,
  report_directory: "C:/tracker/Daily_test_report",
  mv_report_directory: "C:/tracker/MV_Daily_test_report",
  runtime_directory: "C:/dashboard/runtime/automation",
  sessions: {
    jc2: { exists: true, modified_at: "2026-07-30T08:00:00" },
    cxalloy: { exists: false, modified_at: null },
  },
  active_run_id: null,
  last_etl: {
    path: "C:/dashboard/frontend/public/data/etl_run_metadata.json",
    generated_at: "2026-07-30T08:30:00",
    readable: true,
  },
};

const succeededRun: AutomationRun = {
  run_id: "run-1",
  kind: "pipeline",
  label: "Daily Data Refresh",
  status: "succeeded",
  created_at: "2026-07-30T08:00:00",
  started_at: "2026-07-30T08:00:00",
  finished_at: "2026-07-30T08:02:00",
  exit_code: 0,
  error: null,
  current_step: null,
  options: {},
  steps: [
    {
      job_id: "run_dashboard_etl",
      label: "Run Dashboard ETL",
      status: "succeeded",
      started_at: "2026-07-30T08:01:00",
      finished_at: "2026-07-30T08:02:00",
      exit_code: 0,
      error: null,
    },
  ],
};

const jobs: AutomationJob[] = [
  {
    job_id: "wash_daily_reports",
    label: "Rebuild Daily Test Summary",
    description: "Rebuild the EPS daily summary.",
    supported_options: [],
    dangerous: false,
  },
  {
    job_id: "upload_cxalloy_reports",
    label: "Upload CxAlloy Reports",
    description: "Upload organized reports.",
    supported_options: ["dry_run", "no_excel_update"],
    dangerous: true,
  },
];

function report(index: number): DailyReport {
  return {
    report_name: `7-${30 - index}.md`,
    modified_at: `2026-07-${String(30 - index).padStart(2, "0")}T08:00:00`,
    sections: { failed: [], retested_and_passed: [], tested: [`EQ-${index}`] },
    counts: { failed: 0, retested_and_passed: 0, tested: 1 },
  };
}

const mvReport: MvDailyReport = {
  report_name: "7-30.md",
  modified_at: "2026-07-30T09:00:00",
  sections: {
    tested_and_passed: ["FD01-IAD06-TX6-01A"],
    partially_tested: ["FD02-IAD06-TX6-01B"],
    failed: [],
    retested_and_passed: [],
  },
  counts: {
    tested_and_passed: 1,
    partially_tested: 1,
    failed: 0,
    retested_and_passed: 0,
  },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("DataOperationsPage", () => {
  it("shows a recovery command when the local task service is offline", async () => {
    vi.mocked(getAutomationHealth).mockRejectedValue(new Error("Connection refused"));
    vi.mocked(getAutomationJobs).mockResolvedValue([]);
    vi.mocked(getAutomationRuns).mockResolvedValue([]);
    vi.mocked(getDailyReports).mockResolvedValue([]);
    vi.mocked(getMvDailyReports).mockResolvedValue([]);

    render(<DataOperationsPage onDashboardReload={vi.fn()} />);

    expect(
      await screen.findByText("Local automation service is offline"),
    ).toBeInTheDocument();
    expect(screen.getByText("python scripts/start_dashboard.py")).toBeInTheDocument();
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
  });

  it("loads service state, expands report history, and starts the daily pipeline", async () => {
    const user = userEvent.setup();
    const onDashboardReload = vi.fn();
    vi.mocked(getAutomationHealth).mockResolvedValue(health);
    vi.mocked(getAutomationJobs).mockResolvedValue(jobs);
    vi.mocked(getAutomationRuns).mockResolvedValue([succeededRun]);
    vi.mocked(getDailyReports).mockResolvedValue(Array.from({ length: 6 }, (_, index) => report(index)));
    vi.mocked(getMvDailyReports).mockResolvedValue([mvReport]);
    vi.mocked(getRunLogs).mockResolvedValue({
      offset: 12,
      content: "ETL complete",
      has_more: false,
    });
    vi.mocked(startDailyPipeline).mockResolvedValue({
      ...succeededRun,
      run_id: "run-2",
      status: "queued",
    });

    render(<DataOperationsPage onDashboardReload={onDashboardReload} />);

    expect(await screen.findByText("Local service connected")).toBeInTheDocument();
    expect(screen.getByText("7-30.md")).toBeInTheDocument();
    expect(screen.queryByText("7-29.md")).not.toBeInTheDocument();
    await waitFor(() => expect(onDashboardReload).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("ETL complete")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Browse All (6)" }));
    expect(screen.getByText("7-29.md")).toBeInTheDocument();
    expect(screen.queryByText("7-25.md")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start Daily Refresh" }));
    await waitFor(() =>
      expect(startDailyPipeline).toHaveBeenCalledWith({ headed: false, force: false }),
    );
  });

  it("switches to MV reports and opens the MV report editor", async () => {
    const user = userEvent.setup();
    vi.mocked(getAutomationHealth).mockResolvedValue(health);
    vi.mocked(getAutomationJobs).mockResolvedValue([]);
    vi.mocked(getAutomationRuns).mockResolvedValue([]);
    vi.mocked(getDailyReports).mockResolvedValue([]);
    vi.mocked(getMvDailyReports).mockResolvedValue([mvReport]);
    vi.mocked(getRunLogs).mockResolvedValue({ offset: 0, content: "", has_more: false });

    render(<DataOperationsPage onDashboardReload={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "MV Reports (1)" }));
    expect(screen.getByText("C:/tracker/MV_Daily_test_report", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Partially Tested")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New MV Daily Report" }));
    expect(screen.getByRole("heading", { name: "New MV Daily Test Report" })).toBeInTheDocument();
    expect(screen.getByText("Saved separately from EPS reports; no EPS wash is started.")).toBeInTheDocument();
  });

  it("keeps existing EPS reports visible when the MV endpoint is unavailable", async () => {
    vi.mocked(getAutomationHealth).mockResolvedValue(health);
    vi.mocked(getAutomationJobs).mockResolvedValue([]);
    vi.mocked(getAutomationRuns).mockResolvedValue([]);
    vi.mocked(getDailyReports).mockResolvedValue([report(0)]);
    vi.mocked(getMvDailyReports).mockRejectedValue(new Error("Not found"));

    render(<DataOperationsPage onDashboardReload={vi.fn()} />);

    expect(await screen.findByText("7-30.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EPS Reports (1)" })).toBeInTheDocument();
  });
});
