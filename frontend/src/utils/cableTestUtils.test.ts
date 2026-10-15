import { describe, expect, it } from "vitest";
import { cableTestState } from "./cableTestUtils";

describe("shared cable readiness", () => {
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
});
