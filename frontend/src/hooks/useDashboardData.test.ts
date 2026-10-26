import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchJson } from "../utils/dataLoaders";
import { useDashboardData } from "./useDashboardData";

vi.mock("../utils/dataLoaders", () => ({
  fetchJson: vi.fn(),
  clearPendingJsonRequests: vi.fn(),
  unwrapRecords: <T,>(json: unknown): T[] => {
    if (Array.isArray(json)) return json as T[];
    if (
      json !== null &&
      typeof json === "object" &&
      Array.isArray((json as { records?: unknown }).records)
    ) {
      return (json as { records: T[] }).records;
    }
    return [];
  },
}));

const fetchJsonMock = vi.mocked(fetchJson);

function defaultPayload(path: string): unknown {
  const payloads: Record<string, unknown> = {
    "/data/pdms.json": { records: [{ pdm_name: "PDM-A", equipment: [] }] },
    "/data/summary.json": { total_pdms: 1 },
    "/data/etl_run_metadata.json": { generated_at: "2026-07-30T08:00:00" },
    "/data/history_comparison.json": { lookback_days: 7 },
    "/data/eps_test_summary.json": { passed_test_item_count: 4 },
    "/data/eps_pdm_execution.json": { records: [{ pdm_name: "PDM-A" }] },
    "/data/eps_module_execution.json": { records: [{ module_equipment: "EQ-1" }] },
    "/data/eps_test_items.json": { records: [{ equipment_name: "EQ-1" }] },
    "/data/eps_failed_items.json": { records: [] },
    "/data/eps_incomplete_items.json": { records: [] },
    "/data/eps_not_found_items.json": { records: [] },
    "/data/issue_attachment_manifest.json": { records: [] },
    "/data/neta_report_manifest.json": { records: [] },
    "/data/cxalloy_report_status.json": { records: [] },
    "/data/power_plan.json": { pages: [] },
    "/data/kpr_summary.json": null,
    "/data/equipment.json": { records: [{ equipment_id: "IAD06-EQ-1" }] },
    "/data/cases.json": { records: [{ case_id: "CASE-1" }] },
    "/data/module_equipment_links.json": { records: [{ pdm_name: "PDM-A" }] },
    "/data/data_quality_report.json": { unmatched_cases: [] },
  };
  return payloads[path] ?? null;
}

afterEach(() => {
  vi.restoreAllMocks();
  fetchJsonMock.mockReset();
});

describe("useDashboardData route loading", () => {
  it("loads combined daily-report evidence for EPS execution and preserves both source histories", async () => {
    const audit = { item_count: 1, items: [{ equipment_key: "TX6-01", events: [
      { source: "Daily_test_report", date: "2026-10-01" },
      { source: "MV_Daily_test_report", date: "2026-10-03" },
    ] }] };
    fetchJsonMock.mockImplementation(async (path) => path === "/data/eps_daily_report_audit.json"
      ? audit : defaultPayload(path));
    const { result } = renderHook(() => useDashboardData("/eps-test-execution"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.epsDailyReportAudit).toEqual(audit);
    expect(fetchJsonMock).toHaveBeenCalledWith("/data/eps_daily_report_audit.json");
  });

  function setup() {
    fetchJsonMock.mockImplementation(async (path) => defaultPayload(path));
  }

  it("loads only PDM list dependencies, preserving energisation and readiness inputs", async () => {
    fetchJsonMock.mockImplementation(async (path) => path === "/data/pdms.json"
      ? { records: [{ pdm_name: "PDM-A", energised_offsite: true, energised_onsite: null }] }
      : defaultPayload(path));
    const { result } = renderHook(() => useDashboardData("/pdms"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pdms[0]).toMatchObject({ energised_offsite: true, energised_onsite: null });
    expect(result.current.epsPdmExecution).toHaveLength(1);
    expect(fetchJsonMock.mock.calls.map(([path]) => path).sort()).toEqual([
      "/data/etl_run_metadata.json", "/data/pdms.json", "/data/eps_pdm_execution.json",
    ].sort());
  });

  it("starts Equipment data before a slow PDM request finishes", async () => {
    let release!: (value: unknown) => void;
    fetchJsonMock.mockImplementation((path) => path === "/data/pdms.json"
      ? new Promise((resolve) => { release = resolve; }) : Promise.resolve(defaultPayload(path)));
    const { result } = renderHook(() => useDashboardData("/equipment"));
    await waitFor(() => expect(fetchJsonMock).toHaveBeenCalledWith("/data/equipment.json"));
    expect(fetchJsonMock).toHaveBeenCalledWith("/data/eps_test_items.json");
    expect(result.current.loading).toBe(true);
    await act(async () => release(defaultPayload("/data/pdms.json")));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.equipment).toHaveLength(1);
    expect(result.current.epsTestItems).toHaveLength(1);
    expect(fetchJsonMock).not.toHaveBeenCalledWith("/data/data_quality_report.json");
    expect(fetchJsonMock).not.toHaveBeenCalledWith("/data/eps_test_summary.json");
  });

  it("keeps Layout independent even when metadata never completes", async () => {
    fetchJsonMock.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useDashboardData("/layout"));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(fetchJsonMock.mock.calls.map(([path]) => path)).toEqual(["/data/etl_run_metadata.json"]));
  });

  it("waits for all Power Plan status inputs without fetching unrelated datasets", async () => {
    setup();
    const { result } = renderHook(() => useDashboardData("/power-plan"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchJsonMock.mock.calls.map(([path]) => path).sort()).toEqual([
      "/data/etl_run_metadata.json", "/data/pdms.json", "/data/equipment.json", "/data/cases.json",
      "/data/eps_module_execution.json", "/data/eps_test_items.json",
    ].sort());
  });

  it("loads details once on demand and keeps the PDM list available", async () => {
    setup();
    const { result } = renderHook(() => useDashboardData("/pdms"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await Promise.all([
        result.current.loadResources(["epsTestItems", "epsModuleExecution"]),
        result.current.loadResources(["epsTestItems"]),
      ]);
    });
    expect(result.current.epsTestItems).toHaveLength(1);
    expect(fetchJsonMock.mock.calls.filter(([path]) => path === "/data/eps_test_items.json")).toHaveLength(1);
    expect(result.current.loading).toBe(false);
  });

  it("reuses loaded data on route changes and loads KPR context only for a drill-down", async () => {
    setup();
    const { result, rerender } = renderHook(({ path, search }) => useDashboardData(path, search), {
      initialProps: { path: "/pdms", search: "" },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ path: "/equipment", search: "" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchJsonMock.mock.calls.filter(([path]) => path === "/data/pdms.json")).toHaveLength(1);
    expect(fetchJsonMock).not.toHaveBeenCalledWith("/data/kpr_summary.json");
    rerender({ path: "/equipment", search: "?lifecycleStage=neta" });
    await waitFor(() => expect(fetchJsonMock).toHaveBeenCalledWith("/data/kpr_summary.json"));
  });

  it("handles optional missing exports and offers reload for missing required files", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchJsonMock.mockImplementation(async (path) => path === "/data/eps_pdm_execution.json"
      ? null : path === "/data/pdms.json" ? null : defaultPayload(path));
    const { result } = renderHook(() => useDashboardData("/pdms"));
    await waitFor(() => expect(result.current.error).toBe("Dashboard data could not be loaded."));
    setup();
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.pdms).toHaveLength(1);
  });

  it("ignores late responses from before ETL reload and refreshes deferred data too", async () => {
    setup();
    const { result } = renderHook(() => useDashboardData("/pdms"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let release!: (value: unknown) => void;
    fetchJsonMock.mockImplementation((path) => path === "/data/eps_test_items.json"
      ? new Promise((resolve) => { release = resolve; }) : Promise.resolve(defaultPayload(path)));
    let oldRequest!: Promise<void>;
    await act(async () => {
      oldRequest = result.current.loadResources(["epsTestItems"]);
      await Promise.resolve();
    });
    setup();
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.loadResources(["epsTestItems"]); });
    await act(async () => { release({ records: [{ equipment_name: "STALE" }] }); await oldRequest; });
    expect(result.current.epsTestItems).toEqual([{ equipment_name: "EQ-1" }]);
    expect(fetchJsonMock.mock.calls.filter(([path]) => path === "/data/pdms.json")).toHaveLength(2);
    expect(fetchJsonMock.mock.calls.filter(([path]) => path === "/data/eps_test_items.json")).toHaveLength(2);
  });

  it("loads Data Quality only when visiting it", async () => {
    setup();
    const { result } = renderHook(() => useDashboardData("/data-quality"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dataQualityReport).toEqual({ unmatched_cases: [] });
    expect(fetchJsonMock).not.toHaveBeenCalledWith("/data/equipment.json");
  });
});
