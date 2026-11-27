import type { EpsTestSummary, KprSummary } from "../types/data";
import type { EpsActivityFilter } from "./epsExecutionFilters";

function stringArrayDifference(
  current: Array<string | null | undefined>,
  baseline: Array<string | null | undefined>,
): string[] {
  const baselineSet = new Set(
    baseline
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  );

  return current
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .filter((value) => !baselineSet.has(value))
    .sort((left, right) => left.localeCompare(right));
}

export function getActivityHistory(summary: EpsTestSummary) {
  const history = summary.daily_history;
  const entries = history?.entries ?? [];
  const dates = history?.dates ?? entries.map((entry) => entry.date);
  return {
    entries,
    dates,
    defaultCurrentDate: history?.default_current_date ?? history?.latest_date ?? summary.source_date_label ?? "",
    defaultBaselineDate: history?.default_baseline_date ?? summary.seven_day?.baseline_date ?? dates[0] ?? "",
  };
}

export function getAdvancedActivityEquipment(
  entries: ReturnType<typeof getActivityHistory>["entries"],
  dailyDate: string,
  baselineDate: string,
  currentDate: string,
) {
  const daily = dailyDate ? entries.find(({ date }) => date === dailyDate) : undefined;
  const baseline = baselineDate ? entries.find(({ date }) => date === baselineDate) : undefined;
  const current = currentDate ? entries.find(({ date }) => date === currentDate) : undefined;
  return {
    advancedDailyPassed: daily?.daily_passed_equipment ?? [],
    advancedDailyFailed: daily?.daily_failed_equipment ?? [],
    advancedCumulativePassed: stringArrayDifference(
      current?.cumulative_passed_equipment ?? [],
      baseline?.cumulative_passed_equipment ?? [],
    ),
    advancedCumulativeFailed: stringArrayDifference(
      current?.cumulative_failed_equipment ?? [],
      baseline?.cumulative_failed_equipment ?? [],
    ),
  };
}

export function getActivityEquipmentValues(
  summary: EpsTestSummary | null,
  filter: EpsActivityFilter,
  customEquipmentValues: string[] = [],
): Array<string | null | undefined> {
  if (!summary || !filter) {
    return [];
  }

  if (filter.startsWith("advanced")) {
    return customEquipmentValues;
  }

  if (filter === "yesterdayPassed") {
    return summary.yesterday?.new_tested_equipment ?? [];
  }
  if (filter === "yesterdayFailed") {
    return summary.yesterday?.new_failed_equipment ?? [];
  }
  if (filter === "sevenDayPassed") {
    return summary.seven_day?.new_tested_equipment ?? [];
  }
  if (filter === "sevenDayFailed") {
    return summary.seven_day?.new_failed_equipment ?? [];
  }
  if (filter === "sevenDayRepaired") {
    return summary.seven_day?.repaired_equipment ?? [];
  }

  return [];
}

export function getKprActivityEquipmentValues(summary: KprSummary | null, filter: string) {
  switch (filter) {
    case "passedMonth":
      return summary?.monthly_progress.eps.daily_passed_month_equipment_ids ?? [];
    case "passedPeriodEnd":
      return summary?.monthly_progress.eps.daily_passed_period_end_equipment_ids ?? [];
    case "passedLatest":
      return summary?.current_snapshot?.eps_passed_equipment_ids ?? [];
    default:
      return null;
  }
}
