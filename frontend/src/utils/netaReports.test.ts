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
        reportStage: "formal",
      },
      {
        sourceKey: "gc",
        sourceLabel: "GC",
        url: "/reports/gc.pdf",
        fileName: "IAD06-TX-PDU6-01A-1.pdf",
        reportStage: "formal",
      },
    ]);
    expect(hasGcNetaReportLinks(["IAD06-PDU6-01A-1 - NETA Test Report-01.pdf"], manifest)).toBe(
      true,
    );
    expect(getNetaReportLinks("missing.pdf", manifest)).toEqual([]);
  });

  it("scopes identical names to equipment and prefers formal links per source", () => {
    const data: NetaReportManifest = { records: [
      { equipment_id: "EQ-1", source_key: "downloaded", report_name: "report.pdf", report_stage: "temporary", url: "/temp/eq1.pdf" },
      { equipment_id: "EQ-2", source_key: "downloaded", report_name: "report.pdf", url: "/formal/eq2.pdf" },
      { equipment_id: "EQ-1", source_key: "gc", source_report_name: "report.pdf", report_name: "GC.pdf", report_stage: "temporary", url: "/temp/gc.pdf" },
    ] };
    expect(getNetaReportLinks("report.pdf", data, "eq-1").map((link) => link.url)).toEqual(["/temp/eq1.pdf", "/temp/gc.pdf"]);
    expect(getNetaReportLinks("report.pdf", data)).toEqual([]);
    data.records!.push({ equipment_id: "EQ-1", source_key: "downloaded", report_name: "report.pdf", report_stage: "formal", url: "/formal/eq1.pdf" });
    expect(getNetaReportLinks("report.pdf", data, "EQ-1").map((link) => link.url)).toEqual(["/formal/eq1.pdf", "/temp/gc.pdf"]);
    expect(getNetaReportLinks("report.pdf", data, "EQ-3")).toEqual([]);
    expect(hasGcNetaReportLinks(["report.pdf"], data, "EQ-2")).toBe(false);
  });

  it("retains old unscoped manifests and explicitly named shared cable PDFs", () => {
    expect(getNetaReportLinks("IAD06-PDU6-01A-1 - NETA Test Report-01.pdf", manifest, "EQ-1")).toHaveLength(2);
    const data: NetaReportManifest = { records: [
      { equipment_id: "ENDPOINT-1", source_key: "gc", source_report_name: "FDR-EQ1-EQ2.pdf", report_name: "Cable.pdf", url: "/gc/cable.pdf" },
    ] };
    expect(getNetaReportLinks("FDR-EQ1-EQ2.pdf", data, "FDR-EQ1-EQ2")[0]?.url).toBe("/gc/cable.pdf");
    expect(getNetaReportLinks("FDR-EQ1-EQ2.pdf", data, "EQ-2")).toEqual([]);
  });
});
