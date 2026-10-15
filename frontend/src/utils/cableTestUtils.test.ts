import { describe, expect, it } from "vitest";
import { cableTestState } from "./cableTestUtils";

describe("shared MV cable readiness", () => {
  it.each([
    [{ system_element_status: " L3: pre func testing & startup " }, "updated"],
    [{ system_element_status: "L3" }, "unconfirmed"],
    [{ system_element_status: "Installation Complete" }, "unconfirmed"],
    [{ mv_daily_test_status: "tested_and_passed" }, "pending"],
    [{ mv_daily_test_status: "retested_and_passed" }, "pending"],
    [{ mv_daily_test_status: "partially_tested" }, "partial"],
    [{ mv_daily_test_status: "failed", system_element_status: "L3: Pre Func Testing & Startup" }, "failed"],
    [{ mv_daily_test_status: "partially_tested", system_element_status: "L3: Pre Func Testing & Startup" }, "updated"],
    [{}, "unconfirmed"],
  ])("classifies %j as %s", (evidence, expected) => expect(cableTestState(evidence)).toBe(expected));
});
