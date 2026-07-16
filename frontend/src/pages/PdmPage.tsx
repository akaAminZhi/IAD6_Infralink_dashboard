import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { EmptyState } from "../components/common/EmptyState";
import {
  PdmFilters,
  type PdmQuickFilter,
  type PdmFiltersState,
} from "../components/pdms/PdmFilters";
import { PdmDetailDrawer } from "../components/pdms/PdmDetailDrawer";
import { PdmSummaryCards } from "../components/pdms/PdmSummaryCards";
import { PdmTable } from "../components/pdms/PdmTable";
import type { DashboardData, PdmRecord } from "../types/data";
import {
  getEquipmentDisplayId,
  hasNetaTestingStarted,
  getPdmSummaryMetrics,
  getPdmTableRows,
  type PdmTableRow,
} from "../utils/pdmUtils";
import { matchesSearchQuery } from "../utils/searchUtils";

interface PdmPageProps {
  data: DashboardData;
}

const defaultFilters: PdmFiltersState = {
  search: "",
  readiness: "",
  quickFilter: "",
  openCasesOnly: false,
  netaIncompleteOnly: false,
  missingReportsOnly: false,
  missingIssueImagesOnly: false,
};

function getQuickFilter(value: string | null): PdmQuickFilter {
  if (value === "testingStarted" || value === "fullyReady" || value === "needsAttention") {
    return value;
  }

  return "";
}

function getFiltersFromSearchParams(searchParams: URLSearchParams): PdmFiltersState {
  return {
    ...defaultFilters,
    quickFilter: getQuickFilter(searchParams.get("quickFilter")),
  };
}

function normalizePdmName(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function filterRows(rows: PdmTableRow[], filters: PdmFiltersState): PdmTableRow[] {
  const search = filters.search.trim();

  return rows.filter((row) => {
    if (filters.quickFilter === "testingStarted" && !hasNetaTestingStarted(row.pdm)) {
      return false;
    }
    if (filters.quickFilter === "fullyReady" && row.readinessLevel !== "Good") {
      return false;
    }
    if (
      filters.quickFilter === "needsAttention" &&
      !["Watch", "Attention", "Critical"].includes(row.readinessLevel)
    ) {
      return false;
    }
    if (search && !rowMatchesSearch(row, search)) {
      return false;
    }
    if (filters.readiness && row.readinessLevel !== filters.readiness) {
      return false;
    }
    if (filters.openCasesOnly && row.openCaseCount === 0) {
      return false;
    }
    if (filters.netaIncompleteOnly && row.netaIncompleteCount === 0) {
      return false;
    }
    if (filters.missingReportsOnly && row.netaMissingReportCount === 0) {
      return false;
    }
    if (filters.missingIssueImagesOnly && row.casesMissingIssueImageCount === 0) {
      return false;
    }

    return true;
  });
}

function rowMatchesSearch(row: PdmTableRow, search: string): boolean {
  const equipmentValues = (row.pdm.equipment ?? []).flatMap((equipment) => [
    getEquipmentDisplayId(equipment),
    equipment.equipment_id,
    equipment.source_equipment_label,
  ]);

  return matchesSearchQuery([row.pdmName, ...equipmentValues], search);
}

function sortRowsForDefaultReadinessView(rows: PdmTableRow[]): PdmTableRow[] {
  return [...rows].sort((a, b) => {
    const aPartialNeta = hasNetaTestingStarted(a.pdm) && a.netaIncompleteCount > 0 ? 1 : 0;
    const bPartialNeta = hasNetaTestingStarted(b.pdm) && b.netaIncompleteCount > 0 ? 1 : 0;

    return (
      bPartialNeta - aPartialNeta ||
      b.netaMissingReportCount - a.netaMissingReportCount ||
      b.openCaseCount - a.openCaseCount ||
      b.readinessScore - a.readinessScore ||
      a.pdmName.localeCompare(b.pdmName)
    );
  });
}

export function PdmPage({ data }: PdmPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParamsKey = searchParams.get("quickFilter") ?? "";
  const requestedPdmName =
    searchParams.get("pdmName")?.trim() || searchParams.get("selectedPdm")?.trim() || "";
  const [filters, setFilters] = useState<PdmFiltersState>(() =>
    getFiltersFromSearchParams(searchParams),
  );
  const [selectedPdm, setSelectedPdm] = useState<PdmRecord | null>(null);

  const summaryMetrics = useMemo(() => getPdmSummaryMetrics(data.pdms), [data.pdms]);
  const tableRows = useMemo(() => getPdmTableRows(data.pdms), [data.pdms]);
  const filteredRows = useMemo(
    () => sortRowsForDefaultReadinessView(filterRows(tableRows, filters)),
    [filters, tableRows],
  );

  useEffect(() => {
    setFilters(getFiltersFromSearchParams(searchParams));
  }, [filterParamsKey]);

  useEffect(() => {
    if (!requestedPdmName) {
      return;
    }

    const targetRow = tableRows.find(
      (row) => normalizePdmName(row.pdmName) === normalizePdmName(requestedPdmName),
    );

    if (targetRow) {
      setSelectedPdm(targetRow.pdm);
    }
  }, [requestedPdmName, tableRows]);

  function selectPdm(row: PdmTableRow) {
    setSelectedPdm(row.pdm);
  }

  function closePdmDetail() {
    setSelectedPdm(null);
    if (!searchParams.has("pdmName") && !searchParams.has("selectedPdm")) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("pdmName");
    nextParams.delete("selectedPdm");
    setSearchParams(nextParams, { replace: true });
  }

  if (data.pdms.length === 0) {
    return (
      <EmptyState
        title="No PDM data found."
        description="Run python scripts/etl/run_etl.py first, then refresh this page."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PdmSummaryCards metrics={summaryMetrics} />

      <PdmFilters
        filters={filters}
        onChange={(nextFilters) => setFilters({ ...nextFilters, quickFilter: "" })}
        onReset={() => {
          setFilters(defaultFilters);
          setSearchParams({});
        }}
      />

      <PdmTable
        onSelectPdm={selectPdm}
        rows={filteredRows}
        selectedPdmName={selectedPdm?.pdm_name ?? null}
      />

      <PdmDetailDrawer
        epsTestItems={data.epsTestItems}
        pdm={selectedPdm}
        onClose={closePdmDetail}
      />
    </div>
  );
}
