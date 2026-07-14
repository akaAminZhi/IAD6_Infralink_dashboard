import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CirclePlay,
  ClipboardCheck,
  FileCheck2,
  FileClock,
  FileWarning,
  ListChecks,
  Minus,
  ShieldAlert,
  ShieldCheck,
  TimerReset,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { EmptyState } from "../components/common/EmptyState";
import { NetaReportChips } from "../components/common/NetaReportChips";
import { StatusBadge } from "../components/common/StatusBadge";
import { OverviewKpiGrid, type OverviewKpi } from "../components/overview/OverviewKpiGrid";
import { PdmDetailDrawer } from "../components/pdms/PdmDetailDrawer";
import { PdmReadinessBadge } from "../components/pdms/PdmReadinessBadge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { useNetaReportManifest } from "../contexts/NetaReportManifestContext";
import type { DashboardData, PdmRecord } from "../types/data";
import {
  flattenPdmEquipment,
  getEquipmentNeedingAttention,
  getEquipmentReadinessMetrics,
  type EquipmentAttentionRow,
} from "../utils/equipmentReadinessUtils";
import { getNetaReportLinks, getNetaReportNames } from "../utils/netaReports";
import {
  getCasesMissingIssueImageCount,
  getMissingNetaReportCount,
  getNetaCompleteCount,
  getNetaIncompleteCount,
  getPdmEquipmentCount,
  getPdmOpenCaseCount,
  getPdmReadinessLevel,
  getPdmReadinessScore,
  getPdmTableRows,
  hasNetaTestingStarted,
  type PdmReadinessLevel,
  type PdmTableRow,
} from "../utils/pdmUtils";
import { formatNumber, formatPercent } from "../utils/summaryUtils";

interface OverviewPageProps {
  data: DashboardData;
}

type ReportNameMode = "original" | "gc";

interface PdmActionRow {
  pdm: PdmRecord;
  pdmName: string;
  readinessLevel: PdmReadinessLevel;
  readinessScore: number;
  equipmentCount: number;
  netaCompleteCount: number;
  netaIncompleteCount: number;
  missingReports: number;
  openCases: number;
  newIssuesSevenDay: number;
  resolvedIssuesSevenDay: number;
  mainReason: string;
}

interface RiskBreakdownRow {
  label: string;
  count: number;
  icon: LucideIcon;
  iconClassName: string;
  tone: "neutral" | "positive" | "warning" | "critical";
}

function normalizeCaseId(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
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

function getCaseIdsForPdm(pdm: PdmRecord): Set<string> {
  return new Set(
    (pdm.equipment ?? [])
      .flatMap((equipment) => equipment.cases ?? [])
      .map((caseItem) => normalizeCaseId(caseItem.case_id))
      .filter(Boolean),
  );
}

function getPrimaryReason(row: PdmTableRow, newIssuesSevenDay: number): string {
  if (row.netaMissingReportCount > 0) {
    return "Missing NETA reports";
  }
  if (row.openCaseCount > 0) {
    return "Open cases";
  }
  if (newIssuesSevenDay > 0) {
    return "New issues in last 7 days";
  }
  if (row.netaIncompleteCount > 0 && row.readinessLevel !== "Not Started") {
    return "NETA in progress";
  }
  if (row.casesMissingIssueImageCount > 0) {
    return "Missing issue images";
  }
  if (row.readinessLevel === "Not Started") {
    return "Testing not started";
  }
  return "Ready";
}

function getPdmActionRows(data: DashboardData): PdmActionRow[] {
  const newCaseIds = new Set(
    (data.historyComparison?.cases?.new_case_ids ?? []).map(normalizeCaseId).filter(Boolean),
  );
  const resolvedCaseIds = new Set(
    (data.historyComparison?.cases?.resolved_case_ids ?? []).map(normalizeCaseId).filter(Boolean),
  );

  return getPdmTableRows(data.pdms)
    .map((row) => {
      const pdmCaseIds = getCaseIdsForPdm(row.pdm);
      const newIssuesSevenDay = Array.from(pdmCaseIds).filter((caseId) =>
        newCaseIds.has(caseId),
      ).length;
      const resolvedIssuesSevenDay = Array.from(pdmCaseIds).filter((caseId) =>
        resolvedCaseIds.has(caseId),
      ).length;

      return {
        pdm: row.pdm,
        pdmName: row.pdmName,
        readinessLevel: row.readinessLevel,
        readinessScore: row.readinessScore,
        equipmentCount: row.equipmentCount,
        netaCompleteCount: row.netaCompleteCount,
        netaIncompleteCount: row.netaIncompleteCount,
        missingReports: row.netaMissingReportCount,
        openCases: row.openCaseCount,
        newIssuesSevenDay,
        resolvedIssuesSevenDay,
        mainReason: getPrimaryReason(row, newIssuesSevenDay),
      };
    })
    .filter((row) => row.readinessLevel !== "Not Started" || row.openCases > 0 || row.newIssuesSevenDay > 0)
    .sort((a, b) => {
      const aStartedIncomplete = a.readinessLevel !== "Not Started" && a.netaIncompleteCount > 0 ? 1 : 0;
      const bStartedIncomplete = b.readinessLevel !== "Not Started" && b.netaIncompleteCount > 0 ? 1 : 0;

      return (
        bStartedIncomplete - aStartedIncomplete ||
        b.missingReports - a.missingReports ||
        b.openCases - a.openCases ||
        b.newIssuesSevenDay - a.newIssuesSevenDay ||
        b.readinessScore - a.readinessScore ||
        a.pdmName.localeCompare(b.pdmName)
      );
    });
}

function buildKpis(data: DashboardData): OverviewKpi[] {
  const metrics = getEquipmentReadinessMetrics(data.pdms);
  const pdmRows = getPdmTableRows(data.pdms);
  const testingStarted = data.pdms.filter(hasNetaTestingStarted).length;
  const fullyReady = pdmRows.filter((row) => row.readinessLevel === "Good").length;
  const needingAttention = pdmRows.filter((row) =>
    ["Watch", "Attention", "Critical"].includes(row.readinessLevel),
  ).length;
  const netaAdded = data.historyComparison?.neta_complete?.new_count ?? 0;
  const newIssues = data.historyComparison?.cases?.new_count ?? 0;

  return [
    {
      label: "Testing Started PDMs",
      value: `${formatNumber(testingStarted)} / ${formatNumber(data.pdms.length)}`,
      description: "PDMs where NETA has started.",
      icon: CirclePlay,
      iconClassName: "text-blue-700",
      targetPath: "/pdms?quickFilter=testingStarted",
      tone: "progress",
    },
    {
      label: "Fully Ready PDMs",
      value: formatNumber(fullyReady),
      description: "Started PDMs with no current readiness blockers.",
      icon: ShieldCheck,
      iconClassName: "text-emerald-700",
      targetPath: "/pdms?quickFilter=fullyReady",
      tone: fullyReady > 0 ? "positive" : "neutral",
    },
    {
      label: "PDMs Needing Attention",
      value: formatNumber(needingAttention),
      description: "Watch, Attention, or Critical readiness.",
      icon: CircleAlert,
      iconClassName: needingAttention > 0 ? "text-amber-700" : "text-emerald-700",
      targetPath: "/pdms?quickFilter=needsAttention",
      tone: needingAttention > 0 ? "warning" : "positive",
    },
    {
      label: "NETA Complete",
      value: `${formatNumber(metrics.netaComplete)} / ${formatPercent(metrics.netaCompletionRate)}`,
      description: `+${formatNumber(netaAdded)} since 7-day baseline.`,
      icon: FileCheck2,
      iconClassName: "text-emerald-700",
      targetPath: "/equipment?quickFilter=recentNetaComplete",
      tone: "positive",
    },
    {
      label: "7-Day New Issues",
      value: formatNumber(newIssues),
      description: "New case IDs since baseline.",
      icon: CircleAlert,
      iconClassName: newIssues > 0 ? "text-red-700" : "text-slate-500",
      targetPath: "/issues?sevenDay=new",
      tone: newIssues > 0 ? "critical" : "neutral",
    },
  ];
}

function WeeklyProgressPanel({ data }: { data: DashboardData }) {
  const baselineDate = formatSnapshotDate(data.historyComparison?.cases?.baseline_date);
  const netaAdded = data.historyComparison?.neta_complete?.new_count ?? 0;
  const newIssues = data.historyComparison?.cases?.new_count ?? 0;
  const resolvedIssues = data.historyComparison?.cases?.resolved_count ?? 0;
  const previousNetaAdded =
    data.historyComparison?.neta_complete?.previous_period?.new_count ?? null;
  const previousNewIssues = data.historyComparison?.cases?.previous_period?.new_count ?? null;
  const previousResolvedIssues =
    data.historyComparison?.cases?.previous_period?.resolved_count ?? null;
  const missingReports = getPdmTableRows(data.pdms).reduce(
    (total, row) => total + row.netaMissingReportCount,
    0,
  );

  function makeTrend(
    current: number,
    previous: number | null,
    higherIsGood: boolean,
  ): {
    className: string;
    Icon: typeof ArrowUpRight;
    label: string;
    motionClass: string;
  } {
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

  const cards = [
    {
      label: "NETA Completed",
      value: `+${formatNumber(netaAdded)}`,
      note: "Equipment newly complete",
      icon: ClipboardCheck,
      iconClassName: "text-emerald-700",
      tone: "border-emerald-200 bg-emerald-50/60 text-emerald-950",
      trend: makeTrend(netaAdded, previousNetaAdded, true),
    },
    {
      label: "New Issues",
      value: `+${formatNumber(newIssues)}`,
      note: "Case IDs added",
      icon: CircleAlert,
      iconClassName: newIssues > 0 ? "text-red-700" : "text-slate-500",
      tone: newIssues > 0
        ? "border-red-300 bg-red-50/80 text-red-950"
        : "border-slate-200 bg-slate-50/70 text-slate-950",
      trend: makeTrend(newIssues, previousNewIssues, false),
    },
    {
      label: "Resolved Issues",
      value: formatNumber(resolvedIssues),
      note: "Moved to resolved/closed",
      icon: CheckCheck,
      iconClassName: "text-emerald-700",
      tone: "border-emerald-200 bg-emerald-50/60 text-emerald-950",
      trend: makeTrend(resolvedIssues, previousResolvedIssues, true),
    },
    {
      label: "Missing Reports",
      value: formatNumber(missingReports),
      note: "Current NETA evidence gap",
      icon: FileWarning,
      iconClassName: missingReports > 0 ? "text-red-700" : "text-emerald-700",
      tone: missingReports > 0
        ? "border-red-300 bg-red-50/80 text-red-950"
        : "border-emerald-200 bg-emerald-50/60 text-emerald-950",
      trend: null,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-700" aria-hidden="true" />
          Weekly Progress
        </CardTitle>
        <CardDescription>Compared with {baselineDate}.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const CardIcon = card.icon;
            const TrendIcon = card.trend?.Icon ?? Minus;

            return (
              <div className={`rounded-md border p-4 ${card.tone}`} key={card.label}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/70 ring-1 ring-border/70">
                    <CardIcon className={`h-5 w-5 ${card.iconClassName}`} aria-hidden="true" />
                  </div>
                  {card.trend ? (
                    <div
                      className={`inline-flex shrink-0 items-center gap-1.5 text-right text-sm font-semibold ${card.trend.className}`}
                    >
                      <TrendIcon
                        className={`h-4 w-4 ${card.trend.motionClass}`}
                        aria-hidden="true"
                      />
                      {card.trend.label}
                    </div>
                  ) : (
                    <div className="inline-flex shrink-0 items-center gap-1.5 text-right text-sm font-semibold text-muted-foreground">
                      <Minus className="h-4 w-4" aria-hidden="true" />
                      Current blocker count
                    </div>
                  )}
                </div>
                <div className="mt-3 min-w-0">
                  <div className="text-xs font-medium uppercase text-muted-foreground">
                    {card.label}
                  </div>
                  <div className="mt-2 text-3xl font-semibold tracking-normal">
                    {card.value}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{card.note}</div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TestingExecutionProgressPanel({
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

  const sevenDay = summary.seven_day;
  const previousSevenDay = summary.previous_seven_day;

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

  const cards = [
    {
      label: "Yesterday Passed",
      value: formatNumber(summary.yesterday?.new_tested_count ?? 0),
      note: `Daily report date ${formatSnapshotDate(summary.yesterday?.source_date_label)}`,
      icon: Activity,
      iconClassName: "text-blue-700",
      tone: "border-blue-200 bg-blue-50/70 text-blue-950",
      trend: null,
    },
    {
      label: "Yesterday Failed",
      value: formatNumber(summary.yesterday?.new_failed_count ?? 0),
      note: "Failed items from yesterday daily report.",
      icon: CircleAlert,
      iconClassName: (summary.yesterday?.new_failed_count ?? 0) > 0 ? "text-red-700" : "text-slate-500",
      tone: (summary.yesterday?.new_failed_count ?? 0) > 0
        ? "border-red-300 bg-red-50/80 text-red-950"
        : "border-slate-200 bg-slate-50/70 text-slate-950",
      trend: null,
    },
    {
      label: "7-Day Passed",
      value: sevenDay?.available ? formatNumber(sevenDay.new_tested_count ?? 0) : "--",
      note: sevenDay?.available
        ? `${formatSnapshotDate(sevenDay.baseline_date)} to ${formatSnapshotDate(sevenDay.current_date)}`
        : "Waiting for EPS history snapshots.",
      icon: ClipboardCheck,
      iconClassName: "text-emerald-700",
      tone: "border-emerald-200 bg-emerald-50/60 text-emerald-950",
      trend: sevenDay?.available
        ? makeTrend(sevenDay.new_tested_count, previousSevenDay?.new_tested_count, true)
        : null,
    },
    {
      label: "7-Day Failed",
      value: sevenDay?.available ? formatNumber(sevenDay.new_failed_count ?? 0) : "--",
      note: "New failed equipment since EPS baseline.",
      icon: CircleAlert,
      iconClassName: "text-red-700",
      tone: "border-red-300 bg-red-50/80 text-red-950",
      trend: sevenDay?.available
        ? makeTrend(sevenDay.new_failed_count, previousSevenDay?.new_failed_count, false)
        : null,
    },
    {
      label: "7-Day Repaired",
      value: sevenDay?.available ? formatNumber(sevenDay.repaired_count ?? 0) : "--",
      note: "Previously failed equipment now tested.",
      icon: CheckCheck,
      iconClassName: "text-emerald-700",
      tone: "border-emerald-200 bg-emerald-50/60 text-emerald-950",
      trend: sevenDay?.available
        ? makeTrend(sevenDay.repaired_count, previousSevenDay?.repaired_count, true)
        : null,
    },
    {
      label: "Waiting Infralink NETA Completion",
      value: formatNumber(summary.waiting_infralink_neta_count ?? 0),
      note: "Field tests complete; Infralink NETA Complete still needs to be clicked.",
      icon: FileClock,
      iconClassName: "text-amber-700",
      tone: "border-amber-200 bg-amber-50/70 text-amber-950",
      trend: null,
    },
  ];

  return (
    <Card>
      <CardHeader className="gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-blue-700" aria-hidden="true" />
            Testing Execution Progress
          </CardTitle>
          <CardDescription>
            EPS field-test execution from the daily tracker workflow.
          </CardDescription>
        </div>
        <StatusBadge tone="muted">{formatSnapshotDate(summary.source_date_label)}</StatusBadge>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const CardIcon = card.icon;
            const TrendIcon = card.trend?.Icon ?? Minus;

            return (
              <button
                className={`rounded-md border p-4 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${card.tone}`}
                key={card.label}
                onClick={onOpen}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/70 ring-1 ring-border/70">
                    <CardIcon className={`h-5 w-5 ${card.iconClassName}`} aria-hidden="true" />
                  </div>
                  {card.trend ? (
                    <div
                      className={`inline-flex shrink-0 items-center gap-1.5 text-right text-sm font-semibold ${card.trend.className}`}
                    >
                      <TrendIcon
                        className={`h-4 w-4 ${card.trend.motionClass}`}
                        aria-hidden="true"
                      />
                      {card.trend.label}
                    </div>
                  ) : null}
                </div>
                <div className="mt-3">
                  <div className="text-xs font-medium uppercase text-muted-foreground">
                    {card.label}
                  </div>
                  <div className="mt-2 text-3xl font-semibold tracking-normal">
                    {card.value}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{card.note}</div>
                </div>
              </button>
            );
          })}
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
  const visibleRows = rows.slice(0, 15);

  return (
    <Card>
      <CardHeader className="gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-amber-700" aria-hidden="true" />
            PDM Action Queue
          </CardTitle>
          <CardDescription>Priority PDMs based on started NETA, missing reports, open cases, and recent issue activity.</CardDescription>
        </div>
        <StatusBadge tone="muted">{`${formatNumber(rows.length)} PDMs`}</StatusBadge>
      </CardHeader>
      <CardContent>
        {visibleRows.length === 0 ? (
          <EmptyState title="No PDMs need action." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">PDM Name</th>
                  <th className="px-3 py-2 font-medium">Readiness</th>
                  <th className="px-3 py-2 text-right font-medium">NETA Complete</th>
                  <th className="px-3 py-2 text-right font-medium">NETA Incomplete</th>
                  <th className="px-3 py-2 text-right font-medium">Missing Reports</th>
                  <th className="px-3 py-2 text-right font-medium">Open Issues</th>
                  <th className="px-3 py-2 text-right font-medium">New 7d</th>
                  <th className="px-3 py-2 text-right font-medium">Resolved 7d</th>
                  <th className="px-3 py-2 font-medium">Main Reason</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    className="cursor-pointer border-b align-top transition-colors last:border-0 hover:bg-muted/50"
                    key={row.pdmName}
                    onClick={() => onSelectPdm(row.pdm)}
                  >
                    <td className="px-3 py-3 font-medium">{row.pdmName}</td>
                    <td className="px-3 py-3">
                      <PdmReadinessBadge level={row.readinessLevel} />
                    </td>
                    <td className="px-3 py-3 text-right">{formatNumber(row.netaCompleteCount)}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(row.netaIncompleteCount)}</td>
                    <td className="px-3 py-3 text-right text-red-600">{formatNumber(row.missingReports)}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(row.openCases)}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(row.newIssuesSevenDay)}</td>
                    <td className="px-3 py-3 text-right text-emerald-700">{formatNumber(row.resolvedIssuesSevenDay)}</td>
                    <td className="px-3 py-3">{row.mainReason}</td>
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

function RiskBreakdown({ pdms }: { pdms: PdmRecord[] }) {
  const rows = useMemo<RiskBreakdownRow[]>(() => {
    const pdmRows = getPdmTableRows(pdms);
    const started = pdms.filter(hasNetaTestingStarted).length;
    const notStarted = pdms.length - started;
    const testingIncomplete = pdmRows.filter(
      (row) => row.readinessLevel !== "Not Started" && row.netaIncompleteCount > 0,
    ).length;
    const missingReports = pdmRows.filter((row) => row.netaMissingReportCount > 0).length;
    const openIssueBlocking = pdmRows.filter((row) => row.openCaseCount > 0).length;
    const ready = pdmRows.filter((row) => row.readinessLevel === "Good").length;

    return [
      {
        label: "Ready",
        count: ready,
        icon: CircleCheck,
        iconClassName: "text-emerald-700",
        tone: "positive",
      },
      {
        label: "Not Started",
        count: notStarted,
        icon: CircleDashed,
        iconClassName: "text-slate-500",
        tone: "neutral",
      },
      {
        label: "Testing Started / Incomplete",
        count: testingIncomplete,
        icon: TimerReset,
        iconClassName: "text-amber-700",
        tone: "warning",
      },
      {
        label: "Complete Missing Report",
        count: missingReports,
        icon: FileWarning,
        iconClassName: "text-red-700",
        tone: "critical",
      },
      {
        label: "Open Issue Blocking",
        count: openIssueBlocking,
        icon: CircleAlert,
        iconClassName: "text-amber-700",
        tone: "warning",
      },
    ];
  }, [pdms]);

  const toneClass = {
    neutral: "border-border bg-background",
    positive: "border-emerald-200 bg-emerald-50/60",
    warning: "border-amber-200 bg-amber-50/70",
    critical: "border-red-200 bg-red-50/70",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-700" aria-hidden="true" />
          Readiness Risk Breakdown
        </CardTitle>
        <CardDescription>Risk categories by PDM, focused on actionability.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {rows.map((row) => {
            const RowIcon = row.icon;

            return (
              <div className={`rounded-md border p-4 ${toneClass[row.tone]}`} key={row.label}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-xs font-medium uppercase text-muted-foreground">
                    {row.label}
                  </div>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/70 ring-1 ring-border/70">
                    <RowIcon className={`h-5 w-5 ${row.iconClassName}`} aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-normal">{formatNumber(row.count)}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function getReportLabel(count: number): string {
  return count === 1 ? "1 report" : `${formatNumber(count)} reports`;
}

function EquipmentAttentionTable({ rows }: { rows: EquipmentAttentionRow[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expandedReportModes, setExpandedReportModes] = useState<Map<string, ReportNameMode>>(
    () => new Map(),
  );
  const netaReportManifest = useNetaReportManifest();
  const visibleRows = showAll ? rows : rows.slice(0, 20);

  function hasGcReportLinks(reportNames: string[]): boolean {
    return reportNames.some((reportName) =>
      getNetaReportLinks(reportName, netaReportManifest).some((link) => link.sourceKey === "gc"),
    );
  }

  function toggleReports(rowKey: string, canShowGcNames: boolean) {
    setExpandedReportModes((current) => {
      const next = new Map(current);
      const currentMode = next.get(rowKey);
      if (currentMode === "original" && canShowGcNames) {
        next.set(rowKey, "gc");
      } else if (currentMode === "original" || currentMode === "gc") {
        next.delete(rowKey);
      } else {
        next.set(rowKey, "original");
      }
      return next;
    });
  }

  return (
    <Card>
      <CardHeader className="gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-slate-600" aria-hidden="true" />
            Equipment Detail Backlog
          </CardTitle>
          <CardDescription>Equipment-level drilldown for incomplete NETA, missing reports, or open cases.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="muted">{`${formatNumber(rows.length)} equipment`}</StatusBadge>
          <Button onClick={() => setIsOpen((current) => !current)} type="button" variant="outline">
            {isOpen ? "Collapse" : "Expand"}
          </Button>
          {isOpen && rows.length > 20 ? (
            <Button onClick={() => setShowAll((current) => !current)} type="button" variant="outline">
              {showAll ? "Show less" : `Show all ${formatNumber(rows.length)}`}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      {isOpen ? (
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              title="No equipment needs attention"
              description="No incomplete NETA, missing reports, or open cases were found."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">PDM Name</th>
                    <th className="px-3 py-2 font-medium">Equipment ID or Source Label</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">NETA</th>
                    <th className="px-3 py-2 font-medium">NETA Test Report</th>
                    <th className="px-3 py-2 text-right font-medium">Open Cases</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, index) => {
                    const rowKey = `${row.pdm_name}-${row.equipment_id}-${row.source_equipment_label}-${index}`;
                    const reportNames = getNetaReportNames(row.neta_test_report);
                    const expandedMode = expandedReportModes.get(rowKey);

                    return (
                      <tr className="border-b align-top last:border-0" key={rowKey}>
                        <td className="px-3 py-2 font-medium">{row.pdm_name ?? "--"}</td>
                        <td className="px-3 py-2">{row.equipment_id ?? row.source_equipment_label ?? "--"}</td>
                        <td className="px-3 py-2">{row.status ?? "--"}</td>
                        <td className="px-3 py-2">{row.neta}</td>
                        <td className="w-[520px] min-w-[520px] max-w-[520px] px-3 py-2">
                          {reportNames.length === 0 ? (
                            <span>0 reports</span>
                          ) : (
                            <div className="w-[496px] max-w-[496px] space-y-2">
                              <Button
                                aria-expanded={expandedMode !== undefined}
                                className="h-8 px-2 text-xs"
                                onClick={() => toggleReports(rowKey, hasGcReportLinks(reportNames))}
                                type="button"
                                variant="outline"
                              >
                                {getReportLabel(reportNames.length)}
                              </Button>
                              {expandedMode ? (
                                <NetaReportChips compactNameMode={expandedMode} reports={reportNames} />
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">{formatNumber(row.open_cases)}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {row.reason.map((reason) => (
                              <span
                                className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
                                key={reason}
                              >
                                {reason}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

export function OverviewPage({ data }: OverviewPageProps) {
  const navigate = useNavigate();
  const [selectedPdm, setSelectedPdm] = useState<PdmRecord | null>(null);
  const flatEquipment = useMemo(() => flattenPdmEquipment(data.pdms), [data.pdms]);
  const attentionRows = useMemo(() => getEquipmentNeedingAttention(data.pdms), [data.pdms]);
  const actionRows = useMemo(() => getPdmActionRows(data), [data]);

  if (data.pdms.length === 0 || flatEquipment.length === 0) {
    return (
      <EmptyState
        title="No PDM dataset found"
        description="Run python scripts/etl/run_etl.py first."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <OverviewKpiGrid
        kpis={buildKpis(data)}
        onKpiClick={(kpi) => {
          if (kpi.targetPath) {
            navigate(kpi.targetPath);
          }
        }}
      />

      <WeeklyProgressPanel data={data} />
      <TestingExecutionProgressPanel
        data={data}
        onOpen={() => navigate("/eps-test-execution")}
      />
      <PdmActionQueue
        rows={actionRows}
        onSelectPdm={setSelectedPdm}
      />
      <RiskBreakdown pdms={data.pdms} />
      <EquipmentAttentionTable rows={attentionRows} />
      <PdmDetailDrawer pdm={selectedPdm} onClose={() => setSelectedPdm(null)} />
    </div>
  );
}
