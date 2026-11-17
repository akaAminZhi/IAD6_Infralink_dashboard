import { describe, expect, it } from "vitest";
import { makeLayoutCable, makeLayoutManifest } from "../test/fixtures";
import { buildConnectedCableIndex, connectedCableCounts, equipmentEnergizationReadiness, getConnectedCables, getConnectedCableScope, isConnectedCableExcluded } from "./connectedCables";
import { isDefaultCxalloyUploadExcluded } from "./cxalloyUploadScope";
import { flattenEquipmentFromPdms } from "./equipmentUtils";

const equipment = flattenEquipmentFromPdms([], [{ equipment_id: "IAD06-EQ-1", neta_complete: true }], [])[0];

describe("connected cable energization readiness", () => {
  it.each([
    ["UPS6-01A", true], ["IAD06-UPS6-02F-1", true], ["UPS6", true],
    ["UPS6-01A-R", true], ["UPS6-R", false], ["UPS6-01R", false],
    [" iad6-ups6-02r-1 ", false], ["AHU6-01A-1", true], ["AHU6-01R-1", true],
    ["IAD06-AHU6-R", true], ["AHU6", true], ["AHU60-01A", false],
    ["UPS60-01A", false], ["OTHER-AHU6-01A", false], [null, false],
  ])("applies Equipment-only UPS6/AHU6 cable rules to either endpoint (%s)", (endpoint, excluded) => {
    expect(isConnectedCableExcluded(makeLayoutCable({ source_equipment_key: endpoint }))).toBe(excluded);
    expect(isConnectedCableExcluded(makeLayoutCable({ target_equipment_key: endpoint }))).toBe(excluded);
    // These additions do not change the uploader's own default exclusions.
    expect(isDefaultCxalloyUploadExcluded(endpoint)).toBe(false);
  });

  it("removes non-R UPS6 and every AHU6 cable from all counts and readiness, retaining UPS6 R", () => {
    const cable = (id: string) => makeLayoutCable({ cable_id: id, target_equipment_key: id, eps_daily_test_status: "failed" });
    const excluded = [cable("UPS6-01A"), cable("AHU6-01A-1"), cable("AHU6-01R-1")];
    const retained = cable("UPS6-01R");
    const index = buildConnectedCableIndex(makeLayoutManifest([...excluded, retained]), null)!;
    expect(getConnectedCables(equipment, index)).toEqual([retained]);
    expect(connectedCableCounts([...excluded, retained], index)).toEqual({ total: 1, tested: 0, failed: 1, unconfirmed: 0, withReport: 0, ready: 0 });
    expect(equipmentEnergizationReadiness(equipment, index).status).toBe("not_ready");
    const allExcluded = buildConnectedCableIndex(makeLayoutManifest(excluded), null)!;
    expect(getConnectedCableScope(equipment, allExcluded)).toEqual({ cables: [], excludedCount: 3 });
    expect(equipmentEnergizationReadiness(equipment, allExcluded).status).toBe("ready");
  });
  it.each([
    ["UPP6-01A", true], ["TX-UPP6-01A", true], ["TX-UPP6-01R", true],
    ["CUPP6-04F-3", true], ["TX-CUPP6-01A-1", true], ["CUPP6", true],
    ["CUPP6-01A-R", true], ["TX-CUPP6-01A-REMARK", true],
    ["CUPP6-R", false], ["CUPP6-04R-3", false], ["TX-CUPP6-01R-1", false],
    [" iad6-tx-upp6-01a ", true], ["IAD06-CUPP6-01A", true],
    [" iad6-cupp6-01r-2 ", false], ["UPP60-01A", false], ["UPP6A", false],
    ["CUPP60-01A", false], ["MDS6-01A", false], [null, false],
  ])("matches the upload script's default exclusion for %s", (reference, excluded) => {
    expect(isDefaultCxalloyUploadExcluded(reference)).toBe(excluded);
  });

  it.each(["source_equipment_key", "target_equipment_key"] as const)("excludes connections by %s from the list and every count", (endpoint) => {
    const excluded = makeLayoutCable({ cable_id: "excluded", [endpoint]: "TX-UPP6-01A",
      [endpoint === "source_equipment_key" ? "target_equipment_key" : "source_equipment_key"]: "EQ-1", eps_daily_test_status: "failed" });
    const required = makeLayoutCable({ feeder_cable_atp_names: ["ATP.pdf"] });
    const index = buildConnectedCableIndex(makeLayoutManifest([excluded, required]), null)!;
    expect(getConnectedCables(equipment, index)).toEqual([required]);
    expect(getConnectedCableScope(equipment, index).excludedCount).toBe(1);
    expect(connectedCableCounts([excluded, required], index)).toEqual({ total: 1, tested: 1, failed: 0, unconfirmed: 0, withReport: 1, ready: 1 });
    expect(equipmentEnergizationReadiness(equipment, index).status).toBe("ready");
  });

  it("keeps R-zone connections and unresolved endpoints in scope", () => {
    const cables = [makeLayoutCable({ target_equipment_key: "CUPP6-01R-3" }),
      makeLayoutCable({ cable_id: "unresolved", target_equipment_key: null })];
    const index = buildConnectedCableIndex(makeLayoutManifest(cables), null)!;
    expect(getConnectedCables(equipment, index)).toEqual(cables);
    expect(equipmentEnergizationReadiness(equipment, index).status).toBe("not_ready");
  });

  it("satisfies cable requirements when all known connections are explicitly excluded, while still requiring equipment NETA", () => {
    const index = buildConnectedCableIndex(makeLayoutManifest([makeLayoutCable({ target_equipment_key: "CUPP6-01A-3" })]), null);
    expect(equipmentEnergizationReadiness(equipment, index).status).toBe("ready");
    expect(equipmentEnergizationReadiness({ ...equipment, neta_complete: false }, index).status).toBe("not_ready");
  });
  it("matches complete endpoint IDs regardless of placement, case and project prefix, without substring matches", () => {
    const cable = makeLayoutCable({ source_equipment_key: " iad06-eq-1 ", target_equipment_key: null });
    const index = buildConnectedCableIndex(makeLayoutManifest([cable, makeLayoutCable({ cable_id: "unrelated", source_equipment_key: "EQ-10" })]), null);
    expect(getConnectedCables(equipment, index)).toEqual([cable]);
  });

  it.each([
    { evidence: { eps_daily_test_status: "tested" as const }, ready: false },
    { evidence: { system_element_status: "L3: Pre Func Testing & Startup" }, ready: false },
    { evidence: { neta_complete: true }, ready: false },
    { evidence: { neta_test_report: "Report.pdf" }, ready: false },
    { evidence: { eps_daily_test_status: "failed" as const, neta_test_report: "Report.pdf" }, ready: false },
    { evidence: { mv_daily_test_status: "partially_tested", neta_test_report: "Report.pdf" }, ready: false },
    { evidence: { eps_daily_test_status: "tested" as const, neta_test_report: "N/A; none; null" }, ready: false },
    { evidence: { eps_daily_test_status: "tested" as const, neta_test_report: "Report.pdf" }, ready: true },
    { evidence: { mv_daily_test_status: "retested_and_passed", neta_test_report: "Report.pdf" }, ready: true },
    { evidence: { feeder_cable_atp_names: ["ATP.pdf"] }, ready: true },
  ])("requires both passing test evidence and a report: $evidence", ({ evidence, ready }) => {
    const index = buildConnectedCableIndex(makeLayoutManifest([makeLayoutCable(evidence)]), null);
    expect(equipmentEnergizationReadiness(equipment, index).status).toBe(ready ? "ready" : "not_ready");
    expect(equipmentEnergizationReadiness({ ...equipment, neta_complete: false }, index).status).toBe("not_ready");
    expect(equipmentEnergizationReadiness({ ...equipment, neta_complete: "true" }, index).status).toBe("not_ready");
  });

  it("requires every cable, including one-ended unresolved connections, with separate test/report counts", () => {
    const cables = [makeLayoutCable({ feeder_cable_atp_names: ["ATP.pdf"] }),
      makeLayoutCable({ cable_id: "FDR-unresolved", target_equipment_key: null, eps_daily_test_status: "tested" })];
    const index = buildConnectedCableIndex(makeLayoutManifest(cables), null)!;
    expect(connectedCableCounts(getConnectedCables(equipment, index), index)).toMatchObject({ tested: 2, withReport: 1, ready: 1 });
    expect(equipmentEnergizationReadiness(equipment, index).status).toBe("not_ready");
  });

  it("counts an exact cable PDF filed under endpoint equipment, without accepting other cable suffixes", () => {
    const cable = makeLayoutCable({ eps_daily_test_status: "tested" });
    const layout = makeLayoutManifest([cable]);
    const report = { report_name: `${cable.cable_id}-A.pdf`, url: "/report.pdf" };
    expect(equipmentEnergizationReadiness(equipment, buildConnectedCableIndex(layout, { records: [report] })).status).toBe("not_ready");
    expect(equipmentEnergizationReadiness(equipment, buildConnectedCableIndex(layout, { records: [{ ...report, report_name: `${cable.cable_id}.pdf` }] })).status).toBe("ready");
  });

  it("does not turn absent cable data or missing associations into readiness", () => {
    expect(equipmentEnergizationReadiness(equipment, null).status).toBe("unknown");
    expect(equipmentEnergizationReadiness(equipment, buildConnectedCableIndex(makeLayoutManifest([]), null)).status).toBe("unknown");
    expect(buildConnectedCableIndex({ ...makeLayoutManifest([]), cables: undefined }, null)).toBeNull();
  });

  it("keeps cable/termination and tracking exclusions out of equipment readiness", () => {
    for (const reference of [{ equipment_type: "Feeder Cable - LV" }, { equipment_type: "Termination" }, { equipment_id: "IAD06-UPS6-01" }]) {
      expect(equipmentEnergizationReadiness({ ...equipment, ...reference }, null).status).toBe("not_applicable");
    }
  });
});
