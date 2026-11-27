import { useMemo } from "react";
import type { DashboardData } from "../types/data";
import { getActivityEquipmentValues, getKprActivityEquipmentValues } from "../utils/epsExecutionActivity";
import {
  buildEquipmentReferenceSet,
  filterTestItems,
  type EpsActivityFilter,
  type EpsFiltersState,
  type EpsTestItemFilter,
} from "../utils/epsExecutionFilters";
import { filterModuleRecords, filterPdmRows, sortPdmRows, sortTestItems } from "../utils/epsExecutionRows";

export function useEpsExecutionRows(
  data: DashboardData,
  filters: EpsFiltersState,
  {
    activityFilter,
    customActivityEquipmentValues,
    kprFilter,
    testItemFilter,
    trackerTypeFilter,
  }: {
    activityFilter: EpsActivityFilter;
    customActivityEquipmentValues: string[];
    kprFilter: string;
    testItemFilter: EpsTestItemFilter;
    trackerTypeFilter: string;
  },
) {
  const activity = useMemo(() => {
    const kprEquipment = getKprActivityEquipmentValues(data.kprSummary, kprFilter);
    const equipmentKeys = buildEquipmentReferenceSet(
      kprEquipment ?? getActivityEquipmentValues(data.epsTestSummary, activityFilter, customActivityEquipmentValues),
    );
    return {
      equipmentKeys,
      // An empty KPR cohort matches no test items, while a missing cohort leaves exact matching off.
      exactItemKeys: kprEquipment === null ? null : equipmentKeys ?? new Set<string>(),
    };
  }, [activityFilter, customActivityEquipmentValues, data.epsTestSummary, data.kprSummary, kprFilter]);

  const moduleRecords = useMemo(
    () => filterModuleRecords(data.epsModuleExecution, filters),
    [data.epsModuleExecution, filters],
  );
  const sortedPdmRows = useMemo(() => sortPdmRows(data.epsPdmExecution), [data.epsPdmExecution]);

  const { testItems, moduleTestItems } = useMemo(() => {
    const itemFilters = { testItemFilter, trackerTypeFilter, equipmentKeys: activity.equipmentKeys };
    const moduleTestItems = filterTestItems(data.epsTestItems, itemFilters, activityFilter);
    // Module drill-down uses equipment scope. KPR's standalone item list uses an exact cohort.
    const testItems = activity.exactItemKeys === null
      ? moduleTestItems
      : filterTestItems(
          data.epsTestItems,
          { ...itemFilters, exactItemKeys: activity.exactItemKeys },
          "advancedCumulativePassed",
        );
    return { moduleTestItems, testItems };
  }, [activity, activityFilter, data.epsTestItems, testItemFilter, trackerTypeFilter]);

  const hasItemScope = Boolean(testItemFilter || trackerTypeFilter || activity.equipmentKeys);
  const pdmRows = useMemo(
    () => filterPdmRows(sortedPdmRows, moduleRecords, hasItemScope ? testItems : null),
    [hasItemScope, moduleRecords, sortedPdmRows, testItems],
  );
  const testItemRows = useMemo(() => sortTestItems(testItems), [testItems]);

  return { hasItemScope, moduleRecords, moduleTestItems, pdmRows, testItemRows };
}
