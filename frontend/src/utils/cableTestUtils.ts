/** The cable readiness rules used by MV Equipment and Layout. */
interface CableTestEvidence {
  system_element_status?: string | null;
  mv_daily_test_status?: string | null;
}

export type CableTestState = "updated" | "pending" | "partial" | "failed" | "unconfirmed";

export const CABLE_TEST_STATES: Record<CableTestState, { label: string; color: string; dash?: string }> = {
  updated: { label: "Tested + Infralink Updated", color: "#16a34a" },
  pending: { label: "Tested - Infralink Update Pending", color: "#2563eb" },
  partial: { label: "Partially Tested", color: "#d97706", dash: "7 3" },
  failed: { label: "Test Failed", color: "#dc2626", dash: "3 3" },
  unconfirmed: { label: "Testing Not Confirmed", color: "#64748b", dash: "5 4" },
};

export function isMvDailyTestPassed(evidence: CableTestEvidence): boolean {
  return ["tested_and_passed", "retested_and_passed"].includes(evidence.mv_daily_test_status ?? "");
}

export function isMvDailyTestFailed(evidence: CableTestEvidence): boolean {
  return evidence.mv_daily_test_status === "failed";
}

export function isCableInfralinkUpdated(evidence: CableTestEvidence): boolean {
  return String(evidence.system_element_status ?? "").trim().toUpperCase().replace(/\s+/g, " ") === "L3: PRE FUNC TESTING & STARTUP";
}

export function cableTestState(evidence: CableTestEvidence): CableTestState {
  if (isMvDailyTestFailed(evidence)) return "failed";
  if (isCableInfralinkUpdated(evidence)) return "updated";
  if (isMvDailyTestPassed(evidence)) return "pending";
  if (evidence.mv_daily_test_status === "partially_tested") return "partial";
  return "unconfirmed";
}
