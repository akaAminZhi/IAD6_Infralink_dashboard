import { describe, expect, it } from "vitest";

import type { EpsTestItemRecord } from "../types/data";
import {
  buildEpsTestItemIndex,
  getEpsStatusTone,
  getEpsTestItemStatusLabel,
  getIndexedEpsTestItems,
  normalizeEpsEquipmentKey,
  summarizeEpsTestItems,
} from "./epsTestItemUtils";

function item(
  itemStatus: string,
  equipment = "IAD06-PDU6-01A-1",
): EpsTestItemRecord {
  return {
    item_status: itemStatus,
    module_equipment: equipment,
  };
}

describe("epsTestItemUtils", () => {
  it("normalizes equipment identifiers and indexes all supported aliases", () => {
    const record: EpsTestItemRecord = {
      item_status: "Passed",
      matched_equipment_id: "IAD06-PDU6-01A-1",
      module_equipment_key: "PDU6-01A-1",
      module_equipment: " pdu6-01a-1 ",
    };
    const index = buildEpsTestItemIndex([record]);

    expect(normalizeEpsEquipmentKey(" iad06-pdu6-01a-1 ")).toBe("PDU6-01A-1");
    expect(index.get("PDU6-01A-1")).toEqual([record]);
    expect(getIndexedEpsTestItems(index, ["IAD06-PDU6-01A-1", "PDU6-01A-1"])).toEqual([
      record,
    ]);
  });

  it.each([
    [[], "No Test Items", 0, 0, 0, 0],
    [[item("Not Tested")], "Not Started", 0, 0, 0, 1],
    [[item("Passed"), item("Not Tested")], "In Progress", 1, 0, 0, 1],
    [[item("Failed"), item("Passed")], "Failed", 1, 0, 1, 0],
    [[item("Fixed")], "Fixed", 0, 1, 0, 0],
    [[item("Passed"), item("Fixed")], "Passed", 1, 1, 0, 0],
  ])(
    "summarizes item states as %s",
    (items, expectedStatus, passed, fixed, failed, remaining) => {
      expect(summarizeEpsTestItems(items as EpsTestItemRecord[])).toEqual({
        total: (items as EpsTestItemRecord[]).length,
        passed,
        fixed,
        failed,
        remaining,
        status: expectedStatus,
      });
    },
  );

  it("maps status labels and tones used by the UI", () => {
    expect(getEpsTestItemStatusLabel("Fixed")).toBe("Fixed After Failure");
    expect(getEpsTestItemStatusLabel("Fixed - Not In Tracker")).toBe(
      "Fixed After Failure - Not In Tracker",
    );
    expect(getEpsTestItemStatusLabel("Failed")).toBe("Current Failed");
    expect(getEpsTestItemStatusLabel("Failed - Not In Tracker")).toBe(
      "Current Failed - Not In Tracker",
    );
    expect(getEpsStatusTone("Passed")).toBe("success");
    expect(getEpsStatusTone("Fixed")).toBe("teal");
    expect(getEpsStatusTone("Failed")).toBe("danger");
    expect(getEpsStatusTone("In Progress")).toBe("warning");
    expect(getEpsStatusTone("No Test Items")).toBe("muted");
  });
});
