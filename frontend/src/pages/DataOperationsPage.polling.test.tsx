import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AutomationHealth, AutomationRun } from "../types/automation";
import {
  getAutomationHealth,
  getAutomationJobs,
  getAutomationRuns,
  getDailyReports,
  getMvDailyReports,
  getRunLogs,
} from "../utils/automationApi";
import {
  ACTIVE_POLL_MS,
  DataOperationsPage,
  IDLE_POLL_MS,
  LOG_POLL_MS,
} from "./DataOperationsPage";

vi.mock("../utils/automationApi", () => {
  class MockAutomationApiError extends Error {
    status = 0;
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
    getSiteDailyReports: vi.fn().mockResolvedValue([]),
    saveSiteDailyReport: vi.fn(),
    getRunLogs: vi.fn(),
    resumeAutomationRun: vi.fn(),
    runAutomationJob: vi.fn(),
    saveDailyReport: vi.fn(),
    saveMvDailyReport: vi.fn(),
    startAutomationLogin: vi.fn(),
    disconnectProvider: vi.fn(),
    startBrowserLogin: vi.fn(),
    browserLoginAction: vi.fn(),
    closeBrowserLogin: vi.fn(),
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
  busy: false,
  last_etl: { path: "x", generated_at: "2026-07-30T08:30:00", readable: true },
};

function makeRun(status: AutomationRun["status"]): AutomationRun {
  return {
    run_id: "run-1",
    kind: "pipeline",
    label: "Daily Data Refresh",
    status,
    created_at: "2026-07-30T08:00:00",
    started_at: "2026-07-30T08:00:00",
    finished_at: status === "running" ? null : "2026-07-30T08:02:00",
    exit_code: status === "running" ? null : 0,
    error: null,
    current_step: null,
    options: {},
    steps: [],
  };
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

async function mount() {
  render(<DataOperationsPage onDashboardReload={vi.fn()} />);
  await advance(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  setHidden(false);
  vi.mocked(getAutomationHealth).mockResolvedValue(health);
  vi.mocked(getAutomationJobs).mockResolvedValue([]);
  vi.mocked(getAutomationRuns).mockResolvedValue([makeRun("succeeded")]);
  vi.mocked(getDailyReports).mockResolvedValue([]);
  vi.mocked(getMvDailyReports).mockResolvedValue([]);
  vi.mocked(getRunLogs).mockResolvedValue({ offset: 0, content: "", has_more: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("DataOperationsPage polling", () => {
  it("loads health, runs, jobs, and logs once on mount", async () => {
    await mount();
    expect(getAutomationHealth).toHaveBeenCalledTimes(1);
    expect(getAutomationRuns).toHaveBeenCalledTimes(1);
    expect(getAutomationJobs).toHaveBeenCalledTimes(1);
    expect(getRunLogs).toHaveBeenCalledTimes(1);
  });

  it("polls slowly while idle and never re-fetches the static job list or logs", async () => {
    await mount();
    await advance(IDLE_POLL_MS - 1);
    expect(getAutomationHealth).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(getAutomationHealth).toHaveBeenCalledTimes(2);
    expect(getAutomationRuns).toHaveBeenCalledTimes(2);
    await advance(IDLE_POLL_MS * 3);
    expect(getAutomationHealth).toHaveBeenCalledTimes(5);
    expect(getAutomationJobs).toHaveBeenCalledTimes(1);
    expect(getRunLogs).toHaveBeenCalledTimes(1);
  });

  it("polls status and logs quickly while a run is active", async () => {
    vi.mocked(getAutomationHealth).mockResolvedValue({ ...health, busy: true, active_run_id: "run-1" });
    vi.mocked(getAutomationRuns).mockResolvedValue([makeRun("running")]);
    await mount();
    const healthBefore = vi.mocked(getAutomationHealth).mock.calls.length;
    const logsBefore = vi.mocked(getRunLogs).mock.calls.length;
    await advance(ACTIVE_POLL_MS * 4);
    expect(vi.mocked(getAutomationHealth).mock.calls.length - healthBefore).toBe(4);
    expect(vi.mocked(getRunLogs).mock.calls.length - logsBefore).toBeGreaterThanOrEqual(5);
    expect(getAutomationJobs).toHaveBeenCalledTimes(1);
  });

  it("treats busy health as active even when no run is listed as active", async () => {
    vi.mocked(getAutomationHealth).mockResolvedValue({ ...health, busy: true });
    await mount();
    const before = vi.mocked(getAutomationHealth).mock.calls.length;
    await advance(ACTIVE_POLL_MS * 2);
    expect(vi.mocked(getAutomationHealth).mock.calls.length - before).toBe(2);
  });

  it("slows down again and reads the final log tail when the run finishes", async () => {
    vi.mocked(getAutomationHealth).mockResolvedValue({ ...health, busy: true, active_run_id: "run-1" });
    vi.mocked(getAutomationRuns).mockResolvedValue([makeRun("running")]);
    vi.mocked(getRunLogs).mockResolvedValueOnce({ offset: 5, content: "start", has_more: false });
    await mount();
    expect(screen.getByText("start", { selector: "pre" })).toBeInTheDocument();

    vi.mocked(getAutomationHealth).mockResolvedValue(health);
    vi.mocked(getAutomationRuns).mockResolvedValue([makeRun("succeeded")]);
    vi.mocked(getRunLogs).mockImplementation(async (_id, offset = 0) =>
      offset >= 9
        ? { offset, content: "", has_more: false }
        : { offset: 9, content: "-final", has_more: false });
    await advance(ACTIVE_POLL_MS);
    expect(screen.getByText("start-final", { selector: "pre" })).toBeInTheDocument();

    const healthAfter = vi.mocked(getAutomationHealth).mock.calls.length;
    const logsAfter = vi.mocked(getRunLogs).mock.calls.length;
    await advance(IDLE_POLL_MS - 1);
    expect(vi.mocked(getAutomationHealth).mock.calls.length).toBe(healthAfter);
    await advance(1);
    expect(vi.mocked(getAutomationHealth).mock.calls.length).toBe(healthAfter + 1);
    await advance(LOG_POLL_MS * 20);
    expect(vi.mocked(getRunLogs).mock.calls.length).toBe(logsAfter);
  });

  it("requests logs with the running offset and never duplicates text", async () => {
    vi.mocked(getAutomationHealth).mockResolvedValue({ ...health, busy: true, active_run_id: "run-1" });
    vi.mocked(getAutomationRuns).mockResolvedValue([makeRun("running")]);
    vi.mocked(getRunLogs)
      .mockResolvedValueOnce({ offset: 3, content: "abc", has_more: false })
      .mockResolvedValue({ offset: 3, content: "", has_more: false });
    await mount();
    await advance(LOG_POLL_MS * 2);
    expect(getRunLogs).toHaveBeenNthCalledWith(1, "run-1", 0);
    expect(getRunLogs).toHaveBeenLastCalledWith("run-1", 3);
    expect(screen.getByText("abc", { selector: "pre" })).toBeInTheDocument();
  });

  it("keeps polling after a transient failure", async () => {
    vi.mocked(getAutomationHealth).mockRejectedValueOnce(new Error("Connection refused"));
    await mount();
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
    await advance(IDLE_POLL_MS);
    expect(getAutomationHealth).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Connection refused")).not.toBeInTheDocument();
  });

  it("retries the job list only until it has loaded once", async () => {
    vi.mocked(getAutomationJobs).mockRejectedValueOnce(new Error("jobs down"));
    await mount();
    expect(getAutomationJobs).toHaveBeenCalledTimes(1);
    await advance(IDLE_POLL_MS);
    expect(getAutomationJobs).toHaveBeenCalledTimes(2);
    await advance(IDLE_POLL_MS * 2);
    expect(getAutomationJobs).toHaveBeenCalledTimes(2);
  });

  it("makes no requests while the tab is hidden and refreshes on return", async () => {
    await mount();
    act(() => setHidden(true));
    const healthBefore = vi.mocked(getAutomationHealth).mock.calls.length;
    await advance(IDLE_POLL_MS * 5);
    expect(vi.mocked(getAutomationHealth).mock.calls.length).toBe(healthBefore);
    act(() => setHidden(false));
    await advance(0);
    expect(vi.mocked(getAutomationHealth).mock.calls.length).toBe(healthBefore + 1);
  });

  it("stops all polling after unmount", async () => {
    vi.mocked(getAutomationHealth).mockResolvedValue({ ...health, busy: true, active_run_id: "run-1" });
    vi.mocked(getAutomationRuns).mockResolvedValue([makeRun("running")]);
    const view = render(<DataOperationsPage onDashboardReload={vi.fn()} />);
    await advance(0);
    view.unmount();
    const health1 = vi.mocked(getAutomationHealth).mock.calls.length;
    const logs1 = vi.mocked(getRunLogs).mock.calls.length;
    await advance(IDLE_POLL_MS * 2);
    expect(vi.mocked(getAutomationHealth).mock.calls.length).toBe(health1);
    expect(vi.mocked(getRunLogs).mock.calls.length).toBe(logs1);
  });
});
