import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchJson } from "../utils/dataLoaders";
import { useDashboardData } from "./useDashboardData";

vi.mock("../utils/dataLoaders", () => ({
  fetchJson: vi.fn(),
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

describe("useDashboardData", () => {
  it("loads the core and optional overview datasets", async () => {
    fetchJsonMock.mockImplementation(async (path) => defaultPayload(path));

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.pdms).toEqual([{ pdm_name: "PDM-A", equipment: [] }]);
    expect(result.current.summary?.total_pdms).toBe(1);
    expect(result.current.epsTestItems).toEqual([{ equipment_name: "EQ-1" }]);
    expect(result.current.detailDataLoaded).toBe(false);
  });

  it("keeps the dashboard available when an optional dataset fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchJsonMock.mockImplementation(async (path) => {
      if (path === "/data/power_plan.json") {
        throw new Error("optional file missing");
      }
      return defaultPayload(path);
    });

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.powerPlanManifest).toBeNull();
    expect(result.current.pdms).toHaveLength(1);
  });

  it("reports a core dataset failure and resets data", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchJsonMock.mockImplementation(async (path) => {
      if (path === "/data/pdms.json") {
        throw new Error("pdms missing");
      }
      return defaultPayload(path);
    });

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Dashboard data could not be loaded.");
    expect(result.current.pdms).toEqual([]);
  });

  it("loads detail data on demand and ignores duplicate requests", async () => {
    let releaseEquipment: (() => void) | undefined;
    const equipmentGate = new Promise<void>((resolve) => {
      releaseEquipment = resolve;
    });
    fetchJsonMock.mockImplementation(async (path) => {
      if (path === "/data/equipment.json") {
        await equipmentGate;
      }
      return defaultPayload(path);
    });

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let firstLoad: Promise<void>;
    await act(async () => {
      firstLoad = result.current.loadDetailData();
      await Promise.resolve();
    });
    expect(result.current.detailDataLoading).toBe(true);

    await act(async () => {
      await result.current.loadDetailData();
    });
    expect(
      fetchJsonMock.mock.calls.filter(([path]) => path === "/data/equipment.json"),
    ).toHaveLength(1);

    releaseEquipment?.();
    await act(async () => {
      await firstLoad!;
    });
    expect(result.current.detailDataLoaded).toBe(true);
    expect(result.current.equipment).toEqual([{ equipment_id: "IAD06-EQ-1" }]);
    expect(result.current.cases).toEqual([{ case_id: "CASE-1" }]);
  });

  it("reports detail loading failures and reloads the overview", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchJsonMock.mockImplementation(async (path) => {
      if (path === "/data/equipment.json") {
        throw new Error("equipment unavailable");
      }
      return defaultPayload(path);
    });

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const initialPdmCalls = fetchJsonMock.mock.calls.filter(
      ([path]) => path === "/data/pdms.json",
    ).length;

    await act(async () => {
      await result.current.loadDetailData();
    });
    expect(result.current.detailDataError).toBe(
      "Equipment and issue detail data could not be loaded.",
    );

    act(() => result.current.reload());
    await waitFor(() => {
      const pdmCalls = fetchJsonMock.mock.calls.filter(
        ([path]) => path === "/data/pdms.json",
      ).length;
      expect(pdmCalls).toBe(initialPdmCalls + 1);
    });
  });
});
