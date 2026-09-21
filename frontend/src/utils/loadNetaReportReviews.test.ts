import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNetaReportReviewCache } from "./automationApi";
import { clearPublishedNetaReviewCache, loadNetaReportReviews } from "./loadNetaReportReviews";

const snapshot = {
  available: true,
  reports: [{ file: "EQ/report.pdf", status: "FAILED", evidence: ["Bad reading"] }],
  summary: { FAILED: 1 }, total_reports: 1,
};

afterEach(() => {
  clearPublishedNetaReviewCache();
  clearNetaReportReviewCache();
  vi.restoreAllMocks();
});

describe("published NETA reviews", () => {
  it("uses only same-origin data remotely, deduplicates and caches until expiry", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify(snapshot)),
    );
    const [first, second] = await Promise.all([
      loadNetaReportReviews("dashboard.example"), loadNetaReportReviews("dashboard.example"),
    ]);
    expect(first.editable).toBe(false);
    expect(first.data).toBe(second.data);
    expect(first.data.reports[0].evidence).toEqual(["Bad reading"]);
    await loadNetaReportReviews("dashboard.example");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/data/neta_report_reviews.json", { cache: "no-cache" });
    clock.mockReturnValue(301001);
    await loadNetaReportReviews("dashboard.example");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to read-only published results when the local service is offline", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify(snapshot)));
    expect((await loadNetaReportReviews("localhost")).editable).toBe(false);
  });

  it("keeps successful local service results editable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(snapshot)));
    expect((await loadNetaReportReviews("127.0.0.1")).editable).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache missing snapshots as zero exceptions", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...snapshot, available: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify(snapshot)));
    await expect(loadNetaReportReviews("remote")).rejects.toThrow("unavailable");
    expect((await loadNetaReportReviews("remote")).data.total_reports).toBe(1);
  });
});
