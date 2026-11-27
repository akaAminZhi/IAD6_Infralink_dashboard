import type { EpsTestItemRecord } from "../types/data";
import { getTestItemResult, isFailureHistoryResult, normalizeTrackerType, type EpsTestItemFilter, type EpsTestResult } from "./epsExecutionFilters";

interface TestItemChartDatum {
  id: EpsTestItemFilter;
  name: string;
  value: number;
  percent: number;
  color: string;
}

interface TrackerTypeChartDatum {
  id: string;
  name: string;
  value: number;
  percent: number;
  color: string;
}

const FAILED_TRACKER_TYPE_COLORS = [
  "#dc2626",
  "#f97316",
  "#f59e0b",
  "#be123c",
  "#7c3aed",
  "#2563eb",
  "#0f766e",
  "#64748b",
];

export function countTestItemResults(items: EpsTestItemRecord[]): Record<EpsTestResult, number> {
  const counts = { Passed: 0, Fixed: 0, Failed: 0, "Not In Tracker": 0, "Not Tested": 0 };
  for (const item of items) {
    const result = getTestItemResult(item);
    if (result !== null) {
      counts[result] += 1;
    }
  }
  return counts;
}

const testResultChart: Array<{ id: EpsTestResult; name: string; color: string }> = [
  { id: "Passed", name: "Passed", color: "#16a34a" },
  { id: "Fixed", name: "Fixed After Failure", color: "#0d9488" },
  { id: "Failed", name: "Current Failed", color: "#dc2626" },
  { id: "Not In Tracker", name: "Not In Tracker", color: "#2563eb" },
  { id: "Not Tested", name: "Not Tested", color: "#f59e0b" },
];

export function buildTestItemBreakdown(counts: Record<EpsTestResult, number>, total: number): TestItemChartDatum[] {
  return testResultChart
    .filter(({ id }) => counts[id] > 0)
    .map((row) => ({
      ...row,
      value: counts[row.id],
      percent: Math.round((counts[row.id] / total) * 100),
    }));
}

export function testItemFilterLabel(filter: EpsTestItemFilter): string {
  if (filter === "Fixed") return "Fixed After Failure";
  if (filter === "Failed") return "Current Failed";
  return filter || "All";
}

export function buildFailureHistoryTrackerTypeBreakdown(items: EpsTestItemRecord[]): TrackerTypeChartDatum[] {
  let total = 0;
  const counts = new Map<string, number>();

  for (const item of items) {
    if (!isFailureHistoryResult(getTestItemResult(item))) {
      continue;
    }
    total += 1;
    const trackerType = normalizeTrackerType(item.tracker_type) || "Unknown";
    counts.set(trackerType, (counts.get(trackerType) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([leftType, leftCount], [rightType, rightCount]) => {
      return rightCount - leftCount || leftType.localeCompare(rightType);
    })
    .map(([trackerType, value], index) => ({
      id: trackerType,
      name: trackerType,
      value,
      percent: Math.round((value / total) * 100),
      color: FAILED_TRACKER_TYPE_COLORS[index % FAILED_TRACKER_TYPE_COLORS.length],
    }));
}
