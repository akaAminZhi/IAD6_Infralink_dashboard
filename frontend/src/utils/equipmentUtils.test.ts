import { describe, expect, it } from "vitest";

import type { CaseIssue, PdmRecord } from "../types/data";
import {
  flattenEquipmentFromPdms,
  getEquipmentAttentionReasons,
  getEquipmentSummaryMetrics,
  getNetaDisplayStatus,
  getOpenCaseCount,
  groupEquipmentById,
  hasPendingCxalloyReport,
  type FlattenedEquipmentRow,
} from "./equipmentUtils";

function row(overrides: Partial<FlattenedEquipmentRow> = {}): FlattenedEquipmentRow {
  return {
    row_id: "EQ-1-PDM-A",
    pdm_name: "PDM-A",
    module_type: null,
    equipment_id: "IAD06-EQ-1",
    source_equipment_label: "EQ-1",
    display_equipment_id: "IAD06-EQ-1",
    equipment_type: "PDU",
    status: "Conditional Yellow Tag",
    parent: "PDM-A",
    system: null,
    manufacturer: null,
    model: null,
    serial_number: null,
    open_issues_count_from_system_elements: 0,
    calculated_open_case_count: 0,
    neta_complete: false,
    neta_completed_at: null,
    neta_test_report: null,
    neta_report_status: null,
    cxalloy_upload_status: null,
    cxalloy_expected_report_count: 0,
    cxalloy_available_report_count: 0,
    cxalloy_report_names: [],
    cxalloy_missing_report_names: [],
    cxalloy_last_attempt_status: null,
    cxalloy_last_attempt_error: null,
    cxalloy_last_attempt_at: null,
    cases: [],
    eps_test_items: [],
    source: "pdms",
    ...overrides,
  };
}

describe("equipmentUtils", () => {
  it("flattens PDM equipment and enriches asset, case, EPS, and CxAlloy data", () => {
    const pdms: PdmRecord[] = [
      {
        pdm_name: "PDM-A",
        equipment: [
          {
            equipment_id: "IAD06-EQ-1",
            source_equipment_label: "EQ-1",
            cases: [{ case_id: "CASE-1", status: "Open" }],
          },
        ],
      },
    ];
    const cases: CaseIssue[] = [
      { case_id: "CASE-1", equipment_id: "IAD06-EQ-1", status: "Open" },
      { case_id: "CASE-2", equipment_id: "IAD06-EQ-1", status: "Resolved" },
    ];

    const result = flattenEquipmentFromPdms(
      pdms,
      [
        {
          equipment_id: "IAD06-EQ-1",
          equipment_type: "PDU",
          manufacturer: "IEM",
          model: "MODEL-1",
          serial_number: "SERIAL-1",
          neta_complete: true,
          neta_test_report: "Report-01.pdf",
        },
      ],
      cases,
      [{ module_equipment: "EQ-1", item_status: "Passed" }],
      {
        records: [
          {
            equipment_id: "EQ-1",
            upload_status: "pending",
            expected_report_count: 1,
            available_report_count: 1,
            report_names: ["Report-01.pdf"],
          },
        ],
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      pdm_name: "PDM-A",
      equipment_type: "PDU",
      manufacturer: "IEM",
      model: "MODEL-1",
      serial_number: "SERIAL-1",
      neta_complete: true,
      cxalloy_upload_status: "pending",
    });
    expect(result[0].cases.map((caseItem) => caseItem.case_id)).toEqual(["CASE-1", "CASE-2"]);
    expect(result[0].eps_test_items).toHaveLength(1);
    expect(getOpenCaseCount(result[0])).toBe(1);
    expect(hasPendingCxalloyReport(result[0])).toBe(true);
  });

  it("falls back to standalone equipment when there are no PDM records", () => {
    const result = flattenEquipmentFromPdms(
      [],
      [{ equipment_id: "IAD06-EQ-2", neta_complete: false }],
      [{ case_id: "CASE-2", equipment_id: "IAD06-EQ-2", status: "Closed" }],
    );

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("equipment");
    expect(result[0].pdm_name).toBeNull();
    expect(getOpenCaseCount(result[0])).toBe(0);
  });

  it("derives NETA status and attention reasons", () => {
    const missingReport = row({
      neta_complete: true,
      neta_test_report: null,
      cases: [{ status: "Open", issue_image: null }],
    });

    expect(getNetaDisplayStatus(missingReport)).toBe("Complete - Missing Report");
    expect(getEquipmentAttentionReasons(missingReport)).toEqual([
      "Missing NETA test report",
      "Open case",
      "Missing issue image",
    ]);
    expect(getNetaDisplayStatus(row({ neta_complete: true, neta_test_report: "a.pdf" }))).toBe(
      "Complete + Report Available",
    );
    expect(getNetaDisplayStatus(row({ neta_complete: false }))).toBe("Incomplete");
    expect(getNetaDisplayStatus(row({ neta_complete: "unexpected" }))).toBe("Unknown");
  });

  it("calculates summary metrics and groups duplicate equipment IDs", () => {
    const rows = [
      row({
        row_id: "1",
        cases: [{ status: "Open", issue_image: null }],
        cxalloy_upload_status: "pending",
      }),
      row({
        row_id: "2",
        pdm_name: "PDM-B",
        neta_complete: true,
        neta_test_report: "report.pdf",
        status: "Ready",
        cxalloy_upload_status: "pending",
      }),
    ];

    expect(groupEquipmentById(rows).get("IAD06-EQ-1")).toHaveLength(2);
    expect(getEquipmentSummaryMetrics(rows)).toMatchObject({
      totalEquipmentEntries: 2,
      uniqueEquipmentIds: 1,
      netaComplete: 1,
      netaIncomplete: 1,
      equipmentWithOpenCases: 1,
      casesMissingIssueImage: 1,
      cxalloyPendingEquipment: 1,
    });
  });
});
