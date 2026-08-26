import { describe, expect, it } from "vitest";

import { makeDashboardData } from "../test/fixtures";
import type { PowerPlanAnnotation } from "../types/data";
import {
  enrichPdmSchematicEquipment,
  enrichPowerPlanEquipment,
  getAnnotationBounds,
  isPowerPlanWaivedItem,
  normalizePowerPlanEquipmentKey,
} from "./powerPlanUtils";

function annotation(label: string): PowerPlanAnnotation {
  return {
    annotation_id: label,
    kind: "equipment",
    label,
    matched_equipment_id: `IAD06-${label}`,
    rect: { x: 100, y: 200, width: 50, height: 40 },
    center: { x: 125, y: 220 },
  };
}

describe("powerPlanUtils", () => {
  it("normalizes equipment keys and bounds annotations", () => {
    expect(normalizePowerPlanEquipmentKey(" iad06-pdu6-01a-1 ")).toBe("PDU6-01A-1");
    expect(getAnnotationBounds([], 1000, 800)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
    });
    expect(getAnnotationBounds([annotation("PDU6-01A-1")], 1000, 800, 20)).toEqual({
      x: 80,
      y: 180,
      width: 90,
      height: 80,
    });
  });

  it("treats commented incomplete items as waived only after NETA completion", () => {
    const item = { item_status: "Not Tested", comments: "Not required by scope" };
    expect(isPowerPlanWaivedItem(item, true)).toBe(true);
    expect(isPowerPlanWaivedItem(item, false)).toBe(false);
    expect(isPowerPlanWaivedItem({ item_status: "Passed", comments: "Done" }, true)).toBe(false);
  });

  it("keeps NETA-complete equipment ready while preserving open and remaining counts", () => {
    const result = enrichPowerPlanEquipment(
      [annotation("PDU6-01A-1")],
      makeDashboardData({
        equipment: [{ equipment_id: "IAD06-PDU6-01A-1", neta_complete: true }],
        cases: [
          {
            case_id: "CASE-1",
            equipment_id: "IAD06-PDU6-01A-1",
            status: "Open",
          },
        ],
        epsTestItems: [
          {
            module_equipment: "PDU6-01A-1",
            item_status: "Not Tested",
            comments: "",
          },
        ],
        pdms: [
          {
            pdm_name: "IAD06-PDM-E6-110-01",
            equipment: [{ equipment_id: "IAD06-PDU6-01A-1" }],
          },
        ],
      }),
    );

    expect(result[0]).toMatchObject({
      status: "ready",
      pdmName: "IAD06-PDM-E6-110-01",
      notTestedCount: 1,
      failedCount: 0,
    });
    expect(result[0].openIssues).toHaveLength(1);
  });

  it.each([
    [
      "waitingNeta",
      {
        epsModuleExecution: [
          {
            pdm_name: "PDM-A",
            module_equipment: "EQ-1",
            eps_test_status: "Complete, Waiting Infralink NETA Completion",
          },
        ],
        epsTestItems: [{ module_equipment: "EQ-1", item_status: "Passed" }],
      },
    ],
    [
      "action",
      {
        cases: [{ equipment_id: "IAD06-EQ-1", status: "Open" }],
        epsTestItems: [{ module_equipment: "EQ-1", item_status: "Not Tested" }],
      },
    ],
    ["testing", { epsTestItems: [{ module_equipment: "EQ-1", item_status: "Not Tested" }] }],
    ["noData", {}],
  ])("derives %s status for non-complete equipment", (expectedStatus, overrides) => {
    const pdms = [{ pdm_name: "PDM-A", equipment: [{ equipment_id: "IAD06-EQ-1" }] }];
    const result = enrichPowerPlanEquipment(
      [annotation("EQ-1")],
      makeDashboardData({ pdms, ...overrides }),
    );
    expect(result[0].status).toBe(expectedStatus);
  });

  it("builds schematic rows directly from PDM membership without duplicates", () => {
    const data = makeDashboardData({
      pdms: [
        {
          pdm_name: "PDM-A",
          equipment: [
            { equipment_id: "IAD06-EQ-1" },
            { equipment_id: "IAD06-EQ-1" },
          ],
        },
      ],
      equipment: [
        {
          equipment_id: "IAD06-EQ-1",
          manufacturer: "IEM",
          neta_complete: false,
        },
      ],
      epsTestItems: [{ module_equipment: "EQ-1", item_status: "Passed" }],
    });

    const result = enrichPdmSchematicEquipment(data);
    expect(result).toHaveLength(1);
    expect(result[0].equipment?.manufacturer).toBe("IEM");
    expect(result[0].status).toBe("testing");
  });

  it("does not treat BATTERY equipment as NETA-ready", () => {
    const result = enrichPowerPlanEquipment(
      [annotation("INV6-H1-1 BATTERY1")],
      makeDashboardData({
        equipment: [
          {
            equipment_id: "IAD06-INV6-H1-1 BATTERY1",
            neta_complete: true,
          },
        ],
      }),
    );

    expect(result[0].status).toBe("noData");
  });

  it("excludes direct INV6 equipment but still tracks TX-INV6 equipment", () => {
    const result = enrichPowerPlanEquipment(
      [annotation("INV6-04R"), annotation("TX-INV6-03R")],
      makeDashboardData({
        equipment: [
          { equipment_id: "IAD06-INV6-04R", neta_complete: true },
          { equipment_id: "IAD06-TX-INV6-03R", neta_complete: true },
        ],
      }),
    );

    expect(result.find((item) => item.equipmentId === "IAD06-INV6-04R")?.status).toBe(
      "noData",
    );
    expect(result.find((item) => item.equipmentId === "IAD06-TX-INV6-03R")?.status).toBe(
      "ready",
    );
  });
});
