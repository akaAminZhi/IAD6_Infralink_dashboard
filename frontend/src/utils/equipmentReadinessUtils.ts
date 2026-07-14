import type { CaseIssue, PdmEquipmentRecord, PdmRecord } from "../types/data";

export interface FlatPdmEquipment extends PdmEquipmentRecord {
  pdm_name: string | null;
  module_type: string | null;
  pdm_open_case_count: number;
  pdm_neta_started: boolean;
}

export interface EquipmentReadinessMetrics {
  totalEquipmentLinks: number;
  matchedEquipment: number;
  unmatchedEquipment: number;
  netaComplete: number;
  netaIncomplete: number;
  netaMissingReports: number;
  equipmentWithOpenCases: number;
  totalOpenCases: number;
  netaCompletionRate: number | null;
  mostCommonStatus: string | null;
  mostCommonStatusCount: number;
}

export interface EquipmentStatusDatum {
  name: string;
  value: number;
}

export interface EquipmentTypeReadinessDatum {
  equipment_type: string;
  complete: number;
  incomplete: number;
  open_case_equipment: number;
  total: number;
}

export interface PdmRiskRow {
  pdm_name: string;
  module_type: string | null;
  risk_score: number;
  equipment_count: number;
  neta_incomplete_count: number;
  neta_missing_report_count: number;
  open_case_count: number;
  unmatched_equipment_count: number;
}

export interface EquipmentAttentionRow {
  pdm_name: string | null;
  equipment_id: string | null;
  source_equipment_label: string | null;
  equipment_type: string | null;
  status: string | null;
  neta: string;
  neta_test_report: string | null;
  open_cases: number;
  reason: string[];
  priority_score: number;
}

const CLOSED_STATUSES = new Set([
  "closed",
  "complete",
  "cancelled",
  "canceled",
  "void",
  "resolved",
]);

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function normalizeStatus(value: unknown): string {
  return isBlank(value) ? "Unknown" : String(value).trim();
}

function isMatched(equipment: PdmEquipmentRecord): boolean {
  return equipment.match_status === "matched";
}

function isUnmatched(equipment: PdmEquipmentRecord): boolean {
  return equipment.match_status === "unmatched" || equipment.match_status === "ambiguous";
}

function hasMissingNetaReport(equipment: PdmEquipmentRecord): boolean {
  return (
    equipment.neta_complete === true &&
    (isBlank(equipment.neta_test_report) || equipment.neta_report_status === "missing_report")
  );
}

function isNetaComplete(equipment: PdmEquipmentRecord): boolean {
  return equipment.neta_complete === true && !hasMissingNetaReport(equipment);
}

function isNetaIncomplete(equipment: PdmEquipmentRecord): boolean {
  return equipment.neta_complete !== true;
}

function hasPdmNetaTestingStarted(pdm: PdmRecord): boolean {
  const equipmentCount = pdm.equipment_count ?? (pdm.equipment ?? []).length;
  if (equipmentCount === 0) {
    return false;
  }

  const incompleteCount =
    pdm.neta_incomplete_count ??
    (pdm.equipment ?? []).filter((equipment) => equipment.neta_complete !== true).length;

  return incompleteCount !== equipmentCount;
}

export function isOpenCase(caseItem: CaseIssue): boolean {
  const status = caseItem.status;
  if (isBlank(status)) {
    return true;
  }
  return !CLOSED_STATUSES.has(String(status).trim().toLowerCase());
}

function openCaseCount(equipment: PdmEquipmentRecord): number {
  if ((equipment.cases ?? []).length > 0) {
    return (equipment.cases ?? []).filter(isOpenCase).length;
  }

  const calculated = equipment.calculated_open_case_count;
  if (typeof calculated === "number" && Number.isFinite(calculated)) {
    return calculated;
  }
  return 0;
}

export function flattenPdmEquipment(pdms: PdmRecord[]): FlatPdmEquipment[] {
  return pdms.flatMap((pdm) =>
    (pdm.equipment ?? []).map((equipment) => ({
      ...equipment,
      pdm_name: pdm.pdm_name ?? null,
      module_type: pdm.module_type ?? null,
      pdm_open_case_count: pdm.open_case_count ?? 0,
      pdm_neta_started: hasPdmNetaTestingStarted(pdm),
    })),
  );
}

export function getEquipmentReadinessMetrics(pdms: PdmRecord[]): EquipmentReadinessMetrics {
  const flatEquipment = flattenPdmEquipment(pdms);
  const statusDistribution = getEquipmentStatusDistribution(flatEquipment);
  const mostCommonStatus = statusDistribution[0] ?? null;
  const netaComplete = flatEquipment.filter(isNetaComplete).length;
  const netaMissingReports = flatEquipment.filter(hasMissingNetaReport).length;
  const netaIncomplete = flatEquipment.filter(isNetaIncomplete).length;
  const totalOpenCases = flatEquipment.reduce(
    (total, equipment) => total + openCaseCount(equipment),
    0,
  );
  const denominator = netaComplete + netaIncomplete + netaMissingReports;

  return {
    totalEquipmentLinks: flatEquipment.length,
    matchedEquipment: flatEquipment.filter(isMatched).length,
    unmatchedEquipment: flatEquipment.filter(isUnmatched).length,
    netaComplete,
    netaIncomplete,
    netaMissingReports,
    equipmentWithOpenCases: flatEquipment.filter((equipment) => openCaseCount(equipment) > 0)
      .length,
    totalOpenCases,
    netaCompletionRate: denominator > 0 ? netaComplete / denominator : null,
    mostCommonStatus: mostCommonStatus?.name ?? null,
    mostCommonStatusCount: mostCommonStatus?.value ?? 0,
  };
}

export function getEquipmentStatusDistribution(
  flatEquipment: FlatPdmEquipment[],
): EquipmentStatusDatum[] {
  const counts = flatEquipment.reduce<Record<string, number>>((accumulator, equipment) => {
    const status = normalizeStatus(equipment.status);
    accumulator[status] = (accumulator[status] ?? 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

export function getEquipmentTypeReadiness(
  flatEquipment: FlatPdmEquipment[],
): EquipmentTypeReadinessDatum[] {
  const rows = flatEquipment.reduce<Record<string, EquipmentTypeReadinessDatum>>(
    (accumulator, equipment) => {
      const equipmentType = isBlank(equipment.equipment_type)
        ? "Unknown"
        : String(equipment.equipment_type).trim();

      accumulator[equipmentType] ??= {
        equipment_type: equipmentType,
        complete: 0,
        incomplete: 0,
        open_case_equipment: 0,
        total: 0,
      };

      accumulator[equipmentType].total += 1;
      if (isNetaComplete(equipment)) {
        accumulator[equipmentType].complete += 1;
      } else {
        accumulator[equipmentType].incomplete += 1;
      }
      if (openCaseCount(equipment) > 0) {
        accumulator[equipmentType].open_case_equipment += 1;
      }

      return accumulator;
    },
    {},
  );

  return Object.values(rows)
    .sort((a, b) => b.total - a.total || a.equipment_type.localeCompare(b.equipment_type))
    .slice(0, 12);
}

export function getTopPdmsNeedingAttention(pdms: PdmRecord[]): PdmRiskRow[] {
  return pdms
    .map((pdm) => {
      const equipment = pdm.equipment ?? [];
      const unmatchedEquipment = equipment.filter(isUnmatched).length;
      const netaMissingReports = equipment.filter(hasMissingNetaReport).length;
      const netaIncomplete = equipment.filter(isNetaIncomplete).length;
      const openCases =
        pdm.open_case_count ??
        equipment.reduce((total, equipmentRecord) => total + openCaseCount(equipmentRecord), 0);
      const riskScore =
        unmatchedEquipment * 3 + netaMissingReports * 3 + netaIncomplete * 2 + openCases * 2;

      return {
        pdm_name: pdm.pdm_name ?? "Unknown",
        module_type: pdm.module_type ?? null,
        risk_score: riskScore,
        equipment_count: pdm.equipment_count ?? equipment.length,
        neta_incomplete_count: netaIncomplete,
        neta_missing_report_count: netaMissingReports,
        open_case_count: openCases,
        unmatched_equipment_count: unmatchedEquipment,
      };
    })
    .filter((row) => row.risk_score > 0)
    .sort((a, b) => b.risk_score - a.risk_score || a.pdm_name.localeCompare(b.pdm_name))
    .slice(0, 10);
}

export function getNetaReadinessByPdm(pdms: PdmRecord[]): PdmRiskRow[] {
  return pdms
    .map((pdm) => {
      const equipment = pdm.equipment ?? [];
      const netaMissingReports = equipment.filter(hasMissingNetaReport).length;
      const netaIncomplete = equipment.filter(isNetaIncomplete).length;
      return {
        pdm_name: pdm.pdm_name ?? "Unknown",
        module_type: pdm.module_type ?? null,
        risk_score: netaIncomplete * 2 + netaMissingReports * 3,
        equipment_count: pdm.equipment_count ?? equipment.length,
        neta_incomplete_count: netaIncomplete,
        neta_missing_report_count: netaMissingReports,
        open_case_count: pdm.open_case_count ?? 0,
        unmatched_equipment_count: equipment.filter(isUnmatched).length,
      };
    })
    .filter((row) => row.equipment_count > 0)
    .sort((a, b) => b.risk_score - a.risk_score || a.pdm_name.localeCompare(b.pdm_name))
    .slice(0, 10);
}

export function getEquipmentNeedingAttention(pdms: PdmRecord[]): EquipmentAttentionRow[] {
  return flattenPdmEquipment(pdms)
    .filter((equipment) => !isUnmatched(equipment))
    .filter((equipment) => equipment.pdm_neta_started)
    .map((equipment) => {
      const reasons: string[] = [];
      if (isNetaIncomplete(equipment)) {
        reasons.push("NETA incomplete");
      }
      if (hasMissingNetaReport(equipment)) {
        reasons.push("Missing NETA test report");
      }
      if (openCaseCount(equipment) > 0) {
        reasons.push("Open case");
      }

      const priorityScore =
        (hasMissingNetaReport(equipment) ? 3 : 0) +
        (isNetaIncomplete(equipment) ? 2 : 0) +
        openCaseCount(equipment) * 2;

      return {
        pdm_name: equipment.pdm_name,
        equipment_id: equipment.equipment_id ?? null,
        source_equipment_label: equipment.source_equipment_label ?? null,
        equipment_type: equipment.equipment_type ?? null,
        status: equipment.status ?? null,
        neta: equipment.neta_complete === true ? "Complete" : "Incomplete",
        neta_test_report: equipment.neta_test_report ?? null,
        open_cases: openCaseCount(equipment),
        reason: reasons,
        priority_score: priorityScore,
      };
    })
    .filter((row) => row.reason.length > 0)
    .sort((a, b) => b.priority_score - a.priority_score || (a.pdm_name ?? "").localeCompare(b.pdm_name ?? ""));
}
