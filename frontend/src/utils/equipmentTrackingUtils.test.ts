import { describe, expect, it } from "vitest";

import { requiresEquipmentTestTracking } from "./equipmentTrackingUtils";

describe("requiresEquipmentTestTracking", () => {
  it("excludes BATTERY in either equipment ID or source label", () => {
    expect(
      requiresEquipmentTestTracking({ equipment_id: "IAD06-INV6-H1-1 BATTERY 2" }),
    ).toBe(false);
    expect(
      requiresEquipmentTestTracking({ source_equipment_label: "INV6-H1-1 battery1" }),
    ).toBe(false);
    expect(
      requiresEquipmentTestTracking({ normalized_equipment_id: "IAD06-BATTERY-RACK-1" }),
    ).toBe(false);
  });

  it("excludes direct INV6 equipment without excluding TX-INV6 equipment", () => {
    expect(requiresEquipmentTestTracking({ equipment_id: "IAD06-INV6-04R" })).toBe(false);
    expect(requiresEquipmentTestTracking({ source_equipment_label: "INV6-H1-1" })).toBe(false);
    expect(requiresEquipmentTestTracking({ equipment_id: "IAD06-TX-INV6-03R" })).toBe(true);
    expect(
      requiresEquipmentTestTracking({ equipment_id: "IAD06-ATS-TX-INV6-H1-1" }),
    ).toBe(true);
  });
});
