import type { EpsTestItemRecord } from "../types/data";

export interface EpsFiltersState {
  search: string;
  status: string;
}

export type EpsTestItemFilter =
  | ""
  | "Passed"
  | "Fixed"
  | "Failed"
  | "Failure History"
  | "Not Tested"
  | "Not In Tracker";
export type EpsActivityFilter =
  | ""
  | "yesterdayPassed"
  | "yesterdayFailed"
  | "sevenDayPassed"
  | "sevenDayFailed"
  | "sevenDayRepaired"
  | "advancedDailyPassed"
  | "advancedDailyFailed"
  | "advancedCumulativePassed"
  | "advancedCumulativeFailed";

export const defaultFilters: EpsFiltersState = {
  search: "",
  status: "",
};

const testItemFilters: EpsTestItemFilter[] = [
  "Passed",
  "Fixed",
  "Failed",
  "Failure History",
  "Not Tested",
  "Not In Tracker",
];
const activityFilters: EpsActivityFilter[] = [
  "yesterdayPassed",
  "yesterdayFailed",
  "sevenDayPassed",
  "sevenDayFailed",
  "sevenDayRepaired",
  "advancedDailyPassed",
  "advancedDailyFailed",
  "advancedCumulativePassed",
  "advancedCumulativeFailed",
];

export function filtersFromSearchParams(searchParams: URLSearchParams): EpsFiltersState {
  return {
    search: searchParams.get("search")?.trim() ?? "",
    status: searchParams.get("status")?.trim() ?? "",
  };
}

export function testItemFilterFromSearchParams(searchParams: URLSearchParams): EpsTestItemFilter {
  const value = searchParams.get("testItemFilter")?.trim() ?? "";
  return testItemFilters.includes(value as EpsTestItemFilter)
    ? (value as EpsTestItemFilter)
    : "";
}

export function activityFilterFromSearchParams(searchParams: URLSearchParams): EpsActivityFilter {
  const value = searchParams.get("activityFilter")?.trim() ?? "";
  return activityFilters.includes(value as EpsActivityFilter)
    ? (value as EpsActivityFilter)
    : "";
}

export function trackerTypeFromSearchParams(searchParams: URLSearchParams): string {
  return searchParams.get("trackerType")?.trim() ?? "";
}

export function normalizeGroupKey(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function equipmentReferenceVariants(value: unknown): string[] {
  const normalized = normalizeGroupKey(value);
  if (!normalized) {
    return [];
  }

  const withoutPrefix = normalized.startsWith("IAD06-") ? normalized.slice("IAD06-".length) : normalized;
  return Array.from(new Set([normalized, withoutPrefix, `IAD06-${withoutPrefix}`]));
}

export function buildEquipmentReferenceSet(values: Array<string | null | undefined> | null | undefined): Set<string> | null {
  if (!values || values.length === 0) {
    return null;
  }

  const references = new Set<string>();
  for (const value of values) {
    for (const variant of equipmentReferenceVariants(value)) {
      references.add(variant);
    }
  }

  return references.size > 0 ? references : null;
}

export type EpsTestResult = Exclude<EpsTestItemFilter, "" | "Failure History">;

export function getTestItemResult(item: EpsTestItemRecord): EpsTestResult | null {
  switch (item.item_status) {
    case "Passed":
      return "Passed";
    case "Fixed":
    case "Fixed - Not In Tracker":
      return "Fixed";
    case "Failed":
    case "Failed - Not In Tracker":
      return "Failed";
    case "Not Tested":
    case "Incomplete":
      return "Not Tested";
    default:
      return String(item.item_status ?? "").includes("Not In Tracker") ? "Not In Tracker" : null;
  }
}

export function normalizeTrackerType(value: unknown): string {
  return String(value ?? "").trim();
}

export function isFailureHistoryResult(result: EpsTestResult | null): boolean {
  return result === "Failed" || result === "Fixed";
}

function matchesEquipmentReferences(values: unknown[], keys: Set<string> | null): boolean {
  return keys === null || values.some((value) =>
    equipmentReferenceVariants(value).some((reference) => keys.has(reference)),
  );
}

export function filterTestItems(
  items: EpsTestItemRecord[],
  {
    testItemFilter,
    trackerTypeFilter,
    equipmentKeys,
    exactItemKeys = null,
  }: {
    testItemFilter: EpsTestItemFilter;
    trackerTypeFilter: string;
    equipmentKeys: Set<string> | null;
    exactItemKeys?: Set<string> | null;
  },
  activityFilter: EpsActivityFilter,
): EpsTestItemRecord[] {
  const trackerType = trackerTypeFilter.toLowerCase();
  const needsFailed = activityFilter.endsWith("Failed");
  const needsPassed = activityFilter.endsWith("Passed") || activityFilter === "sevenDayRepaired";

  if (!testItemFilter && !trackerType && !activityFilter && equipmentKeys === null && exactItemKeys === null) {
    return items;
  }

  return items.filter((item) => {
    const result = getTestItemResult(item);
    if (testItemFilter && (testItemFilter === "Failure History"
      ? !isFailureHistoryResult(result)
      : result !== testItemFilter)) {
      return false;
    }
    if (needsFailed && result !== "Failed") {
      return false;
    }
    if (needsPassed && result !== "Passed" && result !== "Fixed" &&
        item.item_status !== "Passed - Not In Tracker") {
      return false;
    }
    if (trackerType && normalizeTrackerType(item.tracker_type).toLowerCase() !== trackerType) {
      return false;
    }

    return matchesEquipmentReferences([item.equipment_key, item.equipment_name], exactItemKeys) &&
      matchesEquipmentReferences([
        item.equipment_key,
        item.equipment_name,
        item.module_equipment_key,
        item.module_equipment,
        item.matched_equipment_id,
      ], equipmentKeys);
  });
}
