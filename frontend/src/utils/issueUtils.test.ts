import { describe, expect, it } from "vitest";

import type { EnrichedIssue } from "./issueUtils";
import {
  getAssignedToNames,
  getInferredIssueType,
  getIssueImageReferences,
  getIssueNetaStatus,
  hasCtReference,
  isClosedStatus,
  issueHasAnyAssignee,
} from "./issueUtils";

function issue(overrides: Partial<EnrichedIssue> = {}): EnrichedIssue {
  return {
    row_id: "CASE-1-EQ-1",
    case_id: "CASE-1",
    status: "Open",
    priority: "High",
    summary: null,
    equipment_id: "EQ-1",
    system_element_raw: "EQ-1",
    assigned_to: null,
    reported_on: null,
    due_date: null,
    created_at: null,
    last_updated_at: null,
    issue_image: null,
    corrective_images: null,
    has_issue_image: false,
    has_corrective_images: false,
    due_state: "No Due Date",
    pdm_name: "PDM-1",
    equipment_type: null,
    equipment_status: null,
    manufacturer: null,
    model: null,
    serial_number: null,
    neta_complete: null,
    neta_completed_at: null,
    neta_test_report: null,
    neta_report_status: null,
    ...overrides,
  };
}

describe("issueUtils", () => {
  it("recognizes CT and CTS references without matching unrelated words", () => {
    expect(hasCtReference("PRIMARY SIDE CTS- A AND C PHASE")).toBe(true);
    expect(getInferredIssueType({ summary: "Type: CTS\nRatio failed" })).toBe(
      "CT",
    );
    expect(hasCtReference("Contact inspection complete")).toBe(false);
  });

  it("preserves explicit non-CT issue types", () => {
    expect(
      getInferredIssueType({ summary: "Type: Breaker\nPrimary injection failed" }),
    ).toBe("Breaker");
  });

  it("splits assignees only on commas outside role parentheses", () => {
    const names = getAssignedToNames(
      "James Sartoris (PM/PL), Zhimin Qin (Cx, ENG), Yucheng Ko (QC)",
    );
    expect(names).toEqual([
      "James Sartoris (PM/PL)",
      "Zhimin Qin (Cx, ENG)",
      "Yucheng Ko (QC)",
    ]);
    expect(
      issueHasAnyAssignee(
        issue({ assigned_to: names.join(",") }),
        ["Zhimin Qin (Cx, ENG)"],
      ),
    ).toBe(true);
  });

  it("treats resolved variants as closed", () => {
    expect(isClosedStatus("Resolved")).toBe(true);
    expect(isClosedStatus("Completed")).toBe(true);
    expect(isClosedStatus("Acknowledged")).toBe(false);
  });

  it("classifies NETA report readiness", () => {
    expect(
      getIssueNetaStatus(
        issue({ neta_complete: true, neta_test_report: "report.pdf" }),
      ),
    ).toBe("Complete + Report");
    expect(
      getIssueNetaStatus(issue({ neta_complete: true, neta_test_report: null })),
    ).toBe("Complete - Missing Report");
    expect(
      getIssueNetaStatus(
        issue({ equipment_id: "IAD06-INV6-H1-1 BATTERY 2", neta_complete: false }),
      ),
    ).toBe("Not Tracked");
    expect(
      getIssueNetaStatus(issue({ equipment_id: "IAD06-INV6-04R", neta_complete: false })),
    ).toBe("Not Tracked");
    expect(
      getIssueNetaStatus(issue({ equipment_id: "IAD06-TX-INV6-03R", neta_complete: false })),
    ).toBe("Incomplete");
  });

  it("splits attachment references while preserving file names", () => {
    expect(getIssueImageReferences("a.jpg; b.pdf\nc.png")).toEqual([
      "a.jpg",
      "b.pdf",
      "c.png",
    ]);
  });
});
