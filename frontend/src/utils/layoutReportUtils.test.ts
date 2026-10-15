import { describe, expect, it } from "vitest";
import type { NetaReportManifest } from "../types/data";
import { getLayoutCableReportNames } from "./layoutReportUtils";

describe("Layout cable PDF matching", () => {
  it("finds exact cable IDs in GC filenames without assigning neighboring or single-ended files", () => {
    const manifest: NetaReportManifest = { records: [
      { report_name: "FDR-IAD06-TX-UPP6-06A-IAD06-UPP6-06A.pdf", url: "/neta-reports-gc/a.pdf" },
      { report_name: "FDR-IAD06-TX-UPP6-06A-IAD06-UPP6-06A-1.pdf", url: "/neta-reports-gc/b.pdf" },
      { report_name: "FDR-IAD06-TX-UPP6-06A.pdf", url: "/neta-reports-gc/c.pdf" },
      { report_name: "FDR-IAD06-TX-UPP6-06A-IAD06-UPP6-06A.pdf", url: null },
    ] };
    expect(getLayoutCableReportNames({ cable_id: "FDR-IAD06-TX-UPP6-06A-IAD06-UPP6-06A", neta_test_report: null }, manifest))
      .toEqual(["FDR-IAD06-TX-UPP6-06A-IAD06-UPP6-06A.pdf"]);
  });

  it("keeps explicitly listed cable reports even when the local PDF is missing", () => {
    expect(getLayoutCableReportNames({ cable_id: "FDR-A-B", neta_test_report: "Report-2.pdf; Report-1.pdf" }, null))
      .toEqual(["Report-1.pdf", "Report-2.pdf"]);
  });

  it("shows a linked ATP PDF once and keeps the GC fallback when ATP is missing", () => {
    const report = "FDR-A-B.pdf";
    const manifest: NetaReportManifest = { records: [
      { report_name: report, url: "/neta-reports-gc/FDR-A-B.pdf", source_key: "gc" },
    ] };
    const cable = { cable_id: "FDR-A-B", neta_test_report: report };
    expect(getLayoutCableReportNames({ ...cable, feeder_cable_atp_files: [
      { file_name: report, relative_path: `FDR-A-B/${report}`, url: "/feeder-cable-atp/FDR-A-B.pdf" },
    ] }, manifest)).toEqual([]);
    expect(getLayoutCableReportNames(cable, manifest)).toEqual([report]);
  });
});
