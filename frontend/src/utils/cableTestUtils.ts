/** The cable readiness rules used by MV Equipment and Layout. */
interface CableTestEvidence {
  system_element_status?: string | null;
  feeder_cable_atp_names?: string[] | null;
  feeder_cable_atp_files?: unknown[] | null;
  mv_daily_test_status?: string | null;
  mv_daily_test_date?: string | null;
  eps_daily_test_status?: string | null;
  eps_daily_test_date?: string | null;
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
  return hasInfralinkCableTestReport(evidence) ||
    String(evidence.system_element_status ?? "").trim().toUpperCase().replace(/\s+/g, " ") === "L3: PRE FUNC TESTING & STARTUP";
}

export function hasInfralinkCableTestReport(evidence: CableTestEvidence): boolean {
  return !!evidence.feeder_cable_atp_names?.some((name) => name.trim()) ||
    !!evidence.feeder_cable_atp_files?.length;
}

function latestDailyOutcome(evidence: CableTestEvidence): "failed" | "partial" | "passed" | null {
  const results: Array<{ date: string; outcome: "failed" | "partial" | "passed" }> = [];
  if (evidence.mv_daily_test_status === "failed") results.push({ date: evidence.mv_daily_test_date ?? "", outcome: "failed" });
  else if (evidence.mv_daily_test_status === "partially_tested") results.push({ date: evidence.mv_daily_test_date ?? "", outcome: "partial" });
  else if (isMvDailyTestPassed(evidence)) results.push({ date: evidence.mv_daily_test_date ?? "", outcome: "passed" });

  if (evidence.eps_daily_test_status === "failed") results.push({ date: evidence.eps_daily_test_date ?? "", outcome: "failed" });
  else if (["tested", "retested_and_passed"].includes(evidence.eps_daily_test_status ?? "")) {
    results.push({ date: evidence.eps_daily_test_date ?? "", outcome: "passed" });
  }
  if (!results.length) return null;
  const latestDate = results.map((result) => result.date).sort().at(-1);
  const latest = results.filter((result) => result.date === latestDate);
  if (latest.some((result) => result.outcome === "failed")) return "failed";
  if (latest.some((result) => result.outcome === "partial")) return "partial";
  return "passed";
}

export function cableTestState(evidence: CableTestEvidence): CableTestState {
  if (hasInfralinkCableTestReport(evidence)) return "updated";
  const dailyOutcome = latestDailyOutcome(evidence);
  if (dailyOutcome === "failed") return "failed";
  if (isCableInfralinkUpdated(evidence)) return "updated";
  if (dailyOutcome === "passed") return "pending";
  if (dailyOutcome === "partial") return "partial";
  return "unconfirmed";
}
