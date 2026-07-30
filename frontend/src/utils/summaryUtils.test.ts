import { describe, expect, it } from "vitest";

import type {
  CaseIssue,
  DashboardSummary,
  Equipment,
  ModuleEquipmentLink,
  PdmRecord,
} from "../types/data";
import {
  arrayToChartData,
  asNumber,
  countMissingIssueImages,
  countNetaComplete,
  countOpenCases,
  countPriorityContains,
  countUniqueMatchedEquipment,
  getGroupedSummary,
  getMetric,
  getTopPdmsByMissingNetaReports,
  getTopPdmsByOpenCases,
  groupCountBy,
  objectToChartData,
} from "./summaryUtils";

describe("summaryUtils", () => {
  it("prefers nested metric and grouped-summary values", () => {
    const summary = {
      total_cases: 3,
      metrics: { total_cases: 4 },
      cases_by_status: { Open: 2 },
      grouped_summaries: { cases_by_status: { Open: 3 } },
    } as DashboardSummary;

    expect(getMetric(summary, "total_cases")).toBe(4);
    expect(getGroupedSummary(summary, "cases_by_status")).toEqual({ Open: 3 });
    expect(getMetric(null, "total_cases")).toBeNull();
  });

  it("normalizes numbers and chart data", () => {
    expect(asNumber("12")).toBe(12);
    expect(asNumber("bad")).toBeNull();
    expect(objectToChartData({ B: 2, A: 2, Empty: 0 })).toEqual([
      { name: "A", value: 2 },
      { name: "B", value: 2 },
    ]);
    expect(
      arrayToChartData(
        [
          { pdm_name: "PDM-B", open_cases: 2 },
          { pdm_name: "PDM-A", open_cases: 4 },
        ],
        ["pdm_name"],
        ["open_cases"],
        1,
      ),
    ).toEqual([{ name: "PDM-A", value: 4, pdm_name: "PDM-A" }]);
  });

  it("counts grouped, open, priority, image, matched, and NETA records", () => {
    const cases: CaseIssue[] = [
      { status: "Open", priority: "Urgent", issue_image: null },
      { status: "Resolved", priority: "High", issue_image: "image.jpg" },
      { status: null, priority: "High / Urgent", issue_image: " " },
    ];
    const links: ModuleEquipmentLink[] = [
      { match_status: "matched", matched_equipment_id: "EQ-1" },
      { match_status: "matched", matched_equipment_id: "EQ-1" },
      { match_status: "unmatched", matched_equipment_id: "EQ-2" },
    ];
    const equipment: Equipment[] = [
      { equipment_id: "EQ-1", neta_complete: true },
      { equipment_id: "EQ-2", neta_complete: false },
    ];

    expect(groupCountBy(cases, "status")).toEqual({ Open: 1, Resolved: 1, Unknown: 1 });
    expect(countOpenCases(cases)).toBe(2);
    expect(countPriorityContains(cases, "urgent")).toBe(2);
    expect(countMissingIssueImages(cases)).toBe(2);
    expect(countUniqueMatchedEquipment(links)).toBe(1);
    expect(countNetaComplete(equipment)).toBe(1);
  });

  it("uses PDM nested records when aggregate values are unavailable", () => {
    const pdms: PdmRecord[] = [
      {
        pdm_name: "PDM-A",
        open_case_count: undefined,
        neta_missing_report_count: undefined,
        equipment: [
          {
            equipment_id: "EQ-1",
            neta_complete: true,
            neta_test_report: null,
            cases: [{ status: "Open" }, { status: "Resolved" }],
          },
        ],
      },
      { pdm_name: "PDM-B", open_case_count: 3, neta_missing_report_count: 0 },
    ];

    expect(getTopPdmsByOpenCases(pdms)).toEqual([
      { name: "PDM-B", value: 3, pdm_name: "PDM-B" },
      { name: "PDM-A", value: 1, pdm_name: "PDM-A" },
    ]);
    expect(getTopPdmsByMissingNetaReports(pdms)).toEqual([
      { name: "PDM-A", value: 1, pdm_name: "PDM-A" },
    ]);
  });
});
