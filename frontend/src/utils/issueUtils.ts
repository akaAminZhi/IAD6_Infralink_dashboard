import type { CaseIssue, Equipment, PdmRecord } from "../types/data";
import { getNetaReportNames } from "./netaReports";

export type IssueDueState = "Overdue" | "Due Soon" | "No Due Date" | "Normal" | "Closed";

export type IssueNetaStatus =
  | "Complete + Report"
  | "Complete - Missing Report"
  | "Incomplete"
  | "Unknown";

export interface EnrichedIssue {
  row_id: string;
  case_id: string | null;
  status: string | null;
  priority: string | null;
  summary: string | null;
  equipment_id: string | null;
  system_element_raw: string | null;
  assigned_to: string | null;
  reported_on: string | null;
  due_date: string | null;
  created_at: string | null;
  last_updated_at: string | null;
  issue_image: string | null;
  corrective_images: string | null;
  has_issue_image: boolean;
  has_corrective_images: boolean;
  due_state: IssueDueState;
  pdm_name: string | null;
  equipment_type: string | null;
  equipment_status: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  neta_complete: boolean | string | null;
  neta_completed_at: string | null;
  neta_test_report: string | null;
  neta_report_status: string | null;
}

export interface IssueSummaryMetrics {
  totalIssues: number;
  openIssues: number;
  urgentIssues: number;
  highPriorityIssues: number;
  overdueIssues: number;
  dueSoonIssues: number;
  missingIssueImage: number;
  assignedIssues: number;
}

const CLOSED_STATUSES = new Set([
  "closed",
  "complete",
  "completed",
  "cancelled",
  "canceled",
  "void",
  "resolved",
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const CT_REFERENCE_PATTERN = /(^|[^A-Z0-9])CT(?:S|\d+)?(?=$|[^A-Z0-9])/i;

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function firstText(...values: unknown[]): string | null {
  const value = values.find((candidate) => !isBlank(candidate));
  return value === undefined ? null : String(value).trim();
}

function normalizeLookup(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function parseDate(value: string | null | undefined): Date | null {
  if (isBlank(value)) {
    return null;
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getEquipmentKey(issue: CaseIssue): string {
  return normalizeLookup(issue.equipment_id || issue.system_element_raw);
}

export function isClosedStatus(status: unknown): boolean {
  if (isBlank(status)) {
    return false;
  }

  return CLOSED_STATUSES.has(String(status).trim().toLowerCase());
}

export function isOpenIssue(issue: Pick<EnrichedIssue, "status"> | CaseIssue): boolean {
  return !isClosedStatus(issue.status);
}

export function isUrgentIssue(issue: Pick<EnrichedIssue, "priority"> | CaseIssue): boolean {
  return String(issue.priority ?? "").toLowerCase().includes("urgent");
}

export function isHighPriorityIssue(issue: Pick<EnrichedIssue, "priority"> | CaseIssue): boolean {
  return String(issue.priority ?? "").toLowerCase().includes("high");
}

export function getInferredIssueType(
  issue: Pick<EnrichedIssue, "summary"> | Pick<CaseIssue, "summary">,
): string {
  const summary = String(issue.summary ?? "").trim();
  const explicitType = summary.match(/^\s*Type\s*:\s*([^\r\n,;]+)/im)?.[1]?.trim();

  if (explicitType) {
    return /^CTS?$/i.test(explicitType) ? "CT" : explicitType;
  }
  if (hasCtReference(summary)) {
    return "CT";
  }
  return "Other";
}

export function hasCtReference(summary: unknown): boolean {
  return CT_REFERENCE_PATTERN.test(String(summary ?? ""));
}

export function getIssueTypeFilterOptions(issues: EnrichedIssue[]): string[] {
  return [...new Set(issues.map(getInferredIssueType))].sort((left, right) => {
    if (left === "Other") return 1;
    if (right === "Other") return -1;
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
  });
}

export function hasIssueImage(issue: Pick<EnrichedIssue, "issue_image"> | CaseIssue): boolean {
  return !isBlank(issue.issue_image);
}

export function hasCorrectiveImages(
  issue: Pick<EnrichedIssue, "corrective_images"> | CaseIssue,
): boolean {
  return !isBlank(issue.corrective_images);
}

export function getAssignedToNames(value: string | null | undefined): string[] {
  if (isBlank(value)) {
    return [];
  }

  const names: string[] = [];
  let current = "";
  let parenthesisDepth = 0;

  for (const character of String(value)) {
    if (character === "(") {
      parenthesisDepth += 1;
      current += character;
      continue;
    }

    if (character === ")") {
      parenthesisDepth = Math.max(0, parenthesisDepth - 1);
      current += character;
      continue;
    }

    if (character === "," && parenthesisDepth === 0) {
      const name = current.trim();
      if (name) {
        names.push(name);
      }
      current = "";
      continue;
    }

    current += character;
  }

  const finalName = current.trim();
  if (finalName) {
    names.push(finalName);
  }

  return names;
}

export function issueHasAnyAssignee(issue: EnrichedIssue, selectedAssignees: string[]): boolean {
  if (selectedAssignees.length === 0) {
    return true;
  }

  const selected = new Set(selectedAssignees.map((name) => normalizeLookup(name)));
  return getAssignedToNames(issue.assigned_to).some((name) => selected.has(normalizeLookup(name)));
}

export function isIssueCreatedYesterday(
  issue: Pick<EnrichedIssue, "created_at"> | CaseIssue,
  today = new Date(),
): boolean {
  const createdAt = parseDate(issue.created_at);
  if (!createdAt) {
    return false;
  }

  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  return (
    createdAt.getFullYear() === yesterday.getFullYear() &&
    createdAt.getMonth() === yesterday.getMonth() &&
    createdAt.getDate() === yesterday.getDate()
  );
}

export function getDueState(issue: Pick<EnrichedIssue, "due_date" | "status"> | CaseIssue): IssueDueState {
  if (isClosedStatus(issue.status)) {
    return "Closed";
  }

  const dueDate = parseDate(issue.due_date);
  if (!dueDate) {
    return "No Due Date";
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueTime = dueDate.getTime();

  if (dueTime < todayStart) {
    return "Overdue";
  }

  if (dueTime <= todayStart + 7 * DAY_MS) {
    return "Due Soon";
  }

  return "Normal";
}

function buildPdmEquipmentIndex(pdms: PdmRecord[]): Map<string, EnrichedIssue[]> {
  const index = new Map<string, EnrichedIssue[]>();

  pdms.forEach((pdm) => {
    (pdm.equipment ?? []).forEach((equipment) => {
      const key = normalizeLookup(equipment.equipment_id);
      if (!key) {
        return;
      }

      const context: EnrichedIssue = {
        row_id: "",
        case_id: null,
        status: null,
        priority: null,
        summary: null,
        equipment_id: firstText(equipment.equipment_id),
        system_element_raw: null,
        assigned_to: null,
        reported_on: null,
        due_date: null,
        created_at: null,
        last_updated_at: null,
        issue_image: null,
        corrective_images: null,
        has_issue_image: false,
        has_corrective_images: false,
        due_state: "No Due Date",
        pdm_name: firstText(pdm.pdm_name),
        equipment_type: firstText(equipment.equipment_type),
        equipment_status: firstText(equipment.status),
        manufacturer: firstText(equipment.manufacturer),
        model: firstText(equipment.model),
        serial_number: firstText(equipment.serial_number),
        neta_complete: equipment.neta_complete ?? null,
        neta_completed_at: firstText(equipment.neta_completed_at),
        neta_test_report: firstText(equipment.neta_test_report),
        neta_report_status: firstText(equipment.neta_report_status),
      };

      const records = index.get(key) ?? [];
      records.push(context);
      index.set(key, records);
    });
  });

  return index;
}

function buildEquipmentFallbackIndex(equipmentRecords: Equipment[]): Map<string, Equipment> {
  const index = new Map<string, Equipment>();
  for (const equipment of equipmentRecords) {
    const key = normalizeLookup(equipment.equipment_id);
    if (key) {
      index.set(key, equipment);
    }
  }
  return index;
}

export function enrichIssuesWithPdmContext(
  cases: CaseIssue[],
  pdms: PdmRecord[],
  equipmentRecords: Equipment[] = [],
): EnrichedIssue[] {
  const pdmEquipmentIndex = buildPdmEquipmentIndex(pdms);
  const equipmentFallbackIndex = buildEquipmentFallbackIndex(equipmentRecords);

  return cases.map((caseItem, index) => {
    const equipmentKey = getEquipmentKey(caseItem);
    const pdmContexts = pdmEquipmentIndex.get(equipmentKey) ?? [];
    const pdmContext = pdmContexts[0] ?? null;
    const equipmentFallback = equipmentFallbackIndex.get(equipmentKey) ?? null;
    const issueImage = firstText(caseItem.issue_image);
    const correctiveImages = firstText(caseItem.corrective_images);
    const dueState = getDueState(caseItem);

    return {
      row_id: `${caseItem.case_id ?? "case"}-${equipmentKey || index}-${index}`,
      case_id: firstText(caseItem.case_id),
      status: firstText(caseItem.status),
      priority: firstText(caseItem.priority),
      summary: firstText(caseItem.summary),
      equipment_id: firstText(caseItem.equipment_id, caseItem.system_element_raw),
      system_element_raw: firstText(caseItem.system_element_raw),
      assigned_to: firstText(caseItem.assigned_to),
      reported_on: firstText(caseItem.reported_on),
      due_date: firstText(caseItem.due_date),
      created_at: firstText(caseItem.created_at),
      last_updated_at: firstText(caseItem.last_updated_at),
      issue_image: issueImage,
      corrective_images: correctiveImages,
      has_issue_image: !isBlank(issueImage),
      has_corrective_images: !isBlank(correctiveImages),
      due_state: dueState,
      pdm_name: pdmContext?.pdm_name ?? null,
      equipment_type: firstText(pdmContext?.equipment_type, equipmentFallback?.equipment_type),
      equipment_status: firstText(pdmContext?.equipment_status, equipmentFallback?.status),
      manufacturer: firstText(pdmContext?.manufacturer, equipmentFallback?.manufacturer),
      model: firstText(pdmContext?.model, equipmentFallback?.model),
      serial_number: firstText(pdmContext?.serial_number, equipmentFallback?.serial_number),
      neta_complete: pdmContext?.neta_complete ?? equipmentFallback?.neta_complete ?? null,
      neta_completed_at: firstText(pdmContext?.neta_completed_at, equipmentFallback?.neta_completed_at),
      neta_test_report: firstText(pdmContext?.neta_test_report, equipmentFallback?.neta_test_report),
      neta_report_status: pdmContext?.neta_report_status ?? null,
    };
  });
}

export function getIssueNetaStatus(issue: EnrichedIssue): IssueNetaStatus {
  if (issue.neta_complete === true && !hasMissingNetaReportForIssue(issue)) {
    return "Complete + Report";
  }

  if (issue.neta_complete === true && hasMissingNetaReportForIssue(issue)) {
    return "Complete - Missing Report";
  }

  if (issue.neta_complete === false || issue.neta_complete === null || issue.neta_complete === undefined) {
    return "Incomplete";
  }

  return "Unknown";
}

export function hasMissingNetaReportForIssue(issue: EnrichedIssue): boolean {
  return (
    issue.neta_complete === true &&
    (isBlank(issue.neta_test_report) || issue.neta_report_status === "missing_report")
  );
}

export function getIssueSummaryMetrics(issues: EnrichedIssue[]): IssueSummaryMetrics {
  return issues.reduce<IssueSummaryMetrics>(
    (metrics, issue) => {
      metrics.totalIssues += 1;
      if (isOpenIssue(issue)) {
        metrics.openIssues += 1;
      }
      if (isUrgentIssue(issue)) {
        metrics.urgentIssues += 1;
      }
      if (isHighPriorityIssue(issue)) {
        metrics.highPriorityIssues += 1;
      }
      if (issue.due_state === "Overdue") {
        metrics.overdueIssues += 1;
      }
      if (issue.due_state === "Due Soon") {
        metrics.dueSoonIssues += 1;
      }
      if (!hasIssueImage(issue)) {
        metrics.missingIssueImage += 1;
      }
      if (!isBlank(issue.assigned_to)) {
        metrics.assignedIssues += 1;
      }

      return metrics;
    },
    {
      totalIssues: 0,
      openIssues: 0,
      urgentIssues: 0,
      highPriorityIssues: 0,
      overdueIssues: 0,
      dueSoonIssues: 0,
      missingIssueImage: 0,
      assignedIssues: 0,
    },
  );
}

export function getUniqueFilterOptions(
  issues: EnrichedIssue[],
  field: keyof Pick<EnrichedIssue, "status" | "priority" | "assigned_to" | "due_state">,
): string[] {
  return Array.from(
    new Set(
      issues
        .map((issue) => (isBlank(issue[field]) ? "Unknown" : String(issue[field]).trim()))
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

export function getAssigneeFilterOptions(issues: EnrichedIssue[]): string[] {
  return Array.from(
    new Set(issues.flatMap((issue) => getAssignedToNames(issue.assigned_to))),
  ).sort((a, b) => a.localeCompare(b));
}

export function getIssueImageReferences(value: string | null | undefined): string[] {
  if (isBlank(value)) {
    return [];
  }

  return String(value)
    .split(/[;\r\n]+/)
    .map((reference) => reference.trim())
    .filter(Boolean);
}

export function getCorrectiveImageReferences(value: string | null | undefined): string[] {
  return getIssueImageReferences(value);
}

export function getNetaReportReferences(value: string | null | undefined): string[] {
  return getNetaReportNames(value);
}
