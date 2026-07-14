import type { CaseIssue, PdmEquipmentRecord, PdmRecord } from "../types/data";

export type PdmReadinessLevel = "Not Started" | "Good" | "Watch" | "Attention" | "Critical";

export interface PdmSummaryMetrics {
  totalPdms: number;
  totalEquipment: number;
  netaComplete: number;
  netaIncomplete: number;
  netaMissingReports: number;
  pdmsWithOpenCases: number;
  totalOpenCases: number;
  casesMissingIssueImage: number;
}

export interface PdmTableRow {
  pdm: PdmRecord;
  pdmName: string;
  moduleType: string;
  equipmentCount: number;
  netaCompleteCount: number;
  netaIncompleteCount: number;
  netaMissingReportCount: number;
  openCaseCount: number;
  casesMissingIssueImageCount: number;
  readinessScore: number;
  readinessLevel: PdmReadinessLevel;
}

const CLOSED_CASE_STATUSES = new Set([
  "closed",
  "complete",
  "cancelled",
  "canceled",
  "void",
  "resolved",
]);

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function isOpenCase(caseItem: CaseIssue): boolean {
  if (isBlank(caseItem.status)) {
    return true;
  }

  return !CLOSED_CASE_STATUSES.has(String(caseItem.status).trim().toLowerCase());
}

export function hasMissingIssueImage(caseItem: CaseIssue): boolean {
  return isBlank(caseItem.issue_image);
}

export function isNetaComplete(equipment: PdmEquipmentRecord): boolean {
  return equipment.neta_complete === true;
}

export function hasMissingNetaReport(equipment: PdmEquipmentRecord): boolean {
  return (
    isNetaComplete(equipment) &&
    (isBlank(equipment.neta_test_report) || equipment.neta_report_status === "missing_report")
  );
}

export function hasNetaTestingSignal(equipment: PdmEquipmentRecord): boolean {
  return (
    isNetaComplete(equipment) ||
    !isBlank(equipment.neta_completed_at) ||
    !isBlank(equipment.neta_test_report)
  );
}

export function getOpenCaseCountForEquipment(equipment: PdmEquipmentRecord): number {
  if ((equipment.cases ?? []).length > 0) {
    return (equipment.cases ?? []).filter(isOpenCase).length;
  }

  const calculatedOpenCases = asNumber(equipment.calculated_open_case_count);
  if (calculatedOpenCases !== null) {
    return calculatedOpenCases;
  }

  return 0;
}

export function getCasesMissingIssueImageCount(pdm: PdmRecord): number {
  return (pdm.equipment ?? []).reduce((total, equipment) => {
    return total + (equipment.cases ?? []).filter(hasMissingIssueImage).length;
  }, 0);
}

export function getPdmOpenCaseCount(pdm: PdmRecord): number {
  const equipment = pdm.equipment ?? [];
  if (equipment.some((record) => (record.cases ?? []).length > 0)) {
    return equipment.reduce((total, record) => total + getOpenCaseCountForEquipment(record), 0);
  }

  const pdmOpenCases = asNumber(pdm.open_case_count);
  if (pdmOpenCases !== null) {
    return pdmOpenCases;
  }

  return equipment.reduce((total, equipment) => {
    return total + getOpenCaseCountForEquipment(equipment);
  }, 0);
}

export function getNetaCompleteCount(pdm: PdmRecord): number {
  const sourceCount = asNumber(pdm.neta_complete_count);
  if (sourceCount !== null) {
    return sourceCount;
  }

  return (pdm.equipment ?? []).filter(isNetaComplete).length;
}

export function getNetaIncompleteCount(pdm: PdmRecord): number {
  const sourceCount = asNumber(pdm.neta_incomplete_count);
  if (sourceCount !== null) {
    return sourceCount;
  }

  return (pdm.equipment ?? []).filter((equipment) => !isNetaComplete(equipment)).length;
}

export function getMissingNetaReportCount(pdm: PdmRecord): number {
  const sourceCount = asNumber(pdm.neta_missing_report_count);
  if (sourceCount !== null) {
    return sourceCount;
  }

  return (pdm.equipment ?? []).filter(hasMissingNetaReport).length;
}

export function getPdmEquipmentCount(pdm: PdmRecord): number {
  return asNumber(pdm.equipment_count) ?? (pdm.equipment ?? []).length;
}

export function hasNetaTestingStarted(pdm: PdmRecord): boolean {
  const equipmentCount = getPdmEquipmentCount(pdm);
  if (equipmentCount === 0) {
    return false;
  }

  if ((pdm.equipment ?? []).some(hasNetaTestingSignal)) {
    return true;
  }

  return getNetaIncompleteCount(pdm) !== equipmentCount;
}

export function getPdmReadinessScore(pdm: PdmRecord): number {
  if (!hasNetaTestingStarted(pdm)) {
    return 0;
  }

  return (
    getMissingNetaReportCount(pdm) * 3 +
    getNetaIncompleteCount(pdm) * 2 +
    getPdmOpenCaseCount(pdm) * 2 +
    getCasesMissingIssueImageCount(pdm)
  );
}

export function getPdmReadinessLevel(pdm: PdmRecord): PdmReadinessLevel {
  if (!hasNetaTestingStarted(pdm)) {
    return "Not Started";
  }

  const score = getPdmReadinessScore(pdm);

  if (score === 0) {
    return "Good";
  }
  if (score < 6) {
    return "Watch";
  }
  if (score < 15) {
    return "Attention";
  }
  return "Critical";
}

export function getPdmSummaryMetrics(pdms: PdmRecord[]): PdmSummaryMetrics {
  return pdms.reduce<PdmSummaryMetrics>(
    (metrics, pdm) => {
      const equipment = pdm.equipment ?? [];
      const openCases = getPdmOpenCaseCount(pdm);
      const missingIssueImages = getCasesMissingIssueImageCount(pdm);

      metrics.totalPdms += 1;
      metrics.totalEquipment += getPdmEquipmentCount(pdm);
      metrics.netaComplete += getNetaCompleteCount(pdm);
      metrics.netaIncomplete += getNetaIncompleteCount(pdm);
      metrics.netaMissingReports += getMissingNetaReportCount(pdm);
      metrics.totalOpenCases += openCases;
      metrics.casesMissingIssueImage += missingIssueImages;
      if (openCases > 0 || equipment.some((record) => getOpenCaseCountForEquipment(record) > 0)) {
        metrics.pdmsWithOpenCases += 1;
      }

      return metrics;
    },
    {
      totalPdms: 0,
      totalEquipment: 0,
      netaComplete: 0,
      netaIncomplete: 0,
      netaMissingReports: 0,
      pdmsWithOpenCases: 0,
      totalOpenCases: 0,
      casesMissingIssueImage: 0,
    },
  );
}

export function getEquipmentAttentionReasons(equipment: PdmEquipmentRecord): string[] {
  const reasons: string[] = [];

  if (!isNetaComplete(equipment)) {
    reasons.push("NETA incomplete");
  }
  if (hasMissingNetaReport(equipment)) {
    reasons.push("Missing NETA test report");
  }
  if (getOpenCaseCountForEquipment(equipment) > 0) {
    reasons.push("Open case");
  }
  if ((equipment.cases ?? []).some(hasMissingIssueImage)) {
    reasons.push("Missing issue image");
  }

  const hasUsefulDetails =
    !isBlank(equipment.equipment_id) ||
    !isBlank(equipment.source_equipment_label) ||
    !isBlank(equipment.equipment_type) ||
    !isBlank(equipment.status);
  if (!hasUsefulDetails && reasons.length === 0) {
    reasons.push("Limited equipment details");
  }

  return reasons;
}

export function getEquipmentDisplayId(equipment: PdmEquipmentRecord): string {
  if (!isBlank(equipment.equipment_id)) {
    return String(equipment.equipment_id).trim();
  }

  if (!isBlank(equipment.source_equipment_label)) {
    return String(equipment.source_equipment_label).trim();
  }

  return "Unknown equipment";
}

export function getPdmTableRows(pdms: PdmRecord[]): PdmTableRow[] {
  return pdms.map((pdm) => ({
    pdm,
    pdmName: isBlank(pdm.pdm_name) ? "Unknown PDM" : String(pdm.pdm_name).trim(),
    moduleType: isBlank(pdm.module_type) ? "Unknown" : String(pdm.module_type).trim(),
    equipmentCount: getPdmEquipmentCount(pdm),
    netaCompleteCount: getNetaCompleteCount(pdm),
    netaIncompleteCount: getNetaIncompleteCount(pdm),
    netaMissingReportCount: getMissingNetaReportCount(pdm),
    openCaseCount: getPdmOpenCaseCount(pdm),
    casesMissingIssueImageCount: getCasesMissingIssueImageCount(pdm),
    readinessScore: getPdmReadinessScore(pdm),
    readinessLevel: getPdmReadinessLevel(pdm),
  }));
}

export function getModuleTypeOptions(pdms: PdmRecord[]): string[] {
  return Array.from(
    new Set(
      pdms
        .map((pdm) => (isBlank(pdm.module_type) ? "Unknown" : String(pdm.module_type).trim()))
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}
