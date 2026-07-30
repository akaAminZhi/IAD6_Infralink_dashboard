import { afterEach, describe, expect, it, vi } from "vitest";

import type { EnrichedIssue } from "./issueUtils";
import { downloadIssuesXlsx } from "./exportIssues";

function issue(overrides: Partial<EnrichedIssue> = {}): EnrichedIssue {
  return {
    row_id: "CASE-1-EQ-1",
    case_id: "IAD06-CASE-1",
    status: "Resolved",
    priority: "High",
    summary: "CT ratio out of tolerance",
    equipment_id: "IAD06-PDU6-01A-1",
    system_element_raw: "IAD06-PDU6-01A-1",
    assigned_to: "Engineer One",
    reported_on: "2026-07-01T08:00:00",
    due_date: "2026-07-10T00:00:00",
    created_at: "2026-07-01T08:00:00",
    last_updated_at: "2026-07-09T12:00:00",
    issue_image: "Issue-01.jpg",
    corrective_images: null,
    has_issue_image: true,
    has_corrective_images: false,
    due_state: "Closed",
    pdm_name: "IAD06-PDM-E6-110-01",
    equipment_type: "PDU",
    equipment_status: "Conditional Yellow Tag",
    manufacturer: "IEM",
    model: "MODEL-1",
    serial_number: "SERIAL-1",
    neta_complete: true,
    neta_completed_at: "2026-07-08T10:00:00",
    neta_test_report: "Report-01.pdf",
    neta_report_status: "report_available",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloadIssuesXlsx", () => {
  it("creates a styled workbook with the expected issue columns", async () => {
    let capturedBlob: Blob | undefined;
    let downloadedName = "";
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return "blob:issues";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      downloadedName = this.download;
    });

    await downloadIssuesXlsx([issue()]);

    expect(downloadedName).toMatch(/^iad6-issues-.*\.xlsx$/);
    expect(capturedBlob).not.toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:issues");

    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const blob = capturedBlob;
    if (!blob) {
      throw new Error("Expected the workbook download Blob.");
    }
    const buffer = await blob.arrayBuffer();
    await workbook.xlsx.load(buffer);
    const issuesSheet = workbook.getWorksheet("Issues");
    const summarySheet = workbook.getWorksheet("Summary");

    expect(issuesSheet).toBeDefined();
    expect(summarySheet).toBeDefined();
    expect(issuesSheet?.getCell(4, 1).value).toBe("Case ID");
    expect(issuesSheet?.getRow(4).values).not.toContain("Due State");
    expect(issuesSheet?.getRow(4).values).not.toContain("Equipment Type");
    expect(issuesSheet?.getCell(5, 1).value).toBe("IAD06-CASE-1");
    expect(issuesSheet?.getCell(5, 12).value).toBe("Missing Corrective Images");
  }, 20_000);
});
