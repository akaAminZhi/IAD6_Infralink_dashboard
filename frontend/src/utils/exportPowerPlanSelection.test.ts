import { describe, expect, it } from "vitest";

import type { EnrichedPowerPlanEquipment } from "./powerPlanUtils";
import { createPowerPlanSelectionWorkbook } from "./exportPowerPlanSelection";

function equipmentRow(
  area: "110" | "210",
  equipmentNumber: string,
): EnrichedPowerPlanEquipment {
  const pdmName = `IAD06-PDM-E6-${area}-01-PRIMARY-CDS`;
  const equipmentId = `IAD06-PDU6-${equipmentNumber}`;
  return {
    annotation: {
      annotation_id: `pdm:${pdmName}:${equipmentId}`,
      kind: "equipment",
      label: equipmentId.replace("IAD06-", ""),
      rect: { x: 0, y: 0, width: 0, height: 0 },
      center: { x: 0, y: 0 },
      matched_equipment_id: equipmentId,
    },
    equipment: {
      equipment_id: equipmentId,
      equipment_type: "Power Distribution Unit",
      status: "Conditional Yellow Tag",
      manufacturer: "IEM",
      model: "MODEL-1",
      serial_number: "SERIAL-1",
      neta_complete: false,
    },
    equipmentId,
    pdmName,
    issues: [
      {
        case_id: `CASE-${area}`,
        status: "Open",
        priority: "High",
        summary: "CT ratio out of tolerance",
        issue_image: "issue.jpg",
      },
    ],
    openIssues: [
      {
        case_id: `CASE-${area}`,
        status: "Open",
        summary: "CT ratio out of tolerance",
      },
    ],
    testItems: [
      {
        module_equipment: equipmentId,
        equipment_name: `${equipmentId}-CT`,
        tracker_type: "CT",
        item_status: "Failed",
        comments: "Retest required",
      },
    ],
    passedCount: 0,
    failedCount: 1,
    notTestedCount: 0,
    waivedCount: 0,
    status: "action",
  };
}

describe("Power Plan Excel export", () => {
  it("creates one detailed worksheet per selected area family", async () => {
    const workbook = await createPowerPlanSelectionWorkbook([
      equipmentRow("110", "01A-1"),
      equipmentRow("210", "01D-1"),
    ]);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "E6-110",
      "E6-210",
    ]);
    const e6110 = workbook.getWorksheet("E6-110");
    if (!e6110) throw new Error("Expected E6-110 worksheet");
    expect(e6110.getCell("A5").value).toBe("IAD06-PDU6-01A-1");
    expect(e6110.getCell("C5").value).toBe("E6-110-01");
    expect(e6110.getCell("D5").value).toBe(
      "IAD06-PDM-E6-110-01-PRIMARY-CDS",
    );
    const expectedHeaders = [
      "Equipment ID",
      "Equipment Label",
      "Room / Area",
      "PDM Name",
      "Readiness",
      "Equipment Type",
      "Equipment Status",
      "Manufacturer",
      "Model",
      "Serial Number",
      "Open Issues",
      "Issue Details",
    ];
    expect(expectedHeaders.map((_, index) => e6110.getCell(4, index + 1).value)).toEqual(
      expectedHeaders,
    );
    expect(e6110.getCell("K5").value).toBe(1);
    expect(e6110.getCell("L5").value).toBe(
      "CASE-110 | CT ratio out of tolerance",
    );
    expect(String(e6110.getCell("L5").value)).not.toContain("Priority:");
    expect(String(e6110.getCell("L5").value)).not.toContain("Status:");
    expect(e6110.autoFilter).toEqual({
      from: { row: 4, column: 1 },
      to: { row: 4, column: 12 },
    });
  }, 20_000);

  it("requires at least one selected equipment record", async () => {
    await expect(createPowerPlanSelectionWorkbook([])).rejects.toThrow(
      /select at least one/i,
    );
  });
});
