import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDown, CalendarDays, RotateCcw, X } from "lucide-react";
import { EmptyState } from "../components/common/EmptyState";
import { DailyReportAuditPanel } from "../components/eps/DailyReportAuditPanel";
import { EpsActivityCards } from "../components/eps/EpsActivityCards";
import { EpsFilters } from "../components/eps/EpsExecutionFilters";
import { StatusBreakdown } from "../components/eps/EpsStatusBreakdown";
import { EpsTestItemBreakdowns } from "../components/eps/EpsTestItemBreakdowns";
import { PdmExecutionTable } from "../components/eps/EpsPdmExecutionTable";
import { TestItemTable } from "../components/eps/EpsTestItemTable";
import { useEpsExecutionRows } from "../hooks/useEpsExecutionRows";
import type { DashboardData } from "../types/data";
import { testItemFilterLabel } from "../utils/epsExecutionBreakdown";
import {
  activityFilterFromSearchParams,
  defaultFilters,
  filtersFromSearchParams,
  testItemFilterFromSearchParams,
  trackerTypeFromSearchParams,
  type EpsActivityFilter,
  type EpsFiltersState,
  type EpsTestItemFilter,
} from "../utils/epsExecutionFilters";
import { getStatusOptions } from "../utils/epsExecutionRows";
import { formatNumber } from "../utils/formatters";
import "./EpsTestExecutionPage.css";

export function EpsTestExecutionPage({ data }: { data: DashboardData }) {
  const [searchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [filters, setFilters] = useState<EpsFiltersState>(() =>
    filtersFromSearchParams(searchParams),
  );
  const [testItemFilter, setTestItemFilter] = useState<EpsTestItemFilter>(() =>
    testItemFilterFromSearchParams(searchParams),
  );
  const [trackerTypeFilter, setTrackerTypeFilter] = useState(() =>
    trackerTypeFromSearchParams(searchParams),
  );
  const [activityFilter, setActivityFilter] = useState<EpsActivityFilter>(() =>
    activityFilterFromSearchParams(searchParams),
  );
  const [customActivityEquipmentValues, setCustomActivityEquipmentValues] = useState<string[]>([]);
  const summary = data.epsTestSummary;
  const { hasItemScope, moduleRecords, moduleTestItems, pdmRows, testItemRows } = useEpsExecutionRows(
    data,
    filters,
    {
      activityFilter,
      customActivityEquipmentValues,
      kprFilter: searchParams.get("kprFilter")?.trim() ?? "",
      testItemFilter,
      trackerTypeFilter,
    },
  );
  const statusOptions = useMemo(() => getStatusOptions(summary), [summary]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsKey);
    setFilters(filtersFromSearchParams(params));
    setTestItemFilter(testItemFilterFromSearchParams(params));
    setTrackerTypeFilter(trackerTypeFromSearchParams(params));
    setActivityFilter(activityFilterFromSearchParams(params));
    setCustomActivityEquipmentValues([]);
  }, [searchParamsKey]);

  const selectTrackerType = (trackerType: string) => {
    setTrackerTypeFilter((currentTrackerType) =>
      currentTrackerType.toLowerCase() === trackerType.toLowerCase() ? "" : trackerType,
    );
  };
  const selectAllFailureHistoryTestItems = () => {
    if (testItemFilter === "Failure History" && !trackerTypeFilter) {
      setTestItemFilter("");
      return;
    }

    setTestItemFilter("Failure History");
    setTrackerTypeFilter("");
  };
  const selectFailureHistoryTrackerType = (trackerType: string) => {
    setTestItemFilter("Failure History");
    setTrackerTypeFilter((currentTrackerType) =>
      testItemFilter === "Failure History" &&
      currentTrackerType.toLowerCase() === trackerType.toLowerCase()
        ? ""
        : trackerType,
    );
  };
  const selectActivityFilter = (filter: EpsActivityFilter, equipmentValues: string[] = []) => {
    const nextFilter = activityFilter === filter ? "" : filter;
    setActivityFilter(nextFilter);
    setCustomActivityEquipmentValues(nextFilter.startsWith("advanced") ? equipmentValues : []);
  };

  if (!summary) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <DailyReportAuditPanel audit={data.epsDailyReportAudit} />
        <EmptyState
          title="No EPS tracker execution data found."
          description="Run python scripts/etl/run_etl.py first, then refresh this page."
        />
      </div>
    );
  }

  return (
    <div className="eps-execution mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <div className="eps-page-heading">
        <div>
          <h2>EPS Tracker Execution</h2>
          <p>Track field progress, resolve failures and trace every test to its PDM.</p>
        </div>
        <div className="eps-snapshot">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          <span>EPS snapshot <strong>{summary.source_date_label || summary.snapshot_date || "Unavailable"}</strong></span>
        </div>
      </div>
      <nav aria-label="EPS page sections" className="eps-section-nav">
        <a href="#eps-progress">Execution overview</a>
        <a href="#eps-pdms">PDM &amp; test items <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /></a>
        <a href="#eps-daily-review">Daily report review <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /></a>
      </nav>
      <section id="eps-progress" aria-label="Execution overview" className="eps-section">
        <StatusBreakdown
          activeStatus={filters.status}
          onSelectStatus={(status) =>
            setFilters((currentFilters) => ({
              ...currentFilters,
              status: currentFilters.status === status ? "" : status,
            }))
          }
          summary={summary}
        />
        <EpsActivityCards
          activeFilter={activityFilter}
          onSelectFilter={selectActivityFilter}
          summary={summary}
        />
        <EpsTestItemBreakdowns
          activeFilter={testItemFilter}
          activeTrackerType={trackerTypeFilter}
          items={data.epsTestItems}
          onSelectAllFailureHistory={selectAllFailureHistoryTestItems}
          onSelectFilter={(filter) =>
            setTestItemFilter((currentFilter) => (currentFilter === filter ? "" : filter))
          }
          onSelectTrackerType={selectFailureHistoryTrackerType}
        />
      </section>
      <section id="eps-pdms" aria-label="PDM and test item details" className="eps-section">
        <div className="eps-detail-heading">
          <div>
            <h3>PDM &amp; test item details</h3>
            <p>Expand a PDM to inspect its equipment and test items.</p>
          </div>
          <span className="eps-result-count">{formatNumber(pdmRows.length)} PDMs in view</span>
        </div>
        {(testItemFilter || trackerTypeFilter || activityFilter) && (
          <div aria-label="Active execution filters" className="eps-active-filters">
            <span>Filtering by</span>
            {testItemFilter && (
              <button type="button" onClick={() => setTestItemFilter("")}>
                {testItemFilterLabel(testItemFilter)}
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Remove test result filter</span>
              </button>
            )}
            {trackerTypeFilter && (
              <button type="button" onClick={() => setTrackerTypeFilter("")}>
                {trackerTypeFilter}
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Remove tracker type filter</span>
              </button>
            )}
            {activityFilter && (
              <button type="button" onClick={() => {
                setActivityFilter("");
                setCustomActivityEquipmentValues([]);
              }}>
                Testing activity
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Remove activity filter</span>
              </button>
            )}
            <button type="button" onClick={() => {
              setTestItemFilter("");
              setTrackerTypeFilter("");
              setActivityFilter("");
              setCustomActivityEquipmentValues([]);
            }}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Clear execution filters
            </button>
          </div>
        )}
        <EpsFilters
          filters={filters}
          onChange={setFilters}
          onReset={() => setFilters(defaultFilters)}
          statuses={statusOptions}
        />
        <PdmExecutionTable
          activeTrackerType={trackerTypeFilter}
          hasItemScope={hasItemScope}
          moduleRecords={moduleRecords}
          onSelectTrackerType={selectTrackerType}
          rows={pdmRows}
          testItems={moduleTestItems}
        />
        <TestItemTable
          activeTrackerType={trackerTypeFilter}
          description={
            testItemFilter || trackerTypeFilter || activityFilter
              ? "Showing filtered test items from EPS execution data."
              : "All EPS tracker and daily-report test item records."
          }
          onClearTrackerType={() => setTrackerTypeFilter("")}
          onSelectTrackerType={selectTrackerType}
          rows={testItemRows}
          title="Test Items Table"
        />
      </section>
      <section id="eps-daily-review" aria-label="Daily report review" className="eps-section">
        <DailyReportAuditPanel audit={data.epsDailyReportAudit} />
      </section>
    </div>
  );
}
