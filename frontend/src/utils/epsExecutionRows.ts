import type { EpsModuleExecutionRecord, EpsPdmExecutionRecord, EpsTestItemRecord, EpsTestSummary } from "../types/data";
import { normalizeGroupKey, type EpsFiltersState } from "./epsExecutionFilters";
import { statusSortValue, testItemSortValue } from "./epsExecutionStatus";
import { matchesSearchQuery } from "./searchUtils";

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function compareNames(left: unknown, right: unknown): number {
  return String(left ?? "").localeCompare(String(right ?? ""));
}

export function moduleGroupKey(pdmName: unknown, moduleKey: unknown): string {
  return `${normalizeGroupKey(pdmName)}|${normalizeGroupKey(moduleKey)}`;
}

function compareModuleStatus(a: EpsModuleExecutionRecord, b: EpsModuleExecutionRecord) {
  return statusSortValue(a.eps_test_status) - statusSortValue(b.eps_test_status);
}

export function filterModuleRecords(records: EpsModuleExecutionRecord[], filters: EpsFiltersState) {
  const search = filters.search.trim();
  return records
    .filter((record) =>
      (!filters.status || record.eps_test_status === filters.status) &&
      (!search || matchesSearchQuery([
        record.pdm_name,
        record.module_equipment,
        record.module_equipment_key,
        record.matched_equipment_id,
        record.equipment_serial_number,
        record.equipment_manufacturer,
        record.equipment_model,
      ], search)),
    )
    .sort((a, b) =>
      compareModuleStatus(a, b) ||
      compareNames(a.pdm_name, b.pdm_name) ||
      compareNames(a.module_equipment, b.module_equipment),
    );
}

export function sortPdmRows(rows: EpsPdmExecutionRecord[]) {
  return [...rows].sort((a, b) =>
    statusSortValue(a.eps_execution_status) - statusSortValue(b.eps_execution_status) ||
    asNumber(b.failed_count) - asNumber(a.failed_count) ||
    asNumber(b.partial_count) - asNumber(a.partial_count) ||
    compareNames(a.pdm_name, b.pdm_name),
  );
}

export function filterPdmRows(
  rows: EpsPdmExecutionRecord[],
  modules: EpsModuleExecutionRecord[],
  matchingItems: EpsTestItemRecord[] | null,
) {
  const modulePdmNames = new Set(modules.map((module) => normalizeGroupKey(module.pdm_name)));
  const itemPdmNames = matchingItems && new Set(matchingItems.map((item) => normalizeGroupKey(item.pdm_name)));
  return rows.filter((row) => {
    const key = normalizeGroupKey(row.pdm_name);
    return modulePdmNames.has(key) && (!itemPdmNames || itemPdmNames.has(key));
  });
}

function compareTestItemStatus(a: EpsTestItemRecord, b: EpsTestItemRecord) {
  return testItemSortValue(a.item_status) - testItemSortValue(b.item_status);
}

function compareTestItemEquipment(a: EpsTestItemRecord, b: EpsTestItemRecord) {
  return compareNames(a.equipment_name ?? a.equipment_key, b.equipment_name ?? b.equipment_key) ||
    asNumber(a.tracker_row) - asNumber(b.tracker_row);
}

export function sortTestItems(items: EpsTestItemRecord[]) {
  return [...items].sort((a, b) =>
    compareTestItemStatus(a, b) ||
    compareNames(a.pdm_name, b.pdm_name) ||
    compareNames(a.module_equipment, b.module_equipment) ||
    compareTestItemEquipment(a, b),
  );
}

function groupAndSort<T>(records: T[], keyOf: (row: T) => string, compare: (a: T, b: T) => number) {
  const groups = new Map<string, T[]>();
  for (const record of records) {
    const key = keyOf(record);
    const group = groups.get(key);
    if (group) {
      group.push(record);
    } else {
      groups.set(key, [record]);
    }
  }
  for (const group of groups.values()) {
    group.sort(compare);
  }
  return groups;
}

export function groupModulesByPdm(modules: EpsModuleExecutionRecord[]) {
  return groupAndSort(modules, (module) => normalizeGroupKey(module.pdm_name), (a, b) =>
    compareModuleStatus(a, b) || compareNames(a.module_equipment, b.module_equipment),
  );
}

export function groupTestItemsByModule(items: EpsTestItemRecord[]) {
  return groupAndSort(items, (item) => moduleGroupKey(item.pdm_name, item.module_equipment_key), (a, b) =>
    compareTestItemStatus(a, b) ||
    compareNames(a.tracker_type, b.tracker_type) ||
    compareTestItemEquipment(a, b),
  );
}

export function getStatusOptions(summary: EpsTestSummary | null): string[] {
  return Object.keys(summary?.status_counts ?? {}).sort((a, b) => statusSortValue(a) - statusSortValue(b));
}
