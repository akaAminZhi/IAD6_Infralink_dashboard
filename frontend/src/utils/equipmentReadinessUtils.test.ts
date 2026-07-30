import { describe, expect, it } from "vitest";

import type { PdmRecord } from "../types/data";
import {
  getEquipmentNeedingAttention,
  getEquipmentReadinessMetrics,
} from "./equipmentReadinessUtils";

const pdms: PdmRecord[] = [
  {
    pdm_name: "PDM-STARTED",
    equipment_count: 2,
    neta_complete_count: 1,
    neta_incomplete_count: 1,
    equipment: [
      {
        equipment_id: "EQ-READY",
        match_status: "matched",
        status: "Cond Green Tag",
        neta_complete: true,
        neta_test_report: "ready.pdf",
        neta_report_status: "present",
        cases: [{ case_id: "1", status: "Resolved" }],
      },
      {
        equipment_id: "EQ-RISK",
        match_status: "matched",
        status: "Cond Red Tag",
        neta_complete: false,
        cases: [{ case_id: "2", status: "Open" }],
      },
    ],
  },
  {
    pdm_name: "PDM-NOT-STARTED",
    equipment_count: 1,
    neta_complete_count: 0,
    neta_incomplete_count: 1,
    equipment: [
      {
        equipment_id: "EQ-WAIT",
        match_status: "matched",
        neta_complete: false,
        cases: [],
      },
    ],
  },
];

describe("equipmentReadinessUtils", () => {
  it("does not count resolved cases as open", () => {
    const metrics = getEquipmentReadinessMetrics(pdms);
    expect(metrics.totalEquipmentLinks).toBe(3);
    expect(metrics.totalOpenCases).toBe(1);
    expect(metrics.equipmentWithOpenCases).toBe(1);
  });

  it("only surfaces attention rows after PDM testing has started", () => {
    const rows = getEquipmentNeedingAttention(pdms);
    expect(rows.map((row) => row.equipment_id)).toEqual(["EQ-RISK"]);
    expect(rows[0]?.reason).toEqual(["NETA incomplete", "Open case"]);
  });
});
