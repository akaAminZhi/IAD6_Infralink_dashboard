import { ResponsivePie } from "@nivo/pie";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCheck,
  ChevronDown,
  CircleDashed,
  FileClock,
  Minus,
  Search,
  TimerReset,
  Wrench,
} from "lucide-react";

import { CollapsibleFilterCard } from "../components/common/CollapsibleFilterCard";
import { EmptyState } from "../components/common/EmptyState";
import { StatusBadge } from "../components/common/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import type {
  DashboardData,
  EpsModuleExecutionRecord,
  EpsPdmExecutionRecord,
  EpsTestItemRecord,
  EpsTestSummary,
} from "../types/data";
import { cn } from "../utils/cn";
import { formatNumber } from "../utils/formatters";

interface EpsTestExecutionPageProps {
  data: DashboardData;
}

interface EpsFiltersState {
  search: string;
  status: string;
}

type EpsTestItemFilter = "" | "Passed" | "Fixed" | "Failed" | "Not Tested" | "Not In Tracker";
type EpsActivityFilter =
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

const STATUS_COMPLETE = "Complete";
const STATUS_WAITING_INFRALINK_NETA = "Complete, Waiting Infralink NETA Completion";
const STATUS_FAILED = "Failed";
const STATUS_PARTIAL = "Partial";
const STATUS_NOT_STARTED = "Not Started";
const STATUS_NO_TRACKER_RECORDS = "No Tracker Records";

const defaultFilters: EpsFiltersState = {
  search: "",
  status: "",
};

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function pageCount(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function paginateRows<T>(rows: T[], page: number, pageSize: number): T[] {
  const safePage = Math.min(Math.max(page, 1), pageCount(rows.length, pageSize));
  const start = (safePage - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

function PaginationControls({
  itemLabel,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  totalItems,
}: {
  itemLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  page: number;
  pageSize: number;
  totalItems: number;
}) {
  const totalPages = pageCount(totalItems, pageSize);
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(totalItems, safePage * pageSize);

  return (
    <div className="flex flex-col gap-3 border-t pt-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <div>
        Showing {formatNumber(start)}-{formatNumber(end)} of {formatNumber(totalItems)} {itemLabel}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span>Rows</span>
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            value={pageSize}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button
          className="h-8 rounded-md border px-2 font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={safePage <= 1}
          onClick={() => onPageChange(1)}
          type="button"
        >
          First
        </button>
        <button
          className="h-8 rounded-md border px-2 font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          type="button"
        >
          Previous
        </button>
        <span className="min-w-[88px] text-center">
          Page {formatNumber(safePage)} / {formatNumber(totalPages)}
        </span>
        <button
          className="h-8 rounded-md border px-2 font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          type="button"
        >
          Next
        </button>
        <button
          className="h-8 rounded-md border px-2 font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          type="button"
        >
          Last
        </button>
      </div>
    </div>
  );
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatSnapshotDate(value: string | null | undefined): string {
  if (!value) {
    return "No baseline";
  }

  const parts = value.split("-");
  if (parts.length !== 3) {
    return value;
  }

  return `${Number(parts[1])}/${Number(parts[2])}/${parts[0]}`;
}

function matchesSearch(record: EpsModuleExecutionRecord, search: string): boolean {
  const haystack = [
    record.pdm_name,
    record.module_equipment,
    record.module_equipment_key,
    record.matched_equipment_id,
    record.equipment_serial_number,
    record.equipment_manufacturer,
    record.equipment_model,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return haystack.includes(search);
}

function filterModuleRecords(
  records: EpsModuleExecutionRecord[],
  filters: EpsFiltersState,
): EpsModuleExecutionRecord[] {
  const search = filters.search.trim().toLowerCase();

  return records
    .filter((record) => {
      if (search && !matchesSearch(record, search)) {
        return false;
      }
      if (filters.status && record.eps_test_status !== filters.status) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      return (
        statusSortValue(a.eps_test_status) - statusSortValue(b.eps_test_status) ||
        String(a.pdm_name ?? "").localeCompare(String(b.pdm_name ?? "")) ||
        String(a.module_equipment ?? "").localeCompare(String(b.module_equipment ?? ""))
      );
    });
}

function statusSortValue(status: unknown): number {
  if (status === STATUS_FAILED) {
    return 0;
  }
  if (status === STATUS_PARTIAL) {
    return 1;
  }
  if (status === STATUS_WAITING_INFRALINK_NETA) {
    return 2;
  }
  if (status === STATUS_COMPLETE) {
    return 3;
  }
  if (status === STATUS_NOT_STARTED) {
    return 4;
  }
  return 5;
}

function statusTone(status: string | null | undefined): "default" | "success" | "warning" | "danger" | "muted" {
  if (status === STATUS_COMPLETE) {
    return "success";
  }
  if (status === STATUS_FAILED) {
    return "danger";
  }
  if (status === STATUS_PARTIAL || status === STATUS_WAITING_INFRALINK_NETA) {
    return "warning";
  }
  if (status === STATUS_NOT_STARTED || status === STATUS_NO_TRACKER_RECORDS) {
    return "muted";
  }
  return "default";
}

function itemStatusTone(status: string | null | undefined): "default" | "success" | "warning" | "danger" | "muted" {
  if (status === "Passed") {
    return "success";
  }
  if (status === "Fixed" || status === "Fixed - Not In Tracker") {
    return "success";
  }
  if (status === "Passed - Not In Tracker") {
    return "default";
  }
  if (status === STATUS_FAILED || status === "Failed - Not In Tracker") {
    return "danger";
  }
  if (status === "Not Found In Tracker") {
    return "danger";
  }
  if (status === "Not Tested" || status === "Incomplete") {
    return "warning";
  }
  return "muted";
}

function itemStatusClass(status: string | null | undefined): string {
  if (status === "Passed") {
    return "border-emerald-200 bg-emerald-50/60";
  }
  if (status === "Fixed" || status === "Fixed - Not In Tracker") {
    return "border-teal-300 bg-teal-50/80";
  }
  if (status === "Passed - Not In Tracker") {
    return "border-blue-200 bg-blue-50/70";
  }
  if (status === STATUS_FAILED || status === "Failed - Not In Tracker") {
    return "border-red-300 bg-red-50/80";
  }
  if (status === "Not Found In Tracker") {
    return "border-red-300 bg-red-50/70";
  }
  if (status === "Not Tested" || status === "Incomplete") {
    return "border-amber-200 bg-amber-50/70";
  }
  return "border-border bg-background";
}

function normalizeGroupKey(value: unknown): string {
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

function buildEquipmentReferenceSet(values: Array<string | null | undefined> | null | undefined): Set<string> | null {
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

function pdmNameKey(value: unknown): string {
  return normalizeGroupKey(value);
}

function moduleGroupKey(pdmName: unknown, moduleKey: unknown): string {
  return `${pdmNameKey(pdmName)}|${normalizeGroupKey(moduleKey)}`;
}

function testItemSortValue(status: unknown): number {
  if (status === "Failed - Not In Tracker") {
    return 0;
  }
  if (status === STATUS_FAILED) {
    return 1;
  }
  if (status === "Fixed" || status === "Fixed - Not In Tracker") {
    return 2;
  }
  if (status === "Not Tested" || status === "Incomplete") {
    return 3;
  }
  if (status === "Passed - Not In Tracker") {
    return 4;
  }
  if (status === "Passed") {
    return 5;
  }
  if (status === "Not Found In Tracker") {
    return 6;
  }
  return 7;
}

function StatusPill({ status }: { status?: string | null }) {
  return <StatusBadge tone={statusTone(status)}>{status || "Unknown"}</StatusBadge>;
}

function ExpandableComment({ value }: { value: string | null | undefined }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const text = String(value ?? "").trim();

  if (!text) {
    return <span className="text-muted-foreground">--</span>;
  }

  return (
    <button
      className="block w-full text-left text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) => {
        event.stopPropagation();
        setIsExpanded((current) => !current);
      }}
      title={isExpanded ? "Click to collapse comments" : "Click to expand comments"}
      type="button"
    >
      <span className={isExpanded ? "whitespace-pre-wrap" : "line-clamp-2"}>
        {text}
      </span>
    </button>
  );
}

function getStatusOptions(summary: EpsTestSummary | null): string[] {
  return Object.keys(summary?.status_counts ?? {}).sort((a, b) => statusSortValue(a) - statusSortValue(b));
}

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

function isFailedTestItem(item: EpsTestItemRecord): boolean {
  return item.item_status === STATUS_FAILED || item.item_status === "Failed - Not In Tracker";
}

function isPassedTestItem(item: EpsTestItemRecord): boolean {
  return (
    item.item_status === "Passed" ||
    item.item_status === "Passed - Not In Tracker" ||
    item.item_status === "Fixed" ||
    item.item_status === "Fixed - Not In Tracker"
  );
}

function isFixedTestItem(item: EpsTestItemRecord): boolean {
  return item.item_status === "Fixed" || item.item_status === "Fixed - Not In Tracker";
}

function isNotInTrackerTestItem(item: EpsTestItemRecord): boolean {
  return (
    String(item.item_status ?? "").includes("Not In Tracker") &&
    !isFailedTestItem(item) &&
    !isFixedTestItem(item)
  );
}

function matchesTestItemFilter(item: EpsTestItemRecord, filter: EpsTestItemFilter): boolean {
  if (!filter) {
    return true;
  }
  if (filter === "Failed") {
    return isFailedTestItem(item);
  }
  if (filter === "Not In Tracker") {
    return isNotInTrackerTestItem(item);
  }
  if (filter === "Fixed") {
    return isFixedTestItem(item);
  }
  if (filter === "Not Tested") {
    return item.item_status === "Not Tested" || item.item_status === "Incomplete";
  }
  return item.item_status === filter;
}

function normalizeTrackerType(value: unknown): string {
  return String(value ?? "").trim();
}

function matchesTrackerTypeFilter(item: EpsTestItemRecord, trackerTypeFilter: string): boolean {
  if (!trackerTypeFilter) {
    return true;
  }
  return normalizeTrackerType(item.tracker_type).toLowerCase() === trackerTypeFilter.toLowerCase();
}

function matchesCombinedTestItemFilters(
  item: EpsTestItemRecord,
  itemFilter: EpsTestItemFilter,
  trackerTypeFilter: string,
): boolean {
  return matchesTestItemFilter(item, itemFilter) && matchesTrackerTypeFilter(item, trackerTypeFilter);
}

function matchesActivityEquipmentFilter(
  item: EpsTestItemRecord,
  activityEquipmentKeys: Set<string> | null,
): boolean {
  if (!activityEquipmentKeys) {
    return true;
  }

  const itemReferences = [
    item.equipment_key,
    item.equipment_name,
    item.module_equipment_key,
    item.module_equipment,
    item.matched_equipment_id,
  ].flatMap(equipmentReferenceVariants);

  return itemReferences.some((reference) => activityEquipmentKeys.has(reference));
}

function matchesAllTestItemFilters(
  item: EpsTestItemRecord,
  itemFilter: EpsTestItemFilter,
  trackerTypeFilter: string,
  activityFilter: EpsActivityFilter,
  activityEquipmentKeys: Set<string> | null,
): boolean {
  if (
    (activityFilter === "yesterdayFailed" ||
      activityFilter === "sevenDayFailed" ||
      activityFilter === "advancedDailyFailed" ||
      activityFilter === "advancedCumulativeFailed") &&
    !isFailedTestItem(item)
  ) {
    return false;
  }

  if (
    (activityFilter === "yesterdayPassed" ||
      activityFilter === "sevenDayPassed" ||
      activityFilter === "sevenDayRepaired" ||
      activityFilter === "advancedDailyPassed" ||
      activityFilter === "advancedCumulativePassed") &&
    !isPassedTestItem(item)
  ) {
    return false;
  }

  return (
    matchesCombinedTestItemFilters(item, itemFilter, trackerTypeFilter) &&
    matchesActivityEquipmentFilter(item, activityEquipmentKeys)
  );
}

function TrackerTypeBadge({
  activeTrackerType,
  onSelectTrackerType,
  value,
}: {
  activeTrackerType: string;
  onSelectTrackerType: (trackerType: string) => void;
  value: string | null | undefined;
}) {
  const trackerType = normalizeTrackerType(value);
  if (!trackerType) {
    return <span className="text-muted-foreground">--</span>;
  }

  const isActive = trackerType.toLowerCase() === activeTrackerType.toLowerCase();

  return (
    <button
      aria-pressed={isActive}
      className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-foreground",
      )}
      onClick={(event) => {
        event.stopPropagation();
        onSelectTrackerType(trackerType);
      }}
      type="button"
    >
      {trackerType}
    </button>
  );
}

function buildTestItemBreakdown(items: EpsTestItemRecord[]): TestItemChartDatum[] {
  const total = items.length || 1;
  const rows: Array<Omit<TestItemChartDatum, "percent">> = [
    {
      id: "Passed",
      name: "Passed",
      value: items.filter((item) => item.item_status === "Passed").length,
      color: "#16a34a",
    },
    {
      id: "Fixed",
      name: "Fixed",
      value: items.filter(isFixedTestItem).length,
      color: "#0d9488",
    },
    {
      id: "Failed",
      name: "Failed",
      value: items.filter(isFailedTestItem).length,
      color: "#dc2626",
    },
    {
      id: "Not In Tracker",
      name: "Not In Tracker",
      value: items.filter(isNotInTrackerTestItem).length,
      color: "#2563eb",
    },
    {
      id: "Not Tested",
      name: "Not Tested",
      value: items.filter((item) => item.item_status === "Not Tested" || item.item_status === "Incomplete").length,
      color: "#f59e0b",
    },
  ];

  return rows
    .filter((row) => row.value > 0)
    .map((row) => ({
      ...row,
      percent: Math.round((row.value / total) * 100),
    }));
}

function buildFailedTrackerTypeBreakdown(items: EpsTestItemRecord[]): TrackerTypeChartDatum[] {
  const failedItems = items.filter(isFailedTestItem);
  const total = failedItems.length || 1;
  const counts = new Map<string, number>();

  for (const item of failedItems) {
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

function entryForDate(summary: EpsTestSummary, dateValue: string | null | undefined) {
  const entries = summary.daily_history?.entries ?? [];
  if (!dateValue) {
    return null;
  }
  return entries.find((entry) => entry.date === dateValue) ?? null;
}

function getActivityEquipmentValues(
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

function EpsActivityCards({
  activeFilter,
  onSelectFilter,
  summary,
}: {
  activeFilter: EpsActivityFilter;
  onSelectFilter: (filter: EpsActivityFilter, equipmentValues?: string[]) => void;
  summary: EpsTestSummary;
}) {
  function makeTrend(
    current: number | null | undefined,
    previous: number | null | undefined,
    higherIsGood: boolean,
  ) {
    if (
      current === null ||
      current === undefined ||
      previous === null ||
      previous === undefined
    ) {
      return null;
    }

    const delta = current - previous;
    if (delta === 0) {
      return {
        className: "text-muted-foreground",
        Icon: Minus,
        label: "No change vs previous 7d",
        motionClass: "",
      };
    }

    const isBetter = higherIsGood ? delta > 0 : delta < 0;
    const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight;
    const sign = delta > 0 ? "+" : "-";

    return {
      className: isBetter ? "text-emerald-700" : "text-red-700",
      Icon,
      label: `${sign}${formatNumber(Math.abs(delta))} vs previous 7d`,
      motionClass: delta > 0 ? "animate-trend-rise" : "animate-trend-fall",
    };
  }

  const historyEntries = summary.daily_history?.entries ?? [];
  const historyDates = summary.daily_history?.dates ?? historyEntries.map((entry) => entry.date);
  const latestHistoryDate = summary.daily_history?.latest_date ?? summary.source_date_label ?? "";
  const defaultDailyDate = summary.daily_history?.default_current_date ?? latestHistoryDate;
  const defaultCurrentDate = summary.daily_history?.default_current_date ?? latestHistoryDate;
  const defaultBaselineDate =
    summary.daily_history?.default_baseline_date ?? summary.seven_day?.baseline_date ?? historyDates[0] ?? "";
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dailyDate, setDailyDate] = useState(defaultDailyDate);
  const [cumulativeCurrentDate, setCumulativeCurrentDate] = useState(defaultCurrentDate);
  const [cumulativeBaselineDate, setCumulativeBaselineDate] = useState(defaultBaselineDate);

  useEffect(() => {
    setDailyDate(defaultDailyDate);
    setCumulativeCurrentDate(defaultCurrentDate);
    setCumulativeBaselineDate(defaultBaselineDate);
  }, [defaultBaselineDate, defaultCurrentDate, defaultDailyDate]);

  const sevenDay = summary.seven_day;
  const previousSevenDay = summary.previous_seven_day;
  const sevenDayAvailable = Boolean(sevenDay?.available);
  const yesterdayAvailable = Boolean(summary.yesterday?.available);
  const yesterdayPassedEquipment = summary.yesterday?.new_tested_equipment ?? [];
  const yesterdayFailedEquipment = summary.yesterday?.new_failed_equipment ?? [];
  const sevenDayPassedEquipment = sevenDay?.new_tested_equipment ?? [];
  const sevenDayFailedEquipment = sevenDay?.new_failed_equipment ?? [];
  const sevenDayRepairedEquipment = sevenDay?.repaired_equipment ?? [];
  const selectedDailyEntry = entryForDate(summary, dailyDate);
  const selectedCurrentEntry = entryForDate(summary, cumulativeCurrentDate);
  const selectedBaselineEntry = entryForDate(summary, cumulativeBaselineDate);
  const advancedDailyPassedEquipment = selectedDailyEntry?.daily_passed_equipment ?? [];
  const advancedDailyFailedEquipment = selectedDailyEntry?.daily_failed_equipment ?? [];
  const advancedCumulativePassedEquipment = stringArrayDifference(
    selectedCurrentEntry?.cumulative_passed_equipment ?? [],
    selectedBaselineEntry?.cumulative_passed_equipment ?? [],
  );
  const advancedCumulativeFailedEquipment = stringArrayDifference(
    selectedCurrentEntry?.cumulative_failed_equipment ?? [],
    selectedBaselineEntry?.cumulative_failed_equipment ?? [],
  );
  const advancedAvailable = historyEntries.length > 0;

  const cards = [
    {
      count: summary.yesterday?.new_tested_count ?? 0,
      enabled: yesterdayAvailable && yesterdayPassedEquipment.length > 0,
      filter: "yesterdayPassed" as EpsActivityFilter,
      icon: Activity,
      iconClassName: "text-blue-700",
      label: "Yesterday Passed",
      note: `Daily report date ${formatSnapshotDate(summary.yesterday?.source_date_label)}`,
      tone: "border-blue-200 bg-blue-50/70 text-blue-950",
      trend: null,
    },
    {
      count: summary.yesterday?.new_failed_count ?? 0,
      enabled: yesterdayAvailable && yesterdayFailedEquipment.length > 0,
      filter: "yesterdayFailed" as EpsActivityFilter,
      icon: AlertTriangle,
      iconClassName: (summary.yesterday?.new_failed_count ?? 0) > 0 ? "text-red-700" : "text-slate-500",
      label: "Yesterday Failed",
      note: "Failed items from yesterday daily report.",
      tone: (summary.yesterday?.new_failed_count ?? 0) > 0
        ? "border-red-300 bg-red-50/80 text-red-950"
        : "border-slate-200 bg-slate-50/70 text-slate-950",
      trend: null,
    },
    {
      count: sevenDayAvailable ? sevenDay?.new_tested_count ?? 0 : null,
      enabled: sevenDayAvailable && sevenDayPassedEquipment.length > 0,
      filter: "sevenDayPassed" as EpsActivityFilter,
      icon: CheckCheck,
      iconClassName: "text-emerald-700",
      label: "7-Day Passed",
      note: sevenDayAvailable
        ? `${formatSnapshotDate(sevenDay?.baseline_date)} to ${formatSnapshotDate(sevenDay?.current_date)}`
        : "Waiting for EPS history snapshots.",
      tone: "border-emerald-200 bg-emerald-50/60 text-emerald-950",
      trend: sevenDayAvailable
        ? makeTrend(sevenDay?.new_tested_count, previousSevenDay?.new_tested_count, true)
        : null,
    },
    {
      count: sevenDayAvailable ? sevenDay?.new_failed_count ?? 0 : null,
      enabled: sevenDayAvailable && sevenDayFailedEquipment.length > 0,
      filter: "sevenDayFailed" as EpsActivityFilter,
      icon: AlertTriangle,
      iconClassName: "text-red-700",
      label: "7-Day Failed",
      note: sevenDayAvailable ? "New failed equipment since EPS baseline." : "Waiting for EPS history snapshots.",
      tone: "border-red-300 bg-red-50/80 text-red-950",
      trend: sevenDayAvailable
        ? makeTrend(sevenDay?.new_failed_count, previousSevenDay?.new_failed_count, false)
        : null,
    },
    {
      count: sevenDayAvailable ? sevenDay?.repaired_count ?? 0 : null,
      enabled: sevenDayAvailable && sevenDayRepairedEquipment.length > 0,
      filter: "sevenDayRepaired" as EpsActivityFilter,
      icon: Wrench,
      iconClassName: "text-emerald-700",
      label: "7-Day Repaired",
      note: sevenDayAvailable ? "Previously failed equipment now tested." : "Waiting for EPS history snapshots.",
      tone: "border-emerald-200 bg-emerald-50/60 text-emerald-950",
      trend: sevenDayAvailable
        ? makeTrend(sevenDay?.repaired_count, previousSevenDay?.repaired_count, true)
        : null,
    },
  ];

  return (
    <Card>
      <CardHeader className="gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Testing Activity vs 7-Day Baseline</CardTitle>
          <CardDescription>
            Daily passed equipment and 7-day execution movement from EPS snapshots.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeFilter ? <StatusBadge tone="default">Activity filter active</StatusBadge> : null}
          <button
            className="rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setAdvancedOpen((current) => !current)}
            type="button"
          >
            {advancedOpen ? "Hide Advanced" : "Advanced"}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => {
            const Icon = card.icon;
            const TrendIcon = card.trend?.Icon ?? Minus;
            const isActive = activeFilter === card.filter;
            const value = card.count === null ? "--" : formatNumber(card.count);

            return (
              <button
                aria-pressed={isActive}
                className={cn(
                  "rounded-md border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  card.tone,
                  isActive ? "ring-2 ring-primary" : "hover:-translate-y-0.5 hover:shadow-sm",
                  !card.enabled ? "cursor-not-allowed opacity-70 hover:translate-y-0 hover:shadow-none" : "",
                )}
                disabled={!card.enabled}
                key={card.filter}
                onClick={() => onSelectFilter(card.filter)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs font-medium uppercase text-muted-foreground">{card.label}</div>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/70 ring-1 ring-border/70">
                    <Icon className={`h-5 w-5 ${card.iconClassName}`} aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-normal">{value}</div>
                {card.trend ? (
                  <div
                    className={`mt-2 inline-flex items-center gap-1.5 text-sm font-semibold ${card.trend.className}`}
                  >
                    <TrendIcon className={`h-4 w-4 ${card.trend.motionClass}`} aria-hidden="true" />
                    {card.trend.label}
                  </div>
                ) : null}
                <div className="mt-2 text-xs font-medium text-muted-foreground">
                  {isActive ? "Filtered" : card.note}
                </div>
              </button>
            );
          })}
        </div>
        {advancedOpen ? (
          <div className="mt-4 rounded-md border bg-muted/20 p-4">
            {advancedAvailable ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-md border bg-background p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <div className="text-sm font-semibold">Daily Activity Baseline</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Choose one report date, then filter passed or failed test items from that day.
                      </div>
                    </div>
                    <label className="flex min-w-[180px] flex-col gap-1 text-sm font-medium">
                      Date
                      <select
                        className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        onChange={(event) => setDailyDate(event.target.value)}
                        value={dailyDate}
                      >
                        {historyDates.map((dateValue) => (
                          <option key={dateValue} value={dateValue}>
                            {formatSnapshotDate(dateValue)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      aria-pressed={activeFilter === "advancedDailyPassed"}
                      className={cn(
                        "rounded-md border border-emerald-200 bg-emerald-50/70 p-4 text-left text-emerald-950 transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none",
                        activeFilter === "advancedDailyPassed" ? "ring-2 ring-primary" : "",
                      )}
                      disabled={advancedDailyPassedEquipment.length === 0}
                      onClick={() => onSelectFilter("advancedDailyPassed", advancedDailyPassedEquipment)}
                      type="button"
                    >
                      <div className="text-xs font-medium uppercase text-muted-foreground">Passed</div>
                      <div className="mt-2 text-3xl font-semibold tracking-normal">
                        {formatNumber(advancedDailyPassedEquipment.length)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatSnapshotDate(dailyDate)}</div>
                    </button>
                    <button
                      aria-pressed={activeFilter === "advancedDailyFailed"}
                      className={cn(
                        "rounded-md border border-red-300 bg-red-50/80 p-4 text-left text-red-950 transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none",
                        activeFilter === "advancedDailyFailed" ? "ring-2 ring-primary" : "",
                      )}
                      disabled={advancedDailyFailedEquipment.length === 0}
                      onClick={() => onSelectFilter("advancedDailyFailed", advancedDailyFailedEquipment)}
                      type="button"
                    >
                      <div className="text-xs font-medium uppercase text-muted-foreground">Failed</div>
                      <div className="mt-2 text-3xl font-semibold tracking-normal">
                        {formatNumber(advancedDailyFailedEquipment.length)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatSnapshotDate(dailyDate)}</div>
                    </button>
                  </div>
                </div>

                <div className="rounded-md border bg-background p-4">
                  <div>
                    <div className="text-sm font-semibold">Cumulative Date Comparison</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Compare cumulative execution between two report dates.
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
                      Baseline
                      <select
                        className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        onChange={(event) => setCumulativeBaselineDate(event.target.value)}
                        value={cumulativeBaselineDate}
                      >
                        {historyDates.map((dateValue) => (
                          <option key={dateValue} value={dateValue}>
                            {formatSnapshotDate(dateValue)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
                      Current
                      <select
                        className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        onChange={(event) => setCumulativeCurrentDate(event.target.value)}
                        value={cumulativeCurrentDate}
                      >
                        {historyDates.map((dateValue) => (
                          <option key={dateValue} value={dateValue}>
                            {formatSnapshotDate(dateValue)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      aria-pressed={activeFilter === "advancedCumulativePassed"}
                      className={cn(
                        "rounded-md border border-emerald-200 bg-emerald-50/70 p-4 text-left text-emerald-950 transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none",
                        activeFilter === "advancedCumulativePassed" ? "ring-2 ring-primary" : "",
                      )}
                      disabled={advancedCumulativePassedEquipment.length === 0}
                      onClick={() =>
                        onSelectFilter("advancedCumulativePassed", advancedCumulativePassedEquipment)
                      }
                      type="button"
                    >
                      <div className="text-xs font-medium uppercase text-muted-foreground">New Passed</div>
                      <div className="mt-2 text-3xl font-semibold tracking-normal">
                        {formatNumber(advancedCumulativePassedEquipment.length)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatSnapshotDate(cumulativeBaselineDate)} to {formatSnapshotDate(cumulativeCurrentDate)}
                      </div>
                    </button>
                    <button
                      aria-pressed={activeFilter === "advancedCumulativeFailed"}
                      className={cn(
                        "rounded-md border border-red-300 bg-red-50/80 p-4 text-left text-red-950 transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none",
                        activeFilter === "advancedCumulativeFailed" ? "ring-2 ring-primary" : "",
                      )}
                      disabled={advancedCumulativeFailedEquipment.length === 0}
                      onClick={() =>
                        onSelectFilter("advancedCumulativeFailed", advancedCumulativeFailedEquipment)
                      }
                      type="button"
                    >
                      <div className="text-xs font-medium uppercase text-muted-foreground">New Failed</div>
                      <div className="mt-2 text-3xl font-semibold tracking-normal">
                        {formatNumber(advancedCumulativeFailedEquipment.length)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatSnapshotDate(cumulativeBaselineDate)} to {formatSnapshotDate(cumulativeCurrentDate)}
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState title="No daily EPS history is available." />
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TestItemBreakdownPanel({
  activeFilter,
  items,
  onSelectFilter,
}: {
  activeFilter: EpsTestItemFilter;
  items: EpsTestItemRecord[];
  onSelectFilter: (filter: EpsTestItemFilter) => void;
}) {
  const data = useMemo(() => buildTestItemBreakdown(items), [items]);
  const total = items.length;
  const activeLabel = activeFilter || "All";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Test Item Breakdown</CardTitle>
            <CardDescription>Field execution status by individual EPS tracker test item.</CardDescription>
          </div>
          <StatusBadge tone={activeFilter ? "default" : "muted"}>
            {activeFilter ? `${activeLabel} filter` : "All test items"}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] md:items-center">
          <div className="relative h-[300px] rounded-md border bg-muted/20 p-3">
            <ResponsivePie
              activeOuterRadiusOffset={8}
              arcLabel={(datum) => String(datum.value)}
              arcLabelsRadiusOffset={0.55}
              arcLabelsSkipAngle={8}
              arcLabelsTextColor="#ffffff"
              borderColor="#ffffff"
              borderWidth={2}
              colors={({ data: datum }) => datum.color}
              cornerRadius={3}
              data={data}
              enableArcLinkLabels={false}
              innerRadius={0.62}
              margin={{ top: 18, right: 18, bottom: 18, left: 18 }}
              onClick={(datum) => onSelectFilter(String(datum.id) as EpsTestItemFilter)}
              padAngle={1}
              role="application"
              theme={{
                text: {
                  fill: "#0f172a",
                  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                  fontSize: 12,
                },
                tooltip: {
                  container: {
                    borderRadius: 6,
                    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.16)",
                    fontSize: 12,
                  },
                },
              }}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-full bg-card/95 px-5 py-4 text-center shadow-sm">
                <div className="text-3xl font-semibold leading-none tracking-normal">
                  {formatNumber(total)}
                </div>
                <div className="mt-1 text-xs font-medium uppercase text-muted-foreground">Test Items</div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              aria-pressed={!activeFilter}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/60",
                !activeFilter ? "border-primary bg-primary/5" : "",
              )}
              onClick={() => onSelectFilter("")}
              type="button"
            >
              <div className="text-xs font-medium uppercase text-muted-foreground">Total Test Items</div>
              <div className="mt-1 text-2xl font-semibold tracking-normal">{formatNumber(total)}</div>
            </button>
            {data.map((entry) => (
              <button
                aria-pressed={activeFilter === entry.id}
                className={cn(
                  "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                  activeFilter === entry.id ? "border-primary bg-primary/5" : "",
                )}
                key={entry.id}
                onClick={() => onSelectFilter(entry.id)}
                type="button"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="truncate font-medium">{entry.name}</span>
                </div>
                <span className="shrink-0 text-muted-foreground">
                  {formatNumber(entry.value)} - {entry.percent}%
                </span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FailedTrackerTypeBreakdownPanel({
  activeTestItemFilter,
  activeTrackerType,
  items,
  onSelectAllFailed,
  onSelectTrackerType,
}: {
  activeTestItemFilter: EpsTestItemFilter;
  activeTrackerType: string;
  items: EpsTestItemRecord[];
  onSelectAllFailed: () => void;
  onSelectTrackerType: (trackerType: string) => void;
}) {
  const data = useMemo(() => buildFailedTrackerTypeBreakdown(items), [items]);
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const isFailedFilterActive = activeTestItemFilter === "Failed";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Failed Tracker Type Breakdown</CardTitle>
            <CardDescription>
              Failed and failed-not-in-tracker test items grouped by EPS tracker type.
            </CardDescription>
          </div>
          <StatusBadge tone={isFailedFilterActive || activeTrackerType ? "danger" : "muted"}>
            {activeTrackerType
              ? `Failed + ${activeTrackerType}`
              : isFailedFilterActive
                ? "Failed filter"
                : "All failed types"}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState title="No failed test items found." />
        ) : (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] md:items-center">
            <div className="relative h-[300px] rounded-md border bg-muted/20 p-3">
              <ResponsivePie
                activeOuterRadiusOffset={8}
                arcLabel={(datum) => String(datum.value)}
                arcLabelsRadiusOffset={0.55}
                arcLabelsSkipAngle={8}
                arcLabelsTextColor="#ffffff"
                borderColor="#ffffff"
                borderWidth={2}
                colors={({ data: datum }) => datum.color}
                cornerRadius={3}
                data={data}
                enableArcLinkLabels={false}
                innerRadius={0.62}
                margin={{ top: 18, right: 18, bottom: 18, left: 18 }}
                onClick={(datum) => onSelectTrackerType(String(datum.id))}
                padAngle={1}
                role="application"
                theme={{
                  text: {
                    fill: "#0f172a",
                    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                    fontSize: 12,
                  },
                  tooltip: {
                    container: {
                      borderRadius: 6,
                      boxShadow: "0 10px 24px rgba(15, 23, 42, 0.16)",
                      fontSize: 12,
                    },
                  },
                }}
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-full bg-card/95 px-5 py-4 text-center shadow-sm">
                  <div className="text-3xl font-semibold leading-none tracking-normal">
                    {formatNumber(total)}
                  </div>
                  <div className="mt-1 text-xs font-medium uppercase text-muted-foreground">Failed</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                aria-pressed={isFailedFilterActive && !activeTrackerType}
                className={cn(
                  "w-full rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/60",
                  isFailedFilterActive && !activeTrackerType ? "border-primary bg-primary/5" : "",
                )}
                onClick={onSelectAllFailed}
                type="button"
              >
                <div className="text-xs font-medium uppercase text-muted-foreground">Total Failed Tests</div>
                <div className="mt-1 text-2xl font-semibold tracking-normal">{formatNumber(total)}</div>
              </button>
              {data.map((entry) => {
                const isActive =
                  isFailedFilterActive &&
                  activeTrackerType.toLowerCase() === entry.id.toLowerCase();

                return (
                  <button
                    aria-pressed={isActive}
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                      isActive ? "border-primary bg-primary/5" : "",
                    )}
                    key={entry.id}
                    onClick={() => onSelectTrackerType(entry.id)}
                    type="button"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="truncate font-medium">{entry.name}</span>
                    </div>
                    <span className="shrink-0 text-muted-foreground">
                      {formatNumber(entry.value)} - {entry.percent}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBreakdown({
  activeStatus,
  onSelectStatus,
  summary,
}: {
  activeStatus: string;
  onSelectStatus: (status: string) => void;
  summary: EpsTestSummary;
}) {
  const rows = [
    {
      label: STATUS_COMPLETE,
      count: summary.complete_count,
      icon: <CheckCheck className="h-5 w-5 text-emerald-700" />,
      className: "border-emerald-200 bg-emerald-50/60",
    },
    {
      label: STATUS_WAITING_INFRALINK_NETA,
      count: summary.waiting_infralink_neta_count,
      icon: <FileClock className="h-5 w-5 text-amber-700" />,
      className: "border-amber-200 bg-amber-50/70",
    },
    {
      label: STATUS_PARTIAL,
      count: summary.partial_count,
      icon: <TimerReset className="h-5 w-5 text-amber-700" />,
      className: "border-amber-200 bg-amber-50/70",
    },
    {
      label: STATUS_FAILED,
      count: summary.failed_count,
      icon: <AlertTriangle className="h-5 w-5 text-red-700" />,
      className: "border-red-300 bg-red-50/80",
    },
    {
      label: STATUS_NOT_STARTED,
      count: summary.not_started_count,
      icon: <CircleDashed className="h-5 w-5 text-slate-500" />,
      className: "border-border bg-background",
    },
    {
      label: STATUS_NO_TRACKER_RECORDS,
      count: summary.no_tracker_record_count,
      icon: <Wrench className="h-5 w-5 text-slate-500" />,
      className: "border-border bg-background",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution Status Breakdown</CardTitle>
        <CardDescription>
          Field-test status by module equipment, separate from Infralink NETA closeout.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {rows.map((row) => (
            <button
              aria-pressed={activeStatus === row.label}
              className={`rounded-md border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${row.className} ${
                activeStatus === row.label
                  ? "ring-2 ring-primary"
                  : "hover:-translate-y-0.5 hover:shadow-sm"
              }`}
              key={row.label}
              onClick={() => onSelectStatus(row.label)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs font-medium uppercase text-muted-foreground">{row.label}</div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/70 ring-1 ring-border/70">
                  {row.icon}
                </div>
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-normal">
                {formatNumber(row.count)}
              </div>
              <div className="mt-2 text-xs font-medium text-muted-foreground">
                {activeStatus === row.label ? "Filtered" : "Click to filter"}
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EpsFilters({
  filters,
  onChange,
  onReset,
  statuses,
}: {
  filters: EpsFiltersState;
  onChange: (filters: EpsFiltersState) => void;
  onReset: () => void;
  statuses: string[];
}) {
  const activeCount = [filters.search.trim(), filters.status].filter(Boolean).length;

  return (
    <CollapsibleFilterCard activeCount={activeCount}>
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.4fr)_minmax(220px,0.7fr)_auto]">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Search
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              onChange={(event) => onChange({ ...filters, search: event.target.value })}
              placeholder="PDM, module equipment, matched equipment, serial"
              type="search"
              value={filters.search}
            />
          </span>
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          EPS Test Status
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            onChange={(event) => onChange({ ...filters, status: event.target.value })}
            value={filters.status}
          >
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button
            className="h-9 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            onClick={onReset}
            type="button"
          >
            Reset
          </button>
        </div>
      </div>
    </CollapsibleFilterCard>
  );
}

function PdmExecutionTable({
  activityFilter,
  activityEquipmentKeys,
  activeTrackerType,
  moduleRecords,
  onSelectTrackerType,
  rows,
  testItemFilter,
  testItems,
}: {
  activityFilter: EpsActivityFilter;
  activityEquipmentKeys: Set<string> | null;
  activeTrackerType: string;
  moduleRecords: EpsModuleExecutionRecord[];
  onSelectTrackerType: (trackerType: string) => void;
  rows: EpsPdmExecutionRecord[];
  testItemFilter: EpsTestItemFilter;
  testItems: EpsTestItemRecord[];
}) {
  const [isVisible, setIsVisible] = useState(true);
  const [expandedPdm, setExpandedPdm] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(() => new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const toggleModule = (moduleKey: string) => {
    setExpandedModules((current) => {
      const next = new Set(current);
      if (next.has(moduleKey)) {
        next.delete(moduleKey);
      } else {
        next.add(moduleKey);
      }
      return next;
    });
  };
  useEffect(() => {
    setCurrentPage(1);
    setExpandedPdm(null);
    setExpandedModules(new Set());
  }, [rows]);

  const visibleRows = useMemo(
    () => paginateRows(rows, currentPage, pageSize),
    [currentPage, pageSize, rows],
  );
  const modulesByPdm = useMemo(() => {
    const grouped = new Map<string, EpsModuleExecutionRecord[]>();
    for (const record of moduleRecords) {
      const groupKey = pdmNameKey(record.pdm_name);
      const current = grouped.get(groupKey) ?? [];
      current.push(record);
      grouped.set(groupKey, current);
    }
    for (const [groupKey, records] of grouped) {
      grouped.set(
        groupKey,
        [...records].sort((a, b) => {
          return (
            statusSortValue(a.eps_test_status) - statusSortValue(b.eps_test_status) ||
            String(a.module_equipment ?? "").localeCompare(String(b.module_equipment ?? ""))
          );
        }),
      );
    }
    return grouped;
  }, [moduleRecords]);

  const testItemsByModule = useMemo(() => {
    const grouped = new Map<string, EpsTestItemRecord[]>();
    for (const item of testItems) {
      const groupKey = moduleGroupKey(item.pdm_name, item.module_equipment_key);
      const current = grouped.get(groupKey) ?? [];
      current.push(item);
      grouped.set(groupKey, current);
    }
    for (const [groupKey, items] of grouped) {
      grouped.set(
        groupKey,
        [...items].sort((a, b) => {
          return (
            testItemSortValue(a.item_status) - testItemSortValue(b.item_status) ||
            String(a.tracker_type ?? "").localeCompare(String(b.tracker_type ?? "")) ||
            String(a.equipment_name ?? a.equipment_key ?? "").localeCompare(
              String(b.equipment_name ?? b.equipment_key ?? ""),
            ) ||
            asNumber(a.tracker_row) - asNumber(b.tracker_row)
          );
        }),
      );
    }
    return grouped;
  }, [testItems]);

  return (
    <Card>
      <CardHeader className="gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>PDM Execution Table</CardTitle>
          <CardDescription>EPS execution progress grouped by PDM.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone="muted">{`${formatNumber(rows.length)} PDMs`}</StatusBadge>
          <button
            className="rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setIsVisible((current) => !current)}
            type="button"
          >
            {isVisible ? "Hide" : "Show"}
          </button>
        </div>
      </CardHeader>
      {isVisible ? (
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title="No PDMs match the current filters." />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">PDM Name</th>
                <th className="px-3 py-2 font-medium">EPS Status</th>
                <th className="px-3 py-2 text-right font-medium">Modules</th>
                <th className="px-3 py-2 text-right font-medium">Complete</th>
                <th className="px-3 py-2 text-right font-medium">Waiting Infralink NETA</th>
                <th className="px-3 py-2 text-right font-medium">Partial</th>
                <th className="px-3 py-2 text-right font-medium">Failed</th>
                <th className="px-3 py-2 text-right font-medium">Not Started</th>
                <th className="px-3 py-2 text-right font-medium">Tracker Items</th>
                <th className="px-3 py-2 text-right font-medium">Completion</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const groupKey = pdmNameKey(row.pdm_name);
                const isExpanded = expandedPdm === groupKey;
                const pdmModules = modulesByPdm.get(groupKey) ?? [];
                const visiblePdmModules = testItemFilter || activeTrackerType || activityEquipmentKeys
                  ? pdmModules.filter((moduleRecord) => {
                      const moduleItems =
                        testItemsByModule.get(
                          moduleGroupKey(moduleRecord.pdm_name, moduleRecord.module_equipment_key),
                        ) ?? [];
                      return moduleItems.some((item) =>
                        matchesAllTestItemFilters(
                          item,
                          testItemFilter,
                          activeTrackerType,
                          activityFilter,
                          activityEquipmentKeys,
                        ),
                      );
                    })
                  : pdmModules;

                return (
                  <Fragment key={row.pdm_name ?? groupKey}>
                    <tr className="border-b align-top last:border-0">
                      <td className="px-3 py-3 font-medium">
                        <button
                          className="flex max-w-[280px] items-start gap-2 text-left font-semibold transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setExpandedPdm(isExpanded ? null : groupKey)}
                          type="button"
                        >
                          <ChevronDown
                            className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${
                              isExpanded ? "rotate-0" : "-rotate-90"
                            }`}
                          />
                          <span>{row.pdm_name ?? "--"}</span>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={row.eps_execution_status} />
                      </td>
                      <td className="px-3 py-3 text-right">{formatNumber(row.module_equipment_count)}</td>
                      <td className="px-3 py-3 text-right text-emerald-700">{formatNumber(row.complete_count)}</td>
                      <td className="px-3 py-3 text-right text-amber-700">
                        {formatNumber(row.waiting_infralink_neta_count)}
                      </td>
                      <td className="px-3 py-3 text-right text-amber-700">{formatNumber(row.partial_count)}</td>
                      <td className="px-3 py-3 text-right text-red-700">{formatNumber(row.failed_count)}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(row.not_started_count)}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(row.tracker_item_count)}</td>
                      <td className="px-3 py-3 text-right">{formatPercent(row.field_test_completion_rate)}</td>
                    </tr>
                    {isExpanded ? (
                      <tr className="border-b bg-muted/20" key={`${row.pdm_name}-details`}>
                        <td className="px-3 py-4" colSpan={10}>
                          {visiblePdmModules.length === 0 ? (
                            <EmptyState title="No module equipment matches the current filters for this PDM." />
                          ) : (
                            <div className="overflow-x-auto rounded-md border bg-background">
                              <table className="w-full min-w-[1060px] text-left text-sm">
                                <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
                                  <tr>
                                    <th className="px-3 py-2 font-medium">Equipment ID or Source Label</th>
                                    <th className="px-3 py-2 font-medium">EPS Status</th>
                                    <th className="px-3 py-2 text-right font-medium">Passed</th>
                                    <th className="px-3 py-2 text-right font-medium">Fixed</th>
                                    <th className="px-3 py-2 text-right font-medium">Not Tested</th>
                                    <th className="px-3 py-2 text-right font-medium">Failed</th>
                                    <th className="px-3 py-2 text-right font-medium">Not In Tracker</th>
                                    <th className="px-3 py-2 text-right font-medium">Test Items</th>
                                    <th className="px-3 py-2 text-right font-medium">Completion</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {visiblePdmModules.map((moduleRecord) => {
                                    const currentModuleKey = moduleGroupKey(
                                      moduleRecord.pdm_name,
                                      moduleRecord.module_equipment_key,
                                    );
                                    const allModuleItems = testItemsByModule.get(currentModuleKey) ?? [];
                                    const moduleItems = allModuleItems.filter((item) =>
                                      matchesAllTestItemFilters(
                                        item,
                                        testItemFilter,
                                        activeTrackerType,
                                        activityFilter,
                                        activityEquipmentKeys,
                                      ),
                                    );
                                    const isModuleExpanded = expandedModules.has(currentModuleKey);
                                    const passedCount = moduleItems.filter(
                                      (item) => item.item_status === "Passed",
                                    ).length;
                                    const fixedCount = moduleItems.filter(isFixedTestItem).length;
                                    const notTestedCount = moduleItems.filter(
                                      (item) =>
                                        item.item_status === "Not Tested" ||
                                        item.item_status === "Incomplete",
                                    ).length;
                                    const failedCount = moduleItems.filter(
                                      (item) =>
                                        item.item_status === STATUS_FAILED ||
                                        item.item_status === "Failed - Not In Tracker",
                                    ).length;
                                    const notFoundCount = moduleItems.filter(
                                      isNotInTrackerTestItem,
                                    ).length;

                                    return (
                                      <Fragment key={moduleRecord.row_id ?? currentModuleKey}>
                                        <tr
                                          className="cursor-pointer border-b align-top transition-colors last:border-0 hover:bg-muted/50"
                                          onClick={() => toggleModule(currentModuleKey)}
                                        >
                                          <td className="px-3 py-3 font-medium">
                                            <div className="flex min-w-0 items-start gap-2">
                                              <ChevronDown
                                                className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${
                                                  isModuleExpanded ? "rotate-0" : "-rotate-90"
                                                }`}
                                              />
                                              <div className="min-w-0">
                                                <div className="break-words">
                                                  {moduleRecord.module_equipment ?? "--"}
                                                </div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                  {moduleRecord.matched_equipment_id ?? "--"}
                                                </div>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="px-3 py-3">
                                            <StatusPill status={moduleRecord.eps_test_status} />
                                          </td>
                                          <td className="px-3 py-3 text-right text-emerald-700">
                                            {formatNumber(passedCount)}
                                          </td>
                                          <td className="px-3 py-3 text-right text-teal-700">
                                            {formatNumber(fixedCount)}
                                          </td>
                                          <td className="px-3 py-3 text-right text-amber-700">
                                            {formatNumber(notTestedCount)}
                                          </td>
                                          <td className="px-3 py-3 text-right text-red-700">
                                            {formatNumber(failedCount)}
                                          </td>
                                          <td className="px-3 py-3 text-right text-blue-700">
                                            {formatNumber(notFoundCount)}
                                          </td>
                                          <td className="px-3 py-3 text-right">
                                            {formatNumber(moduleItems.length)}
                                          </td>
                                          <td className="px-3 py-3 text-right">
                                            {formatPercent(moduleRecord.field_test_completion_rate)}
                                          </td>
                                        </tr>
                                        {isModuleExpanded ? (
                                          <tr className="border-b bg-muted/20">
                                            <td className="px-3 py-3" colSpan={9}>
                                              {moduleItems.length === 0 ? (
                                                <div className="rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">
                                                  No tracker test items found for this module equipment.
                                                </div>
                                              ) : (
                                                <div className="overflow-x-auto rounded-md border bg-background">
                                                  <table className="w-full min-w-[860px] text-left text-xs">
                                                    <thead className="border-b bg-muted/30 uppercase text-muted-foreground">
                                                      <tr>
                                                        <th className="px-3 py-2 font-medium">Test Item</th>
                                                        <th className="px-3 py-2 font-medium">Status</th>
                                                        <th className="px-3 py-2 font-medium">Tracker Type</th>
                                                        <th className="px-3 py-2 font-medium">Equipment Type</th>
                                                        <th className="px-3 py-2 text-right font-medium">Tracker Row</th>
                                                        <th className="px-3 py-2 font-medium">Comments</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {moduleItems.map((item, itemIndex) => (
                                                        <tr
                                                          className={`border-b last:border-0 ${itemStatusClass(
                                                            item.item_status,
                                                          )}`}
                                                          key={`${item.equipment_key}-${item.tracker_row}-${itemIndex}`}
                                                        >
                                                          <td className="px-3 py-2 font-medium">
                                                            {item.equipment_name ?? item.equipment_key ?? "--"}
                                                          </td>
                                                          <td className="px-3 py-2">
                                                            <StatusBadge tone={itemStatusTone(item.item_status)}>
                                                              {item.item_status ?? "Unknown"}
                                                            </StatusBadge>
                                                          </td>
                                                          <td className="px-3 py-2">
                                                            <TrackerTypeBadge
                                                              activeTrackerType={activeTrackerType}
                                                              onSelectTrackerType={onSelectTrackerType}
                                                              value={item.tracker_type}
                                                            />
                                                          </td>
                                                          <td className="px-3 py-2">
                                                            {item.tracker_equipment_type ?? "--"}
                                                          </td>
                                                          <td className="px-3 py-2 text-right">
                                                            {item.tracker_row ?? "--"}
                                                          </td>
                                                          <td className="max-w-[360px] px-3 py-2">
                                                            <ExpandableComment value={item.comments ?? item.reason} />
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              )}
                                            </td>
                                          </tr>
                                        ) : null}
                                      </Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <PaginationControls
            itemLabel="PDMs"
            onPageChange={setCurrentPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize);
              setCurrentPage(1);
            }}
            page={currentPage}
            pageSize={pageSize}
            totalItems={rows.length}
          />
        </div>
        )}
      </CardContent>
      ) : null}
    </Card>
  );
}

function ModuleExecutionTable({ rows }: { rows: EpsModuleExecutionRecord[] }) {
  const visibleRows = rows.slice(0, 500);

  return (
    <Card>
      <CardHeader className="gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Module Equipment Execution Table</CardTitle>
          <CardDescription>Field-test status by module equipment.</CardDescription>
        </div>
        <StatusBadge tone="muted">{`${formatNumber(rows.length)} shown`}</StatusBadge>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title="No module equipment matches the current filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Module Equipment</th>
                  <th className="px-3 py-2 font-medium">PDM Name</th>
                  <th className="px-3 py-2 font-medium">EPS Status</th>
                  <th className="px-3 py-2 text-right font-medium">Tracker Items</th>
                  <th className="px-3 py-2 text-right font-medium">Complete Items</th>
                  <th className="px-3 py-2 text-right font-medium">Incomplete Items</th>
                  <th className="px-3 py-2 text-right font-medium">Failed Items</th>
                  <th className="px-3 py-2 text-right font-medium">Completion</th>
                  <th className="px-3 py-2 font-medium">Matched Equipment</th>
                  <th className="px-3 py-2 font-medium">Tracker Types</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr className="border-b align-top last:border-0" key={row.row_id}>
                    <td className="px-3 py-3 font-medium">{row.module_equipment ?? "--"}</td>
                    <td className="px-3 py-3">{row.pdm_name ?? "--"}</td>
                    <td className="px-3 py-3">
                      <StatusPill status={row.eps_test_status} />
                    </td>
                    <td className="px-3 py-3 text-right">{formatNumber(row.tracker_item_count)}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(row.completed_test_item_count)}</td>
                    <td className="px-3 py-3 text-right text-amber-700">
                      {formatNumber(row.incomplete_test_item_count)}
                    </td>
                    <td className="px-3 py-3 text-right text-red-700">
                      {formatNumber(row.failed_test_item_count)}
                    </td>
                    <td className="px-3 py-3 text-right">{formatPercent(row.field_test_completion_rate)}</td>
                    <td className="px-3 py-3">{row.matched_equipment_id ?? "--"}</td>
                    <td className="px-3 py-3">{(row.tracker_types ?? []).join(", ") || "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > visibleRows.length ? (
              <div className="mt-3 text-sm text-muted-foreground">
                Showing first {formatNumber(visibleRows.length)} records. Use filters to narrow the list.
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TestItemTable({
  activeTrackerType,
  onClearTrackerType,
  onSelectTrackerType,
  rows,
  title,
  description,
}: {
  activeTrackerType: string;
  onClearTrackerType: () => void;
  onSelectTrackerType: (trackerType: string) => void;
  rows: EpsTestItemRecord[];
  title: string;
  description: string;
}) {
  const [isVisible, setIsVisible] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  useEffect(() => {
    setCurrentPage(1);
  }, [rows]);

  const visibleRows = useMemo(
    () => paginateRows(rows, currentPage, pageSize),
    [currentPage, pageSize, rows],
  );

  return (
    <Card>
      <CardHeader className="gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {activeTrackerType ? (
            <button
              className="rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
              onClick={onClearTrackerType}
              type="button"
            >
              Tracker Type: {activeTrackerType} x
            </button>
          ) : null}
          <StatusBadge tone="muted">{`${formatNumber(rows.length)} items`}</StatusBadge>
          <button
            className="rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setIsVisible((current) => !current)}
            type="button"
          >
            {isVisible ? "Hide" : "Show"}
          </button>
        </div>
      </CardHeader>
      {isVisible ? (
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title="No records found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Equipment Name</th>
                  <th className="px-3 py-2 font-medium">Module Equipment</th>
                  <th className="px-3 py-2 font-medium">PDM Name</th>
                  <th className="px-3 py-2 font-medium">Item Status</th>
                  <th className="px-3 py-2 font-medium">Tracker Type</th>
                  <th className="px-3 py-2 font-medium">Equipment Type</th>
                  <th className="px-3 py-2 text-right font-medium">Tracker Row</th>
                  <th className="px-3 py-2 font-medium">Comments</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => (
                  <tr className="border-b align-top last:border-0" key={`${row.equipment_key}-${index}`}>
                    <td className="px-3 py-3 font-medium">{row.equipment_name ?? row.equipment_key ?? "--"}</td>
                    <td className="px-3 py-3">{row.module_equipment ?? "--"}</td>
                    <td className="px-3 py-3">{row.pdm_name ?? "--"}</td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={itemStatusTone(row.item_status)}>
                        {row.item_status ?? "--"}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-3">
                      <TrackerTypeBadge
                        activeTrackerType={activeTrackerType}
                        onSelectTrackerType={onSelectTrackerType}
                        value={row.tracker_type}
                      />
                    </td>
                    <td className="px-3 py-3">{row.tracker_equipment_type ?? "--"}</td>
                    <td className="px-3 py-3 text-right">{row.tracker_row ?? "--"}</td>
                    <td className="max-w-[460px] px-3 py-3">
                      <ExpandableComment value={row.comments ?? row.reason} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls
              itemLabel="test items"
              onPageChange={setCurrentPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setCurrentPage(1);
              }}
              page={currentPage}
              pageSize={pageSize}
              totalItems={rows.length}
            />
          </div>
        )}
      </CardContent>
      ) : null}
    </Card>
  );
}

export function EpsTestExecutionPage({ data }: EpsTestExecutionPageProps) {
  const [filters, setFilters] = useState<EpsFiltersState>(defaultFilters);
  const [testItemFilter, setTestItemFilter] = useState<EpsTestItemFilter>("");
  const [trackerTypeFilter, setTrackerTypeFilter] = useState("");
  const [activityFilter, setActivityFilter] = useState<EpsActivityFilter>("");
  const [customActivityEquipmentValues, setCustomActivityEquipmentValues] = useState<string[]>([]);
  const summary = data.epsTestSummary;
  const activityEquipmentKeys = useMemo(
    () =>
      buildEquipmentReferenceSet(
        getActivityEquipmentValues(summary, activityFilter, customActivityEquipmentValues),
      ),
    [activityFilter, customActivityEquipmentValues, summary],
  );
  const statusOptions = useMemo(() => getStatusOptions(summary), [summary]);
  const filteredModuleRecords = useMemo(
    () => filterModuleRecords(data.epsModuleExecution, filters),
    [data.epsModuleExecution, filters],
  );
  const pdmRows = useMemo(
    () =>
      [...data.epsPdmExecution].sort((a, b) => {
        return (
          statusSortValue(a.eps_execution_status) - statusSortValue(b.eps_execution_status) ||
          asNumber(b.failed_count) - asNumber(a.failed_count) ||
          asNumber(b.partial_count) - asNumber(a.partial_count) ||
          String(a.pdm_name ?? "").localeCompare(String(b.pdm_name ?? ""))
        );
      }),
    [data.epsPdmExecution],
  );
  const filteredPdmRows = useMemo(() => {
    const filteredPdmNames = new Set(filteredModuleRecords.map((record) => pdmNameKey(record.pdm_name)));
    if (!testItemFilter && !trackerTypeFilter && !activityEquipmentKeys) {
      return pdmRows.filter((row) => filteredPdmNames.has(pdmNameKey(row.pdm_name)));
    }

    const pdmNamesWithMatchingTestItems = new Set(
      data.epsTestItems
        .filter((item) =>
          matchesAllTestItemFilters(
            item,
            testItemFilter,
            trackerTypeFilter,
            activityFilter,
            activityEquipmentKeys,
          ),
        )
        .map((item) => pdmNameKey(item.pdm_name)),
    );

    return pdmRows.filter((row) => {
      const rowKey = pdmNameKey(row.pdm_name);
      return filteredPdmNames.has(rowKey) && pdmNamesWithMatchingTestItems.has(rowKey);
    });
  }, [
    activityEquipmentKeys,
    activityFilter,
    data.epsTestItems,
    filteredModuleRecords,
    pdmRows,
    testItemFilter,
    trackerTypeFilter,
  ]);
  const filteredTestItems = useMemo(
    () =>
      data.epsTestItems
        .filter((item) =>
          matchesAllTestItemFilters(
            item,
            testItemFilter,
            trackerTypeFilter,
            activityFilter,
            activityEquipmentKeys,
          ),
        )
        .sort((a, b) => {
          return (
            testItemSortValue(a.item_status) - testItemSortValue(b.item_status) ||
            String(a.pdm_name ?? "").localeCompare(String(b.pdm_name ?? "")) ||
            String(a.module_equipment ?? "").localeCompare(String(b.module_equipment ?? "")) ||
            String(a.equipment_name ?? a.equipment_key ?? "").localeCompare(
              String(b.equipment_name ?? b.equipment_key ?? ""),
            ) ||
            asNumber(a.tracker_row) - asNumber(b.tracker_row)
          );
        }),
    [activityEquipmentKeys, activityFilter, data.epsTestItems, testItemFilter, trackerTypeFilter],
  );
  const selectTrackerType = (trackerType: string) => {
    setTrackerTypeFilter((currentTrackerType) =>
      currentTrackerType.toLowerCase() === trackerType.toLowerCase() ? "" : trackerType,
    );
  };
  const selectAllFailedTestItems = () => {
    if (testItemFilter === "Failed" && !trackerTypeFilter) {
      setTestItemFilter("");
      return;
    }

    setTestItemFilter("Failed");
    setTrackerTypeFilter("");
  };
  const selectFailedTrackerType = (trackerType: string) => {
    setTestItemFilter("Failed");
    setTrackerTypeFilter((currentTrackerType) =>
      testItemFilter === "Failed" && currentTrackerType.toLowerCase() === trackerType.toLowerCase()
        ? ""
        : trackerType,
    );
  };
  const selectActivityFilter = (filter: EpsActivityFilter, equipmentValues: string[] = []) => {
    const nextFilter = activityFilter === filter ? "" : filter;
    setActivityFilter(nextFilter);
    setCustomActivityEquipmentValues(nextFilter.startsWith("advanced") ? equipmentValues : []);
  };

  if (!summary || data.epsModuleExecution.length === 0) {
    return (
      <EmptyState
        title="No EPS test execution data found."
        description="Run python scripts/etl/run_etl.py first, then refresh this page."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <EpsActivityCards
        activeFilter={activityFilter}
        onSelectFilter={selectActivityFilter}
        summary={summary}
      />
      <TestItemBreakdownPanel
        activeFilter={testItemFilter}
        items={data.epsTestItems}
        onSelectFilter={(filter) =>
          setTestItemFilter((currentFilter) => (currentFilter === filter ? "" : filter))
        }
      />
      <FailedTrackerTypeBreakdownPanel
        activeTestItemFilter={testItemFilter}
        activeTrackerType={trackerTypeFilter}
        items={data.epsTestItems}
        onSelectAllFailed={selectAllFailedTestItems}
        onSelectTrackerType={selectFailedTrackerType}
      />
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
      <EpsFilters
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(defaultFilters)}
        statuses={statusOptions}
      />
      <PdmExecutionTable
        activityFilter={activityFilter}
        activityEquipmentKeys={activityEquipmentKeys}
        activeTrackerType={trackerTypeFilter}
        moduleRecords={filteredModuleRecords}
        onSelectTrackerType={selectTrackerType}
        rows={filteredPdmRows}
        testItemFilter={testItemFilter}
        testItems={data.epsTestItems}
      />
      <TestItemTable
        activeTrackerType={trackerTypeFilter}
        description={
          testItemFilter || trackerTypeFilter || activityFilter
            ? `Showing filtered test items from EPS execution data.`
            : "All EPS tracker and daily-report test item records."
        }
        onClearTrackerType={() => setTrackerTypeFilter("")}
        onSelectTrackerType={selectTrackerType}
        rows={filteredTestItems}
        title="Test Items Table"
      />
    </div>
  );
}
