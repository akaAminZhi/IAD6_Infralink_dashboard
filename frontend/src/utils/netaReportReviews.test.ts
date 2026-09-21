import { describe, expect, it } from "vitest";

import type { NetaReportReviewsResponse } from "../types/automation";
import type { NetaReportManifest } from "../types/data";
import {
  getEquipmentNetaReviewState,
  getNetaReviewsForReport,
} from "./netaReportReviews";

const reviews: NetaReportReviewsResponse = {
  total_reports: 2,
  summary: { PASSED: 0, FAILED: 1, REVIEW_REQUIRED: 1, ERROR: 0 },
  reports: [
    {
      file: "IAD06-EQ-1/IAD06-EQ-1.pdf",
      status: "FAILED",
      is_passed: false,
    },
    {
      file: "IAD06-EQ-2/IAD06-EQ-2.pdf",
      status: "REVIEW_REQUIRED",
      is_passed: null,
    },
  ],
};

const manifest: NetaReportManifest = {
  records: [
    {
      source_key: "gc",
      report_name: "IAD06-EQ-1.pdf",
      source_report_name: "IAD06-EQ-1 - NETA Test Report-01.pdf",
      relative_path: "IAD06-EQ-1/IAD06-EQ-1.pdf",
    },
    {
      source_key: "gc",
      report_name: "IAD06-EQ-2.pdf",
      source_report_name: "IAD06-EQ-2 - NETA Test Report-01.pdf",
      relative_path: "IAD06-EQ-2/IAD06-EQ-2.pdf",
    },
  ],
};

describe("netaReportReviews", () => {
  it("rebuilds review indexes when a saved result replaces the response", () => {
    const name = "IAD06-EQ-1 - NETA Test Report-01.pdf";
    expect(getEquipmentNetaReviewState(name, reviews, manifest)).toBe("failed");
    const updated: NetaReportReviewsResponse = {
      ...reviews,
      reports: reviews.reports.map((report) => ({ ...report, status: "PASSED", is_passed: true })),
    };
    expect(getEquipmentNetaReviewState(name, updated, manifest)).toBe("passed");
    expect(getEquipmentNetaReviewState(name, reviews, manifest)).toBe("failed");
  });
  it("matches original report names to GC review result paths", () => {
    expect(
      getNetaReviewsForReport(
        "IAD06-EQ-1 - NETA Test Report-01.pdf",
        reviews,
        manifest,
      ),
    ).toEqual([reviews.reports[0]]);
  });

  it("prioritizes failed over review-required and passed states", () => {
    expect(
      getEquipmentNetaReviewState(
        "IAD06-EQ-1 - NETA Test Report-01.pdf; IAD06-EQ-2 - NETA Test Report-01.pdf",
        reviews,
        manifest,
      ),
    ).toBe("failed");
    expect(
      getEquipmentNetaReviewState(
        "IAD06-EQ-2 - NETA Test Report-01.pdf",
        reviews,
        manifest,
      ),
    ).toBe("review_required");
  });
});
