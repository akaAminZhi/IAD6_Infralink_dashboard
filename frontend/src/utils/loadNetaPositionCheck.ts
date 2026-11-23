import type { NetaPositionCheck } from "../types/netaPositions";

export async function loadNetaPositionCheck(): Promise<NetaPositionCheck> {
  const response = await fetch("/data/neta_position_check.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("NETA position check has not been generated. Run the dashboard ETL.");
  const data = await response.json() as NetaPositionCheck;
  if (!Array.isArray(data.families) || !Array.isArray(data.equipment)) {
    throw new Error("NETA position check data is malformed.");
  }
  return data;
}

export const ISSUE_LABELS: Record<string, string> = {
  missing: "Missing position",
  failed_only: "FAIL only",
  retest_unordered: "FAIL + PASS, date unknown",
  result_pending: "Result pending review",
  duplicate: "Duplicate PASS",
  extra: "Not in baseline",
  needs_review: "Needs review",
  asset_equipment_conflict: "Name references other equipment",
  gc_name_mismatch: "GC name mismatch",
  complete_but_nonconforming: "NETA complete but nonconforming",
  superseded_fail: "FAIL superseded by retest",
  same_day_fail: "FAIL on the same day as PASS",
  fail_after_pass: "FAIL after PASS",
  duplicate_different_sn: "Two PASS with different SN",
  report_belongs_elsewhere: "Report belongs to other equipment",
  unresolved_position_link: "Manual report link needs review",
  pdf_unparsed: "PDF field unreadable, GC name used",
  no_reports: "No reports",
};

export function issueLabel(code: string): string {
  return ISSUE_LABELS[code] ?? code;
}
