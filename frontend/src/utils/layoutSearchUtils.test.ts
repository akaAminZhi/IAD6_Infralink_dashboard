import { describe, expect, it } from "vitest";
import type { LayoutEquipmentRecord, LayoutPlanManifest } from "../types/data";
import { buildLayoutSearchEntries, searchLayoutEntries } from "./layoutSearchUtils";

function device(key: string, id = key): LayoutEquipmentRecord {
  return { annotation_id: id, equipment_key: key, label: key, matched_equipment_id: `IAD06-${key}`,
    candidate_equipment_ids: [`IAD06-${key}`], match_status: "matched", fixed: false, source_floor_id: "first",
    rect: { x: 0, y: 0, width: 10, height: 10 }, energized_completed_at: null, system_element_status: null };
}

function manifest(): LayoutPlanManifest {
  return { generated_at: "2026-10-23", selected_input_files: {}, diagnostics: [], fixed_equipment: [],
    floors: [{ floor_id: "first", label: "First Floor", file_name: "floor.pdf", page_number: 1, width: 100, height: 100,
      equipment: [device("EQ-1"), device("EQ-2"), device("EQ-2", "duplicate")] }],
    cables: [{ cable_id: "FDR-IAD06-EQ-1-IAD06-EQ-2", equipment_type: "Feeder Cable - LV",
      source_equipment_key: "EQ-1", target_equipment_key: "EQ-2", connection_status: "resolved",
      system_element_status: null, neta_complete: false, neta_test_report: null, mv_daily_test_status: null, mv_daily_test_date: null }] };
}

describe("Layout search", () => {
  it("ranks ordinary equipment before cables and terminations before applying the suggestion limit", () => {
    const data = manifest();
    const cableId = data.cables![0].cable_id;
    const entries = buildLayoutSearchEntries(data, [
      { equipment_id: cableId + "-A", equipment_type: "TERMINATION" },
      ...Array.from({ length: 13 }, (_, index) => ({ equipment_id: `IAD06-PANEL-${cableId}-${index}`, equipment_type: "Switchgear" })),
    ], "first");
    const results = searchLayoutEntries(entries, cableId);
    expect(results).toHaveLength(12);
    expect(results.every((entry) => entry.record.equipment_type === "Switchgear")).toBe(true);
    const onlyCable = searchLayoutEntries(entries, `${cableId}-A`);
    expect(onlyCable[0].record.equipment_type).toBe("TERMINATION");
  });

  it("covers all Excel IDs, keeps exact equipment ahead of related cables, and skips blank IDs", () => {
    const equipment = [
      { equipment_id: "IAD06-EQ-1" },
      { equipment_id: "FDR-IAD06-EQ-1-IAD06-EQ-2" },
      { equipment_id: "IAD06-TERM-1", equipment_type: "Termination" },
      { equipment_id: "IAD06-INV6-01", test_tracking_required: false },
      { equipment_id: null },
      { equipment_id: " " },
    ];
    const entries = buildLayoutSearchEntries(manifest(), equipment, "first");
    for (const record of equipment.filter((record) => record.equipment_id?.trim())) {
      expect(searchLayoutEntries(entries, record.equipment_id!)).not.toHaveLength(0);
    }
    expect(entries).toHaveLength(5);
    expect(searchLayoutEntries(entries, "iad06-eq-1")[0].kind).toBe("placement");
    expect(searchLayoutEntries(entries, "fdr*eq-2")[0].kind).toBe("cable");
    expect(searchLayoutEntries(entries, "term-1")[0]).toMatchObject({ kind: "equipment", floorId: null });
    expect(searchLayoutEntries(entries, "  ")).toEqual([]);
  });

  it("does not assign a floor to cables with ambiguous placements or unresolved identities", () => {
    const data = manifest();
    expect(buildLayoutSearchEntries(data, [], "first").find((entry) => entry.kind === "cable")?.floorId).toBeNull();
    data.floors[0].equipment.pop();
    expect(buildLayoutSearchEntries(data, [], "first").find((entry) => entry.kind === "cable")?.floorId).toBe("first");
    data.cables![0].connection_status = "ambiguous_cable_id";
    expect(buildLayoutSearchEntries(data, [], "first").find((entry) => entry.kind === "cable")?.floorId).toBeNull();
  });
});
