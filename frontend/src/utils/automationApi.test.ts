import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AutomationApiError,
  getAutomationHealth,
  getDailyReport,
  getMvEquipmentComments,
  getMvDailyReport,
  getRunLogs,
  runAutomationJob,
  addMvEquipmentComment,
  deleteMvEquipmentComment,
  saveDailyReport,
  saveMvDailyReport,
} from "./automationApi";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("automationApi", () => {
  it("uses the local API and encodes path parameters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await getAutomationHealth();
    await getRunLogs("run id", 12);
    await getDailyReport("7-30.md");
    await getMvDailyReport("7-30.md");
    await getMvEquipmentComments();
    await deleteMvEquipmentComment("comment id");

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8765/api/automation/health");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://127.0.0.1:8765/api/automation/runs/run%20id/logs?after=12",
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      "http://127.0.0.1:8765/api/automation/daily-reports/7-30.md",
    );
    expect(fetchMock.mock.calls[3][0]).toBe(
      "http://127.0.0.1:8765/api/automation/mv-daily-reports/7-30.md",
    );
    expect(fetchMock.mock.calls[4][0]).toBe(
      "http://127.0.0.1:8765/api/automation/mv-equipment-comments",
    );
    expect(fetchMock.mock.calls[5][0]).toBe(
      "http://127.0.0.1:8765/api/automation/mv-equipment-comments/comment%20id",
    );
    expect(fetchMock.mock.calls[5][1]).toMatchObject({ method: "DELETE" });
  });

  it("sends JSON job and daily-report payloads", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ run_id: "run-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await runAutomationJob("dashboard etl", { force: true }, true);
    await saveDailyReport("7-30.md", {
      failed: "A",
      retested_and_passed: "B",
      tested: "C",
      overwrite: false,
    });
    await saveMvDailyReport("7-30.md", {
      tested_and_passed: "MV-A",
      partially_tested: "MV-B",
      failed: "MV-C",
      retested_and_passed: "MV-D",
      overwrite: false,
    });
    await addMvEquipmentComment({ annotation_id: "equipment-1", text: "Check relay." });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ options: { force: true }, confirmed: true }),
    });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      body: JSON.stringify({
        failed: "A",
        retested_and_passed: "B",
        tested: "C",
        overwrite: false,
      }),
    });
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      method: "PUT",
      body: JSON.stringify({
        tested_and_passed: "MV-A",
        partially_tested: "MV-B",
        failed: "MV-C",
        retested_and_passed: "MV-D",
        overwrite: false,
      }),
    });
    expect(fetchMock.mock.calls[3][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ annotation_id: "equipment-1", text: "Check relay." }),
    });
  });

  it("surfaces JSON and fallback HTTP errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Task service is busy." }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(getAutomationHealth()).rejects.toEqual(
      expect.objectContaining<Partial<AutomationApiError>>({
        name: "AutomationApiError",
        message: "Task service is busy.",
        status: 409,
      }),
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not json", { status: 500 }),
    );
    await expect(getAutomationHealth()).rejects.toThrow(
      "Automation request failed (500).",
    );
  });
});
