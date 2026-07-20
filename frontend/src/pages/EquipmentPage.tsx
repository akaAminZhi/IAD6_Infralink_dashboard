import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { EmptyState } from "../components/common/EmptyState";
import { EquipmentDetailDrawer } from "../components/equipment/EquipmentDetailDrawer";
import {
  EquipmentFilters,
  type EquipmentFiltersState,
} from "../components/equipment/EquipmentFilters";
import {
  EquipmentSummaryCards,
  type EquipmentQuickFilter,
} from "../components/equipment/EquipmentSummaryCards";
import { EquipmentTable } from "../components/equipment/EquipmentTable";
import type { DashboardData } from "../types/data";
import {
  flattenEquipmentFromPdms,
  getCasesMissingIssueImageCount,
  getEquipmentSummaryMetrics,
  getFilterOptions,
  getNetaDisplayStatus,
  getOpenCaseCount,
  hasMissingNetaReport,
  hasPendingCxalloyReport,
  isBlank,
  type FlattenedEquipmentRow,
} from "../utils/equipmentUtils";
import { matchesSearchQuery } from "../utils/searchUtils";

interface EquipmentPageProps {
  data: DashboardData;
}

const defaultFilters: EquipmentFiltersState = {
  equipmentSearch: "",
  pdmSearch: "",
  equipmentType: "",
  status: "",
  parent: "",
  neta: "",
  openCasesOnly: false,
  missingIssueImagesOnly: false,
  missingNetaReportOnly: false,
  newNetaCompleteOnly: false,
  cxalloyPendingOnly: false,
};

function normalizeFilterValue(value: unknown): string {
  return isBlank(value) ? "Unknown" : String(value).trim();
}

function filterEquipmentRows(
  rows: FlattenedEquipmentRow[],
  filters: EquipmentFiltersState,
  newNetaCompleteIds: Set<string>,
): FlattenedEquipmentRow[] {
  const equipmentSearch = filters.equipmentSearch.trim();
  const pdmSearch = filters.pdmSearch.trim();

  return rows.filter((row) => {
    if (
      equipmentSearch &&
      !matchesSearchQuery(
        [row.display_equipment_id, row.equipment_id, row.source_equipment_label],
        equipmentSearch,
      )
    ) {
      return false;
    }
    if (pdmSearch && !matchesSearchQuery([row.pdm_name], pdmSearch)) {
      return false;
    }
    if (filters.equipmentType && normalizeFilterValue(row.equipment_type) !== filters.equipmentType) {
      return false;
    }
    if (filters.status && normalizeFilterValue(row.status) !== filters.status) {
      return false;
    }
    if (filters.parent && normalizeFilterValue(row.parent) !== filters.parent) {
      return false;
    }
    const netaStatus = getNetaDisplayStatus(row);
    if (filters.neta === "complete" && netaStatus !== "Complete + Report Available") {
      return false;
    }
    if (filters.neta === "incomplete" && netaStatus !== "Incomplete" && netaStatus !== "Unknown") {
      return false;
    }
    if (filters.neta === "complete_missing_report" && netaStatus !== "Complete - Missing Report") {
      return false;
    }
    if (filters.openCasesOnly && getOpenCaseCount(row) === 0) {
      return false;
    }
    if (filters.missingIssueImagesOnly && getCasesMissingIssueImageCount(row) === 0) {
      return false;
    }
    if (filters.missingNetaReportOnly && !hasMissingNetaReport(row)) {
      return false;
    }
    if (filters.cxalloyPendingOnly && !hasPendingCxalloyReport(row)) {
      return false;
    }
    if (
      filters.newNetaCompleteOnly &&
      ![
        row.display_equipment_id,
        row.equipment_id,
        row.source_equipment_label,
      ].some((value) => newNetaCompleteIds.has(normalizeEquipmentKey(value)))
    ) {
      return false;
    }

    return true;
  });
}

function sortEquipmentRows(rows: FlattenedEquipmentRow[]): FlattenedEquipmentRow[] {
  return [...rows].sort((a, b) => {
    return (
      getOpenCaseCount(b) - getOpenCaseCount(a) ||
      getCasesMissingIssueImageCount(b) - getCasesMissingIssueImageCount(a) ||
      Number(hasMissingNetaReport(b)) - Number(hasMissingNetaReport(a)) ||
      a.display_equipment_id.localeCompare(b.display_equipment_id)
    );
  });
}

function normalizeEquipmentKey(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function getActiveQuickFilter(filters: EquipmentFiltersState): EquipmentQuickFilter | null {
  if (filters.openCasesOnly) {
    return "openCases";
  }
  if (filters.missingNetaReportOnly) {
    return "missingNetaReport";
  }
  if (filters.missingIssueImagesOnly) {
    return "missingIssueImages";
  }
  if (filters.neta === "complete") {
    return "netaComplete";
  }
  if (filters.newNetaCompleteOnly) {
    return "recentNetaComplete";
  }
  if (filters.cxalloyPendingOnly) {
    return "cxalloyPending";
  }

  return null;
}

function getFiltersForQuickFilter(filter: string | null): EquipmentFiltersState {
  if (filter === "openCases") {
    return { ...defaultFilters, openCasesOnly: true };
  }
  if (filter === "missingNetaReport") {
    return { ...defaultFilters, missingNetaReportOnly: true };
  }
  if (filter === "missingIssueImages") {
    return { ...defaultFilters, missingIssueImagesOnly: true };
  }
  if (filter === "netaComplete") {
    return { ...defaultFilters, neta: "complete" };
  }
  if (filter === "recentNetaComplete") {
    return { ...defaultFilters, newNetaCompleteOnly: true };
  }
  if (filter === "cxalloyPending") {
    return { ...defaultFilters, cxalloyPendingOnly: true };
  }

  return defaultFilters;
}

function getNewNetaCompleteIds(data: DashboardData): Set<string> {
  return new Set(
    (data.historyComparison?.neta_complete?.new_equipment_ids ?? [])
      .map(normalizeEquipmentKey)
      .filter(Boolean),
  );
}

function getNewNetaCompleteDisplayCount(
  equipmentRows: FlattenedEquipmentRow[],
  newNetaCompleteIds: Set<string>,
): number {
  return new Set(
    equipmentRows
      .filter((row) =>
        [
          row.display_equipment_id,
          row.equipment_id,
          row.source_equipment_label,
        ].some((value) => newNetaCompleteIds.has(normalizeEquipmentKey(value))),
      )
      .map((row) => normalizeEquipmentKey(row.display_equipment_id))
      .filter(Boolean),
  ).size;
}

export function EquipmentPage({ data }: EquipmentPageProps) {
  const [searchParams] = useSearchParams();
  const quickFilterParam = searchParams.get("quickFilter");
  const [filters, setFilters] = useState<EquipmentFiltersState>(() =>
    getFiltersForQuickFilter(quickFilterParam),
  );
  const [selectedEquipment, setSelectedEquipment] = useState<FlattenedEquipmentRow | null>(null);
  const deferredFilters = useDeferredValue(filters);

  const equipmentRows = useMemo(
    () =>
      flattenEquipmentFromPdms(
        data.pdms,
        data.equipment,
        data.cases,
        data.epsTestItems,
        data.cxalloyReportStatus,
      ),
    [data.cases, data.cxalloyReportStatus, data.epsTestItems, data.equipment, data.pdms],
  );
  const summaryMetrics = useMemo(() => getEquipmentSummaryMetrics(equipmentRows), [equipmentRows]);
  const newNetaCompleteIds = useMemo(() => getNewNetaCompleteIds(data), [data]);
  const newNetaCompleteCount = useMemo(
    () => getNewNetaCompleteDisplayCount(equipmentRows, newNetaCompleteIds),
    [equipmentRows, newNetaCompleteIds],
  );
  const filterOptions = useMemo(
    () => ({
      equipmentTypes: getFilterOptions(equipmentRows, "equipment_type"),
      statuses: getFilterOptions(equipmentRows, "status"),
      parents: getFilterOptions(equipmentRows, "parent"),
    }),
    [equipmentRows],
  );
  const filteredRows = useMemo(
    () => sortEquipmentRows(filterEquipmentRows(equipmentRows, deferredFilters, newNetaCompleteIds)),
    [deferredFilters, equipmentRows, newNetaCompleteIds],
  );
  const selectedGroup = useMemo(() => {
    if (!selectedEquipment) {
      return [];
    }
    const groupKey = normalizeEquipmentKey(selectedEquipment.display_equipment_id);
    const associatedRows = equipmentRows.filter(
      (row) => normalizeEquipmentKey(row.display_equipment_id) === groupKey,
    );
    return associatedRows.length > 0 ? associatedRows : [selectedEquipment];
  }, [equipmentRows, selectedEquipment]);
  const activeQuickFilter = getActiveQuickFilter(filters);

  useEffect(() => {
    setFilters(getFiltersForQuickFilter(quickFilterParam));
  }, [quickFilterParam]);

  function handleQuickFilter(filter: EquipmentQuickFilter) {
    if (activeQuickFilter === filter) {
      setFilters(defaultFilters);
      return;
    }

    setFilters({
      ...defaultFilters,
      cxalloyPendingOnly: filter === "cxalloyPending",
      missingIssueImagesOnly: filter === "missingIssueImages",
      missingNetaReportOnly: filter === "missingNetaReport",
      newNetaCompleteOnly: filter === "recentNetaComplete",
      neta: filter === "netaComplete" ? "complete" : "",
      openCasesOnly: filter === "openCases",
    });
  }

  if (equipmentRows.length === 0) {
    return (
      <EmptyState
        title="No equipment data found."
        description="Run python scripts/etl/run_etl.py first, then refresh this page."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <EquipmentSummaryCards
        activeFilter={activeQuickFilter}
        historyComparison={data.historyComparison}
        metrics={summaryMetrics}
        newNetaCompleteCount={newNetaCompleteCount}
        onSelectFilter={handleQuickFilter}
      />

      <EquipmentFilters
        equipmentTypes={filterOptions.equipmentTypes}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(defaultFilters)}
        parents={filterOptions.parents}
        statuses={filterOptions.statuses}
      />

      <EquipmentTable
        onSelectEquipment={setSelectedEquipment}
        rows={filteredRows}
        selectedRowId={selectedEquipment?.row_id ?? null}
      />

      <EquipmentDetailDrawer
        associatedRows={selectedGroup}
        equipment={selectedEquipment}
        onClose={() => setSelectedEquipment(null)}
      />
    </div>
  );
}
