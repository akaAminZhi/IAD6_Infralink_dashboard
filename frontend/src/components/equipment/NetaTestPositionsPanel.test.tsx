import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { NetaPositionEquipment } from "../../types/netaPositions";
import { NetaTestPositionsPanel } from "./NetaTestPositionsPanel";

const entry: NetaPositionEquipment = {
  equipment_id: "IAD06-MDS6-01D", family: "MDS6|A-F", equipment_type: null, neta_complete: true,
  baseline_basis: "draft", report_stage: "formal", report_count: 2, nonconforming: true,
  complete_but_nonconforming: true, issue_counts: { missing: 1, failed_only: 1 },
  positions: [
    { key: "CDS-PRI", result: "failed_only", notes: [], reports: ["EQ/CDS-PRI.pdf"] },
    { key: "CDS-SEC", result: "missing", notes: [], reports: [] },
    { key: "MCB2-PRI", result: "pass", notes: ["superseded_fail"], reports: ["EQ/MCB2.pdf"] },
    { key: "PQM1-CT01-A", result: "result_pending", notes: ["needs_review"], reports: ["EQ/CT01-A.pdf"] },
  ],
  extra_reports: [], needs_review_reports: [],
  reports: [
    { equipment_id: "IAD06-MDS6-01D", file: "EQ/CDS-PRI.pdf", url: "/r/cds.pdf", report_stage: "formal", status: "FAILED",
      key: "CDS-PRI", confidence: "exact", form: "report", source_report_name: null, flags: ["gc_name_mismatch"],
      referenced_equipment: null, name_source: "pdf_asset", gc_name_key: "CDS-PRI", test_date: null,
      suggested_gc_name: "MDS6-01D-CDS-PRI(FAILED).pdf" },
  ],
  exception_note: null,
};

describe("NetaTestPositionsPanel", () => {
  it("lists baseline positions with results, report links and rename hints", () => {
    render(<MemoryRouter><NetaTestPositionsPanel entry={entry} /></MemoryRouter>);
    expect(screen.getByText(/NETA complete, but the reports do not match/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CDS-PRI" })).toHaveAttribute("href", "/r/cds.pdf");
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText("FAIL superseded by retest")).toBeInTheDocument();
    expect(screen.getByText("Pending review").closest("li")).toHaveTextContent("PQM1-CT01-A");
    expect(screen.queryByText("Unrecognized name")).not.toBeInTheDocument();
    expect(screen.getByText("MDS6-01D-CDS-PRI(FAILED).pdf")).toBeInTheDocument();
  });

  it("renders nothing without an entry", () => {
    const { container } = render(<MemoryRouter><NetaTestPositionsPanel entry={null} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});
