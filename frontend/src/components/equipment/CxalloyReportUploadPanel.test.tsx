import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CxalloyReportFileStatus } from "../../types/data";
import { flattenEquipmentFromPdms } from "../../utils/equipmentUtils";
import { CxalloyReportUploadPanel } from "./CxalloyReportUploadPanel";

function equipment(reports?: CxalloyReportFileStatus[]) {
  return flattenEquipmentFromPdms([], [{ equipment_id: "IAD06-MDS6-01D", neta_complete: true }], [], [], {
    records: [{ equipment_id: "MDS6-01D", upload_status: "pending", reports }],
  })[0];
}

describe("CxalloyReportUploadPanel", () => {
  it("keeps equipment uploaded while displaying each downloaded cable's own status without totals", () => {
    const row = equipment([
      { report_name: "switchboard.pdf", report_kind: "equipment", upload_status: "uploaded" },
      { report_name: "uploaded-cable.pdf", report_kind: "cable", upload_status: "uploaded" },
      { report_name: "new-cable.pdf", report_kind: "cable", upload_status: "pending" },
    ]);
    const { container, rerender } = render(<CxalloyReportUploadPanel equipment={row} />);
    const deviceSection = screen.getByRole("region", { name: "Equipment Reports" });
    expect(within(deviceSection).getAllByText("Uploaded")).toHaveLength(2);
    expect(within(deviceSection).queryByText("Pending")).not.toBeInTheDocument();
    expect(deviceSection.querySelector("details")).not.toHaveAttribute("open");
    const cables = screen.getByRole("region", { name: "Cable Reports" });
    expect(within(cables).getByText("uploaded-cable.pdf").closest("li")).toHaveTextContent("Uploaded");
    expect(within(cables).getByText("new-cable.pdf").closest("li")).toHaveTextContent("Pending");
    expect(cables.querySelector("details")).toBeNull();
    expect(container).not.toHaveTextContent(/\d+\s*(files|\/)/);
    expect(within(cables).queryByText("switchboard.pdf")).not.toBeInTheDocument();

    rerender(<CxalloyReportUploadPanel equipment={equipment([
      ...row.cxalloy_reports!,
      { report_name: "later-cable.pdf", report_kind: "cable", upload_status: "pending" },
    ])} />);
    expect(within(screen.getByRole("region", { name: "Equipment Reports" })).queryByText("Pending")).not.toBeInTheDocument();
    expect(screen.getByText("later-cable.pdf").closest("li")).toHaveTextContent("Pending");
  });

  it("distinguishes missing PDFs and unverified history and retains the last upload error", () => {
    render(<CxalloyReportUploadPanel equipment={{ ...equipment([
      { report_name: "missing.pdf", report_kind: "equipment", upload_status: "missing_pdf" },
      { report_name: "changed-cable.pdf", report_kind: "cable", upload_status: "review_required" },
    ]), cxalloy_last_attempt_error: "Could not save attachment." }} />);
    expect(screen.getByText("missing.pdf").closest("li")).toHaveTextContent("Missing local PDF");
    expect(screen.getByText("changed-cable.pdf").closest("li")).toHaveTextContent("Review required");
    expect(screen.getByText(/Could not save attachment/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Equipment Reports" }).querySelector("details")).toHaveAttribute("open");
  });

  it("does not infer cable completion or equipment upload when there are no downloaded files", () => {
    render(<CxalloyReportUploadPanel equipment={equipment([])} />);
    expect(screen.getByText("No downloaded equipment reports.")).toBeInTheDocument();
    expect(screen.getByText("No downloaded cable reports.")).toBeInTheDocument();
    expect(screen.queryByText("Uploaded")).not.toBeInTheDocument();
  });

  it("requires refreshed data rather than guessing file categories from an old combined status", () => {
    render(<CxalloyReportUploadPanel equipment={equipment()} />);
    expect(screen.getByText(/Refresh report status data/)).toBeInTheDocument();
    expect(screen.queryByText("Uploaded")).not.toBeInTheDocument();
  });
});
