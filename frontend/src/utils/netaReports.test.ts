import { describe, expect, it } from "vitest";

import type { NetaReportManifest } from "../types/data";
import {
  getNetaReportCount,
  getNetaReportLinks,
  getNetaReportNames,
  hasGcNetaReportLinks,
  sortNetaReportNames,
} from "./netaReports";

const manifest: NetaReportManifest = {
  records: [
    {
      source_key: "gc",
      source_label: "GC",
      report_name: "IAD06-TX-PDU6-01A-1.pdf",
      source_report_name: "IAD06-PDU6-01A-1 - NETA Test Report-01.pdf",
      url: "/reports/gc.pdf",
    },
    {
      source_key: "downloaded",
      source_label: "Original",
      report_name: "IAD06-PDU6-01A-1 - NETA Test Report-01.pdf",
      url: "/reports/original.pdf",
    },
    {
      source_key: "downloaded",
      source_label: "Original",
      report_name: "IAD06-PDU6-01A-1 - NETA Test Report-01.pdf",
      url: "/reports/original.pdf",
    },
  ],
};

describe("netaReports", () => {
  it("sorts report numbers naturally", () => {
    expect(
      sortNetaReportNames([
        "NETA Test Report-10.pdf",
        "NETA Test Report-2.pdf",
        "NETA Test Report-1.pdf",
      ]),
    ).toEqual([
      "NETA Test Report-1.pdf",
      "NETA Test Report-2.pdf",
      "NETA Test Report-10.pdf",
    ]);
  });

  it("parses semicolon and multiline report fields", () => {
    const value = "Report-10.pdf; Report-2.pdf\nReport-1.pdf";
    expect(getNetaReportNames(value)).toEqual([
      "Report-1.pdf",
      "Report-2.pdf",
      "Report-10.pdf",
    ]);
    expect(getNetaReportCount(value)).toBe(3);
    expect(getNetaReportNames(null)).toEqual([]);
  });

  it("returns original before GC links and removes duplicate URLs", () => {
    const links = getNetaReportLinks(
      "IAD06-PDU6-01A-1 - NETA Test Report-01.pdf",
      manifest,
    );

    expect(links).toEqual([
      {
        sourceKey: "downloaded",
        sourceLabel: "Original",
        url: "/reports/original.pdf",
        fileName: "IAD06-PDU6-01A-1 - NETA Test Report-01.pdf",
      },
      {
        sourceKey: "gc",
        sourceLabel: "GC",
        url: "/reports/gc.pdf",
        fileName: "IAD06-TX-PDU6-01A-1.pdf",
      },
    ]);
    expect(hasGcNetaReportLinks(["IAD06-PDU6-01A-1 - NETA Test Report-01.pdf"], manifest)).toBe(
      true,
    );
    expect(getNetaReportLinks("missing.pdf", manifest)).toEqual([]);
  });
});
