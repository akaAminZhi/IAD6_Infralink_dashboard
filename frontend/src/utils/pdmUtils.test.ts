import { describe, expect, it } from "vitest";

import type {
  EpsPdmExecutionRecord,
  PdmEquipmentRecord,
  PdmRecord,
} from "../types/data";
import {
  getPdmOpenCaseCount,
  getPdmReadinessLevel,
  hasEpsTestingStarted,
  hasPdmTestingStarted,
} from "./pdmUtils";

function equipment(
  overrides: Partial<PdmEquipmentRecord> = {},
): PdmEquipmentRecord {
  return {
    equipment_id: "EQ-1",
    match_status: "matched",
    neta_complete: false,
    cases: [],
    ...overrides,
  };
}

function pdm(overrides: Partial<PdmRecord> = {}): PdmRecord {
  return {
    pdm_name: "PDM-1",
    equipment_count: 1,
    neta_complete_count: 0,
    neta_incomplete_count: 1,
    equipment: [equipment()],
    ...overrides,
  };
}

describe("pdmUtils", () => {
  it("uses EPS activity as a testing-start signal", () => {
    const eps: EpsPdmExecutionRecord = {
      pdm_name: "PDM-1",
      completed_test_item_count: 1,
      eps_execution_status: "Partial",
    };
    expect(hasEpsTestingStarted(eps)).toBe(true);
    expect(hasPdmTestingStarted(pdm(), eps)).toBe(true);
  });

  it("keeps a PDM not started when neither EPS nor NETA has activity", () => {
    expect(hasPdmTestingStarted(pdm(), null)).toBe(false);
    expect(getPdmReadinessLevel(pdm(), null)).toBe("Not Started");
  });

  it("counts only open equipment cases when detailed cases exist", () => {
    const record = pdm({
      open_case_count: 9,
      equipment: [
        equipment({
          cases: [
            { case_id: "1", status: "Resolved" },
            { case_id: "2", status: "Acknowledged" },
          ],
        }),
      ],
    });
    expect(getPdmOpenCaseCount(record)).toBe(1);
  });

  it("returns Good for started PDMs with no readiness blockers", () => {
    const record = pdm({
      neta_complete_count: 1,
      neta_incomplete_count: 0,
      equipment: [
        equipment({
          neta_complete: true,
          neta_test_report: "report.pdf",
          neta_report_status: "present",
        }),
      ],
    });
    expect(getPdmReadinessLevel(record)).toBe("Good");
  });

  it("escalates high blocker scores to Critical", () => {
    const record = pdm({
      equipment_count: 4,
      neta_incomplete_count: 4,
      open_case_count: 4,
      equipment: [
        equipment({
          neta_complete: true,
          neta_report_status: "missing_report",
          neta_test_report: null,
          cases: [
            { case_id: "1", status: "Open", issue_image: null },
            { case_id: "2", status: "Open", issue_image: null },
          ],
        }),
      ],
    });
    expect(getPdmReadinessLevel(record, { failed_test_item_count: 1 })).toBe(
      "Critical",
    );
  });
});
