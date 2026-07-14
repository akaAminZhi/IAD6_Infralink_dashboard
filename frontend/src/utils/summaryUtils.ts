import type {
  CaseIssue,
  DashboardSummary,
  Equipment,
  ModuleEquipmentLink,
  PdmRecord,
} from "../types/data";

export interface ChartDatum {
  name: string;
  value: number;
  pdm_name?: string | null;
}

const CLOSED_STATUSES = new Set(["closed", "complete", "cancelled", "canceled", "void"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

export function getMetric(summary: DashboardSummary | null, key: string): unknown {
  if (!summary) {
    return null;
  }

  const metrics = summary.metrics;
  if (isRecord(metrics) && key in metrics) {
    return metrics[key];
  }

  return summary[key] ?? null;
}

export function getGroupedSummary(summary: DashboardSummary | null, key: string): unknown {
  if (!summary) {
    return null;
  }

  const groupedSummaries = summary.grouped_summaries;
  if (isRecord(groupedSummaries) && key in groupedSummaries) {
    return groupedSummaries[key];
  }

  return summary[key] ?? null;
}

export function formatNumber(value: unknown): string {
  const numberValue = asNumber(value);
  if (numberValue === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US").format(numberValue);
}

export function formatPercent(value: unknown): string {
  const numberValue = asNumber(value);
  if (numberValue === null) {
    return "—";
  }

  const percentValue = Math.abs(numberValue) <= 1 ? numberValue * 100 : numberValue;
  return `${percentValue.toFixed(1)}%`;
}

export function groupCountBy<T extends object>(
  records: T[],
  key: keyof T,
): Record<string, number> {
  return records.reduce<Record<string, number>>((counts, record) => {
    const rawValue = record[key];
    const label =
      rawValue === null || rawValue === undefined || String(rawValue).trim() === ""
        ? "Unknown"
        : String(rawValue).trim();
    counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {});
}

export function objectToChartData(value: unknown, limit?: number): ChartDatum[] {
  if (!isRecord(value)) {
    return [];
  }

  const rows = Object.entries(value)
    .map(([name, rawCount]) => ({
      name,
      value: asNumber(rawCount) ?? 0,
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  return limit ? rows.slice(0, limit) : rows;
}

export function arrayToChartData(
  value: unknown,
  nameKeys: string[],
  valueKeys: string[],
  limit?: number,
): ChartDatum[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const rows = value
    .filter(isRecord)
    .map((record) => {
      const name =
        nameKeys
          .map((key) => record[key])
          .find((candidate) => typeof candidate === "string" && candidate.trim() !== "") ??
        "Unknown";
      const metric =
        valueKeys.map((key) => asNumber(record[key])).find((candidate) => candidate !== null) ??
        0;
      return {
        name: String(name),
        value: metric,
        pdm_name: typeof record.pdm_name === "string" ? record.pdm_name : null,
      };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  return limit ? rows.slice(0, limit) : rows;
}

export function isOpenCase(caseIssue: CaseIssue): boolean {
  const status = caseIssue.status;
  if (!status) {
    return true;
  }
  return !CLOSED_STATUSES.has(status.trim().toLowerCase());
}

export function getTopPdmsByOpenCases(pdms: PdmRecord[], limit = 10): ChartDatum[] {
  return pdms
    .map((pdm) => ({
      name: pdm.pdm_name ?? "Unknown",
      value: asNumber(pdm.open_case_count) ?? countOpenCasesFromPdm(pdm),
      pdm_name: pdm.pdm_name,
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function getTopPdmsByMissingNetaReports(pdms: PdmRecord[], limit = 10): ChartDatum[] {
  return pdms
    .map((pdm) => ({
      name: pdm.pdm_name ?? "Unknown",
      value: asNumber(pdm.neta_missing_report_count) ?? countMissingNetaReportsFromPdm(pdm),
      pdm_name: pdm.pdm_name,
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function countOpenCasesFromPdm(pdm: PdmRecord): number {
  return (pdm.equipment ?? []).reduce((total, equipment) => {
    return total + (equipment.cases ?? []).filter(isOpenCase).length;
  }, 0);
}

export function countMissingNetaReportsFromPdm(pdm: PdmRecord): number {
  return (pdm.equipment ?? []).filter((equipment) => {
    return equipment.neta_complete === true && !equipment.neta_test_report;
  }).length;
}

export function countOpenCases(cases: CaseIssue[]): number {
  return cases.filter(isOpenCase).length;
}

export function countPriorityContains(cases: CaseIssue[], token: string): number {
  const normalizedToken = token.toLowerCase();
  return cases.filter((caseIssue) =>
    caseIssue.priority?.toLowerCase().includes(normalizedToken),
  ).length;
}

export function countMissingIssueImages(cases: CaseIssue[]): number {
  return cases.filter((caseIssue) => !caseIssue.issue_image?.trim()).length;
}

export function countUniqueMatchedEquipment(moduleLinks: ModuleEquipmentLink[]): number {
  return new Set(
    moduleLinks
      .filter((link) => link.match_status === "matched" && link.matched_equipment_id)
      .map((link) => link.matched_equipment_id),
  ).size;
}

export function countNetaComplete(equipment: Equipment[]): number {
  return equipment.filter((record) => record.neta_complete === true).length;
}
