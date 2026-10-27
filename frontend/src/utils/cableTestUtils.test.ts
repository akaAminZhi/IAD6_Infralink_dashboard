import { describe, expect, it } from "vitest";
import { cableTestState, layoutCableMissingReport, layoutCableTestState, parseCableAttachmentNames } from "./cableTestUtils";

describe("shared cable readiness", () => {
  it("flags updated cables without report evidence while distinguishing missing local downloads", () => {
    const updated = { system_element_status: " L3: pre func testing & startup " };
    expect(layoutCableMissingReport(updated)).toBe(true);
    expect(layoutCableMissingReport({ ...updated, feeder_cable_atp_names: ["N/A", "null", " "], neta_test_report: "none; NA" })).toBe(true);
    expect(layoutCableMissingReport({ ...updated, feeder_cable_atp_names: ["ATP.pdf"] })).toBe(false);
    expect(layoutCableMissingReport({ ...updated, feeder_cable_atp_files: [{}] })).toBe(false);
    expect(layoutCableMissingReport({ ...updated, neta_test_report: "NETA.pdf" })).toBe(false);
    expect(layoutCableMissingReport({ eps_daily_test_status: "tested" })).toBe(false);
    expect(layoutCableMissingReport({ ...updated, eps_daily_test_status: "failed" })).toBe(false);
    expect(layoutCableMissingReport({})).toBe(false);
  });
  it("normalizes cable attachments like the Layout builder and rejects placeholder-only evidence", () => {
    expect(parseCableAttachmentNames(" N/A; ATP  report.pdf; atp report.PDF\nnone; NA; null ")).toEqual(["ATP report.pdf"]);
    expect(layoutCableTestState({ feeder_cable_atp_names: ["N/A", "none", " "] })).toBe("unconfirmed");
  });
  it.each([
    [{ system_element_status: " L3: pre func testing & startup " }, "updated"],
    [{ system_element_status: "L3" }, "unconfirmed"],
    [{ system_element_status: "Installation Complete" }, "unconfirmed"],
    [{ mv_daily_test_status: "tested_and_passed" }, "pending"],
    [{ mv_daily_test_status: "retested_and_passed" }, "pending"],
    [{ mv_daily_test_status: "partially_tested" }, "partial"],
    [{ mv_daily_test_status: "failed", system_element_status: "L3: Pre Func Testing & Startup" }, "failed"],
    [{ mv_daily_test_status: "partially_tested", system_element_status: "L3: Pre Func Testing & Startup" }, "updated"],
    [{ eps_daily_test_status: "tested" }, "pending"],
    [{ eps_daily_test_status: "retested_and_passed", system_element_status: "L3: Pre Func Testing & Startup" }, "updated"],
    [{ eps_daily_test_status: "failed", system_element_status: "L3: Pre Func Testing & Startup" }, "failed"],
    [{ eps_daily_test_status: "tested", eps_daily_test_date: "2026-10-15", mv_daily_test_status: "failed", mv_daily_test_date: "2026-10-14" }, "pending"],
    [{ eps_daily_test_status: "failed", eps_daily_test_date: "2026-10-15", mv_daily_test_status: "tested_and_passed", mv_daily_test_date: "2026-10-14" }, "failed"],
    [{ eps_daily_test_status: "tested", eps_daily_test_date: "2026-10-15", mv_daily_test_status: "failed", mv_daily_test_date: "2026-10-15" }, "failed"],
    [{ system_element_status: "Pre-Installation Complete", eps_daily_test_status: "tested", feeder_cable_atp_names: ["FDR-IAD06-MDB6-01A-IAD06-ATS-TX-HTP6-01A.pdf"] }, "updated"],
    [{ system_element_status: "Pre-Installation Complete", feeder_cable_atp_names: ["Cable ATP.pdf"] }, "updated"],
    [{ eps_daily_test_status: "failed", feeder_cable_atp_names: ["Cable ATP.pdf"] }, "updated"],
    [{ eps_daily_test_status: "tested", feeder_cable_atp_names: [] }, "pending"],
    [{}, "unconfirmed"],
  ])("classifies %j as %s", (evidence, expected) => expect(cableTestState(evidence)).toBe(expected));

  it("shows partial daily cable evidence as unconfirmed in Layout while keeping the shared result", () => {
    const evidence = { mv_daily_test_status: "partially_tested" };
    expect(cableTestState(evidence)).toBe("partial");
    expect(layoutCableTestState(evidence)).toBe("unconfirmed");
    expect(layoutCableTestState({ ...evidence, feeder_cable_atp_names: ["Cable ATP.pdf"] })).toBe("updated");
  });
});
