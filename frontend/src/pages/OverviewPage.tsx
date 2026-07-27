import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCheck,
  CircleAlert,
  CirclePlay,
  ClipboardCheck,
  FileClock,
  FileWarning,
  ListChecks,
  Minus,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { EmptyState } from "../components/common/EmptyState";
import { StatusBadge } from "../components/common/StatusBadge";
import { PdmDetailDrawer } from "../components/pdms/PdmDetailDrawer";
import { PdmReadinessBadge } from "../components/pdms/PdmReadinessBadge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import type { CaseIssue, DashboardData, PdmRecord } from "../types/data";
import { formatDateTime } from "../utils/formatters";
import {
  getPdmTableRows,
  hasNetaTestingStarted,
  isOpenCase,
  type PdmReadinessLevel,
  type PdmTableRow,
} from "../utils/pdmUtils";
import { formatNumber, formatPercent } from "../utils/summaryUtils";

interface OverviewPageProps {
  data: DashboardData;
}

interface PdmActionRow {
  pdm: PdmRecord;
  pdmName: string;
  readinessLevel: PdmReadinessLevel;
  equipmentCount: number;
  netaCompleteCount: number;
  missingReports: number;
  openCases: number;
  newIssuesSevenDay: number;
  resolvedIssuesSevenDay: number;
  epsCompletedCount: number;
  epsItemCount: number;
  epsFailedCount: number;
  mainReason: string;
}

interface TrendResult {
  className: string;
  Icon: typeof ArrowUpRight;
  label: string;
  motionClass: string;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizeCaseId(value: unknown): string {
  return normalizeText(value);
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

function formatSignedNumber(value: number): string {
  if (value > 0) {
    return `+${formatNumber(value)}`;
  }
  return formatNumber(value);
}

function buildTrend(
  current: number,
  previous: number | null | undefined,
  higherIsGood: boolean,
): TrendResult {
  if (previous === null || previous === undefined) {
    return {
      className: "text-muted-foreground",
      Icon: Minus,
      label: "No previous window",
      motionClass: "",
    };
  }

  const delta = current - previous;
  if (delta === 0) {
    return {
      className: "text-muted-foreground",
      Icon: Minus,
      label: "No change",
      motionClass: "",
    };
  }

  const isBetter = higherIsGood ? delta > 0 : delta < 0;
  return {
    className: isBetter ? "text-emerald-700" : "text-red-700",
    Icon: delta > 0 ? ArrowUpRight : ArrowDownRight,
    label: `${formatSignedNumber(delta)} vs prior 7d`,
    motionClass: delta > 0 ? "animate-trend-rise" : "animate-trend-fall",
  };
}

function getCaseIdsForPdm(pdm: PdmRecord): Set<string> {
  return new Set(
    (pdm.equipment ?? [])
      .flatMap((equipment) => equipment.cases ?? [])
      .map((caseItem) => normalizeCaseId(caseItem.case_id))
      .filter(Boolean),
  );
}

function getPrimaryReason(
  row: PdmTableRow,
  newIssuesSevenDay: number,
  epsFailedCount: number,
): string {
  if (row.openCaseCount > 0) {
    return `${formatNumber(row.openCaseCount)} open issue${row.openCaseCount === 1 ? "" : "s"}`;
  }
  if (epsFailedCount > 0) {
    return `${formatNumber(epsFailedCount)} failed EPS test${epsFailedCount === 1 ? "" : "s"}`;
  }
  if (row.netaMissingReportCount > 0) {
    return `${formatNumber(row.netaMissingReportCount)} missing NETA report${
      row.netaMissingReportCount === 1 ? "" : "s"
    }`;
  }
  if (newIssuesSevenDay > 0) {
    return `${formatNumber(newIssuesSevenDay)} new issue${newIssuesSevenDay === 1 ? "" : "s"} in 7d`;
  }
  if (row.netaIncompleteCount > 0 && row.readinessLevel !== "Not Started") {
    return "NETA testing in progress";
  }
  return row.readinessLevel === "Not Started" ? "Testing not started" : "No current blocker";
}

function getPdmActionRows(data: DashboardData): PdmActionRow[] {
  const newCaseIds = new Set(
    (data.historyComparison?.cases?.new_case_ids ?? []).map(normalizeCaseId).filter(Boolean),
  );
  const resolvedCaseIds = new Set(
    (data.historyComparison?.cases?.resolved_case_ids ?? []).map(normalizeCaseId).filter(Boolean),
  );
  const epsByPdm = new Map(
    data.epsPdmExecution.map((row) => [normalizeText(row.pdm_name), row]),
  );
  const readinessPriority: Record<PdmReadinessLevel, number> = {
    Critical: 4,
    Attention: 3,
    Watch: 2,
    Good: 1,
    "Not Started": 0,
  };

  return getPdmTableRows(data.pdms)
    .map((row) => {
      const pdmCaseIds = getCaseIdsForPdm(row.pdm);
      const newIssuesSevenDay = Array.from(pdmCaseIds).filter((caseId) =>
        newCaseIds.has(caseId),
      ).length;
      const resolvedIssuesSevenDay = Array.from(pdmCaseIds).filter((caseId) =>
        resolvedCaseIds.has(caseId),
      ).length;
      const epsRecord = epsByPdm.get(normalizeText(row.pdmName));
      const epsFailedCount = epsRecord?.failed_test_item_count ?? 0;

      return {
        pdm: row.pdm,
        pdmName: row.pdmName,
        readinessLevel: row.readinessLevel,
        equipmentCount: row.equipmentCount,
        netaCompleteCount: row.netaCompleteCount,
        missingReports: row.netaMissingReportCount,
        openCases: row.openCaseCount,
        newIssuesSevenDay,
        resolvedIssuesSevenDay,
        epsCompletedCount: epsRecord?.completed_test_item_count ?? 0,
        epsItemCount: epsRecord?.tracker_item_count ?? 0,
        epsFailedCount,
        mainReason: getPrimaryReason(row, newIssuesSevenDay, epsFailedCount),
      };
    })
    .filter(
      (row) =>
        row.readinessLevel !== "Not Started" ||
        row.openCases > 0 ||
        row.epsFailedCount > 0 ||
        row.newIssuesSevenDay > 0,
    )
    .sort((a, b) => {
      return (
        readinessPriority[b.readinessLevel] - readinessPriority[a.readinessLevel] ||
        b.openCases - a.openCases ||
        b.epsFailedCount - a.epsFailedCount ||
        b.missingReports - a.missingReports ||
        b.newIssuesSevenDay - a.newIssuesSevenDay ||
        a.pdmName.localeCompare(b.pdmName)
      );
    });
}

function countUniqueCases(
  cases: CaseIssue[],
  predicate: (caseItem: CaseIssue) => boolean,
): number {
  const keys = new Set<string>();
  cases.forEach((caseItem, index) => {
    if (predicate(caseItem)) {
      keys.add(normalizeCaseId(caseItem.case_id) || `ROW-${index}`);
    }
  });
  return keys.size;
}

function getOverviewCases(data: DashboardData): CaseIssue[] {
  if (data.cases.length > 0) {
    return data.cases;
  }

  return data.pdms.flatMap((pdm) =>
    (pdm.equipment ?? []).flatMap((equipment) => equipment.cases ?? []),
  );
}

function isOverdueOpenCase(caseItem: CaseIssue): boolean {
  if (!isOpenCase(caseItem) || !caseItem.due_date) {
    return false;
  }

  const dueDate = new Date(caseItem.due_date);
  if (Number.isNaN(dueDate.getTime())) {
    return false;
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return dueDate.getTime() < todayStart;
}

function ReadinessOverview({
  data,
  onNavigate,
}: {
  data: DashboardData;
  onNavigate: (path: string) => void;
}) {
  const rows = getPdmTableRows(data.pdms);
  const totalPdms = rows.length;
  const testingStarted = data.pdms.filter(hasNetaTestingStarted).length;
  const ready = rows.filter((row) => row.readinessLevel === "Good").length;
  const watch = rows.filter((row) => row.readinessLevel === "Watch").length;
  const attention = rows.filter((row) => row.readinessLevel === "Attention").length;
  const critical = rows.filter((row) => row.readinessLevel === "Critical").length;
  const notStarted = rows.filter((row) => row.readinessLevel === "Not Started").length;
  const needingAttention = watch + attention + critical;
  const waitingNeta = data.epsTestSummary?.waiting_infralink_neta_count ?? 0;
  const openIssues = countUniqueCases(getOverviewCases(data), isOpenCase);
  const generatedAt =
    data.etlRunMetadata?.generated_at ??
    data.summary?.generated_at ??
    data.historyComparison?.generated_at;

  const metrics = [
    {
      label: "Testing Started",
      value: `${formatNumber(testingStarted)} / ${formatNumber(totalPdms)}`,
      detail: "PDMs",
      icon: CirclePlay,
      iconClassName: "text-blue-700",
      path: "/pdms?quickFilter=testingStarted",
    },
    {
      label: "Ready",
      value: formatNumber(ready),
      detail: "No readiness blockers",
      icon: ShieldCheck,
      iconClassName: "text-emerald-700",
      path: "/pdms?quickFilter=fullyReady",
    },
    {
      label: "Need Attention",
      value: formatNumber(needingAttention),
      detail: "Watch or higher",
      icon: CircleAlert,
      iconClassName: needingAttention > 0 ? "text-red-700" : "text-emerald-700",
      path: "/pdms?quickFilter=needsAttention",
    },
    {
      label: "Waiting Infralink NETA",
      value: formatNumber(waitingNeta),
      detail: "Field tests complete",
      icon: FileClock,
      iconClassName: "text-teal-700",
      path: "/eps-test-execution",
    },
    {
      label: "Open Issues",
      value: formatNumber(openIssues),
      detail: "Current issue backlog",
      icon: CircleAlert,
      iconClassName: openIssues > 0 ? "text-red-700" : "text-emerald-700",
      path: "/issues?openOnly=1",
    },
  ];

  const distribution = [
    { label: "Ready", count: ready, barClass: "bg-emerald-500", dotClass: "bg-emerald-500" },
    { label: "Watch", count: watch, barClass: "bg-blue-500", dotClass: "bg-blue-500" },
    { label: "Attention", count: attention, barClass: "bg-amber-500", dotClass: "bg-amber-500" },
    { label: "Critical", count: critical, barClass: "bg-red-500", dotClass: "bg-red-500" },
    { label: "Not Started", count: notStarted, barClass: "bg-slate-300", dotClass: "bg-slate-300" },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 border-b bg-slate-50/60 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Equipment Readiness</CardTitle>
          <CardDescription>Current PDM readiness and active engineering workload.</CardDescription>
        </div>
        <StatusBadge tone="muted">{`Data updated ${formatDateTime(generatedAt)}`}</StatusBadge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-2 xl:grid-cols-5">
          {metrics.map((metric, index) => {
            const Icon = metric.icon;
            return (
              <button
                className={`group min-h-28 border-b p-5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring xl:col-span-1 xl:border-b-0 ${
                  index === metrics.length - 1 ? "col-span-2" : ""
                } ${index % 2 === 0 && index < metrics.length - 1 ? "border-r xl:border-r-0" : ""} ${
                  index < metrics.length - 1 ? "xl:border-r" : ""
                }`}
                key={metric.label}
                onClick={() => onNavigate(metric.path)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                      {metric.label}
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">
                      {metric.value}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{metric.detail}</div>
                  </div>
                  <Icon className={`h-5 w-5 shrink-0 ${metric.iconClassName}`} aria-hidden="true" />
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t px-5 py-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Readiness distribution
            </span>
            <span className="text-xs text-muted-foreground">{formatNumber(totalPdms)} total PDMs</span>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            {distribution.map((item) =>
              item.count > 0 ? (
                <div
                  className={item.barClass}
                  key={item.label}
                  style={{ width: `${(item.count / Math.max(totalPdms, 1)) * 100}%` }}
                  title={`${item.label}: ${item.count}`}
                />
              ) : null,
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {distribution.map((item) => (
              <div className="flex items-center gap-2 text-xs" key={item.label}>
                <span className={`h-2 w-2 rounded-full ${item.dotClass}`} />
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-semibold text-slate-900">{formatNumber(item.count)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PdmActionQueue({
  onSelectPdm,
  rows,
}: {
  onSelectPdm: (pdm: PdmRecord) => void;
  rows: PdmActionRow[];
}) {
  const visibleRows = rows.slice(0, 10);

  return (
    <Card>
      <CardHeader className="gap-2 border-b md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-red-700" aria-hidden="true" />
            PDM Action Queue
          </CardTitle>
          <CardDescription>
            Highest-priority PDMs ranked by readiness, open issues, failed EPS tests, and evidence gaps.
          </CardDescription>
        </div>
        <StatusBadge tone={rows.length > 0 ? "warning" : "success"}>
          {`${formatNumber(rows.length)} require review`}
        </StatusBadge>
      </CardHeader>
      <CardContent className="p-0">
        {visibleRows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No PDMs need action." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b bg-slate-50/70 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">PDM</th>
                  <th className="px-3 py-3 font-medium">Readiness</th>
                  <th className="px-3 py-3 font-medium">NETA Progress</th>
                  <th className="px-3 py-3 font-medium">EPS Testing</th>
                  <th className="px-3 py-3 text-right font-medium">Open Issues</th>
                  <th className="px-3 py-3 font-medium">7-Day Movement</th>
                  <th className="px-4 py-3 font-medium">Primary Blocker</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    className="cursor-pointer border-b align-middle transition-colors last:border-0 hover:bg-slate-50"
                    key={row.pdmName}
                    onClick={() => onSelectPdm(row.pdm)}
                  >
                    <td className="max-w-64 px-4 py-3 font-semibold text-slate-950">
                      {row.pdmName}
                    </td>
                    <td className="px-3 py-3">
                      <PdmReadinessBadge level={row.readinessLevel} />
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-semibold text-slate-950">
                        {formatNumber(row.netaCompleteCount)}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        / {formatNumber(row.equipmentCount)}
                      </span>
                      {row.missingReports > 0 ? (
                        <div className="mt-1 text-xs font-medium text-red-700">
                          {formatNumber(row.missingReports)} report missing
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      {row.epsItemCount > 0 ? (
                        <>
                          <span className="font-semibold text-slate-950">
                            {formatNumber(row.epsCompletedCount)}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            / {formatNumber(row.epsItemCount)}
                          </span>
                          {row.epsFailedCount > 0 ? (
                            <div className="mt-1 text-xs font-medium text-red-700">
                              {formatNumber(row.epsFailedCount)} failed
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground">No tracker data</span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-semibold ${
                        row.openCases > 0 ? "text-red-700" : "text-slate-700"
                      }`}
                    >
                      {formatNumber(row.openCases)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <span className="font-medium text-red-700">
                          +{formatNumber(row.newIssuesSevenDay)} new
                        </span>
                        <span className="font-medium text-emerald-700">
                          -{formatNumber(row.resolvedIssuesSevenDay)} resolved
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {row.mainReason}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WeeklyMovement({
  data,
  onNavigate,
}: {
  data: DashboardData;
  onNavigate: (path: string) => void;
}) {
  const netaAdded = data.historyComparison?.neta_complete?.new_count ?? 0;
  const newIssues = data.historyComparison?.cases?.new_count ?? 0;
  const resolvedIssues = data.historyComparison?.cases?.resolved_count ?? 0;
  const epsPassed = data.epsTestSummary?.seven_day?.new_tested_count ?? 0;
  const previousNetaAdded = data.historyComparison?.neta_complete?.previous_period?.new_count;
  const previousNewIssues = data.historyComparison?.cases?.previous_period?.new_count;
  const previousResolvedIssues = data.historyComparison?.cases?.previous_period?.resolved_count;
  const previousEpsPassed = data.epsTestSummary?.previous_seven_day?.new_tested_count;
  const issueBacklogChange = newIssues - resolvedIssues;
  const previousBacklogChange =
    previousNewIssues !== undefined && previousResolvedIssues !== undefined
      ? previousNewIssues - previousResolvedIssues
      : null;
  const baselineDate = formatSnapshotDate(data.historyComparison?.cases?.baseline_date);

  const metrics = [
    {
      label: "NETA Completed",
      value: `+${formatNumber(netaAdded)}`,
      icon: ClipboardCheck,
      iconClassName: "text-emerald-700",
      trend: buildTrend(netaAdded, previousNetaAdded, true),
      path: "/equipment?quickFilter=recentNetaComplete",
    },
    {
      label: "EPS Passed",
      value: `+${formatNumber(epsPassed)}`,
      icon: Activity,
      iconClassName: "text-blue-700",
      trend: buildTrend(epsPassed, previousEpsPassed, true),
      path: "/eps-test-execution",
    },
    {
      label: "New Issues",
      value: `+${formatNumber(newIssues)}`,
      icon: CircleAlert,
      iconClassName: "text-red-700",
      trend: buildTrend(newIssues, previousNewIssues, false),
      path: "/issues?sevenDay=new",
    },
    {
      label: "Resolved Issues",
      value: formatNumber(resolvedIssues),
      icon: CheckCheck,
      iconClassName: "text-emerald-700",
      trend: buildTrend(resolvedIssues, previousResolvedIssues, true),
      path: "/issues?sevenDay=resolved",
    },
    {
      label: "Issue Backlog Change",
      value: formatSignedNumber(issueBacklogChange),
      icon: issueBacklogChange > 0 ? ArrowUpRight : ArrowDownRight,
      iconClassName: issueBacklogChange > 0 ? "text-red-700" : "text-emerald-700",
      trend: buildTrend(issueBacklogChange, previousBacklogChange, false),
      path: "/issues?openOnly=1",
    },
  ];

  return (
    <Card>
      <CardHeader className="gap-2 border-b md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-700" aria-hidden="true" />
            7-Day Movement
          </CardTitle>
          <CardDescription>Current activity since {baselineDate}, compared with the prior window.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid sm:grid-cols-2 xl:grid-cols-5">
          {metrics.map((metric, index) => {
            const MetricIcon = metric.icon;
            const TrendIcon = metric.trend.Icon;
            return (
              <button
                className={`min-h-28 p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                  index < metrics.length - 1 ? "border-b xl:border-b-0 xl:border-r" : ""
                }`}
                key={metric.label}
                onClick={() => onNavigate(metric.path)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {metric.label}
                  </span>
                  <MetricIcon className={`h-4 w-4 ${metric.iconClassName}`} aria-hidden="true" />
                </div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <span className="text-2xl font-semibold text-slate-950">{metric.value}</span>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold ${metric.trend.className}`}
                  >
                    <TrendIcon
                      className={`h-3.5 w-3.5 ${metric.trend.motionClass}`}
                      aria-hidden="true"
                    />
                    {metric.trend.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ManagementExceptions({
  data,
  onNavigate,
}: {
  data: DashboardData;
  onNavigate: (path: string) => void;
}) {
  const pdmRows = getPdmTableRows(data.pdms);
  const cases = getOverviewCases(data);
  const missingNetaReports = pdmRows.reduce(
    (total, row) => total + row.netaMissingReportCount,
    0,
  );
  const overdueIssues = countUniqueCases(cases, isOverdueOpenCase);
  const openIssues = countUniqueCases(cases, isOpenCase);
  const missingIssueImages = countUniqueCases(
    cases,
    (caseItem) => isOpenCase(caseItem) && !String(caseItem.issue_image ?? "").trim(),
  );
  const pendingCxalloy = data.cxalloyReportStatus?.summary?.pending_equipment ?? 0;

  const exceptions = [
    {
      label: "Waiting Infralink NETA completion",
      detail: "Field tests complete; NETA Complete still needs to be clicked.",
      count: data.epsTestSummary?.waiting_infralink_neta_count ?? 0,
      icon: FileClock,
      iconClassName: "text-teal-700",
      path: "/eps-test-execution",
      action: "Review EPS",
    },
    {
      label: "NETA complete with missing report",
      detail: "Completed equipment without required test evidence.",
      count: missingNetaReports,
      icon: FileWarning,
      iconClassName: "text-red-700",
      path: "/equipment?quickFilter=missingNetaReport",
      action: "Review equipment",
    },
    {
      label: "Current failed EPS tests",
      detail: "Test items that still require correction or retest.",
      count: data.epsTestSummary?.failed_test_item_count ?? 0,
      icon: CircleAlert,
      iconClassName: "text-red-700",
      path: "/eps-test-execution",
      action: "Review failures",
    },
    {
      label: "Overdue open issues",
      detail: `${formatNumber(openIssues)} total open issues in the current backlog.`,
      count: overdueIssues,
      icon: CircleAlert,
      iconClassName: "text-red-700",
      path: "/issues?openOnly=1",
      action: "Review issues",
    },
    {
      label: "Open issues missing images",
      detail: "Open issue records without supporting issue images.",
      count: missingIssueImages,
      icon: FileWarning,
      iconClassName: "text-amber-700",
      path: "/equipment?quickFilter=missingIssueImages",
      action: "Review evidence",
    },
    {
      label: "Pending CxAlloy report upload",
      detail: "Equipment reports organized locally but not confirmed in CxAlloy.",
      count: pendingCxalloy,
      icon: UploadCloud,
      iconClassName: "text-blue-700",
      path: "/equipment?quickFilter=cxalloyPending",
      action: "Review uploads",
    },
  ];

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <CircleAlert className="h-5 w-5 text-red-700" aria-hidden="true" />
          Management Exceptions
        </CardTitle>
        <CardDescription>Items requiring direct follow-up, evidence, or system closeout.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid lg:grid-cols-2">
          {exceptions.map((exception, index) => {
            const Icon = exception.icon;
            return (
              <button
                className={`flex min-h-24 items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                  index < exceptions.length - 2 ? "border-b" : ""
                } ${index % 2 === 0 ? "lg:border-r" : ""}`}
                key={exception.label}
                onClick={() => onNavigate(exception.path)}
                type="button"
              >
                <Icon className={`h-5 w-5 shrink-0 ${exception.iconClassName}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-950">{exception.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{exception.detail}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`text-2xl font-semibold ${
                      exception.count > 0 ? "text-slate-950" : "text-muted-foreground"
                    }`}
                  >
                    {formatNumber(exception.count)}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" aria-label={exception.action} />
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function EpsExecutionSummary({
  data,
  onOpen,
}: {
  data: DashboardData;
  onOpen: () => void;
}) {
  const summary = data.epsTestSummary;
  if (!summary) {
    return null;
  }

  const completionRate = summary.field_test_completion_rate ?? 0;
  const progressPercent = Math.max(0, Math.min(100, completionRate * 100));
  const metrics = [
    { label: "Passed", value: summary.passed_test_item_count ?? 0, className: "text-emerald-700" },
    { label: "Current Failed", value: summary.failed_test_item_count ?? 0, className: "text-red-700" },
    { label: "Fixed After Failure", value: summary.fixed_test_item_count ?? 0, className: "text-teal-700" },
    { label: "Not Tested", value: summary.not_tested_test_item_count ?? 0, className: "text-slate-700" },
    {
      label: "Waiting Infralink NETA",
      value: summary.waiting_infralink_neta_count ?? 0,
      className: "text-teal-700",
    },
  ];

  return (
    <Card>
      <CardHeader className="gap-3 border-b md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-blue-700" aria-hidden="true" />
            EPS Test Execution
          </CardTitle>
          <CardDescription>
            Field-test execution summary from {formatSnapshotDate(summary.source_date_label)}.
          </CardDescription>
        </div>
        <Button className="gap-2" onClick={onOpen} variant="outline">
          Open execution
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_2fr] xl:items-center">
          <div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Tracker Completion
                </div>
                <div className="mt-1 text-2xl font-semibold text-slate-950">
                  {formatPercent(completionRate)}
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {formatNumber(summary.completed_tracker_test_item_count ?? 0)} of{" "}
                {formatNumber(summary.total_tracker_test_item_count ?? 0)} items
              </div>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 xl:grid-cols-5">
            {metrics.map((metric) => (
              <div className="border-l pl-4" key={metric.label}>
                <div className="text-xs font-medium text-muted-foreground">{metric.label}</div>
                <div className={`mt-1 text-xl font-semibold ${metric.className}`}>
                  {formatNumber(metric.value)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewPage({ data }: OverviewPageProps) {
  const navigate = useNavigate();
  const [selectedPdm, setSelectedPdm] = useState<PdmRecord | null>(null);
  const actionRows = useMemo(() => getPdmActionRows(data), [data]);

  if (data.pdms.length === 0) {
    return (
      <EmptyState
        title="No PDM dataset found"
        description="Run python scripts/etl/run_etl.py first."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <ReadinessOverview data={data} onNavigate={navigate} />
      <PdmActionQueue rows={actionRows} onSelectPdm={setSelectedPdm} />
      <WeeklyMovement data={data} onNavigate={navigate} />
      <ManagementExceptions data={data} onNavigate={navigate} />
      <EpsExecutionSummary data={data} onOpen={() => navigate("/eps-test-execution")} />
      <PdmDetailDrawer
        epsTestItems={data.epsTestItems}
        pdm={selectedPdm}
        onClose={() => setSelectedPdm(null)}
      />
    </div>
  );
}
