import { describe, expect, it } from "vitest";
import { duplicateManifest, makeDuplicate } from "../test/netaDuplicateFixtures";
import { duplicateCounts, duplicateLabel, getEquipmentDuplicates, getReportDuplicates } from "./netaDuplicates";

describe("NETA duplicate evidence", () => {
  it("uses effective confirmation even when classification remains possible_duplicate", () => {
    expect(duplicateLabel(makeDuplicate())).toBe("Confirmed Duplicate");
    expect(duplicateLabel(makeDuplicate({ status: "invalid" }))).toBe("Duplicate Evidence Invalid");
  });
  it("matches both copies by original or GC name and scopes by full equipment ID", () => {
    const manifest = duplicateManifest();
    for (const name of ["Original-1.pdf", "Original-2.pdf", "GC-1.pdf", "GC-2.pdf"]) {
      expect(getReportDuplicates(manifest, "eq-1", name)).toHaveLength(1);
      expect(getReportDuplicates(manifest, "EQ-10", name)).toHaveLength(0);
      expect(getReportDuplicates(manifest, null, name)).toHaveLength(0);
    }
  });
  it("counts unique groups and preserves unavailable separately from empty", () => {
    const confirmed = makeDuplicate();
    const possible = makeDuplicate({ match_id: "c", status: "possible" });
    expect(duplicateCounts([confirmed, confirmed, possible])).toEqual({ confirmed: 1, possible: 1, invalid: 0 });
    expect(getEquipmentDuplicates({ duplicate_audit: { available: false, matches: [confirmed], errors: ["missing"] } }, "EQ-1")).toEqual([]);
  });
  it("associates a shared cable only through its exact complete original PDF ID", () => {
    const cable = makeDuplicate({ category: "cable", device_name: "ENDPOINT-1" });
    cable.first.original!.report_name = "FD01-IAD06-UTILITY6-03.pdf";
    const manifest = duplicateManifest([cable]);
    expect(getEquipmentDuplicates(manifest, "FD01-IAD06-UTILITY6-03")).toHaveLength(1);
    expect(getEquipmentDuplicates(manifest, "FD01-IAD06-UTILITY6-030")).toHaveLength(0);
    expect(getEquipmentDuplicates(manifest, "UTILITY6-03")).toHaveLength(0);
  });
});
