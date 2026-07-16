import type {
  CaseIssue,
  Equipment,
  EpsTestItemRecord,
  PdmEquipmentRecord,
  PdmRecord,
} from "../types/data";
import {
  buildEpsTestItemIndex,
  getIndexedEpsTestItems,
} from "./epsTestItemUtils";
import { getNetaReportNames } from "./netaReports";

export { getNetaReportNames };

export type EquipmentNetaDisplayStatus =
  | "Complete + Report Available"
  | "Complete - Missing Report"
  | "Incomplete"
  | "Unknown";

export interface FlattenedEquipmentRow {
  row_id: string;
  pdm_name: string | null;
  module_type: string | null;
  equipment_id: string | null;
  source_equipment_label: string | null;
  display_equipment_id: string;
  equipment_type: string | null;
  status: string | null;
  parent: string | null;
  system: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  open_issues_count_from_system_elements: number | null;
  calculated_open_case_count: number | null;
  neta_complete: boolean | string | null;
  neta_completed_at: string | null;
  neta_test_report: string | null;
  neta_report_status: string | null;
  cases: CaseIssue[];
  eps_test_items: EpsTestItemRecord[];
  source: "pdms" | "equipment";
}

export interface EquipmentSummaryMetrics {
  totalEquipmentEntries: number;
  uniqueEquipmentIds: number;
  netaComplete: number;
  netaIncomplete: number;
  missingNetaReports: number;
  equipmentWithOpenCases: number;
  casesMissingIssueImage: number;
  mostCommonStatus: string | null;
  mostCommonStatusCount: number;
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

function normalizeLookup(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function firstText(...values: Array<unknown>): string | null {
  const value = values.find((candidate) => !isBlank(candidate));
  return value === undefined ? null : String(value).trim();
}

function firstNumber(...values: Array<unknown>): number | null {
  for (const value of values) {
    const parsed = asNumber(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function buildEquipmentIndex(equipmentRecords: Equipment[]): Map<string, Equipment> {
  const index = new Map<string, Equipment>();
  for (const record of equipmentRecords) {
    const key = normalizeLookup(record.equipment_id);
    if (key) {
      index.set(key, record);
    }
  }
  return index;
}

function buildCasesIndex(cases: CaseIssue[]): Map<string, CaseIssue[]> {
  const index = new Map<string, CaseIssue[]>();
  for (const caseItem of cases) {
    const key = normalizeLookup(caseItem.equipment_id);
    if (!key) {
      continue;
    }
    const records = index.get(key) ?? [];
    records.push(caseItem);
    index.set(key, records);
  }
  return index;
}

function mergeCases(primaryCases: CaseIssue[], fallbackCases: CaseIssue[]): CaseIssue[] {
  const merged: CaseIssue[] = [];
  const seen = new Set<string>();

  for (const caseItem of [...primaryCases, ...fallbackCases]) {
    const key = !isBlank(caseItem.case_id) ? String(caseItem.case_id).trim() : JSON.stringify(caseItem);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(caseItem);
  }

  return merged;
}

export function getEquipmentDisplayId(
  equipment: Pick<FlattenedEquipmentRow, "equipment_id" | "source_equipment_label"> | PdmEquipmentRecord | Equipment,
): string {
  if (!isBlank(equipment.equipment_id)) {
    return String(equipment.equipment_id).trim();
  }

  if ("source_equipment_label" in equipment && !isBlank(equipment.source_equipment_label)) {
    return String(equipment.source_equipment_label).trim();
  }

  return "Unknown equipment";
}

export function flattenEquipmentFromPdms(
  pdms: PdmRecord[],
  equipmentRecords: Equipment[] = [],
  caseRecords: CaseIssue[] = [],
  epsTestItems: EpsTestItemRecord[] = [],
): FlattenedEquipmentRow[] {
  const equipmentIndex = buildEquipmentIndex(equipmentRecords);
  const casesIndex = buildCasesIndex(caseRecords);
  const epsTestItemIndex = buildEpsTestItemIndex(epsTestItems);
  const rows: FlattenedEquipmentRow[] = [];

  pdms.forEach((pdm, pdmIndex) => {
    (pdm.equipment ?? []).forEach((equipment, equipmentIndexInPdm) => {
      const displayId = getEquipmentDisplayId(equipment);
      const enrichment = equipmentIndex.get(normalizeLookup(equipment.equipment_id));
      const fallbackCases = casesIndex.get(normalizeLookup(equipment.equipment_id)) ?? [];
      const cases = mergeCases(equipment.cases ?? [], fallbackCases);

      rows.push({
        row_id: `${displayId}-${pdm.pdm_name ?? "no-pdm"}-${pdmIndex}-${equipmentIndexInPdm}`,
        pdm_name: firstText(pdm.pdm_name),
        module_type: firstText(pdm.module_type),
        equipment_id: firstText(equipment.equipment_id),
        source_equipment_label: firstText(equipment.source_equipment_label),
        display_equipment_id: displayId,
        equipment_type: firstText(equipment.equipment_type, enrichment?.equipment_type),
        status: firstText(equipment.status, enrichment?.status),
        parent: firstText(equipment.parent, enrichment?.parent),
        system: firstText(equipment.system, enrichment?.system),
        manufacturer: firstText(equipment.manufacturer, enrichment?.manufacturer),
        model: firstText(equipment.model, enrichment?.model),
        serial_number: firstText(equipment.serial_number, enrichment?.serial_number),
        open_issues_count_from_system_elements: firstNumber(
          equipment.open_issues_count_from_system_elements,
          enrichment?.open_issues_count_from_system_elements,
        ),
        calculated_open_case_count: firstNumber(equipment.calculated_open_case_count),
        neta_complete: equipment.neta_complete ?? enrichment?.neta_complete ?? null,
        neta_completed_at: firstText(equipment.neta_completed_at, enrichment?.neta_completed_at),
        neta_test_report: firstText(equipment.neta_test_report, enrichment?.neta_test_report),
        neta_report_status: firstText(equipment.neta_report_status),
        cases,
        eps_test_items: getIndexedEpsTestItems(epsTestItemIndex, [
          equipment.equipment_id,
          equipment.source_equipment_label,
          displayId,
        ]),
        source: "pdms",
      });
    });
  });

  if (rows.length > 0) {
    return rows;
  }

  return equipmentRecords.map((equipment, index) => {
    const displayId = getEquipmentDisplayId(equipment);
    const cases = casesIndex.get(normalizeLookup(equipment.equipment_id)) ?? [];
    return {
      row_id: `${displayId}-equipment-${index}`,
      pdm_name: null,
      module_type: null,
      equipment_id: firstText(equipment.equipment_id),
      source_equipment_label: null,
      display_equipment_id: displayId,
      equipment_type: firstText(equipment.equipment_type),
      status: firstText(equipment.status),
      parent: firstText(equipment.parent),
      system: firstText(equipment.system),
      manufacturer: firstText(equipment.manufacturer),
      model: firstText(equipment.model),
      serial_number: firstText(equipment.serial_number),
      open_issues_count_from_system_elements: firstNumber(
        equipment.open_issues_count_from_system_elements,
      ),
      calculated_open_case_count: null,
      neta_complete: equipment.neta_complete ?? null,
      neta_completed_at: firstText(equipment.neta_completed_at),
      neta_test_report: firstText(equipment.neta_test_report),
      neta_report_status: null,
      cases,
      eps_test_items: getIndexedEpsTestItems(epsTestItemIndex, [
        equipment.equipment_id,
        displayId,
      ]),
      source: "equipment",
    };
  });
}

export function isOpenCase(caseItem: CaseIssue): boolean {
  if (isBlank(caseItem.status)) {
    return true;
  }

  return !CLOSED_CASE_STATUSES.has(String(caseItem.status).trim().toLowerCase());
}

export function getOpenCaseCount(equipment: FlattenedEquipmentRow): number {
  const caseCount = equipment.cases.filter(isOpenCase).length;
  if (equipment.cases.length > 0) {
    return caseCount;
  }

  const calculatedCount = asNumber(equipment.calculated_open_case_count);
  return calculatedCount ?? 0;
}

export function hasMissingIssueImage(caseItem: CaseIssue): boolean {
  return isBlank(caseItem.issue_image);
}

export function getCasesMissingIssueImageCount(equipment: FlattenedEquipmentRow): number {
  return equipment.cases.filter(hasMissingIssueImage).length;
}

export function hasMissingNetaReport(equipment: FlattenedEquipmentRow): boolean {
  return (
    equipment.neta_complete === true &&
    (isBlank(equipment.neta_test_report) || equipment.neta_report_status === "missing_report")
  );
}

export function getNetaDisplayStatus(equipment: FlattenedEquipmentRow): EquipmentNetaDisplayStatus {
  if (equipment.neta_complete === true && !hasMissingNetaReport(equipment)) {
    return "Complete + Report Available";
  }

  if (equipment.neta_complete === true && hasMissingNetaReport(equipment)) {
    return "Complete - Missing Report";
  }

  if (
    equipment.neta_complete === false ||
    equipment.neta_complete === null ||
    equipment.neta_complete === undefined
  ) {
    return "Incomplete";
  }

  return "Unknown";
}

export function getEquipmentAttentionReasons(equipment: FlattenedEquipmentRow): string[] {
  const reasons: string[] = [];
  const netaStatus = getNetaDisplayStatus(equipment);

  if (netaStatus === "Incomplete" || netaStatus === "Unknown") {
    reasons.push("NETA incomplete");
  }
  if (hasMissingNetaReport(equipment)) {
    reasons.push("Missing NETA test report");
  }
  if (getOpenCaseCount(equipment) > 0) {
    reasons.push("Open case");
  }
  if (getCasesMissingIssueImageCount(equipment) > 0) {
    reasons.push("Missing issue image");
  }

  return reasons;
}

export function getUniqueEquipmentCount(equipmentRows: FlattenedEquipmentRow[]): number {
  return new Set(
    equipmentRows.map((row) => normalizeLookup(row.display_equipment_id)).filter(Boolean),
  ).size;
}

export function groupEquipmentById(
  equipmentRows: FlattenedEquipmentRow[],
): Map<string, FlattenedEquipmentRow[]> {
  const groups = new Map<string, FlattenedEquipmentRow[]>();

  for (const row of equipmentRows) {
    const key = normalizeLookup(row.display_equipment_id) || row.row_id;
    const records = groups.get(key) ?? [];
    records.push(row);
    groups.set(key, records);
  }

  return groups;
}

export function getEquipmentSummaryMetrics(
  equipmentRows: FlattenedEquipmentRow[],
): EquipmentSummaryMetrics {
  const statusCounts = equipmentRows.reduce<Record<string, number>>((counts, row) => {
    const status = isBlank(row.status) ? "Unknown" : String(row.status).trim();
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
  const mostCommonStatus =
    Object.entries(statusCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ??
    null;

  return {
    totalEquipmentEntries: equipmentRows.length,
    uniqueEquipmentIds: getUniqueEquipmentCount(equipmentRows),
    netaComplete: equipmentRows.filter(
      (row) => getNetaDisplayStatus(row) === "Complete + Report Available",
    ).length,
    netaIncomplete: equipmentRows.filter(
      (row) => getNetaDisplayStatus(row) === "Incomplete" || getNetaDisplayStatus(row) === "Unknown",
    ).length,
    missingNetaReports: equipmentRows.filter(hasMissingNetaReport).length,
    equipmentWithOpenCases: equipmentRows.filter((row) => getOpenCaseCount(row) > 0).length,
    casesMissingIssueImage: equipmentRows.reduce(
      (total, row) => total + getCasesMissingIssueImageCount(row),
      0,
    ),
    mostCommonStatus: mostCommonStatus?.[0] ?? null,
    mostCommonStatusCount: mostCommonStatus?.[1] ?? 0,
  };
}

export function getFilterOptions(
  equipmentRows: FlattenedEquipmentRow[],
  key: keyof Pick<FlattenedEquipmentRow, "equipment_type" | "status" | "parent" | "system">,
): string[] {
  return Array.from(
    new Set(
      equipmentRows
        .map((row) => (isBlank(row[key]) ? "Unknown" : String(row[key]).trim()))
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}
