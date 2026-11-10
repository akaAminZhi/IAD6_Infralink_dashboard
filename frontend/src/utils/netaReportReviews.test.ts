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
  const sharedName = "TAG IAD06-UTILITY6-01-WAY3-RLY2.pdf";
  const utilityReviews: NetaReportReviewsResponse = {
    total_reports: 2,
    summary: { PASSED: 1, FAILED: 1, REVIEW_REQUIRED: 0, ERROR: 0 },
    reports: [
      { file: `_temporary/IAD06-UTILITY6-01/${sharedName}`, status: "FAILED", is_passed: false },
      { file: `_temporary/IAD06-UTILITY6-02/${sharedName}`, status: "PASSED", is_passed: true },
    ],
  };
  const utilityManifest: NetaReportManifest = {
    records: ["01", "02"].map((suffix) => ({
      source_key: "gc",
      equipment_id: `IAD06-UTILITY6-${suffix}`,
      report_name: sharedName,
      source_report_name: `IAD06-UTILITY6-${suffix} - NETA Test Report-28.pdf`,
      relative_path: `_temporary/IAD06-UTILITY6-${suffix}/${sharedName}`,
    })),
  };

  it("isolates editable results and equipment state when different owners have the same GC filename", () => {
    const name = "IAD06-UTILITY6-02 - NETA Test Report-28.pdf";
    expect(getNetaReviewsForReport(name, utilityReviews, utilityManifest, "IAD06-UTILITY6-02"))
      .toEqual([utilityReviews.reports[1]]);
    expect(getEquipmentNetaReviewState(name, utilityReviews, utilityManifest, "IAD06-UTILITY6-02"))
      .toBe("passed");
    expect(getNetaReviewsForReport(sharedName, utilityReviews, utilityManifest, "IAD06-UTILITY6-01"))
      .toEqual([utilityReviews.reports[0]]);
    expect(getNetaReviewsForReport(sharedName, utilityReviews, utilityManifest)).toEqual([]);
  });

  it("does not substitute another equipment's review when the correct full path is missing", () => {
    const missing: NetaReportReviewsResponse = { ...utilityReviews, reports: [utilityReviews.reports[0]] };
    expect(getNetaReviewsForReport("IAD06-UTILITY6-02 - NETA Test Report-28.pdf", missing, utilityManifest))
      .toEqual([]);
  });

  it("uses exact paths and rejects ambiguous basenames without a manifest", () => {
    expect(getNetaReviewsForReport(utilityReviews.reports[1].file, utilityReviews, null))
      .toEqual([utilityReviews.reports[1]]);
    expect(getNetaReviewsForReport(sharedName, utilityReviews, null)).toEqual([]);
    expect(getNetaReviewsForReport(reviews.reports[0].file.split("/").pop()!, reviews, null))
      .toEqual([reviews.reports[0]]);
  });

  it("keeps unambiguous legacy flat reviews and explicitly shared cable ownership", () => {
    const flat: NetaReportReviewsResponse = {
      ...reviews, reports: [{ ...reviews.reports[0], file: "IAD06-EQ-1.pdf" }],
    };
    expect(getNetaReviewsForReport("IAD06-EQ-1 - NETA Test Report-01.pdf", flat, manifest))
      .toEqual(flat.reports);
    const cableManifest: NetaReportManifest = { records: [{
      equipment_id: "IAD06-ENDPOINT", source_report_name: "IAD06-CABLE-1.pdf",
      report_name: "Cable.pdf", relative_path: "IAD06-ENDPOINT/Cable.pdf",
    }] };
    const cableReviews: NetaReportReviewsResponse = {
      ...reviews, reports: [{ ...reviews.reports[0], file: "IAD06-ENDPOINT/Cable.pdf" }],
    };
    expect(getNetaReviewsForReport("IAD06-CABLE-1.pdf", cableReviews, cableManifest, "IAD06-CABLE-1"))
      .toEqual(cableReviews.reports);
  });

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
