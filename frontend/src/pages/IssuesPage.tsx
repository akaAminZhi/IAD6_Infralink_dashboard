import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { EmptyState } from "../components/common/EmptyState";
import { IssueDetailDrawer } from "../components/issues/IssueDetailDrawer";
import { IssueFilters, type IssueFiltersState } from "../components/issues/IssueFilters";
import {
  IssueSummaryCards,
  type YesterdayIssueFilter,
} from "../components/issues/IssueSummaryCards";
import { IssueTable } from "../components/issues/IssueTable";
import type { DashboardData } from "../types/data";
import {
  enrichIssuesWithPdmContext,
  getAssigneeFilterOptions,
  getInferredIssueType,
  getIssueNetaStatus,
  getIssueSummaryMetrics,
  getIssueTypeFilterOptions,
  getUniqueFilterOptions,
  hasCtReference,
  hasIssueImage,
  hasMissingNetaReportForIssue,
  issueHasAnyAssignee,
  isHighPriorityIssue,
  isIssueCreatedYesterday,
  isOpenIssue,
  isUrgentIssue,
  type EnrichedIssue,
} from "../utils/issueUtils";
import { getSearchGroups, matchesSearchQuery } from "../utils/searchUtils";

interface IssuesPageProps {
  data: DashboardData;
}

const defaultFilters: IssueFiltersState = {
  caseSearch: "",
  equipmentSearch: "",
  pdmSearch: "",
  summarySearch: "",
  issueType: "",
  status: "",
  priority: "",
  assignedTo: [],
  dueState: "",
  openOnly: false,
  missingImageOnly: false,
  urgentHighOnly: false,
  netaIncompleteOnly: false,
  missingNetaReportOnly: false,
  createdYesterdayOnly: false,
  createdSinceBaselineOnly: false,
  resolvedSinceBaselineOnly: false,
};

function getFiltersFromSearchParams(searchParams: URLSearchParams): IssueFiltersState {
  const sevenDayParam = searchParams.get("sevenDay");
  const dueStateParam = searchParams.get("dueState")?.trim() ?? "";
  const dueState = ["Overdue", "Due Soon", "No Due Date", "Normal", "Closed"].includes(
    dueStateParam,
  )
    ? (dueStateParam as IssueFiltersState["dueState"])
    : "";
  const filters: IssueFiltersState = {
    ...defaultFilters,
    dueState,
    missingImageOnly: searchParams.get("missingImageOnly") === "1",
    openOnly: searchParams.get("openOnly") === "1",
  };

  if (sevenDayParam === "new") {
    return {
      ...filters,
      createdSinceBaselineOnly: true,
    };
  }

  if (sevenDayParam === "resolved") {
    return {
      ...filters,
      resolvedSinceBaselineOnly: true,
    };
  }

  return filters;
}

function normalizeFilterValue(value: unknown): string {
  return value === null || value === undefined || String(value).trim() === ""
    ? "Unknown"
    : String(value).trim();
}

function normalizeCaseId(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function matchesIssueSummaryQuery(summary: unknown, query: string): boolean {
  const normalizedSummary = String(summary ?? "").trim().toLowerCase();
  const groups = getSearchGroups(query);

  return groups.some((terms) =>
    terms.every((term) =>
      term === "ct" || term === "cts"
        ? hasCtReference(summary)
        : normalizedSummary.includes(term),
    ),
  );
}

function filterIssues(
  issues: EnrichedIssue[],
  filters: IssueFiltersState,
  newCaseIdsSinceBaseline: Set<string>,
  resolvedCaseIdsSinceBaseline: Set<string>,
): EnrichedIssue[] {
  const caseSearch = filters.caseSearch.trim();
  const equipmentSearch = filters.equipmentSearch.trim();
  const pdmSearch = filters.pdmSearch.trim();
  const summarySearch = filters.summarySearch.trim();

  return issues.filter((issue) => {
    if (caseSearch && !matchesSearchQuery([issue.case_id], caseSearch)) {
      return false;
    }
    if (equipmentSearch && !matchesSearchQuery([issue.equipment_id], equipmentSearch)) {
      return false;
    }
    if (pdmSearch && !matchesSearchQuery([issue.pdm_name], pdmSearch)) {
      return false;
    }
    if (summarySearch && !matchesIssueSummaryQuery(issue.summary, summarySearch)) {
      return false;
    }
    if (filters.issueType && getInferredIssueType(issue) !== filters.issueType) {
      return false;
    }
    if (filters.status) {
      if (filters.status === "Open") {
        if (!isOpenIssue(issue)) {
          return false;
        }
      } else if (normalizeFilterValue(issue.status) !== filters.status) {
        return false;
      }
    }
    if (filters.priority && normalizeFilterValue(issue.priority) !== filters.priority) {
      return false;
    }
    if (filters.assignedTo.length > 0 && !issueHasAnyAssignee(issue, filters.assignedTo)) {
      return false;
    }
    if (filters.dueState && issue.due_state !== filters.dueState) {
      return false;
    }
    if (filters.openOnly && !isOpenIssue(issue)) {
      return false;
    }
    if (filters.missingImageOnly && hasIssueImage(issue)) {
      return false;
    }
    if (filters.urgentHighOnly && !isUrgentIssue(issue) && !isHighPriorityIssue(issue)) {
      return false;
    }
    if (filters.netaIncompleteOnly && getIssueNetaStatus(issue) !== "Incomplete" && getIssueNetaStatus(issue) !== "Unknown") {
      return false;
    }
    if (filters.missingNetaReportOnly && !hasMissingNetaReportForIssue(issue)) {
      return false;
    }
    if (filters.createdYesterdayOnly && !isIssueCreatedYesterday(issue)) {
      return false;
    }
    if (
      filters.createdSinceBaselineOnly &&
      !newCaseIdsSinceBaseline.has(normalizeCaseId(issue.case_id))
    ) {
      return false;
    }
    if (
      filters.resolvedSinceBaselineOnly &&
      !resolvedCaseIdsSinceBaseline.has(normalizeCaseId(issue.case_id))
    ) {
      return false;
    }

    return true;
  });
}

function getIssueStatusFilterOptions(issues: EnrichedIssue[]): string[] {
  const statuses = new Set<string>();
  for (const issue of issues) {
    statuses.add(isOpenIssue(issue) ? "Open" : normalizeFilterValue(issue.status));
  }
  return Array.from(statuses).sort((a, b) => a.localeCompare(b));
}

function getKprCaseFilterIds(data: DashboardData, filter: string): Set<string> | null {
  if (!filter) {
    return null;
  }

  const performance = data.kprSummary?.issue_performance;
  const valuesByFilter: Record<string, string[] | undefined> = {
    currentOpen: performance?.current_open_case_ids,
    monthStartOpen: performance?.month_start_open_case_ids,
    newIssues: performance?.new_issue_case_ids,
    openOver30Days: performance?.open_over_30_days_case_ids,
    overdueOpen: performance?.overdue_open_case_ids,
    resolvedIssues: performance?.resolved_issue_case_ids,
    urgentHighOpen: performance?.urgent_high_open_case_ids,
    latestOpen: data.kprSummary?.current_snapshot?.open_issue_case_ids,
  };

  return new Set((valuesByFilter[filter] ?? []).map(normalizeCaseId).filter(Boolean));
}

function dueSortValue(issue: EnrichedIssue): number {
  const order = {
    Overdue: 5,
    "Due Soon": 4,
    Normal: 3,
    "No Due Date": 2,
    Closed: 1,
  };

  return order[issue.due_state];
}

function sortIssues(issues: EnrichedIssue[]): EnrichedIssue[] {
  return [...issues].sort((a, b) => {
    return (
      dueSortValue(b) - dueSortValue(a) ||
      Number(isUrgentIssue(b)) - Number(isUrgentIssue(a)) ||
      Number(isHighPriorityIssue(b)) - Number(isHighPriorityIssue(a)) ||
      String(a.case_id ?? "").localeCompare(String(b.case_id ?? ""))
    );
  });
}

export function IssuesPage({ data }: IssuesPageProps) {
  const [searchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const kprFilterParam = searchParams.get("kprFilter")?.trim() ?? "";
  const [filters, setFilters] = useState<IssueFiltersState>(() =>
    getFiltersFromSearchParams(searchParams),
  );
  const [selectedIssue, setSelectedIssue] = useState<EnrichedIssue | null>(null);
  const [excludedIssueIds, setExcludedIssueIds] = useState<Set<string>>(
    () => new Set(),
  );

  const enrichedIssues = useMemo(
    () => enrichIssuesWithPdmContext(data.cases, data.pdms, data.equipment),
    [data.cases, data.equipment, data.pdms],
  );
  const newCaseIdsSinceBaseline = useMemo(
    () =>
      new Set(
        (data.historyComparison?.cases?.new_case_ids ?? [])
          .map(normalizeCaseId)
          .filter(Boolean),
      ),
    [data.historyComparison],
  );
  const resolvedCaseIdsSinceBaseline = useMemo(
    () =>
      new Set(
        (data.historyComparison?.cases?.resolved_case_ids ?? [])
          .map(normalizeCaseId)
          .filter(Boolean),
      ),
    [data.historyComparison],
  );
  const summaryMetrics = useMemo(() => getIssueSummaryMetrics(enrichedIssues), [enrichedIssues]);
  const kprCaseFilterIds = useMemo(
    () => getKprCaseFilterIds(data, kprFilterParam),
    [data, kprFilterParam],
  );
  const filterOptions = useMemo(
    () => ({
      statuses: getIssueStatusFilterOptions(enrichedIssues),
      priorities: getUniqueFilterOptions(enrichedIssues, "priority"),
      assignees: getAssigneeFilterOptions(enrichedIssues),
      dueStates: getUniqueFilterOptions(enrichedIssues, "due_state"),
      issueTypes: getIssueTypeFilterOptions(enrichedIssues),
    }),
    [enrichedIssues],
  );
  const filteredIssues = useMemo(
    () =>
      sortIssues(
        filterIssues(
          enrichedIssues,
          filters,
          newCaseIdsSinceBaseline,
          resolvedCaseIdsSinceBaseline,
        ).filter(
          (issue) =>
            kprCaseFilterIds === null ||
            kprCaseFilterIds.has(normalizeCaseId(issue.case_id)),
        ),
      ),
    [
      enrichedIssues,
      filters,
      kprCaseFilterIds,
      newCaseIdsSinceBaseline,
      resolvedCaseIdsSinceBaseline,
    ],
  );
  const visibleIssues = useMemo(
    () => filteredIssues.filter((issue) => !excludedIssueIds.has(issue.row_id)),
    [excludedIssueIds, filteredIssues],
  );
  const activeYesterdayFilter: YesterdayIssueFilter | null = filters.createdYesterdayOnly
    ? filters.openOnly
      ? "open"
      : filters.urgentHighOnly
        ? "urgentHigh"
        : filters.missingImageOnly
          ? "missingImage"
          : "all"
    : null;
  const activeSevenDayFilter: YesterdayIssueFilter | null = filters.createdSinceBaselineOnly
    ? filters.openOnly
      ? "open"
      : filters.urgentHighOnly
        ? "urgentHigh"
        : filters.missingImageOnly
          ? "missingImage"
          : "all"
    : filters.resolvedSinceBaselineOnly
      ? "resolved"
    : null;

  useEffect(() => {
    setFilters(getFiltersFromSearchParams(searchParams));
  }, [searchParamsKey]);

  function handleSelectYesterdayFilter(filter: YesterdayIssueFilter) {
    setSelectedIssue(null);
    setFilters({
      ...defaultFilters,
      createdYesterdayOnly: true,
      missingImageOnly: filter === "missingImage",
      openOnly: filter === "open",
      urgentHighOnly: filter === "urgentHigh",
    });
  }

  function handleSelectSevenDayFilter(filter: YesterdayIssueFilter) {
    setSelectedIssue(null);
    setFilters({
      ...defaultFilters,
      createdSinceBaselineOnly: filter !== "resolved",
      resolvedSinceBaselineOnly: filter === "resolved",
      missingImageOnly: filter === "missingImage",
      openOnly: filter === "open",
      urgentHighOnly: filter === "urgentHigh",
    });
  }

  function handleSelectStatusFilter(status: string) {
    setSelectedIssue(null);
    setFilters((currentFilters) =>
      ((status === "Open" && currentFilters.openOnly && !currentFilters.status) ||
        currentFilters.status === status) &&
      !currentFilters.createdYesterdayOnly &&
      !currentFilters.createdSinceBaselineOnly &&
      !currentFilters.resolvedSinceBaselineOnly
        ? defaultFilters
        : {
            ...defaultFilters,
            openOnly: status === "Open",
            status: status === "Open" ? "" : status,
          },
    );
  }

  function handleExcludeIssue(issue: EnrichedIssue) {
    setExcludedIssueIds((current) => {
      const next = new Set(current);
      next.add(issue.row_id);
      return next;
    });
    setSelectedIssue((current) => (current?.row_id === issue.row_id ? null : current));
  }

  if (enrichedIssues.length === 0) {
    return (
      <EmptyState
        title="No issue data found."
        description="Run python scripts/etl/run_etl.py first, then refresh this page."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <IssueSummaryCards
        activeSevenDayFilter={activeSevenDayFilter}
        activeYesterdayFilter={activeYesterdayFilter}
        activeStatusFilter={filters.openOnly ? "Open" : filters.status}
        historyComparison={data.historyComparison}
        issues={enrichedIssues}
        metrics={summaryMetrics}
        onClearSevenDayFilter={() => {
          setSelectedIssue(null);
          setFilters(defaultFilters);
        }}
        onClearYesterdayFilter={() => {
          setSelectedIssue(null);
          setFilters(defaultFilters);
        }}
        onSelectSevenDayFilter={handleSelectSevenDayFilter}
        onSelectStatusFilter={handleSelectStatusFilter}
        onSelectYesterdayFilter={handleSelectYesterdayFilter}
      />

      <IssueFilters
        assignees={filterOptions.assignees}
        dueStates={filterOptions.dueStates}
        filters={filters}
        issueTypes={filterOptions.issueTypes}
        onChange={setFilters}
        onReset={() => setFilters(defaultFilters)}
        priorities={filterOptions.priorities}
        statuses={filterOptions.statuses}
      />

      <IssueTable
        excludedCount={excludedIssueIds.size}
        issues={visibleIssues}
        onExcludeIssue={handleExcludeIssue}
        onRestoreExcluded={() => setExcludedIssueIds(new Set())}
        onSelectIssue={setSelectedIssue}
        selectedIssueId={selectedIssue?.row_id ?? null}
      />

      <IssueDetailDrawer issue={selectedIssue} onClose={() => setSelectedIssue(null)} />
    </div>
  );
}
