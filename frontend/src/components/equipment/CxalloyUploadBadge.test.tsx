import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CxalloyReportFileStatus, CxalloyReportUploadStatus } from "../../types/data";
import { flattenEquipmentFromPdms } from "../../utils/equipmentUtils";
import { CxalloyUploadBadge } from "./CxalloyUploadBadge";

function equipment(reports?: CxalloyReportFileStatus[], status: CxalloyReportUploadStatus = "pending") {
  return flattenEquipmentFromPdms([], [{ equipment_id: "IAD06-ATS6-01D-2" }], [], [], {
    records: [{ equipment_id: "ATS6-01D-2", upload_status: status, expected_report_count: 4, reports }],
  })[0];
}

describe("CxalloyUploadBadge", () => {
  it("counts uploaded files separately from the one remaining cable PDF", () => {
    render(<CxalloyUploadBadge equipment={equipment([
      { report_name: "equipment.pdf", report_kind: "equipment", upload_status: "uploaded" },
      { report_name: "cable-1.pdf", report_kind: "cable", upload_status: "uploaded" },
      { report_name: "cable-2.pdf", report_kind: "cable", upload_status: "uploaded" },
      { report_name: "cable-3.pdf", report_kind: "cable", upload_status: "pending" },
    ])} />);
    expect(screen.getByText("Uploaded · 3 files")).toBeInTheDocument();
    expect(screen.getByText("Pending · 1 file")).toBeInTheDocument();
    expect(screen.queryByText("Pending · 4 files")).not.toBeInTheDocument();
    expect(screen.getByTitle("Pending: 0 equipment reports, 1 cable reports")).toBeInTheDocument();
  });

  it("retains uploaded evidence alongside missing PDFs and reports requiring review", () => {
    render(<CxalloyUploadBadge equipment={equipment([
      { report_name: "equipment.pdf", report_kind: "equipment", upload_status: "uploaded" },
      { report_name: "changed.pdf", report_kind: "cable", upload_status: "review_required" },
      { report_name: "missing.pdf", report_kind: "cable", upload_status: "missing_pdf" },
    ], "missing_pdf")} />);
    expect(screen.getByText("Uploaded · 1 file")).toBeInTheDocument();
    expect(screen.getByText("Review required · 1 file")).toBeInTheDocument();
    expect(screen.getByText("Missing local PDF · 1 file")).toBeInTheDocument();
    expect(screen.queryByText(/Pending/)).not.toBeInTheDocument();
  });

  it("shows per-file successes even when the package status is pending", () => {
    render(<CxalloyUploadBadge equipment={equipment([
      { report_name: "equipment.pdf", report_kind: "equipment", upload_status: "uploaded" },
    ])} />);
    expect(screen.getByText("Uploaded · 1 file")).toBeInTheDocument();
    expect(screen.queryByText(/Pending/)).not.toBeInTheDocument();
  });

  it.each(["uploaded", "pending", "missing_pdf"] as const)("does not invent file counts for legacy %s data", (status) => {
    const { container } = render(<CxalloyUploadBadge equipment={equipment(undefined, status)} />);
    expect(container).toHaveTextContent(status === "uploaded" ? "Uploaded" : status === "pending" ? "Pending" : "Missing local PDF");
    expect(container).not.toHaveTextContent(/\d+\s*files/);
  });

  it("does not infer upload completion from an empty file list", () => {
    render(<CxalloyUploadBadge equipment={equipment([], "uploaded")} />);
    expect(screen.getByText("No report files")).toBeInTheDocument();
    expect(screen.queryByText(/Uploaded/)).not.toBeInTheDocument();
  });

  it("shows unavailable status when no CxAlloy record exists", () => {
    const row = flattenEquipmentFromPdms([], [{ equipment_id: "IAD06-ATS6-01D-2" }])[0];
    render(<CxalloyUploadBadge equipment={row} />);
    expect(screen.getByText("--")).toBeInTheDocument();
  });
});
