import { describe, expect, it } from "vitest";

import type { NetaPositionCheck, NetaPositionEquipment } from "../types/netaPositions";
import { buildNetaPositionIndex, findNetaPositionEntry, matchesBaselineFilter } from "./netaPositions";

const entry = (patch: Partial<NetaPositionEquipment>): NetaPositionEquipment => ({
  equipment_id: "IAD06-MDS6-01D", family: "MDS6|A-F", equipment_type: null, neta_complete: true,
  baseline_basis: "draft", report_stage: "formal", report_count: 1, nonconforming: false,
  complete_but_nonconforming: false, issue_counts: {}, positions: [], extra_reports: [],
  needs_review_reports: [], reports: [], exception_note: null, ...patch,
});

describe("NETA position filters", () => {
  it("finds entries with or without the IAD06 prefix", () => {
    const index = buildNetaPositionIndex({ equipment: [entry({})] } as unknown as NetaPositionCheck);
    expect(findNetaPositionEntry(index, null, "mds6-01d")?.equipment_id).toBe("IAD06-MDS6-01D");
    expect(findNetaPositionEntry(index, "IAD06-MDS6-01X")).toBeNull();
  });

  it("matches each baseline filter", () => {
    const bad = entry({ nonconforming: true, issue_counts: { missing: 1, duplicate_different_sn: 1, gc_name_mismatch: 2 } });
    expect(matchesBaselineFilter(bad, "nonconforming")).toBe(true);
    expect(matchesBaselineFilter(bad, "missing")).toBe(true);
    expect(matchesBaselineFilter(bad, "failed_only")).toBe(false);
    expect(matchesBaselineFilter(bad, "duplicate")).toBe(true);
    expect(matchesBaselineFilter(bad, "gc_name_mismatch")).toBe(true);
    expect(matchesBaselineFilter(entry({ baseline_basis: "none" }), "no_baseline")).toBe(true);
    expect(matchesBaselineFilter(null, "missing")).toBe(false);
    expect(matchesBaselineFilter(null, "")).toBe(true);
  });
});
